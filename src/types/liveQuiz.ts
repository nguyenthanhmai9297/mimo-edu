import type { RichTextContent } from './domain';

/**
 * "Mimo Quiz – học sinh tham gia" (prototype, Firebase Emulator only).
 * Sessions, players and answers live in server-only collections; browsers
 * only ever see what the API returns.
 */

export type LiveQuizStatus = 'lobby' | 'question' | 'closed' | 'ended';

export interface LiveQuizQuestion {
  prompt: RichTextContent;
  options: RichTextContent[];
  correct: number[];
  multi: boolean;
  explanation?: RichTextContent;
}

export interface LiveQuizSession {
  id: string;
  code: string;
  teacherEmail: string;
  title: string;
  questions: LiveQuizQuestion[];
  /** Seconds students get for each question (null = until the teacher closes it). */
  perQuestionSec: number | null;
  status: LiveQuizStatus;
  /** Current question (-1 in the lobby). */
  index: number;
  questionEndsAt: number | null;
  createdAt: number;
  expiresAt: number;
}

export interface LiveQuizPlayer {
  sessionId: string;
  studentId: string;
  name: string;
  joinedAt: number;
}

export interface LiveQuizAnswer {
  sessionId: string;
  index: number;
  studentId: string;
  chosen: number[];
  correct: boolean;
  answeredAt: number;
}

/** What a student device receives. `correct` only appears once the question is closed. */
export interface LiveQuizPlayView {
  sessionId: string;
  title: string;
  status: LiveQuizStatus;
  index: number;
  total: number;
  serverNow: number;
  questionEndsAt: number | null;
  question: { prompt: RichTextContent; options: RichTextContent[]; multi: boolean } | null;
  myAnswer: number[] | null;
  correct: number[] | null;
  myResult: boolean | null;
  myScore: number;
  name: string;
}

/** What the teacher's board receives. */
export interface LiveQuizHostView {
  sessionId: string;
  code: string;
  status: LiveQuizStatus;
  index: number;
  total: number;
  serverNow: number;
  questionEndsAt: number | null;
  players: { studentId: string; name: string; score: number; answeredCurrent: boolean }[];
  answeredCount: number;
  /** Per-option counts for the current question, once it is closed. */
  optionCounts: number[] | null;
  correctCount: number | null;
  /** Per-question share of correct answers, for the final summary. */
  questionStats: { answered: number; correct: number }[];
}
