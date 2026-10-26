import crypto from 'crypto';
import { NextFunction, Request, Response, Router } from 'express';
import type { AIProviderAdapter } from '../src/services/aiAdapter.js';
import type { TeacherRequest } from './teacherAuth.js';

/**
 * AI endpoints (turn a photo/PDF of an exam into homework, suggest essay scores).
 * Every call costs money, so before the model is reached a request must:
 *   1. come from a signed-in teacher (verified on the server, not in the UI),
 *   2. pass size/shape checks,
 *   3. find the AI configured (otherwise a friendly 503, nothing is called),
 *   4. stay inside the per-teacher limits: one job at a time, N per window,
 *      and no identical exam resent right after it succeeded.
 * Limits live in memory, so they hold per server instance (a cost brake, not
 * a global quota); the provider's spend limit remains the hard ceiling.
 */

export type AIJobLog = {
  taskType: 'ocr_parse' | 'solve_math' | 'essay_grade' | 'figure_redraw' | 'figure_compare';
  provider: string;
  model: string;
  status: 'completed' | 'failed';
  durationMs?: number;
  estimatedCostUsd?: number;
};

interface AILimits {
  windowMs: number;
  parsePerWindow: number;
  gradePerWindow: number;
  /** Figure reads + comparisons (one redraw is usually two calls). */
  figurePerWindow: number;
  /** An identical exam that just succeeded is refused for this long. */
  duplicateMs: number;
}

export const DEFAULT_AI_LIMITS: AILimits = {
  windowMs: 15 * 60 * 1000,
  parsePerWindow: 10,
  gradePerWindow: 40,
  figurePerWindow: 60,
  duplicateMs: 2 * 60 * 1000,
};

interface AIRouterDeps {
  requireTeacher: (req: Request, res: Response, next: NextFunction) => unknown;
  isConfigured: () => boolean;
  loadAdapter: () => Promise<AIProviderAdapter>;
  /** Writes an aiJobs record (server-side); failures must not break the request. */
  logJob: (job: AIJobLog) => Promise<void>;
  limits?: Partial<AILimits>;
  now?: () => number;
}

const MAX_FILES = 20;
/** Vercel rejects bodies above 4.5 MB; the editor compresses pages to ≤ 4.2 MB of base64. */
export const MAX_TOTAL_BASE64 = 4_400_000;
const ALLOWED_MIME = ['image/png', 'image/jpeg', 'image/webp', 'application/pdf'];
const BASE64_RE = /^[A-Za-z0-9+/]+={0,2}$/;
/** One figure picture (a crop of an exam page, or MimoEDU's drawing of it). */
const MAX_FIGURE_BASE64 = 1_500_000;
const FIGURE_MIME = ['image/png', 'image/jpeg', 'image/webp'];
const TEXT_LIMITS = { questionPrompt: 5000, rubric: 5000, sampleSolution: 5000, studentEssayText: 10000 } as const;

export const AI_UNAVAILABLE_MESSAGE =
  'Chức năng AI đang tạm chưa sẵn sàng. Thầy cô vẫn có thể soạn bài thủ công, hoặc báo người quản trị hệ thống để bật AI.';

export function createAIRouter(deps: AIRouterDeps): Router {
  const limits = { ...DEFAULT_AI_LIMITS, ...deps.limits };
  const now = deps.now ?? Date.now;
  const router = Router();

  const calls = new Map<string, number[]>(); // `${kind}:${email}` → call times inside the window
  const busy = new Set<string>(); // emails with an exam being converted
  const recentExams = new Map<string, number>(); // `${email}:${hash}` → success time

  const tooMany = (key: string, max: number): boolean => {
    const t = now();
    const recent = (calls.get(key) ?? []).filter((at) => t - at < limits.windowMs);
    calls.set(key, recent);
    if (recent.length >= max) return true;
    recent.push(t);
    return false;
  };
  const unavailable = (res: Response) =>
    res.status(503).json({ error: AI_UNAVAILABLE_MESSAGE, code: 'AI_UNAVAILABLE' });
  const failure = (res: Response, error: unknown, fallback: string) => {
    if ((error as { code?: string } | null)?.code === 'AI_UNAVAILABLE') {
      console.error('AI unavailable:', (error as { detail?: string }).detail);
      return unavailable(res);
    }
    // Adapter errors are already worded for teachers; anything else stays generic
    return res.status(502).json({ error: error instanceof Error && error.message ? error.message : fallback });
  };

  router.post('/parse-homework', deps.requireTeacher, async (req: TeacherRequest, res: Response) => {
    const email = req.teacherEmail!;
    const { files, solveWithAI } = (req.body ?? {}) as {
      files?: { mimeType?: unknown; base64Data?: unknown }[];
      solveWithAI?: unknown;
    };

    if (!Array.isArray(files) || files.length === 0 || files.length > MAX_FILES) {
      res.status(400).json({ error: `Vui lòng chọn từ 1 đến ${MAX_FILES} ảnh/PDF cho một đề.` });
      return;
    }
    if (files.some((f) => typeof f?.mimeType !== 'string' || !ALLOWED_MIME.includes(f.mimeType))) {
      res.status(400).json({ error: 'Định dạng tệp không hỗ trợ. Chỉ chấp nhận PNG, JPG, WEBP hoặc PDF.' });
      return;
    }
    if (files.some((f) => typeof f.base64Data !== 'string' || !f.base64Data || !BASE64_RE.test(f.base64Data))) {
      res.status(400).json({ error: 'Có tệp rỗng hoặc bị hỏng. Vui lòng chọn lại tệp.' });
      return;
    }
    const pages = files.map((f) => ({ mimeType: f.mimeType as string, base64Data: f.base64Data as string }));
    if (pages.reduce((sum, f) => sum + f.base64Data.length, 0) > MAX_TOTAL_BASE64) {
      res.status(413).json({ error: 'Tổng dung lượng vượt giới hạn 4 MB. Hãy bớt trang hoặc tách đề thành nhiều phần.' });
      return;
    }
    if (!deps.isConfigured()) {
      unavailable(res);
      return;
    }
    if (busy.has(email)) {
      res.status(429).json({ error: 'AI đang xử lý một đề khác của thầy cô. Vui lòng chờ đề đó xong rồi gửi tiếp.', code: 'AI_BUSY' });
      return;
    }
    const solve = solveWithAI === true;
    const examHash = crypto.createHash('sha256');
    for (const p of pages) examHash.update(p.mimeType).update(p.base64Data);
    const examKey = `${email}:${examHash.update(String(solve)).digest('hex')}`;
    const sentAt = recentExams.get(examKey);
    if (sentAt !== undefined && now() - sentAt < limits.duplicateMs) {
      res.status(429).json({ error: 'Đề này vừa được chuyển đổi xong. Thầy cô hãy mở lại kết quả thay vì gửi lại ngay.', code: 'AI_DUPLICATE' });
      return;
    }
    if (tooMany(`parse:${email}`, limits.parsePerWindow)) {
      res.status(429).json({ error: 'Thầy cô đã gửi nhiều đề trong thời gian ngắn. Vui lòng thử lại sau ít phút.', code: 'AI_RATE_LIMIT' });
      return;
    }

    busy.add(email);
    const adapter = await deps.loadAdapter();
    try {
      // The model comes from server configuration only, never from the request
      const result = await adapter.parseHomeworkFromMedia({ files: pages, solveWithAI: solve });
      recentExams.set(examKey, now());
      await deps.logJob({
        taskType: solve ? 'solve_math' : 'ocr_parse',
        provider: result.provider,
        model: result.model,
        status: 'completed',
        durationMs: result.durationMs,
        estimatedCostUsd: result.estimatedCostUsd,
      });
      res.json(result);
    } catch (error) {
      console.error('AI parse-homework error:', error);
      if ((error as { code?: string } | null)?.code !== 'AI_UNAVAILABLE') {
        await deps.logJob({ taskType: solve ? 'solve_math' : 'ocr_parse', provider: adapter.providerName, model: adapter.defaultModel, status: 'failed' });
      }
      failure(res, error, 'AI chưa chuyển đổi được đề này. Vui lòng thử lại hoặc soạn thủ công.');
    } finally {
      busy.delete(email);
      for (const [key, at] of recentExams) if (now() - at >= limits.duplicateMs) recentExams.delete(key);
    }
  });

  router.post('/suggest-grading', deps.requireTeacher, async (req: TeacherRequest, res: Response) => {
    const email = req.teacherEmail!;
    const body = (req.body ?? {}) as Record<string, unknown>;
    const { questionPrompt, maxPoints, studentEssayText } = body;
    const optional = (key: 'rubric' | 'sampleSolution') => (typeof body[key] === 'string' ? (body[key] as string) : undefined);

    if (
      typeof questionPrompt !== 'string' || !questionPrompt.trim() ||
      typeof studentEssayText !== 'string' || !studentEssayText.trim() ||
      typeof maxPoints !== 'number' || !Number.isFinite(maxPoints) || maxPoints <= 0 || maxPoints > 100
    ) {
      res.status(400).json({ error: 'Thiếu đề bài, thang điểm hoặc nội dung bài làm của học sinh.' });
      return;
    }
    const tooLong = (Object.keys(TEXT_LIMITS) as (keyof typeof TEXT_LIMITS)[]).some(
      (key) => typeof body[key] === 'string' && (body[key] as string).length > TEXT_LIMITS[key]
    );
    if (tooLong) {
      res.status(413).json({ error: 'Nội dung câu hỏi hoặc bài làm quá dài để AI gợi ý chấm.' });
      return;
    }
    if (!deps.isConfigured()) {
      unavailable(res);
      return;
    }
    if (tooMany(`grade:${email}`, limits.gradePerWindow)) {
      res.status(429).json({ error: 'Thầy cô đã nhờ AI gợi ý nhiều lần trong thời gian ngắn. Vui lòng thử lại sau ít phút.', code: 'AI_RATE_LIMIT' });
      return;
    }

    const adapter = await deps.loadAdapter();
    try {
      const result = await adapter.suggestEssayGrading({
        questionPrompt,
        maxPoints,
        rubric: optional('rubric'),
        sampleSolution: optional('sampleSolution'),
        studentEssayText,
      });
      await deps.logJob({ taskType: 'essay_grade', provider: result.provider, model: result.model, status: 'completed', durationMs: result.durationMs });
      res.json(result);
    } catch (error) {
      console.error('AI suggest-grading error:', error);
      if ((error as { code?: string } | null)?.code !== 'AI_UNAVAILABLE') {
        await deps.logJob({ taskType: 'essay_grade', provider: adapter.providerName, model: adapter.defaultModel, status: 'failed' });
      }
      failure(res, error, 'Không thể lấy gợi ý chấm điểm từ AI lúc này.');
    }
  });

  /** A figure picture from the request, or null when it is missing, not an image or too large. */
  const figureFile = (value: unknown): { mimeType: string; base64Data: string } | null => {
    const f = value as { mimeType?: unknown; base64Data?: unknown } | null;
    if (!f || typeof f.mimeType !== 'string' || !FIGURE_MIME.includes(f.mimeType)) return null;
    if (typeof f.base64Data !== 'string' || !f.base64Data || f.base64Data.length > MAX_FIGURE_BASE64 || !BASE64_RE.test(f.base64Data)) return null;
    return { mimeType: f.mimeType, base64Data: f.base64Data };
  };
  const figureText = (value: unknown, max: number) => (typeof value === 'string' ? value.slice(0, max) : '');
  /** Shared gate of the two figure endpoints; false when a reply was already sent. */
  const figureGate = (email: string, res: Response): boolean => {
    if (!deps.isConfigured()) {
      unavailable(res);
      return false;
    }
    if (tooMany(`figure:${email}`, limits.figurePerWindow)) {
      res.status(429).json({ error: 'Thầy cô đã nhờ AI vẽ lại nhiều hình trong thời gian ngắn. Vui lòng thử lại sau ít phút.', code: 'AI_RATE_LIMIT' });
      return false;
    }
    return true;
  };

  router.post('/redraw-figure', deps.requireTeacher, async (req: TeacherRequest, res: Response) => {
    const email = req.teacherEmail!;
    const body = (req.body ?? {}) as Record<string, unknown>;
    const image = figureFile(body.image);
    if (!image) {
      res.status(400).json({ error: 'Thiếu ảnh hình, ảnh không phải PNG/JPG/WEBP hoặc lớn hơn 1 MB.' });
      return;
    }
    if (!figureGate(email, res)) return;
    const adapter = await deps.loadAdapter();
    try {
      const result = await adapter.redrawFigure({ image, questionText: figureText(body.questionText, 3000), hint: figureText(body.hint, 500) });
      await deps.logJob({ taskType: 'figure_redraw', provider: result.provider, model: result.model, status: 'completed', durationMs: result.durationMs, estimatedCostUsd: result.estimatedCostUsd });
      res.json(result);
    } catch (error) {
      console.error('AI redraw-figure error:', error);
      if ((error as { code?: string } | null)?.code !== 'AI_UNAVAILABLE') {
        await deps.logJob({ taskType: 'figure_redraw', provider: adapter.providerName, model: adapter.defaultModel, status: 'failed' });
      }
      failure(res, error, 'AI chưa đọc được hình này. Thầy cô vẫn có thể dùng hình gốc.');
    }
  });

  router.post('/compare-figure', deps.requireTeacher, async (req: TeacherRequest, res: Response) => {
    const email = req.teacherEmail!;
    const body = (req.body ?? {}) as Record<string, unknown>;
    const original = figureFile(body.original);
    const redrawn = figureFile(body.redrawn);
    if (!original || !redrawn) {
      res.status(400).json({ error: 'Thiếu hình gốc hoặc hình vẽ lại để so sánh.' });
      return;
    }
    if (!figureGate(email, res)) return;
    const adapter = await deps.loadAdapter();
    try {
      const result = await adapter.compareFigure({ original, redrawn, questionText: figureText(body.questionText, 3000) });
      await deps.logJob({ taskType: 'figure_compare', provider: result.provider, model: result.model, status: 'completed', durationMs: result.durationMs, estimatedCostUsd: result.estimatedCostUsd });
      res.json(result);
    } catch (error) {
      console.error('AI compare-figure error:', error);
      if ((error as { code?: string } | null)?.code !== 'AI_UNAVAILABLE') {
        await deps.logJob({ taskType: 'figure_compare', provider: adapter.providerName, model: adapter.defaultModel, status: 'failed' });
      }
      failure(res, error, 'AI chưa so sánh được hai hình.');
    }
  });

  return router;
}
