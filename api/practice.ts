import crypto from 'crypto';
import express, { NextFunction, Request, Response, Router } from 'express';
import { findPracticeTopic } from '../src/data/practiceCatalog';
import {
  PRACTICE_LEVELS,
  PracticeAttempt,
  PracticeCatalogAvailability,
  PracticeLevel,
  PracticePublicQuestion,
  PracticeQuestion,
  PracticeStartResponse,
  PracticeSubmitResponse,
} from '../src/types/practice';
import {
  buildAttemptQuestions,
  gradePracticeAttempt,
  pickPracticeQuestions,
  Rng,
  toPublicQuestion,
} from '../src/utils/practiceEngine';
import type { PracticeStore } from './practiceStore';

/**
 * Student API for "Luyện Toán cùng Mimo". Answers and explanations never leave
 * the server before an attempt is submitted: /start returns option texts in a
 * per-attempt shuffled order without ids, and grading happens here.
 */

type StudentRequest = Request & { studentSession?: { studentId: string } };

interface PracticeRouterDeps {
  getStore: () => PracticeStore | null;
  requireStudentAuth: (req: Request, res: Response, next: NextFunction) => void;
  rng?: Rng;
  now?: () => Date;
}

const CATALOG_CACHE_MS = 60_000;
const HISTORY_LIMIT = 20;

function emptyLevels(): Record<PracticeLevel, number> {
  return { nhan_biet: 0, thong_hieu: 0, van_dung: 0, thu_thach: 0 };
}

export function summarizeAvailability(questions: PracticeQuestion[]): PracticeCatalogAvailability {
  const topics: PracticeCatalogAvailability['topics'] = {};
  for (const q of questions) {
    const t = (topics[q.topicId] ??= { levels: emptyLevels(), skills: {} });
    t.levels[q.level] += 1;
    t.skills[q.skillId] = (t.skills[q.skillId] ?? 0) + 1;
  }
  return { topics };
}

function publicQuestionsOf(attempt: PracticeAttempt, questions: PracticeQuestion[]): PracticePublicQuestion[] {
  return attempt.questionIds
    .map((id) => questions.find((q) => q.id === id))
    .filter((q): q is PracticeQuestion => Boolean(q))
    .map((q) => toPublicQuestion(q, attempt.optionOrder[q.id] ?? []));
}

function submittedResponse(attempt: PracticeAttempt, questions: PracticeQuestion[]): PracticeSubmitResponse {
  const skills = new Map<string, { skillId: string; correct: number; total: number }>();
  for (const r of attempt.results ?? []) {
    const s = skills.get(r.skillId) ?? { skillId: r.skillId, correct: 0, total: 0 };
    s.total += 1;
    if (r.correct) s.correct += 1;
    skills.set(r.skillId, s);
  }
  return {
    attemptId: attempt.id,
    score: attempt.score ?? 0,
    total: attempt.total,
    questions: publicQuestionsOf(attempt, questions),
    results: attempt.results ?? [],
    skills: [...skills.values()],
  };
}

export function createPracticeRouter({
  getStore,
  requireStudentAuth,
  rng = Math.random,
  now = () => new Date(),
}: PracticeRouterDeps): Router {
  const router = express.Router();
  let catalogCache: { at: number; data: PracticeCatalogAvailability } | null = null;

  router.use(requireStudentAuth);
  router.use((_req, res, next) => {
    if (!getStore()) {
      res.status(503).json({ error: 'Tính năng Luyện Toán chưa được cấu hình trên máy chủ.' });
      return;
    }
    next();
  });

  const handle =
    (fn: (req: StudentRequest, res: Response, store: PracticeStore, studentId: string) => Promise<void>) =>
    async (req: Request, res: Response) => {
      try {
        await fn(req as StudentRequest, res, getStore()!, (req as StudentRequest).studentSession!.studentId);
      } catch (error) {
        console.error('Practice API error:', error);
        res.status(500).json({ error: 'Lỗi máy chủ khi xử lý bài luyện tập. Vui lòng thử lại.' });
      }
    };

  router.get(
    '/catalog',
    handle(async (_req, res, store) => {
      if (!catalogCache || now().getTime() - catalogCache.at > CATALOG_CACHE_MS) {
        catalogCache = { at: now().getTime(), data: summarizeAvailability(await store.listAllServableQuestions()) };
      }
      res.json(catalogCache.data);
    })
  );

  router.post(
    '/start',
    handle(async (req, res, store, studentId) => {
      const { topicId, level, skillId } = (req.body ?? {}) as {
        topicId?: unknown;
        level?: unknown;
        skillId?: unknown;
      };
      if (typeof topicId !== 'string' || !findPracticeTopic(topicId)) {
        res.status(400).json({ error: 'Chuyên đề không hợp lệ.' });
        return;
      }
      if (!PRACTICE_LEVELS.includes(level as PracticeLevel)) {
        res.status(400).json({ error: 'Mức độ không hợp lệ.' });
        return;
      }
      if (skillId != null && (typeof skillId !== 'string' || !skillId.startsWith(`${topicId}.`))) {
        res.status(400).json({ error: 'Kĩ năng không thuộc chuyên đề đã chọn.' });
        return;
      }

      const pool = await store.listServableQuestions(topicId);
      const picked = pickPracticeQuestions(
        pool,
        { level: level as PracticeLevel, skillId: (skillId as string | null) ?? null },
        rng
      );
      if (picked.length === 0) {
        res.status(404).json({ error: 'Chưa có câu hỏi cho lựa chọn này. Con hãy chọn mức độ hoặc kĩ năng khác nhé!' });
        return;
      }

      const { optionOrder, publicQuestions } = buildAttemptQuestions(picked, rng);
      const attempt: PracticeAttempt = {
        id: `${studentId}_${now().getTime()}_${crypto.randomBytes(4).toString('hex')}`,
        studentId,
        topicId,
        skillId: (skillId as string | null) ?? null,
        level: level as PracticeLevel,
        questionIds: picked.map((q) => q.id),
        optionOrder,
        status: 'in_progress',
        total: picked.length,
        startedAt: now().toISOString(),
      };
      await store.createAttempt(attempt);

      const body: PracticeStartResponse = {
        attemptId: attempt.id,
        topicId,
        skillId: attempt.skillId,
        level: attempt.level,
        questions: publicQuestions,
      };
      res.json(body);
    })
  );

  router.post(
    '/submit',
    handle(async (req, res, store, studentId) => {
      const { attemptId, answers } = (req.body ?? {}) as { attemptId?: unknown; answers?: unknown };
      const attempt = typeof attemptId === 'string' ? await store.getAttempt(attemptId) : null;
      // Someone else's attempt looks the same as a missing one
      if (!attempt || attempt.studentId !== studentId) {
        res.status(404).json({ error: 'Không tìm thấy bài luyện tập.' });
        return;
      }
      const questions = await store.getQuestions(attempt.questionIds);
      if (attempt.status === 'submitted') {
        res.json(submittedResponse(attempt, questions));
        return;
      }

      const graded = gradePracticeAttempt(attempt, questions, answers);
      const patch: Partial<PracticeAttempt> = {
        status: 'submitted',
        answers: graded.answers,
        results: graded.results,
        score: graded.score,
        total: graded.total,
        submittedAt: now().toISOString(),
      };
      const saved = await store.completeAttempt(attempt.id, patch);
      // Lost a race with a concurrent submit: return what was stored first
      const final = saved ? { ...attempt, ...patch } : await store.getAttempt(attempt.id);
      res.json(submittedResponse(final as PracticeAttempt, questions));
    })
  );

  router.get(
    '/attempts',
    handle(async (_req, res, store, studentId) => {
      const attempts = await store.listAttempts(studentId, HISTORY_LIMIT);
      res.json(
        attempts.map(({ id, topicId, skillId, level, status, score, total, startedAt, submittedAt }) => ({
          id,
          topicId,
          skillId,
          level,
          status,
          score: score ?? null,
          total,
          startedAt,
          submittedAt: submittedAt ?? null,
        }))
      );
    })
  );

  router.get(
    '/attempts/:id',
    handle(async (req, res, store, studentId) => {
      const attempt = await store.getAttempt(String(req.params.id));
      if (!attempt || attempt.studentId !== studentId) {
        res.status(404).json({ error: 'Không tìm thấy bài luyện tập.' });
        return;
      }
      const questions = await store.getQuestions(attempt.questionIds);
      if (attempt.status === 'submitted') {
        res.json({ status: 'submitted', ...submittedResponse(attempt, questions) });
        return;
      }
      // Resuming: still no answers
      res.json({
        status: 'in_progress',
        attemptId: attempt.id,
        topicId: attempt.topicId,
        skillId: attempt.skillId,
        level: attempt.level,
        questions: publicQuestionsOf(attempt, questions),
      });
    })
  );

  return router;
}
