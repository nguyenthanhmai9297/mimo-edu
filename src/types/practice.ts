import type { PracticeLevel } from './domain';

export type { PracticeLevel };

export const PRACTICE_LEVELS: PracticeLevel[] = ['nhan_biet', 'thong_hieu', 'van_dung', 'thu_thach'];

export interface PracticeOption {
  id: string;
  text: string;
}

export type PracticeQuestionType = 'single_choice' | 'multiple_choice';

/** Full question with answer key. Firestore `practiceQuestions/{id}` – admin and server only. */
export interface PracticeQuestion {
  id: string;
  datasetId: string;
  topicId: string;
  skillId: string;
  level: PracticeLevel;
  type: PracticeQuestionType;
  /** Plain text; formulas as $...$, line breaks as \n. */
  prompt: string;
  options: PracticeOption[];
  correctAnswers: string[];
  explanation: string;
  /** Only approved questions in a published set are served to students. */
  status: 'draft' | 'approved';
  order: number;
  sourceStatus?: string;
  updatedAt: string;
  updatedBy?: string;
}

/** Firestore `practiceSets/{datasetId}` – one imported question file. */
export interface PracticeSet {
  id: string;
  topicId: string;
  title: string;
  schemaVersion: string;
  questionCount: number;
  status: 'draft' | 'published';
  notes?: string;
  importedAt: string;
  importedBy: string;
  publishedAt?: string;
  updatedAt: string;
}

/** What the browser receives while practising: no ids of options, no answers. */
export interface PracticePublicQuestion {
  id: string;
  skillId: string;
  level: PracticeLevel;
  type: PracticeQuestionType;
  prompt: string;
  /** Option texts in display order (shuffled per attempt). */
  options: string[];
}

export interface PracticeQuestionResult {
  questionId: string;
  skillId: string;
  correct: boolean;
  /** Display positions chosen by the student. */
  selected: number[];
  /** Display positions of the correct options. */
  correctPositions: number[];
  explanation: string;
}

/** Firestore `practiceAttempts/{id}` – written by the server only. */
export interface PracticeAttempt {
  id: string;
  studentId: string;
  topicId: string;
  skillId: string | null;
  level: PracticeLevel;
  questionIds: string[];
  /** Per question: original option ids in display order. */
  optionOrder: Record<string, string[]>;
  status: 'in_progress' | 'submitted';
  answers?: Record<string, number[]>;
  results?: PracticeQuestionResult[];
  score?: number;
  total: number;
  startedAt: string;
  submittedAt?: string;
}

export interface PracticeSkillSummary {
  skillId: string;
  correct: number;
  total: number;
}

export interface PracticeCatalogAvailability {
  /** topicId -> level -> number of questions students can practise */
  topics: Record<string, { levels: Record<PracticeLevel, number>; skills: Record<string, number> }>;
}

export interface PracticeStartResponse {
  attemptId: string;
  topicId: string;
  skillId: string | null;
  level: PracticeLevel;
  questions: PracticePublicQuestion[];
}

export interface PracticeSubmitResponse {
  attemptId: string;
  score: number;
  total: number;
  questions: PracticePublicQuestion[];
  results: PracticeQuestionResult[];
  skills: PracticeSkillSummary[];
}
