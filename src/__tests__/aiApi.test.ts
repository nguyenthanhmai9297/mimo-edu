import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import express from 'express';
import type { AddressInfo } from 'net';
import type { Server } from 'http';
import { AIJobLog, createAIRouter } from '../../api/aiRoutes';
import { createRequireTeacher, OWNER_EMAIL } from '../../api/teacherAuth';
import { AIUnavailableError, type AIProviderAdapter } from '../services/aiAdapter';

/**
 * Access control and cost limits of the AI endpoints. Identities come from a
 * fake token verifier, and the model is a stub that only counts calls:
 * no real AI, no Firebase.
 */

const TOKENS: Record<string, { email?: string; email_verified?: boolean }> = {
  owner: { email: OWNER_EMAIL, email_verified: true },
  allowlisted: { email: 'giaovien@truong.edu.vn', email_verified: true },
  unverified: { email: 'giaovien@truong.edu.vn', email_verified: false },
  outsider: { email: 'nguoila@gmail.com', email_verified: true },
};

let adapterCalls = 0;
let configured = true;
let failWith: Error | null = null;
const jobs: AIJobLog[] = [];
let clock = 1_000_000;

const stubAdapter: AIProviderAdapter = {
  providerName: 'stub',
  defaultModel: 'stub-model',
  async parseHomeworkFromMedia() {
    adapterCalls++;
    if (failWith) throw failWith;
    return { title: 'Đề', grade: 'Khối 3', questions: [], provider: 'stub', model: 'stub-model', durationMs: 5 } as never;
  },
  async suggestEssayGrading() {
    adapterCalls++;
    if (failWith) throw failWith;
    return { suggestedScore: 1, explanation: '', improvementFeedback: '', provider: 'stub', model: 'stub-model', durationMs: 5 } as never;
  },
  async redrawFigure() {
    adapterCalls++;
    if (failWith) throw failWith;
    return { redrawable: true, reason: '', spec: null, readings: { pointLabels: [], measurements: [], otherText: [] }, uncertain: [], provider: 'stub', model: 'stub-model', durationMs: 5, estimatedCostUsd: 0.01 };
  },
  async compareFigure() {
    adapterCalls++;
    if (failWith) throw failWith;
    return { verification: { verdict: 'match', differences: [], summary: '' }, provider: 'stub', model: 'stub-model', durationMs: 5, estimatedCostUsd: 0.01 };
  },
};

function start(): Promise<{ url: string; server: Server }> {
  const app = express();
  app.use(express.json({ limit: '15mb' }));
  const requireTeacher = createRequireTeacher(() => ({
    verifyIdToken: async (token) => {
      const claims = TOKENS[token];
      if (!claims) throw new Error('invalid token');
      return claims;
    },
    isAllowlisted: async (email) => email === 'giaovien@truong.edu.vn',
  }));
  app.use(
    '/api/ai',
    createAIRouter({
      requireTeacher,
      isConfigured: () => configured,
      loadAdapter: async () => stubAdapter,
      logJob: async (job) => void jobs.push(job),
      limits: { parsePerWindow: 3, gradePerWindow: 2, figurePerWindow: 3 },
      now: () => clock,
    })
  );
  return new Promise((resolve) => {
    const server = app.listen(0, () => resolve({ url: `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/ai`, server }));
  });
}

const page = (data = 'iVBORw0KGgo=') => ({ files: [{ mimeType: 'image/png', base64Data: data }], solveWithAI: false });
const essay = { questionPrompt: 'Giải bài toán', maxPoints: 2, studentEssayText: 'Bài làm của em' };

describe('API AI – phân quyền, giới hạn và xử lý lỗi', () => {
  let url = '';
  let server: Server;
  const call = async (path: string, body: unknown, token?: string) => {
    const res = await fetch(url + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(body),
    });
    return { status: res.status, data: (await res.json()) as { error?: string; code?: string } };
  };

  beforeAll(async () => ({ url, server } = await start()));
  afterAll(() => server.close());
  beforeEach(() => {
    adapterCalls = 0;
    configured = true;
    failWith = null;
    jobs.length = 0;
    clock += 60 * 60 * 1000; // a fresh rate-limit window for every test
  });

  it('từ chối người chưa đăng nhập, token sai và email chưa xác minh, trước khi gọi AI', async () => {
    for (const path of ['/parse-homework', '/suggest-grading']) {
      const body = path === '/parse-homework' ? page() : essay;
      expect((await call(path, body)).status).toBe(401);
      expect((await call(path, body, 'token-gia')).status).toBe(401);
      expect((await call(path, body, 'unverified')).status).toBe(403);
    }
    expect(adapterCalls).toBe(0);
    expect(jobs).toHaveLength(0);
  });

  it('giáo viên mới đăng nhập Google (không cần nằm trong Admin Allowlist) dùng được AI', async () => {
    expect((await call('/parse-homework', page(), 'outsider')).status).toBe(200);
    expect(adapterCalls).toBe(1);
  });

  it('cho chủ tài khoản và giáo viên trong danh sách được phép dùng AI', async () => {
    expect((await call('/parse-homework', page('AAAA'), 'owner')).status).toBe(200);
    expect((await call('/parse-homework', page('BBBB'), 'allowlisted')).status).toBe(200);
    expect((await call('/suggest-grading', essay, 'allowlisted')).status).toBe(200);
    expect(adapterCalls).toBe(3);
    expect(jobs.map((j) => j.status)).toEqual(['completed', 'completed', 'completed']);
  });

  it('kiểm tra tệp và dung lượng trước khi gọi AI', async () => {
    const bad = [
      { files: [] },
      { files: Array.from({ length: 21 }, () => page().files[0]) },
      { files: [{ mimeType: 'text/html', base64Data: 'AAAA' }] },
      { files: [{ mimeType: 'image/png', base64Data: '' }] },
      { files: [{ mimeType: 'image/png', base64Data: '<script>' }] },
      { mimeType: 'image/png', base64Data: 'AAAA' }, // old single-file body is no longer accepted
    ];
    for (const body of bad) expect((await call('/parse-homework', body, 'owner')).status).toBe(400);
    const big = await call('/parse-homework', page('A'.repeat(4_400_004)), 'owner');
    expect(big.status).toBe(413);
    expect(big.data.error).toContain('4 MB');
    expect((await call('/suggest-grading', { ...essay, maxPoints: 1000 }, 'owner')).status).toBe(400);
    expect((await call('/suggest-grading', { ...essay, studentEssayText: 'a'.repeat(10_001) }, 'owner')).status).toBe(413);
    expect(adapterCalls).toBe(0);
  });

  it('khi chưa cấu hình AI: báo thân thiện, không lộ tên khóa, không gọi AI, không ghi nhật ký', async () => {
    configured = false;
    for (const [path, body] of [['/parse-homework', page()], ['/suggest-grading', essay]] as const) {
      const res = await call(path, body, 'owner');
      expect(res.status).toBe(503);
      expect(res.data.code).toBe('AI_UNAVAILABLE');
      expect(res.data.error).toContain('soạn bài thủ công');
      expect(res.data.error).not.toMatch(/API_KEY|ANTHROPIC|GEMINI|server/i);
    }
    expect(adapterCalls).toBe(0);
    expect(jobs).toHaveLength(0);
  });

  it('khóa AI bị từ chối giữa chừng cũng chỉ hiện lời nhắn thân thiện', async () => {
    failWith = new AIUnavailableError('ANTHROPIC_API_KEY rejected');
    const res = await call('/parse-homework', page(), 'owner');
    expect(res.status).toBe(503);
    expect(res.data.error).not.toContain('ANTHROPIC');
  });

  it('lỗi AI khác được ghi nhật ký "failed" và trả lời bằng thông báo của bộ xử lý', async () => {
    failWith = new Error('Dịch vụ AI đang gặp sự cố tạm thời. Vui lòng thử lại sau ít phút.');
    const res = await call('/parse-homework', page(), 'owner');
    expect(res.status).toBe(502);
    expect(res.data.error).toContain('sự cố tạm thời');
    expect(jobs).toEqual([{ taskType: 'ocr_parse', provider: 'stub', model: 'stub-model', status: 'failed' }]);
  });

  it('giới hạn số đề mỗi giáo viên trong một khoảng thời gian', async () => {
    for (const data of ['AAAA', 'BBBB', 'CCCC']) expect((await call('/parse-homework', page(data), 'owner')).status).toBe(200);
    const fourth = await call('/parse-homework', page('DDDD'), 'owner');
    expect(fourth.status).toBe(429);
    expect(fourth.data.code).toBe('AI_RATE_LIMIT');
    // limits are per teacher
    expect((await call('/parse-homework', page('DDDD'), 'allowlisted')).status).toBe(200);
    clock += 16 * 60 * 1000;
    expect((await call('/parse-homework', page('DDDD'), 'owner')).status).toBe(200);
    expect(adapterCalls).toBe(5);
  });

  it('giới hạn số lần gợi ý chấm', async () => {
    expect((await call('/suggest-grading', essay, 'owner')).status).toBe(200);
    expect((await call('/suggest-grading', essay, 'owner')).status).toBe(200);
    expect((await call('/suggest-grading', essay, 'owner')).status).toBe(429);
    expect(adapterCalls).toBe(2);
  });

  it('chống gửi lại cùng một đề ngay sau khi vừa chuyển đổi xong', async () => {
    expect((await call('/parse-homework', page('AAAA'), 'owner')).status).toBe(200);
    const again = await call('/parse-homework', page('AAAA'), 'owner');
    expect(again.status).toBe(429);
    expect(again.data.code).toBe('AI_DUPLICATE');
    clock += 3 * 60 * 1000;
    expect((await call('/parse-homework', page('AAAA'), 'owner')).status).toBe(200);
    expect(adapterCalls).toBe(2);
  });

  it('một đề lỗi thì được gửi lại ngay', async () => {
    failWith = new Error('Dịch vụ AI đang gặp sự cố tạm thời.');
    expect((await call('/parse-homework', page('AAAA'), 'owner')).status).toBe(502);
    failWith = null;
    expect((await call('/parse-homework', page('AAAA'), 'owner')).status).toBe(200);
  });

  it('mỗi giáo viên chỉ chạy một đề một lúc', async () => {
    let release!: () => void;
    const original = stubAdapter.parseHomeworkFromMedia;
    stubAdapter.parseHomeworkFromMedia = async (input) => {
      await new Promise<void>((r) => (release = r));
      return original.call(stubAdapter, input);
    };
    try {
      const first = call('/parse-homework', page('AAAA'), 'owner');
      await new Promise((r) => setTimeout(r, 50));
      const second = await call('/parse-homework', page('BBBB'), 'owner');
      expect(second.status).toBe(429);
      expect(second.data.code).toBe('AI_BUSY');
      release();
      expect((await first).status).toBe(200);
    } finally {
      stubAdapter.parseHomeworkFromMedia = original;
    }
  });

  it('không nhận chọn model từ trình duyệt', async () => {
    let seen: unknown;
    const original = stubAdapter.parseHomeworkFromMedia;
    stubAdapter.parseHomeworkFromMedia = async (input) => {
      seen = input;
      return original.call(stubAdapter, input);
    };
    try {
      await call('/parse-homework', { ...page(), preferredModel: 'claude-fable-5-1' }, 'owner');
      expect(seen).not.toHaveProperty('preferredModel');
    } finally {
      stubAdapter.parseHomeworkFromMedia = original;
    }
  });

  it('vẽ lại hình: chỉ giáo viên, kiểm tra ảnh, giới hạn số lần, ghi nhật ký chi phí', async () => {
    const img = { mimeType: 'image/png', base64Data: 'iVBORw0KGgo=' };
    expect((await call('/redraw-figure', { image: img })).status).toBe(401);
    expect((await call('/compare-figure', { original: img, redrawn: img }, 'unverified')).status).toBe(403);
    expect((await call('/redraw-figure', { image: { mimeType: 'image/svg+xml', base64Data: 'PHN2Zz4=' } }, 'owner')).status).toBe(400);
    expect((await call('/redraw-figure', { image: { mimeType: 'image/png', base64Data: 'A'.repeat(1_600_000) } }, 'owner')).status).toBe(400);
    expect((await call('/compare-figure', { original: img }, 'owner')).status).toBe(400);
    expect(adapterCalls).toBe(0);
    expect((await call('/redraw-figure', { image: img, questionText: 'Hình H' }, 'owner')).status).toBe(200);
    expect((await call('/compare-figure', { original: img, redrawn: img }, 'owner')).status).toBe(200);
    expect((await call('/redraw-figure', { image: img }, 'owner')).status).toBe(200);
    const limited = await call('/redraw-figure', { image: img }, 'owner');
    expect(limited.status).toBe(429);
    expect(adapterCalls).toBe(3);
    expect(jobs.map((j) => `${j.taskType}:${j.status}:${j.estimatedCostUsd}`)).toEqual([
      'figure_redraw:completed:0.01',
      'figure_compare:completed:0.01',
      'figure_redraw:completed:0.01',
    ]);
    configured = false;
    expect((await call('/redraw-figure', { image: img }, 'allowlisted')).data.code).toBe('AI_UNAVAILABLE');
  });
});
