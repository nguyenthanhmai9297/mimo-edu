import { isAnswerCorrect, shuffleOptions, type ToolQuestion } from './toolQuestions';
import { shuffleList, type Random } from './toolUtils';

/**
 * Rules of "Kéo co kiến thức" (single screen run by the teacher), kept pure so
 * they can be unit-tested. Team 0 = left (Đội Xanh), team 1 = right (Đội Đỏ).
 */
export type Team = 0 | 1;

export interface TugSettings {
  teamNames: [string, string];
  questionCount: number;
  durationSec: number;
  /**
   * first: the first team to reach `target` points wins.
   * lead: the first team ahead by `target` points wins.
   * time: best score when time (or the questions) run out.
   * With first/lead, running out of time or questions also ends the game on the best score.
   */
  winRule: 'first' | 'lead' | 'time';
  target: number;
  /** turns: teams answer one after another · race: both teams answer their own question at once */
  mode: 'turns' | 'race';
  /** Race mode: seconds a side waits after a wrong answer, with the right answer shown (0 = 1.5 s). */
  lockSeconds: number;
}

/** What happened to the question a team is looking at. chosen = null: the teacher revealed it without an answer. */
export interface TugReveal {
  chosen: number[] | null;
  correct: boolean | null;
}

export interface TugState {
  deck: ToolQuestion[];
  /** Next deck index to deal. */
  next: number;
  /** Deck index currently shown to each team (null = none). */
  current: [number | null, number | null];
  /** Set once the current question is answered or revealed; it can't score again. */
  reveal: [TugReveal | null, TugReveal | null];
  turn: Team;
  scores: [number, number];
  answered: [number, number];
  lockedUntil: [number, number];
  endsAt: number;
  /** Time the clock was paused, or null while it runs. */
  pausedAt: number | null;
  finished: boolean;
  winner: Team | 'draw' | null;
  endReason: 'target' | 'lead' | 'time' | 'questions' | 'stopped' | null;
}

export const DEFAULT_TUG_SETTINGS: TugSettings = {
  teamNames: ['Đội Xanh', 'Đội Đỏ'],
  questionCount: 20,
  durationSec: 5 * 60,
  winRule: 'first',
  target: 3,
  mode: 'turns',
  lockSeconds: 3,
};

const RACE_MIN_WAIT_MS = 1500;

function copy(prev: TugState): TugState {
  return {
    ...prev,
    current: [...prev.current] as TugState['current'],
    reveal: [...prev.reveal] as TugState['reveal'],
    scores: [...prev.scores] as TugState['scores'],
    answered: [...prev.answered] as TugState['answered'],
    lockedUntil: [...prev.lockedUntil] as TugState['lockedUntil'],
  };
}

function deal(state: TugState): number | null {
  if (state.next >= state.deck.length) return null;
  const idx = state.next;
  state.next += 1;
  return idx;
}

function bestScore(scores: [number, number]): Team | 'draw' {
  return scores[0] === scores[1] ? 'draw' : scores[0] > scores[1] ? 0 : 1;
}

/** Ends the game; the last questions stay on screen so the winning answer can be seen. */
function finish(state: TugState, reason: TugState['endReason']): TugState {
  state.finished = true;
  state.endReason = reason;
  state.pausedAt = null;
  state.winner = bestScore(state.scores);
  return state;
}

export function startTug(questions: ToolQuestion[], settings: TugSettings, now: number, random?: Random): TugState {
  // Never deal the same question twice in one game, even if it was picked from two sources
  const unique = questions.filter((q, i) => questions.findIndex((x) => x.id === q.id) === i);
  const count = Math.max(1, Math.min(settings.questionCount, unique.length));
  const deck = shuffleList(unique, random).slice(0, count).map((q) => shuffleOptions(q, random));
  const state: TugState = {
    deck,
    next: 0,
    current: [null, null],
    reveal: [null, null],
    turn: 0,
    scores: [0, 0],
    answered: [0, 0],
    lockedUntil: [0, 0],
    endsAt: now + settings.durationSec * 1000,
    pausedAt: null,
    finished: false,
    winner: null,
    endReason: null,
  };
  state.current[0] = deal(state);
  if (settings.mode === 'race') state.current[1] = deal(state);
  return state;
}

/** Steps needed to win, which is also how far the rope can move each way. */
export function ropeLimit(settings: TugSettings): number {
  return settings.winRule === 'time' ? 5 : settings.target;
}

/** Rope offset in steps: positive pulls towards team 0 (left). */
export function ropeOffset(state: TugState, settings: TugSettings): number {
  const limit = ropeLimit(settings);
  return Math.max(-limit, Math.min(limit, state.scores[0] - state.scores[1]));
}

export function isLocked(state: TugState, team: Team, now: number): boolean {
  return state.lockedUntil[team] > now;
}

/** Seconds left on the clock (frozen while paused). */
export function timeLeft(state: TugState, now: number): number {
  return Math.max(0, (state.endsAt - (state.pausedAt ?? now)) / 1000);
}

/**
 * Applies one answer and shows the result on that question. Returns the new
 * state and whether the answer was correct (null = ignored: paused, finished,
 * not this team's turn or the question was already answered).
 */
export function answerTug(
  prev: TugState,
  settings: TugSettings,
  team: Team,
  chosen: number[],
  now: number
): { state: TugState; correct: boolean | null } {
  const idx = prev.current[team];
  if (prev.finished || prev.pausedAt !== null || idx === null || prev.reveal[team] || isLocked(prev, team, now)) {
    return { state: prev, correct: null };
  }
  if (settings.mode === 'turns' && team !== prev.turn) return { state: prev, correct: null };

  const state = copy(prev);
  const correct = isAnswerCorrect(state.deck[idx], chosen);
  state.answered[team] += 1;
  if (correct) state.scores[team] += 1;
  state.reveal[team] = { chosen, correct };
  if (settings.mode === 'race') {
    state.lockedUntil[team] = now + (correct ? RACE_MIN_WAIT_MS : Math.max(RACE_MIN_WAIT_MS, settings.lockSeconds * 1000));
  }

  if (settings.winRule === 'first' && state.scores[team] >= settings.target) return { state: finish(state, 'target'), correct };
  if (settings.winRule === 'lead' && Math.abs(state.scores[0] - state.scores[1]) >= settings.target) {
    return { state: finish(state, 'lead'), correct };
  }
  return { state, correct };
}

/** Teacher shows the right answer of the question in turn without scoring it (turns mode). */
export function revealTug(prev: TugState, team: Team): TugState {
  if (prev.finished || prev.current[team] === null || prev.reveal[team]) return prev;
  const state = copy(prev);
  state.reveal[team] = { chosen: null, correct: null };
  return state;
}

/**
 * Moves a team on to its next question. Turns mode: the turn passes to the
 * other team (an unanswered question is skipped without points). Race mode:
 * only advances when `expected` is still that team's question, so a delayed
 * call can't skip a fresh one.
 */
export function nextTug(prev: TugState, settings: TugSettings, team: Team, expected?: number | null): TugState {
  if (prev.finished || prev.current[team] === null) return prev;
  if (expected !== undefined && prev.current[team] !== expected) return prev;
  const state = copy(prev);
  state.current[team] = null;
  state.reveal[team] = null;
  state.lockedUntil[team] = 0;
  if (settings.mode === 'turns') {
    const other: Team = team === 0 ? 1 : 0;
    state.turn = other;
    state.current[other] = deal(state);
    if (state.current[other] === null) return finish(state, 'questions');
  } else {
    state.current[team] = deal(state);
    if (state.current[0] === null && state.current[1] === null) return finish(state, 'questions');
  }
  return state;
}

export function pauseTug(prev: TugState, now: number): TugState {
  if (prev.finished || prev.pausedAt !== null) return prev;
  return { ...copy(prev), pausedAt: now };
}

/** Restarts the clock; the deadline and any waits move on by the paused time. */
export function resumeTug(prev: TugState, now: number): TugState {
  if (prev.pausedAt === null) return prev;
  const paused = Math.max(0, now - prev.pausedAt);
  const state = copy(prev);
  state.endsAt += paused;
  state.lockedUntil = state.lockedUntil.map((t) => (t > prev.pausedAt! ? t + paused : t)) as TugState['lockedUntil'];
  state.pausedAt = null;
  return state;
}

/** Ends the game when time is up (never while paused). */
export function tickTug(state: TugState, now: number): TugState {
  if (state.finished || state.pausedAt !== null || now < state.endsAt) return state;
  return finish(copy(state), 'time');
}

export function stopTug(state: TugState): TugState {
  if (state.finished) return state;
  return finish(copy(state), 'stopped');
}
