import crypto from 'crypto';
import express, { NextFunction, Request, Response, Router } from 'express';
import type {
  LiveQuizAnswer,
  LiveQuizHostView,
  LiveQuizPlayView,
  LiveQuizQuestion,
  LiveQuizSession,
} from '../src/types/liveQuiz';
import type { LiveQuizStore } from './liveQuizStore';

/**
 * Mimo Quiz – students join with a code and answer on their own devices.
 * Prototype: only enabled against the Firebase Emulator (or LIVE_QUIZ_ENABLED=true).
 *
 * - The answer key never leaves the server while a question is open: students
 *   get prompt/options only, correctness appears after the teacher closes it.
 * - One answer per student per question (deterministic answer id, create-only).
 * - Time is checked on the server (small grace for network delay).
 */

type TeacherRequest = Request & { teacherEmail?: string };
type StudentRequest = Request & { studentSession?: { studentId: string } };

interface LiveQuizDeps {
  getStore: () => LiveQuizStore | null;
  enabled: () => boolean;
  requireTeacher: (req: Request, res: Response, next: NextFunction) => void;
  requireStudentAuth: (req: Request, res: Response, next: NextFunction) => void;
  getStudentName: (studentId: string) => Promise<string>;
  now?: () => number;
}

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const SESSION_TTL_MS = 3 * 60 * 60 * 1000;
const ANSWER_GRACE_MS = 1500;
const MAX_QUESTIONS = 40;
const MAX_SESSION_BYTES = 800_000;
const JOIN_FAIL_LIMIT = 20;
const JOIN_FAIL_WINDOW_MS = 10 * 60 * 1000;

function makeCode(): string {
  return Array.from({ length: 6 }, () => CODE_ALPHABET[crypto.randomInt(CODE_ALPHABET.length)]).join('');
}

function isRich(v: unknown): boolean {
  return typeof v === 'object' && v !== null && Array.isArray((v as { blocks?: unknown }).blocks);
}

/** Validates questions sent by the teacher's browser. */
export function validateLiveQuestions(input: unknown): LiveQuizQuestion[] | string {
  if (!Array.isArray(input) || input.length === 0) return 'Cần ít nhất 1 câu hỏi.';
  if (input.length > MAX_QUESTIONS) return `Tối đa ${MAX_QUESTIONS} câu cho một phiên.`;
  const out: LiveQuizQuestion[] = [];
  for (const [i, raw] of input.entries()) {
    const q = raw as Partial<LiveQuizQuestion>;
    const n = Array.isArray(q?.options) ? q.options.length : 0;
    if (!isRich(q?.prompt) || n < 2 || n > 6 || !q.options!.every(isRich)) return `Câu ${i + 1} không hợp lệ.`;
    const correct = Array.isArray(q.correct) ? [...new Set(q.correct)] : [];
    if (correct.length === 0 || !correct.every((c) => Number.isInteger(c) && c >= 0 && c < n)) return `Câu ${i + 1} thiếu đáp án đúng.`;
    out.push({
      prompt: q.prompt!,
      options: q.options!,
      correct: correct.sort((a, b) => a - b),
      multi: Boolean(q.multi) || correct.length > 1,
      ...(isRich(q.explanation) ? { explanation: q.explanation } : {}),
    });
  }
  return out;
}

function sameSet(a: number[], b: number[]) {
  return a.length === b.length && a.every((x) => b.includes(x));
}

function scores(answers: LiveQuizAnswer[], countable: (a: LiveQuizAnswer) => boolean) {
  const map = new Map<string, number>();
  for (const a of answers) if (a.correct && countable(a)) map.set(a.studentId, (map.get(a.studentId) ?? 0) + 1);
  return map;
}

export function createLiveQuizRouter(deps: LiveQuizDeps): Router {
  const router = express.Router();
  const now = deps.now ?? Date.now;
  const joinFailures = new Map<string, { count: number; since: number }>();

  router.use((_req, res, next) => {
    if (!deps.enabled()) {
      res.status(503).json({ error: 'Chế độ học sinh tham gia đang thử nghiệm, chưa bật trên máy chủ này.' });
      return;
    }
    if (!deps.getStore()) {
      res.status(503).json({ error: 'Máy chủ chưa được cấu hình Firebase Admin.' });
      return;
    }
    next();
  });
  const store = () => deps.getStore()!;

  /** Closes a question whose time (plus grace) has passed. */
  async function settle(session: LiveQuizSession): Promise<LiveQuizSession> {
    if (session.status === 'question' && session.questionEndsAt !== null && now() > session.questionEndsAt + ANSWER_GRACE_MS) {
      const patch = { status: 'closed' as const };
      await store().updateSession(session.id, patch);
      return { ...session, ...patch };
    }
    return session;
  }

  const send = (res: Response, status: number, error: string) => res.status(status).json({ error });

  // ------------------------------------------------------------------ teacher

  const loadOwned = async (req: TeacherRequest, res: Response): Promise<LiveQuizSession | null> => {
    const session = await store().getSession(String(req.params.id));
    if (!session || session.teacherEmail !== req.teacherEmail) {
      send(res, 404, 'Không tìm thấy phiên Quiz.');
      return null;
    }
    return settle(session);
  };

  const hostView = async (session: LiveQuizSession): Promise<LiveQuizHostView> => {
    const [players, answers] = await Promise.all([store().listPlayers(session.id), store().listAnswers(session.id)]);
    const current = answers.filter((a) => a.index === session.index);
    const closed = session.status === 'closed' || session.status === 'ended';
    const points = scores(answers, () => true);
    const q = session.questions[session.index];
    return {
      sessionId: session.id,
      code: session.code,
      status: session.status,
      index: session.index,
      total: session.questions.length,
      serverNow: now(),
      questionEndsAt: session.questionEndsAt,
      players: players
        .sort((a, b) => a.joinedAt - b.joinedAt)
        .map((p) => ({ studentId: p.studentId, name: p.name, score: points.get(p.studentId) ?? 0, answeredCurrent: current.some((a) => a.studentId === p.studentId) })),
      answeredCount: current.length,
      optionCounts: closed && q ? q.options.map((_, i) => current.filter((a) => a.chosen.includes(i)).length) : null,
      correctCount: closed && q ? current.filter((a) => a.correct).length : null,
      questionStats: session.questions.map((_, i) => {
        const list = answers.filter((a) => a.index === i);
        return { answered: list.length, correct: list.filter((a) => a.correct).length };
      }),
    };
  };

  router.post('/sessions', deps.requireTeacher, async (req: TeacherRequest, res) => {
    const questions = validateLiveQuestions(req.body?.questions);
    if (typeof questions === 'string') return void send(res, 400, questions);
    if (JSON.stringify(questions).length > MAX_SESSION_BYTES) return void send(res, 400, 'Bộ câu hỏi quá lớn (có thể do nhiều hình ảnh). Hãy chọn ít câu hơn.');
    const sec = req.body?.perQuestionSec;
    const perQuestionSec = sec === null || sec === undefined ? null : Number(sec);
    if (perQuestionSec !== null && (!Number.isInteger(perQuestionSec) || perQuestionSec < 5 || perQuestionSec > 600)) {
      return void send(res, 400, 'Thời gian mỗi câu phải từ 5 đến 600 giây.');
    }
    const t = now();
    const id = `lq_${t.toString(36)}_${crypto.randomBytes(4).toString('hex')}`;
    const expiresAt = t + SESSION_TTL_MS;
    let code = '';
    for (let i = 0; i < 10 && !code; i++) {
      const candidate = makeCode();
      if (await store().reserveCode(candidate, id, expiresAt, t)) code = candidate;
    }
    if (!code) return void send(res, 500, 'Không tạo được mã phòng, vui lòng thử lại.');
    const session: LiveQuizSession = {
      id,
      code,
      teacherEmail: req.teacherEmail!,
      title: String(req.body?.title ?? 'Mimo Quiz').slice(0, 80),
      questions,
      perQuestionSec,
      status: 'lobby',
      index: -1,
      questionEndsAt: null,
      createdAt: t,
      expiresAt,
    };
    await store().createSession(session);
    res.status(201).json(await hostView(session));
  });

  router.get('/sessions/:id', deps.requireTeacher, async (req: TeacherRequest, res) => {
    const session = await loadOwned(req, res);
    if (session) res.json(await hostView(session));
  });

  router.post('/sessions/:id/open', deps.requireTeacher, async (req: TeacherRequest, res) => {
    const session = await loadOwned(req, res);
    if (!session) return;
    const index = Number(req.body?.index);
    if (session.status === 'ended') return void send(res, 409, 'Phiên Quiz đã kết thúc.');
    if (!Number.isInteger(index) || index < 0 || index >= session.questions.length) return void send(res, 400, 'Câu hỏi không hợp lệ.');
    if (index <= session.index) return void send(res, 409, 'Câu này đã được mở trước đó.');
    const patch: Partial<LiveQuizSession> = {
      status: 'question',
      index,
      questionEndsAt: session.perQuestionSec ? now() + session.perQuestionSec * 1000 : null,
    };
    await store().updateSession(session.id, patch);
    res.json(await hostView({ ...session, ...patch }));
  });

  router.post('/sessions/:id/close', deps.requireTeacher, async (req: TeacherRequest, res) => {
    const session = await loadOwned(req, res);
    if (!session) return;
    if (session.status !== 'question' && session.status !== 'closed') return void send(res, 409, 'Không có câu hỏi nào đang mở.');
    const patch: Partial<LiveQuizSession> = { status: 'closed', questionEndsAt: session.status === 'question' ? now() : session.questionEndsAt };
    if (session.status === 'question') await store().updateSession(session.id, patch);
    res.json(await hostView({ ...session, ...patch }));
  });

  router.post('/sessions/:id/end', deps.requireTeacher, async (req: TeacherRequest, res) => {
    const session = await loadOwned(req, res);
    if (!session) return;
    const patch: Partial<LiveQuizSession> = { status: 'ended', questionEndsAt: null };
    await store().updateSession(session.id, patch);
    res.json(await hostView({ ...session, ...patch }));
  });

  // ------------------------------------------------------------------ student

  router.post('/join', deps.requireStudentAuth, async (req: StudentRequest, res) => {
    const studentId = req.studentSession!.studentId;
    const fail = joinFailures.get(studentId);
    if (fail && now() - fail.since < JOIN_FAIL_WINDOW_MS && fail.count >= JOIN_FAIL_LIMIT) {
      return void send(res, 429, 'Con nhập sai mã nhiều lần quá, chờ vài phút rồi thử lại nhé.');
    }
    const code = String(req.body?.code ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    const id = code.length === 6 ? await store().findSessionIdByCode(code) : null;
    const session = id ? await store().getSession(id) : null;
    if (!session || session.expiresAt < now() || session.status === 'ended') {
      const rec = fail && now() - fail.since < JOIN_FAIL_WINDOW_MS ? fail : { count: 0, since: now() };
      joinFailures.set(studentId, { ...rec, count: rec.count + 1 });
      return void send(res, 404, 'Không tìm thấy phòng Quiz với mã này. Con kiểm tra lại mã trên bảng nhé.');
    }
    joinFailures.delete(studentId);
    if (!(await store().getPlayer(session.id, studentId))) {
      await store().upsertPlayer({ sessionId: session.id, studentId, name: (await deps.getStudentName(studentId)).slice(0, 60), joinedAt: now() });
    }
    res.json({ sessionId: session.id });
  });

  const loadJoined = async (req: StudentRequest, res: Response) => {
    const studentId = req.studentSession!.studentId;
    const raw = await store().getSession(String(req.params.id));
    const player = raw ? await store().getPlayer(raw.id, studentId) : null;
    if (!raw || !player) {
      send(res, 404, 'Con chưa vào phòng Quiz này.');
      return null;
    }
    return { session: await settle(raw), player, studentId };
  };

  router.get('/play/:id', deps.requireStudentAuth, async (req: StudentRequest, res) => {
    const ctx = await loadJoined(req, res);
    if (!ctx) return;
    const { session, player, studentId } = ctx;
    const mine = (await store().listAnswers(session.id)).filter((a) => a.studentId === studentId);
    const q = session.questions[session.index];
    const closed = session.status === 'closed' || session.status === 'ended';
    const myAnswer = mine.find((a) => a.index === session.index) ?? null;
    // Only questions that are no longer open count towards the visible score
    const settled = (a: LiveQuizAnswer) => a.index < session.index || (a.index === session.index && closed);
    const view: LiveQuizPlayView = {
      sessionId: session.id,
      title: session.title,
      status: session.status,
      index: session.index,
      total: session.questions.length,
      serverNow: now(),
      questionEndsAt: session.status === 'question' ? session.questionEndsAt : null,
      question: q && session.status !== 'ended' ? { prompt: q.prompt, options: q.options, multi: q.multi } : null,
      myAnswer: myAnswer?.chosen ?? null,
      correct: q && closed && session.status !== 'ended' ? q.correct : null,
      myResult: closed && myAnswer ? myAnswer.correct : null,
      myScore: mine.filter((a) => a.correct && settled(a)).length,
      name: player.name,
    };
    res.json(view);
  });

  router.post('/play/:id/answer', deps.requireStudentAuth, async (req: StudentRequest, res) => {
    const ctx = await loadJoined(req, res);
    if (!ctx) return;
    const { session, studentId } = ctx;
    const index = Number(req.body?.index);
    const q = session.questions[session.index];
    if (session.status !== 'question' || index !== session.index || !q) return void send(res, 409, 'Câu hỏi này đã đóng.');
    if (session.questionEndsAt !== null && now() > session.questionEndsAt + ANSWER_GRACE_MS) return void send(res, 409, 'Hết giờ rồi!');
    const chosen = Array.isArray(req.body?.chosen) ? [...new Set(req.body.chosen as unknown[])] : [];
    if (chosen.length === 0 || !chosen.every((c) => Number.isInteger(c) && (c as number) >= 0 && (c as number) < q.options.length) || (!q.multi && chosen.length > 1)) {
      return void send(res, 400, 'Đáp án không hợp lệ.');
    }
    const picked = (chosen as number[]).sort((a, b) => a - b);
    const created = await store().createAnswer({
      sessionId: session.id,
      index,
      studentId,
      chosen: picked,
      correct: sameSet(picked, q.correct),
      answeredAt: now(),
    });
    if (!created) return void send(res, 409, 'Con đã trả lời câu này rồi.');
    // Deliberately no correctness here: it is revealed when the question closes
    res.status(201).json({ ok: true });
  });

  return router;
}
