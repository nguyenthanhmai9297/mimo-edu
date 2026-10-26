import crypto from 'crypto';
import express, { NextFunction, Request, Response, Router } from 'express';
import {
  addPlayer,
  closeQuestion,
  endGame,
  hostView,
  judge,
  MAX_PLAYERS,
  pause,
  playView,
  rescue,
  resume,
  setOnField,
  startQuestion,
  summary,
  timeIsUp,
  validateBellQuestions,
  ANSWER_GRACE_MS,
  type BellGame,
  type BellMode,
} from '../src/features/games/bell/bellEngine.js';
import type { BellGameStore } from './bellGameStore.js';

/**
 * Rung chuông vàng. The teacher's board and the pupils' phones only talk to
 * this API; the game (with its answer keys) stays on the server.
 * - Pupils need no account: they join with the 6-digit code and a name and get
 *   a signed player token for this one game.
 * - Online answers are marked here when the question closes (time up or the
 *   teacher closes it); the key is never sent to a phone before that.
 * - Offline games run through the same steps; the teacher marks the tiles.
 */

type TeacherRequest = Request & { teacherEmail?: string };

interface BellDeps {
  getStore: () => BellGameStore | null;
  requireTeacher: (req: Request, res: Response, next: NextFunction) => void;
  sign: (data: string) => string;
  now?: () => number;
}

const JOIN_TTL_MS = 4 * 60 * 60 * 1000;
const MAX_GAME_BYTES = 700_000;
/** Games read for polling are shared for this long inside one server instance. */
const CACHE_MS = 800;
const JOIN_FAIL_LIMIT = 30;
const JOIN_FAIL_WINDOW_MS = 10 * 60 * 1000;

const makeCode = () => String(crypto.randomInt(100000, 1000000));

export function createBellGameRouter(deps: BellDeps): Router {
  const router = express.Router();
  const now = deps.now ?? Date.now;
  const cache = new Map<string, { game: BellGame; at: number }>();
  const joinFailures = new Map<string, { count: number; since: number }>();

  router.use((_req, res, next) => {
    if (!deps.getStore()) return void res.status(503).json({ error: 'Máy chủ chưa được cấu hình Firebase Admin.' });
    next();
  });
  const store = () => deps.getStore()!;
  const send = (res: Response, status: number, error: string) => res.status(status).json({ error });
  const remember = (g: BellGame | null) => {
    if (g) cache.set(g.id, { game: g, at: now() });
    return g;
  };

  /** Applies one rule step; a refused step answers 409 with the reason. */
  async function step(res: Response, id: string, fn: (g: BellGame, answers: Map<string, string>) => BellGame | string, answersOf?: (g: BellGame) => number | null) {
    let refused = '';
    const next = await store().mutate(
      id,
      (g, answers) => {
        const out = fn(g, new Map(answers.map((a) => [a.playerId, a.answer])));
        if (typeof out === 'string') {
          refused = out;
          return null;
        }
        return out;
      },
      answersOf
    );
    remember(next);
    if (refused) send(res, 409, refused);
    return refused ? null : next;
  }

  /** Closes a question whose time is up; the first poll after the clock does it, once. */
  async function load(id: string, fresh = false): Promise<BellGame | null> {
    const hit = cache.get(id);
    let g = !fresh && hit && now() - hit.at < CACHE_MS ? hit.game : remember(await store().get(id));
    if (g && timeIsUp(g, now())) {
      g = remember(
        await store().mutate(
          id,
          (cur, answers) => {
            if (!timeIsUp(cur, now())) return null;
            const out = closeQuestion(cur, new Map(answers.map((a) => [a.playerId, a.answer])));
            return typeof out === 'string' ? null : out;
          },
          (cur) => (cur.mode === 'online' ? cur.index : null)
        )
      );
    }
    return g;
  }

  // ------------------------------------------------------------------ teacher

  const owned = async (req: TeacherRequest, res: Response, fresh = false) => {
    const g = await load(String(req.params.id), fresh);
    if (!g || g.teacherEmail !== req.teacherEmail) {
      send(res, 404, 'Không tìm thấy trận đấu.');
      return null;
    }
    return g;
  };
  const board = async (g: BellGame) => {
    const answered = g.mode === 'online' && (g.status === 'question' || g.status === 'paused') ? (await store().listAnswers(g.id, g.index)).map((a) => a.playerId) : [];
    return hostView(g, answered, now());
  };

  router.post('/games', deps.requireTeacher, async (req: TeacherRequest, res) => {
    const questions = validateBellQuestions(req.body?.questions);
    if (typeof questions === 'string') return void send(res, 400, questions);
    if (JSON.stringify(questions).length > MAX_GAME_BYTES) return void send(res, 400, 'Bộ câu hỏi quá lớn (nhiều hình ảnh). Hãy chọn ít câu hơn.');
    const mode: BellMode = req.body?.mode === 'offline' ? 'offline' : 'online';
    const sec = Number(req.body?.perQuestionSec);
    if (!Number.isInteger(sec) || sec < 5 || sec > 300) return void send(res, 400, 'Thời gian mỗi câu phải từ 5 đến 300 giây.');
    const names: string[] = Array.isArray(req.body?.players) ? req.body.players.filter((n: unknown) => typeof n === 'string' && n.trim()) : [];
    if (mode === 'offline' && names.length === 0) return void send(res, 400, 'Chế độ bảng con cần danh sách học sinh.');
    if (names.length > MAX_PLAYERS) return void send(res, 400, `Tối đa ${MAX_PLAYERS} học sinh.`);
    const t = now();
    const id = `bell_${t.toString(36)}_${crypto.randomBytes(4).toString('hex')}`;
    let code = '';
    for (let i = 0; i < 12 && !code; i++) {
      const c = makeCode();
      if (await store().reserveCode(c, id, t + JOIN_TTL_MS, t)) code = c;
    }
    if (!code) return void send(res, 500, 'Không tạo được mã phòng, vui lòng thử lại.');
    let game: BellGame = {
      id,
      code,
      teacherEmail: req.teacherEmail!,
      title: String(req.body?.title ?? 'Rung chuông vàng').slice(0, 100),
      homeworkId: typeof req.body?.homeworkId === 'string' ? req.body.homeworkId.slice(0, 100) : null,
      mode,
      questions,
      perQuestionSec: sec,
      status: 'lobby',
      index: -1,
      endsAt: null,
      remainingMs: null,
      rescuesUsed: 0,
      players: [],
      createdAt: t,
      endedAt: null,
      expiresAt: t + JOIN_TTL_MS,
    };
    for (const [i, name] of names.entries()) {
      const out = addPlayer(game, `p${i + 1}`, name);
      if (typeof out === 'string') return void send(res, 400, out);
      game = out;
    }
    await store().create(game);
    res.status(201).json(hostView(remember(game)!, [], t));
  });

  router.get('/games', deps.requireTeacher, async (req: TeacherRequest, res) => {
    res.json((await store().listByTeacher(req.teacherEmail!, 30)).map(summary));
  });

  router.get('/games/:id', deps.requireTeacher, async (req: TeacherRequest, res) => {
    const g = await owned(req, res);
    if (g) res.json(await board(g));
  });

  /** Teacher actions: start (next question), pause, resume, close, judge, rescue, field, end. */
  router.post('/games/:id/:action', deps.requireTeacher, async (req: TeacherRequest, res) => {
    const g = await owned(req, res, true);
    if (!g) return;
    const t = now();
    const body = req.body ?? {};
    let next: BellGame | null = null;
    switch (req.params.action) {
      case 'start':
        next = await step(res, g.id, (cur) => startQuestion(cur, t));
        break;
      case 'pause':
        next = await step(res, g.id, (cur) => pause(cur, t));
        break;
      case 'resume':
        next = await step(res, g.id, (cur) => resume(cur, t));
        break;
      case 'close':
        next = await step(res, g.id, (cur, answers) => closeQuestion(cur, answers), (cur) => (cur.mode === 'online' ? cur.index : null));
        break;
      case 'judge': {
        const marks: Record<string, boolean> = {};
        for (const [k, v] of Object.entries(body.marks ?? {})) if (typeof v === 'boolean') marks[k] = v;
        next = await step(res, g.id, (cur) => judge(cur, marks));
        break;
      }
      case 'rescue':
        next = await step(res, g.id, (cur) => rescue(cur, Array.isArray(body.playerIds) ? body.playerIds.map(String) : []));
        break;
      case 'field':
        next = await step(res, g.id, (cur) => setOnField(cur, String(body.playerId ?? ''), body.onField === true));
        break;
      case 'end':
        next = await step(res, g.id, (cur) => endGame(cur, t));
        break;
      default:
        return void send(res, 404, 'Thao tác không hợp lệ.');
    }
    if (next) res.json(await board(next));
  });

  // ------------------------------------------------------------------ pupils

  const playerToken = (gameId: string, playerId: string) => {
    const data = Buffer.from(JSON.stringify({ t: 'bell', g: gameId, p: playerId })).toString('base64url');
    return `${data}.${deps.sign(data)}`;
  };
  const readPlayer = (req: Request): { g: string; p: string } | null => {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) return null;
    const [data, sig] = header.slice(7).split('.');
    if (!data || !sig) return null;
    const expected = deps.sign(data);
    if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
    try {
      const v = JSON.parse(Buffer.from(data, 'base64url').toString());
      return v?.t === 'bell' && typeof v.g === 'string' && typeof v.p === 'string' ? { g: v.g, p: v.p } : null;
    } catch {
      return null;
    }
  };

  router.post('/join', async (req, res) => {
    // Behind the hosting proxy every request shares one address: the client's is the first forwarded one
    const who = String(req.headers['x-forwarded-for'] ?? '').split(',')[0].trim() || req.ip || 'unknown';
    const fail = joinFailures.get(who);
    if (fail && now() - fail.since < JOIN_FAIL_WINDOW_MS && fail.count >= JOIN_FAIL_LIMIT) {
      return void send(res, 429, 'Nhập sai mã nhiều lần quá, chờ vài phút rồi thử lại nhé.');
    }
    const code = String(req.body?.code ?? '').replace(/\D/g, '');
    const id = code.length === 6 ? await store().findGameIdByCode(code) : null;
    const found = id ? await load(id, true) : null;
    if (!found || found.mode !== 'online' || found.expiresAt < now() || found.status === 'ended') {
      const rec = fail && now() - fail.since < JOIN_FAIL_WINDOW_MS ? fail : { count: 0, since: now() };
      joinFailures.set(who, { ...rec, count: rec.count + 1 });
      return void send(res, 404, 'Không tìm thấy phòng với mã này. Con kiểm tra lại mã trên màn chiếu nhé.');
    }
    const playerId = `p_${crypto.randomBytes(6).toString('hex')}`;
    const next = await step(res, found.id, (cur) => addPlayer(cur, playerId, String(req.body?.name ?? '')));
    if (!next) return;
    res.status(201).json({ gameId: next.id, token: playerToken(next.id, playerId) });
  });

  const joined = async (req: Request, res: Response) => {
    const who = readPlayer(req);
    const g = who ? await load(who.g) : null;
    if (!who || !g || !g.players.some((p) => p.id === who.p)) {
      send(res, 401, 'Con chưa vào phòng này hoặc phiên chơi đã hết. Hãy nhập lại mã phòng.');
      return null;
    }
    return { g, playerId: who.p };
  };

  router.get('/play', async (req, res) => {
    const ctx = await joined(req, res);
    if (!ctx) return;
    const { g, playerId } = ctx;
    const open = g.status === 'question' || g.status === 'paused';
    const mine = open && g.mode === 'online' ? await store().getAnswer(g.id, g.index, playerId) : null;
    res.json(playView(g, playerId, mine?.answer ?? null, now()));
  });

  router.post('/play/answer', async (req, res) => {
    const ctx = await joined(req, res);
    if (!ctx) return;
    const g = (await load(ctx.g.id, true))!;
    const me = g.players.find((p) => p.id === ctx.playerId);
    const q = g.questions[g.index];
    if (g.mode !== 'online' || g.status !== 'question' || Number(req.body?.index) !== g.index || !q) return void send(res, 409, 'Câu hỏi này đã đóng.');
    if (!me?.alive) return void send(res, 409, 'Con đang ở ngoài sân, chờ cứu trợ nhé.');
    if (g.endsAt !== null && now() > g.endsAt + ANSWER_GRACE_MS) return void send(res, 409, 'Hết giờ rồi!');
    let answer = '';
    if (q.kind === 'choice') {
      const chosen = Array.isArray(req.body?.chosen) ? [...new Set(req.body.chosen as unknown[])] : [];
      const n = q.options?.length ?? 0;
      if (!chosen.length || !chosen.every((c) => Number.isInteger(c) && (c as number) >= 0 && (c as number) < n) || (!q.multi && chosen.length > 1)) {
        return void send(res, 400, 'Đáp án không hợp lệ.');
      }
      answer = (chosen as number[]).sort((a, b) => a - b).join(',');
    } else {
      answer = String(req.body?.text ?? '').replace(/\s+/g, ' ').trim().slice(0, 60);
      if (!answer) return void send(res, 400, 'Con chưa viết câu trả lời.');
    }
    const created = await store().createAnswer({ gameId: g.id, index: g.index, playerId: ctx.playerId, answer, at: now() });
    if (!created) return void send(res, 409, 'Con đã trả lời câu này rồi.');
    // No right/wrong here: it is shown to everyone when the question closes
    res.status(201).json({ ok: true });
  });

  return router;
}
