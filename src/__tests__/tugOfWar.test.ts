import { describe, it, expect } from 'vitest';
import { createRichTextFromPlain } from '../utils/gradingEngine';
import { createRng } from '../utils/practiceEngine';
import type { ToolQuestion } from '../features/tools/toolQuestions';
import {
  answerTug,
  DEFAULT_TUG_SETTINGS,
  isLocked,
  ropeOffset,
  startTug,
  stopTug,
  tickTug,
  TugSettings,
  TugState,
} from '../features/tools/tugOfWar';

const rt = createRichTextFromPlain;
const questions: ToolQuestion[] = Array.from({ length: 12 }, (_, i) => ({
  id: `q${i}`,
  prompt: rt(`Câu ${i}`),
  options: [rt('a'), rt('b'), rt('c'), rt('d')],
  correct: [i % 4],
  multi: false,
  source: 'test',
}));

const T0 = 1_000_000;
const settings = (patch: Partial<TugSettings> = {}): TugSettings => ({ ...DEFAULT_TUG_SETTINGS, ...patch });
const right = (s: TugState, team: 0 | 1) => s.deck[s.current[team]!].correct;
const wrong = (s: TugState, team: 0 | 1) => [(right(s, team)[0] + 1) % 4];

describe('Kéo co kiến thức – rules', () => {
  it('turns mode: only the team in turn may answer, then the turn passes', () => {
    const cfg = settings();
    let s = startTug(questions, cfg, T0, createRng(1));
    expect(s.current).toEqual([0, null]);
    expect(answerTug(s, cfg, 1, [0], T0).correct).toBeNull();
    const r = answerTug(s, cfg, 0, right(s, 0), T0);
    s = r.state;
    expect(r.correct).toBe(true);
    expect(s.scores).toEqual([1, 0]);
    expect(s.turn).toBe(1);
    expect(s.current[1]).not.toBeNull();
    expect(ropeOffset(s, cfg)).toBe(1);
  });

  it('a wrong answer scores nothing and pauses the game for the lock time', () => {
    const cfg = settings({ lockSeconds: 3 });
    let s = startTug(questions, cfg, T0, createRng(2));
    const r = answerTug(s, cfg, 0, wrong(s, 0), T0);
    s = r.state;
    expect(r.correct).toBe(false);
    expect(s.scores).toEqual([0, 0]);
    expect(isLocked(s, 1, T0 + 2000)).toBe(true);
    expect(answerTug(s, cfg, 1, right(s, 1), T0 + 2000).correct).toBeNull();
    expect(answerTug(s, cfg, 1, right(s, 1), T0 + 3001).correct).toBe(true);
  });

  it('lead rule: a 3-point lead wins immediately', () => {
    const cfg = settings({ mode: 'race', lockSeconds: 0 });
    let s = startTug(questions, cfg, T0, createRng(3));
    for (let i = 0; i < 3; i++) s = answerTug(s, cfg, 1, right(s, 1), T0).state;
    expect(s.finished).toBe(true);
    expect(s.winner).toBe(1);
    expect(s.endReason).toBe('lead');
    expect(ropeOffset(s, cfg)).toBe(-3);
  });

  it('race mode: both sides answer their own questions; wrong side is locked', () => {
    const cfg = settings({ mode: 'race', winRule: 'time', lockSeconds: 3 });
    let s = startTug(questions, cfg, T0, createRng(4));
    expect(s.current[0]).not.toBeNull();
    expect(s.current[1]).not.toBeNull();
    s = answerTug(s, cfg, 0, wrong(s, 0), T0).state;
    expect(isLocked(s, 0, T0 + 1000)).toBe(true);
    expect(isLocked(s, 1, T0 + 1000)).toBe(false);
    s = answerTug(s, cfg, 1, right(s, 1), T0 + 1000).state;
    expect(s.scores).toEqual([0, 1]);
    expect(s.answered).toEqual([1, 1]);
  });

  it('time rule: the game ends at the deadline with the best score or a draw', () => {
    const cfg = settings({ winRule: 'time', durationSec: 60 });
    let s = startTug(questions, cfg, T0, createRng(5));
    expect(tickTug(s, T0 + 59_000).finished).toBe(false);
    const ended = tickTug(s, T0 + 60_000);
    expect(ended).toMatchObject({ finished: true, winner: 'draw', endReason: 'time' });
    s = answerTug(s, cfg, 0, right(s, 0), T0).state;
    expect(tickTug(s, T0 + 61_000).winner).toBe(0);
    expect(stopTug(s)).toMatchObject({ finished: true, endReason: 'stopped' });
  });

  it('ends when questions run out and never deals more than the chosen count', () => {
    const cfg = settings({ winRule: 'time', questionCount: 4, lockSeconds: 0 });
    let s = startTug(questions, cfg, T0, createRng(6));
    expect(s.deck).toHaveLength(4);
    let guard = 0;
    while (!s.finished && guard++ < 10) s = answerTug(s, cfg, s.turn, right(s, s.turn), T0).state;
    expect(s.finished).toBe(true);
    expect(s.endReason).toBe('questions');
    expect(s.answered[0] + s.answered[1]).toBe(4);
  });
});
