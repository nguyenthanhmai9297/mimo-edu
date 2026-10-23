import { describe, it, expect } from 'vitest';
import { createRichTextFromPlain } from '../utils/gradingEngine';
import { createRng } from '../utils/practiceEngine';
import type { ToolQuestion } from '../features/tools/toolQuestions';
import {
  buildQuizDeck,
  DEFAULT_QUIZ_SETTINGS,
  finishQuiz,
  goTo,
  markClass,
  quizSummary,
  reveal,
  secondsLeft,
  startQuiz,
  tickQuiz,
  type QuizSettings,
} from '../features/tools/mimoQuiz';
import { richToPlain } from '../features/tools/toolQuestions';

const rt = createRichTextFromPlain;
const questions: ToolQuestion[] = Array.from({ length: 8 }, (_, i) => ({
  id: `q${i}`,
  prompt: rt(`Câu ${i}`),
  options: [rt(`đúng ${i}`), rt('b'), rt('c'), rt('d')],
  correct: [0],
  multi: false,
  source: 'test',
}));
const T0 = 5_000_000;
const cfg = (patch: Partial<QuizSettings> = {}): QuizSettings => ({ ...DEFAULT_QUIZ_SETTINGS, ...patch });

describe('Mimo Quiz – presentation', () => {
  it('builds a deck of the chosen size and keeps answer keys in sync when shuffling', () => {
    const deck = buildQuizDeck(questions, cfg({ questionCount: 5 }), createRng(7));
    expect(deck).toHaveLength(5);
    for (const q of deck) {
      const n = richToPlain(q.prompt).replace('Câu ', '');
      expect(richToPlain(q.options[q.correct[0]])).toBe(`đúng ${n}`);
    }
    const ordered = buildQuizDeck(questions, cfg({ shuffleQuestions: false, shuffleAnswers: false, questionCount: 3 }));
    expect(ordered.map((q) => q.id)).toEqual(['q0', 'q1', 'q2']);
  });

  it('per-question timer: counts down, auto-reveals at zero, restarts on a new question', () => {
    const settings = cfg({ perQuestionSec: 20 });
    let run = startQuiz(buildQuizDeck(questions, settings, createRng(1)), settings, T0);
    expect(secondsLeft(run, T0 + 5_000)).toBe(15);
    expect(tickQuiz(run, settings, T0 + 19_000).timeUp).toBe(false);
    const t = tickQuiz(run, settings, T0 + 20_000);
    expect(t.timeUp).toBe(true);
    expect(t.run.revealed[0]).toBe(true);
    run = goTo(t.run, 1, settings, T0 + 25_000);
    expect(secondsLeft(run, T0 + 25_000)).toBe(20);
    // going back to a revealed question shows no countdown
    expect(secondsLeft(goTo(run, 0, settings, T0 + 26_000), T0 + 26_000)).toBeNull();
  });

  it('without auto-reveal the timer only stops', () => {
    const settings = cfg({ autoReveal: false });
    const run = startQuiz(buildQuizDeck(questions, settings), settings, T0);
    const t = tickQuiz(run, settings, T0 + 31_000);
    expect(t.timeUp).toBe(true);
    expect(t.run.revealed[0]).toBe(false);
    expect(secondsLeft(t.run, T0 + 31_000)).toBeNull();
  });

  it('total timer finishes the whole quiz', () => {
    const settings = cfg({ timer: 'total', totalSec: 120 });
    const run = startQuiz(buildQuizDeck(questions, settings), settings, T0);
    expect(secondsLeft(run, T0 + 60_000)).toBe(60);
    const moved = goTo(run, 3, settings, T0 + 10_000);
    expect(moved.quizEndsAt).toBe(run.quizEndsAt);
    const t = tickQuiz(moved, settings, T0 + 120_000);
    expect(t.run.finishedAt).toBe(T0 + 120_000);
    expect(goTo(t.run, 4, settings, T0 + 121_000)).toBe(t.run);
  });

  it('summarises revealed questions and class marks, weakest first', () => {
    const settings = cfg({ timer: 'none', shuffleQuestions: false, questionCount: 4 });
    let run = startQuiz(buildQuizDeck(questions, settings), settings, T0);
    expect(secondsLeft(run, T0)).toBeNull();
    run = markClass(reveal(run), 'some');
    run = markClass(reveal(goTo(run, 1, settings, T0)), 'most');
    run = markClass(reveal(goTo(run, 2, settings, T0)), 'few');
    run = finishQuiz(run, T0 + 90_000);
    const s = quizSummary(run);
    expect(s).toMatchObject({ total: 4, revealed: 3, most: 1, some: 1, few: 1, durationSec: 90 });
    expect(s.review.map((r) => r.i)).toEqual([2, 0]);
  });
});
