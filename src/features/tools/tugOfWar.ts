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
  /** lead: first team ahead by `leadTarget` wins (or best score when time/questions run out). time: best score at the end. */
  winRule: 'lead' | 'time';
  leadTarget: number;
  /** turns: teams answer one after another · race: both teams answer their own question at once */
  mode: 'turns' | 'race';
  /** Seconds locked after a wrong answer (0 = no lock): that side in race mode, the whole game in turns mode. */
  lockSeconds: number;
}

export interface TugState {
  deck: ToolQuestion[];
  /** Next deck index to deal. */
  next: number;
  /** Deck index currently shown to each team (null = none). */
  current: [number | null, number | null];
  turn: Team;
  scores: [number, number];
  answered: [number, number];
  lockedUntil: [number, number];
  endsAt: number;
  finished: boolean;
  winner: Team | 'draw' | null;
  endReason: 'lead' | 'time' | 'questions' | 'stopped' | null;
}

export const DEFAULT_TUG_SETTINGS: TugSettings = {
  teamNames: ['Đội Xanh', 'Đội Đỏ'],
  questionCount: 20,
  durationSec: 5 * 60,
  winRule: 'lead',
  leadTarget: 3,
  mode: 'turns',
  lockSeconds: 3,
};

function deal(state: TugState): number | null {
  if (state.next >= state.deck.length) return null;
  const idx = state.next;
  state.next += 1;
  return idx;
}

function bestScore(scores: [number, number]): Team | 'draw' {
  return scores[0] === scores[1] ? 'draw' : scores[0] > scores[1] ? 0 : 1;
}

function finish(state: TugState, reason: TugState['endReason']): TugState {
  state.finished = true;
  state.endReason = reason;
  state.current = [null, null];
  state.winner = bestScore(state.scores);
  return state;
}

export function startTug(questions: ToolQuestion[], settings: TugSettings, now: number, random?: Random): TugState {
  const count = Math.max(1, Math.min(settings.questionCount, questions.length));
  const deck = shuffleList(questions, random).slice(0, count).map((q) => shuffleOptions(q, random));
  const state: TugState = {
    deck,
    next: 0,
    current: [null, null],
    turn: 0,
    scores: [0, 0],
    answered: [0, 0],
    lockedUntil: [0, 0],
    endsAt: now + settings.durationSec * 1000,
    finished: false,
    winner: null,
    endReason: null,
  };
  state.current[0] = deal(state);
  if (settings.mode === 'race') state.current[1] = deal(state);
  return state;
}

/** Rope offset in steps: positive pulls towards team 0 (left). */
export function ropeOffset(state: TugState, settings: TugSettings): number {
  const diff = state.scores[0] - state.scores[1];
  const limit = settings.winRule === 'lead' ? settings.leadTarget : 5;
  return Math.max(-limit, Math.min(limit, diff));
}

export function isLocked(state: TugState, team: Team, now: number): boolean {
  return state.lockedUntil[team] > now;
}

/** Applies one answer. Returns the new state and whether the answer was correct (null = ignored). */
export function answerTug(
  prev: TugState,
  settings: TugSettings,
  team: Team,
  chosen: number[],
  now: number
): { state: TugState; correct: boolean | null } {
  const idx = prev.current[team];
  if (prev.finished || idx === null || isLocked(prev, team, now)) return { state: prev, correct: null };
  if (settings.mode === 'turns' && team !== prev.turn) return { state: prev, correct: null };

  const state: TugState = {
    ...prev,
    current: [...prev.current] as [number | null, number | null],
    scores: [...prev.scores] as [number, number],
    answered: [...prev.answered] as [number, number],
    lockedUntil: [...prev.lockedUntil] as [number, number],
  };
  const correct = isAnswerCorrect(state.deck[idx], chosen);
  state.answered[team] += 1;
  if (correct) state.scores[team] += 1;
  else if (settings.lockSeconds > 0) state.lockedUntil[team] = now + settings.lockSeconds * 1000;

  if (settings.winRule === 'lead' && Math.abs(state.scores[0] - state.scores[1]) >= settings.leadTarget) {
    return { state: finish(state, 'lead'), correct };
  }

  if (settings.mode === 'turns') {
    const other: Team = team === 0 ? 1 : 0;
    state.current[team] = null;
    state.turn = other;
    // Turns: a wrong answer pauses the game (the other team waits out the lock too)
    if (!correct && settings.lockSeconds > 0) state.lockedUntil[other] = state.lockedUntil[team];
    state.current[other] = deal(state);
    if (state.current[other] === null) return { state: finish(state, 'questions'), correct };
  } else {
    state.current[team] = deal(state);
    if (state.current[0] === null && state.current[1] === null) return { state: finish(state, 'questions'), correct };
  }
  return { state, correct };
}

/** Ends the game when time is up. */
export function tickTug(state: TugState, now: number): TugState {
  if (state.finished || now < state.endsAt) return state;
  return finish({ ...state, current: [...state.current] as [number | null, number | null] }, 'time');
}

export function stopTug(state: TugState): TugState {
  if (state.finished) return state;
  return finish({ ...state, current: [...state.current] as [number | null, number | null] }, 'stopped');
}
