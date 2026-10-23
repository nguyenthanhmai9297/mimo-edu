import { describe, it, expect } from 'vitest';
import { createRichTextFromPlain } from '../utils/gradingEngine';
import { createRng } from '../utils/practiceEngine';
import type { ToolQuestion } from '../features/tools/toolQuestions';
import {
  answerTug,
  DEFAULT_TUG_SETTINGS,
  isLocked,
  nextTug,
  pauseTug,
  resumeTug,
  revealTug,
  ropeOffset,
  startTug,
  stopTug,
  tickTug,
  timeLeft,
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
/** Turns mode: the team in turn answers, then the teacher moves on. */
const play = (s: TugState, cfg: TugSettings, ok: boolean) => {
  const t = s.turn;
  const r = answerTug(s, cfg, t, ok ? right(s, t) : wrong(s, t), T0).state;
  return r.finished ? r : nextTug(r, cfg, t);
};

describe('Kéo co kiến thức – rules', () => {
  it('turns mode: only the team in turn may answer; the answer is shown until the teacher moves on', () => {
    const cfg = settings();
    let s = startTug(questions, cfg, T0, createRng(1));
    expect(s.current).toEqual([0, null]);
    expect(answerTug(s, cfg, 1, [0], T0).correct).toBeNull();
    const r = answerTug(s, cfg, 0, right(s, 0), T0);
    s = r.state;
    expect(r.correct).toBe(true);
    expect(s.scores).toEqual([1, 0]);
    expect(s.reveal[0]).toEqual({ chosen: right(s, 0), correct: true });
    expect(s.turn).toBe(0);
    expect(ropeOffset(s, cfg)).toBe(1);
    s = nextTug(s, cfg, 0);
    expect(s.turn).toBe(1);
    expect(s.current).toEqual([null, 1]);
    expect(s.reveal).toEqual([null, null]);
  });

  it('a question can never score twice', () => {
    const cfg = settings({ winRule: 'time' });
    let s = startTug(questions, cfg, T0, createRng(2));
    s = answerTug(s, cfg, 0, right(s, 0), T0).state;
    const again = answerTug(s, cfg, 0, right(s, 0), T0);
    expect(again.correct).toBeNull();
    expect(again.state.scores).toEqual([1, 0]);
    expect(again.state.answered).toEqual([1, 0]);
    // a revealed question can't be answered either
    s = nextTug(s, cfg, 0);
    s = revealTug(s, 1);
    expect(s.reveal[1]).toEqual({ chosen: null, correct: null });
    expect(answerTug(s, cfg, 1, right(s, 1), T0).correct).toBeNull();
    expect(s.scores).toEqual([1, 0]);
  });

  it('a wrong answer scores nothing and shows the right answer', () => {
    const cfg = settings();
    let s = startTug(questions, cfg, T0, createRng(3));
    const r = answerTug(s, cfg, 0, wrong(s, 0), T0);
    s = r.state;
    expect(r.correct).toBe(false);
    expect(s.scores).toEqual([0, 0]);
    expect(s.answered).toEqual([1, 0]);
    expect(s.reveal[0]?.correct).toBe(false);
    expect(ropeOffset(s, cfg)).toBe(0);
  });

  it('skipping a question with "Câu tiếp theo" gives no points', () => {
    const cfg = settings();
    let s = startTug(questions, cfg, T0, createRng(4));
    s = nextTug(s, cfg, 0);
    expect(s.scores).toEqual([0, 0]);
    expect(s.answered).toEqual([0, 0]);
    expect(s.turn).toBe(1);
  });

  it('"đạt 3 điểm": the first team to 3 points wins even if not 3 ahead', () => {
    const cfg = settings({ winRule: 'first', target: 3 });
    let s = startTug(questions, cfg, T0, createRng(5));
    // 0 right, 1 right, 0 right, 1 right, 0 right → 3 : 2
    for (let i = 0; i < 5; i++) s = play(s, cfg, true);
    expect(s).toMatchObject({ finished: true, winner: 0, endReason: 'target', scores: [3, 2] });
    expect(ropeOffset(s, cfg)).toBe(1);
  });

  it('lead rule: a 3-point lead wins immediately', () => {
    const cfg = settings({ mode: 'race', winRule: 'lead', lockSeconds: 0 });
    let s = startTug(questions, cfg, T0, createRng(6));
    for (let i = 0; i < 3; i++) {
      s = answerTug(s, cfg, 1, right(s, 1), T0).state;
      if (!s.finished) s = nextTug(s, cfg, 1, s.current[1]);
    }
    expect(s).toMatchObject({ finished: true, winner: 1, endReason: 'lead' });
    expect(ropeOffset(s, cfg)).toBe(-3);
  });

  it('race mode: both sides answer their own questions; a wrong side waits, a stale advance is ignored', () => {
    const cfg = settings({ mode: 'race', winRule: 'time', lockSeconds: 3 });
    let s = startTug(questions, cfg, T0, createRng(7));
    expect(s.current).toEqual([0, 1]);
    s = answerTug(s, cfg, 0, wrong(s, 0), T0).state;
    expect(isLocked(s, 0, T0 + 2000)).toBe(true);
    expect(isLocked(s, 1, T0 + 2000)).toBe(false);
    s = answerTug(s, cfg, 1, right(s, 1), T0 + 1000).state;
    expect(s.scores).toEqual([0, 1]);
    const q0 = s.current[0];
    s = nextTug(s, cfg, 0, q0);
    expect(s.current[0]).toBe(2);
    expect(nextTug(s, cfg, 0, q0)).toBe(s); // timer from the old question does nothing
  });

  it('time rule: the game ends at the deadline with the best score or a draw', () => {
    const cfg = settings({ winRule: 'time', durationSec: 60 });
    let s = startTug(questions, cfg, T0, createRng(8));
    expect(tickTug(s, T0 + 59_000).finished).toBe(false);
    expect(tickTug(s, T0 + 60_000)).toMatchObject({ finished: true, winner: 'draw', endReason: 'time' });
    s = answerTug(s, cfg, 0, right(s, 0), T0).state;
    expect(tickTug(s, T0 + 61_000).winner).toBe(0);
    expect(stopTug(s)).toMatchObject({ finished: true, endReason: 'stopped', winner: 0 });
  });

  it('"đạt 3 điểm" with time running out first: best score wins, equal scores draw', () => {
    const cfg = settings({ winRule: 'first', durationSec: 60 });
    let s = startTug(questions, cfg, T0, createRng(9));
    s = play(s, cfg, true);
    s = play(s, cfg, true);
    expect(tickTug(s, T0 + 60_000)).toMatchObject({ finished: true, winner: 'draw', endReason: 'time', scores: [1, 1] });
  });

  it('pausing freezes the clock, blocks answers and moves the deadline on', () => {
    const cfg = settings({ durationSec: 60 });
    let s = startTug(questions, cfg, T0, createRng(10));
    s = pauseTug(s, T0 + 10_000);
    expect(timeLeft(s, T0 + 50_000)).toBe(50);
    expect(tickTug(s, T0 + 120_000).finished).toBe(false);
    expect(answerTug(s, cfg, 0, right(s, 0), T0 + 20_000).correct).toBeNull();
    s = resumeTug(s, T0 + 40_000); // paused for 30 s
    expect(timeLeft(s, T0 + 40_000)).toBe(50);
    expect(tickTug(s, T0 + 89_000).finished).toBe(false);
    expect(tickTug(s, T0 + 90_000).finished).toBe(true);
  });

  it('ends when questions run out and never deals more than the chosen count', () => {
    const cfg = settings({ winRule: 'time', questionCount: 4 });
    let s = startTug(questions, cfg, T0, createRng(11));
    expect(s.deck).toHaveLength(4);
    let guard = 0;
    while (!s.finished && guard++ < 10) s = play(s, cfg, true);
    expect(s).toMatchObject({ finished: true, endReason: 'questions', winner: 'draw' });
    expect(s.answered[0] + s.answered[1]).toBe(4);
  });

  it('never deals the same question twice', () => {
    const doubled = [...questions, ...questions.slice(0, 5)];
    const s = startTug(doubled, settings({ questionCount: 40 }), T0, createRng(12));
    expect(s.deck).toHaveLength(12);
    expect(new Set(s.deck.map((q) => q.id)).size).toBe(12);
  });
});
