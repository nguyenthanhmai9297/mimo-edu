import { shuffleOptions, type ToolQuestion } from './toolQuestions';
import { shuffleList, type Random } from './toolUtils';

/** "Mimo Quiz" in presentation mode: the teacher moves through the questions on the board. */
export interface QuizSettings {
  questionCount: number;
  /** per: countdown for each question · total: one countdown for the whole quiz · none: no timer */
  timer: 'per' | 'total' | 'none';
  perQuestionSec: number;
  totalSec: number;
  shuffleQuestions: boolean;
  shuffleAnswers: boolean;
  /** Reveal the answer automatically when a question's time is up. */
  autoReveal: boolean;
}

export const DEFAULT_QUIZ_SETTINGS: QuizSettings = {
  questionCount: 10,
  timer: 'per',
  perQuestionSec: 30,
  totalSec: 10 * 60,
  shuffleQuestions: true,
  shuffleAnswers: true,
  autoReveal: true,
};

/** Class result the teacher may tap after revealing an answer. */
export type ClassMark = 'most' | 'some' | 'few';

export interface QuizRun {
  deck: ToolQuestion[];
  index: number;
  revealed: boolean[];
  marks: (ClassMark | null)[];
  /** When the current question's countdown ends (per-question timer). */
  questionEndsAt: number | null;
  /** When the whole quiz ends (total timer). */
  quizEndsAt: number | null;
  startedAt: number;
  finishedAt: number | null;
}

export function buildQuizDeck(questions: ToolQuestion[], settings: QuizSettings, random?: Random): ToolQuestion[] {
  const ordered = settings.shuffleQuestions ? shuffleList(questions, random) : [...questions];
  const deck = ordered.slice(0, Math.max(1, Math.min(settings.questionCount, ordered.length)));
  return settings.shuffleAnswers ? deck.map((q) => shuffleOptions(q, random)) : deck;
}

export function startQuiz(deck: ToolQuestion[], settings: QuizSettings, now: number): QuizRun {
  return {
    deck,
    index: 0,
    revealed: deck.map(() => false),
    marks: deck.map(() => null),
    questionEndsAt: settings.timer === 'per' ? now + settings.perQuestionSec * 1000 : null,
    quizEndsAt: settings.timer === 'total' ? now + settings.totalSec * 1000 : null,
    startedAt: now,
    finishedAt: null,
  };
}

/** Moves to another question; an unrevealed question gets a fresh countdown. */
export function goTo(run: QuizRun, index: number, settings: QuizSettings, now: number): QuizRun {
  if (run.finishedAt !== null || index < 0 || index >= run.deck.length || index === run.index) return run;
  return {
    ...run,
    index,
    questionEndsAt: settings.timer === 'per' && !run.revealed[index] ? now + settings.perQuestionSec * 1000 : null,
  };
}

export function reveal(run: QuizRun): QuizRun {
  if (run.revealed[run.index]) return run;
  const revealed = [...run.revealed];
  revealed[run.index] = true;
  return { ...run, revealed, questionEndsAt: null };
}

export function markClass(run: QuizRun, mark: ClassMark | null): QuizRun {
  const marks = [...run.marks];
  marks[run.index] = mark;
  return { ...run, marks };
}

export function finishQuiz(run: QuizRun, now: number): QuizRun {
  return run.finishedAt !== null ? run : { ...run, finishedAt: now, questionEndsAt: null };
}

/** Seconds left on the visible countdown (null = no countdown shown). */
export function secondsLeft(run: QuizRun, now: number): number | null {
  const end = run.questionEndsAt ?? run.quizEndsAt;
  return end === null ? null : Math.max(0, Math.ceil((end - now) / 1000));
}

/** Applies timers: per-question time-up may reveal; total time-up finishes the quiz. */
export function tickQuiz(run: QuizRun, settings: QuizSettings, now: number): { run: QuizRun; timeUp: boolean } {
  if (run.finishedAt !== null) return { run, timeUp: false };
  if (run.quizEndsAt !== null && now >= run.quizEndsAt) return { run: finishQuiz(run, now), timeUp: true };
  if (run.questionEndsAt !== null && now >= run.questionEndsAt) {
    const stopped = { ...run, questionEndsAt: null };
    return { run: settings.autoReveal ? reveal(stopped) : stopped, timeUp: true };
  }
  return { run, timeUp: false };
}

export function quizSummary(run: QuizRun) {
  const count = (m: ClassMark) => run.marks.filter((x) => x === m).length;
  return {
    total: run.deck.length,
    revealed: run.revealed.filter(Boolean).length,
    most: count('most'),
    some: count('some'),
    few: count('few'),
    /** Questions to revisit: marked "few" first, then "some". */
    review: run.deck
      .map((q, i) => ({ q, i, mark: run.marks[i] }))
      .filter((x) => x.mark === 'few' || x.mark === 'some')
      .sort((a, b) => (a.mark === b.mark ? a.i - b.i : a.mark === 'few' ? -1 : 1)),
    durationSec: Math.round(((run.finishedAt ?? run.startedAt) - run.startedAt) / 1000),
  };
}
