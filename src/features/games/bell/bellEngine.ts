import type { RichTextContent } from '../../../types/domain.js';
import { shortAnswerMatches } from '../../../utils/gradingEngine.js';

/**
 * Rung chuông vàng – the rules, shared by the server (which holds every game)
 * and the browsers. One game, two ways of answering:
 * - online: pupils answer on their phones, the server marks the answers;
 * - offline: pupils write on mini whiteboards, the teacher marks each tile.
 * Everything here is pure: a function takes a game and returns the next one,
 * or a message saying why the step is not allowed.
 */

export type BellMode = 'online' | 'offline';
/** judging: offline only, the teacher marks the whiteboards; reveal: results of the question are in. */
export type BellStatus = 'lobby' | 'question' | 'paused' | 'judging' | 'reveal' | 'ended';

export interface BellQuestion {
  prompt: RichTextContent;
  kind: 'choice' | 'short';
  options?: RichTextContent[];
  /** choice: indexes of the right options. */
  correct?: number[];
  multi?: boolean;
  /** short: accepted answers. */
  answers?: string[];
  unitMode?: 'required' | 'optional';
  acceptEquivalentFractions?: boolean;
  explanation?: RichTextContent;
}

export interface BellTurn {
  /** Question index. */
  q: number;
  /** What the pupil answered ("" = no answer in time, "bảng con" = marked by the teacher). */
  answer: string;
  ok: boolean;
}

export interface BellPlayer {
  id: string;
  seat: number;
  name: string;
  alive: boolean;
  /** Question index the pupil left the field at (null while on it). */
  outAt: number | null;
  correct: number;
  wrong: number;
  score: number;
  /** Times brought back by a rescue round. */
  rescued: number;
  history: BellTurn[];
}

export interface BellGame {
  id: string;
  code: string;
  teacherEmail: string;
  title: string;
  homeworkId: string | null;
  mode: BellMode;
  questions: BellQuestion[];
  perQuestionSec: number;
  status: BellStatus;
  /** Current question (-1 before the first). */
  index: number;
  endsAt: number | null;
  /** Time left when paused. */
  remainingMs: number | null;
  rescuesUsed: number;
  players: BellPlayer[];
  createdAt: number;
  endedAt: number | null;
  /** Pupils may join (online) until then. */
  expiresAt: number;
}

export const MAX_RESCUES = 2;
export const POINTS_PER_CORRECT = 10;
export const MAX_PLAYERS = 60;
export const MAX_BELL_QUESTIONS = 30;
/** Answers arriving this late after the clock (network delay) still count. */
export const ANSWER_GRACE_MS = 1500;

type Step = BellGame | string;

const alive = (g: BellGame) => g.players.filter((p) => p.alive);
export const aliveCount = (g: BellGame) => alive(g).length;
export const isLastQuestion = (g: BellGame) => g.index >= g.questions.length - 1;

export function addPlayer(g: BellGame, id: string, name: string): Step {
  if (g.status !== 'lobby') return 'Trận đấu đã bắt đầu, không vào thêm được.';
  if (g.players.length >= MAX_PLAYERS) return `Sân đã đủ ${MAX_PLAYERS} người chơi.`;
  const clean = name.replace(/\s+/g, ' ').trim().slice(0, 40);
  if (!clean) return 'Cần nhập tên.';
  const seat = Math.max(0, ...g.players.map((p) => p.seat)) + 1;
  return { ...g, players: [...g.players, { id, seat, name: clean, alive: true, outAt: null, correct: 0, wrong: 0, score: 0, rescued: 0, history: [] }] };
}

/** Opens the next question for everyone at once. */
export function startQuestion(g: BellGame, now: number): Step {
  if (g.status !== 'lobby' && g.status !== 'reveal') return 'Chưa thể mở câu tiếp theo.';
  if (isLastQuestion(g)) return 'Đã hết câu hỏi.';
  if (g.players.length === 0) return 'Chưa có người chơi nào trên sân.';
  if (aliveCount(g) === 0) return 'Không còn ai trên sân – hãy dùng cứu trợ hoặc kết thúc.';
  return { ...g, status: 'question', index: g.index + 1, endsAt: now + g.perQuestionSec * 1000, remainingMs: null };
}

export function pause(g: BellGame, now: number): Step {
  if (g.status !== 'question' || g.endsAt === null) return 'Không có câu hỏi đang chạy.';
  return { ...g, status: 'paused', remainingMs: Math.max(0, g.endsAt - now), endsAt: null };
}

export function resume(g: BellGame, now: number): Step {
  if (g.status !== 'paused') return 'Trận đấu không tạm dừng.';
  return { ...g, status: 'question', endsAt: now + (g.remainingMs ?? 0), remainingMs: null };
}

/** The clock ran out (plus grace) on an open question. */
export const timeIsUp = (g: BellGame, now: number) => g.status === 'question' && g.endsAt !== null && now > g.endsAt + ANSWER_GRACE_MS;

export function checkAnswer(q: BellQuestion, raw: string): boolean {
  if (q.kind === 'choice') {
    const picked = [...new Set(raw.split(',').filter(Boolean).map(Number))].sort((a, b) => a - b);
    const key = [...(q.correct ?? [])].sort((a, b) => a - b);
    return picked.length === key.length && picked.every((v, i) => v === key[i]);
  }
  return (q.answers ?? []).some((k) => shortAnswerMatches(raw, k, { unitMode: q.unitMode, acceptEquivalentFractions: q.acceptEquivalentFractions }));
}

/** A pupil's raw answer as the teacher reads it: option letters, or the text typed. */
export function answerLabel(q: BellQuestion, raw: string): string {
  if (!raw) return '';
  if (q.kind !== 'choice') return raw;
  return raw.split(',').filter(Boolean).map((i) => String.fromCharCode(65 + Number(i))).join(', ');
}

/** The right answer as shown on the board after a question. */
export function rightAnswerLabel(q: BellQuestion): string {
  return q.kind === 'choice' ? answerLabel(q, (q.correct ?? []).join(',')) : (q.answers ?? []).join(' / ');
}

/** Records one result per pupil on the field: right stays, wrong (or no answer) leaves. */
function applyResults(g: BellGame, results: Map<string, { answer: string; ok: boolean }>): BellGame {
  return {
    ...g,
    status: 'reveal',
    endsAt: null,
    remainingMs: null,
    players: g.players.map((p) => {
      if (!p.alive) return p;
      const r = results.get(p.id) ?? { answer: '', ok: false };
      const turn: BellTurn = { q: g.index, answer: r.answer, ok: r.ok };
      return r.ok
        ? { ...p, correct: p.correct + 1, score: p.score + POINTS_PER_CORRECT, history: [...p.history, turn] }
        : { ...p, wrong: p.wrong + 1, alive: false, outAt: g.index, history: [...p.history, turn] };
    }),
  };
}

/**
 * Closes the open (or paused) question. Online: the server marks the answers
 * received (none in time = out). Offline: the teacher marks the whiteboards next.
 */
export function closeQuestion(g: BellGame, answers: Map<string, string>): Step {
  if (g.status !== 'question' && g.status !== 'paused') return 'Không có câu hỏi đang mở.';
  if (g.mode === 'offline') return { ...g, status: 'judging', endsAt: null, remainingMs: null };
  const q = g.questions[g.index];
  const results = new Map<string, { answer: string; ok: boolean }>();
  for (const p of alive(g)) {
    const raw = answers.get(p.id) ?? '';
    results.set(p.id, { answer: raw, ok: raw !== '' && checkAnswer(q, raw) });
  }
  return applyResults(g, results);
}

/** Offline: the teacher's marks for every pupil still on the field. */
export function judge(g: BellGame, marks: Record<string, boolean>): Step {
  if (g.status !== 'judging') return 'Chưa đến lúc chấm bảng con.';
  const missing = alive(g).filter((p) => typeof marks[p.id] !== 'boolean');
  if (missing.length) return `Còn ${missing.length} bạn chưa chấm: ${missing.map((p) => p.seat).join(', ')}.`;
  return applyResults(g, new Map(alive(g).map((p) => [p.id, { answer: 'bảng con', ok: marks[p.id] }])));
}

/**
 * A rescue round (at most two per game, between questions): the chosen pupils
 * who are out come back onto the field.
 */
export function rescue(g: BellGame, ids: string[]): Step {
  if (g.status !== 'reveal') return 'Chỉ cứu trợ được sau khi công bố kết quả một câu.';
  if (g.rescuesUsed >= MAX_RESCUES) return `Đã dùng hết ${MAX_RESCUES} lượt cứu trợ.`;
  const chosen = new Set(ids);
  const back = g.players.filter((p) => !p.alive && chosen.has(p.id));
  if (!back.length) return 'Chưa chọn bạn nào đã bị loại.';
  return {
    ...g,
    rescuesUsed: g.rescuesUsed + 1,
    players: g.players.map((p) => (!p.alive && chosen.has(p.id) ? { ...p, alive: true, outAt: null, rescued: p.rescued + 1 } : p)),
  };
}

/** The teacher's own correction: takes one pupil off the field, or puts them back (not a rescue round). */
export function setOnField(g: BellGame, id: string, onField: boolean): Step {
  if (g.status === 'ended') return 'Trận đấu đã kết thúc.';
  const p = g.players.find((x) => x.id === id);
  if (!p) return 'Không tìm thấy người chơi.';
  if (p.alive === onField) return g;
  return { ...g, players: g.players.map((x) => (x.id === id ? { ...x, alive: onField, outAt: onField ? null : Math.max(0, g.index) } : x)) };
}

export function endGame(g: BellGame, now: number): Step {
  if (g.status === 'ended') return g;
  return { ...g, status: 'ended', endsAt: null, remainingMs: null, endedAt: now };
}

/** Winners: everyone still on the field; if nobody is, the best scores. */
export function winners(g: BellGame): BellPlayer[] {
  const on = alive(g);
  if (on.length) return on;
  const best = Math.max(0, ...g.players.map((p) => p.score));
  return best > 0 ? g.players.filter((p) => p.score === best) : [];
}

/** Final order: on the field first, then by score, then by how late they left. */
export function standings(g: BellGame): BellPlayer[] {
  return [...g.players].sort((a, b) => Number(b.alive) - Number(a.alive) || b.score - a.score || (b.outAt ?? -1) - (a.outAt ?? -1) || a.seat - b.seat);
}

function isRich(v: unknown): v is RichTextContent {
  return typeof v === 'object' && v !== null && Array.isArray((v as { blocks?: unknown }).blocks);
}

/** Checks the questions a teacher's browser sends; every one must carry its approved key. */
export function validateBellQuestions(input: unknown): BellQuestion[] | string {
  if (!Array.isArray(input) || input.length === 0) return 'Cần ít nhất 1 câu hỏi có đáp án.';
  if (input.length > MAX_BELL_QUESTIONS) return `Tối đa ${MAX_BELL_QUESTIONS} câu cho một trận.`;
  const out: BellQuestion[] = [];
  for (const [i, raw] of input.entries()) {
    const q = raw as Partial<BellQuestion>;
    if (!isRich(q?.prompt)) return `Câu ${i + 1} không hợp lệ.`;
    const extra = { ...(isRich(q.explanation) ? { explanation: q.explanation } : {}) };
    if (q.kind === 'choice') {
      const n = Array.isArray(q.options) ? q.options.length : 0;
      if (n < 2 || n > 6 || !q.options!.every(isRich)) return `Câu ${i + 1} không hợp lệ.`;
      const correct = Array.isArray(q.correct) ? [...new Set(q.correct)] : [];
      if (!correct.length || !correct.every((c) => Number.isInteger(c) && c >= 0 && c < n)) return `Câu ${i + 1} thiếu đáp án đúng.`;
      out.push({ prompt: q.prompt, kind: 'choice', options: q.options, correct: correct.sort((a, b) => a - b), multi: Boolean(q.multi) || correct.length > 1, ...extra });
    } else if (q.kind === 'short') {
      const answers = Array.isArray(q.answers) ? q.answers.filter((a): a is string => typeof a === 'string' && a.trim() !== '').slice(0, 10) : [];
      if (!answers.length) return `Câu ${i + 1} thiếu đáp án đúng.`;
      out.push({
        prompt: q.prompt,
        kind: 'short',
        answers,
        ...(q.unitMode === 'optional' ? { unitMode: 'optional' as const } : {}),
        ...(q.acceptEquivalentFractions ? { acceptEquivalentFractions: true } : {}),
        ...extra,
      });
    } else return `Câu ${i + 1} không hợp lệ.`;
  }
  return out;
}

// ---------------------------------------------------------------- views

/** A question as a pupil's phone gets it: no key. */
export interface BellPublicQuestion {
  prompt: RichTextContent;
  kind: 'choice' | 'short';
  options?: RichTextContent[];
  multi?: boolean;
}

export interface BellPlayView {
  gameId: string;
  title: string;
  status: BellStatus;
  index: number;
  total: number;
  serverNow: number;
  endsAt: number | null;
  remainingMs: number | null;
  me: Omit<BellPlayer, 'history' | 'id'> | null;
  playerCount: number;
  aliveCount: number;
  /** Shown while the question is open, to pupils on the field. */
  question: BellPublicQuestion | null;
  /** This pupil's answer to the open question, once sent. */
  myAnswer: string | null;
  /** After a question: whether this pupil was right, and the right answer. */
  result: { ok: boolean; rightAnswer: string } | null;
  winners: string[] | null;
}

export function playView(g: BellGame, playerId: string, myAnswer: string | null, now: number): BellPlayView {
  const p = g.players.find((x) => x.id === playerId) ?? null;
  const q = g.questions[g.index];
  const open = (g.status === 'question' || g.status === 'paused') && Boolean(q);
  const turn = p?.history.find((h) => h.q === g.index);
  return {
    gameId: g.id,
    title: g.title,
    status: g.status,
    index: g.index,
    total: g.questions.length,
    serverNow: now,
    endsAt: g.endsAt,
    remainingMs: g.remainingMs,
    me: p ? { seat: p.seat, name: p.name, alive: p.alive, outAt: p.outAt, correct: p.correct, wrong: p.wrong, score: p.score, rescued: p.rescued } : null,
    playerCount: g.players.length,
    aliveCount: aliveCount(g),
    question: open && p?.alive ? { prompt: q.prompt, kind: q.kind, ...(q.kind === 'choice' ? { options: q.options, multi: q.multi } : {}) } : null,
    myAnswer: open ? myAnswer : null,
    result: (g.status === 'reveal' || g.status === 'ended') && q && turn ? { ok: turn.ok, rightAnswer: rightAnswerLabel(q) } : null,
    winners: g.status === 'ended' ? winners(g).map((w) => `${w.seat}. ${w.name}`) : null,
  };
}

/** The teacher's board: the whole game plus who has answered the open question. */
export interface BellHostView extends Omit<BellGame, 'teacherEmail'> {
  serverNow: number;
  answeredIds: string[];
}

export function hostView(g: BellGame, answeredIds: string[], now: number): BellHostView {
  const { teacherEmail: _t, ...rest } = g;
  return { ...rest, serverNow: now, answeredIds };
}

export interface BellSummary {
  id: string;
  title: string;
  mode: BellMode;
  status: BellStatus;
  createdAt: number;
  endedAt: number | null;
  players: number;
  questions: number;
  reached: number;
  winners: string[];
}

export function summary(g: BellGame): BellSummary {
  return {
    id: g.id,
    title: g.title,
    mode: g.mode,
    status: g.status,
    createdAt: g.createdAt,
    endedAt: g.endedAt,
    players: g.players.length,
    questions: g.questions.length,
    reached: g.index + 1,
    winners: g.status === 'ended' ? winners(g).map((w) => `${w.seat}. ${w.name}`) : [],
  };
}
