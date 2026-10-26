import type { FigureRedraw } from '../features/homework/figureSpec';

/**
 * Core Domain Types for MimoEDU
 */

export type QuestionType =
  | 'single_choice'
  | 'multiple_choice'
  | 'true_false_multi'
  | 'short_answer'
  | 'essay';

export type TextAlignment = 'left' | 'center' | 'right';

export interface GeometryPoint {
  id: string;
  label: string;
  x: number;
  y: number;
}

export type GeometryElementType =
  | 'point'
  | 'segment'
  | 'line'
  | 'ray'
  | 'angle'
  | 'triangle'
  | 'quadrilateral'
  | 'circle';

export interface GeometryElement {
  id: string;
  type: GeometryElementType;
  pointIds: string[]; // References to GeometryPoint.id
  label?: string;
  color?: string;
  dashed?: boolean;
  angleValue?: string;
}

export interface GeometryDrawingData {
  width: number;
  height: number;
  points: GeometryPoint[];
  elements: GeometryElement[];
  caption?: string;
}

export type RichBlockNode =
  | {
      type: 'paragraph';
      align?: TextAlignment;
      bold?: boolean;
      italic?: boolean;
      text: string;
    }
  | {
      type: 'list';
      ordered: boolean;
      items: string[];
    }
  | {
      type: 'math';
      inline: boolean;
      latex: string;
    }
  | {
      type: 'image';
      url: string;
      alt?: string;
      caption?: string;
      /** Set when the image is kept in the image store; `url` is then its signed address. */
      media?: StoredImage;
      /** A sharp redraw of this figure, used by the Word export while `active`. */
      redraw?: FigureRedraw;
      /** Set when automatic redrawing could not redraw this figure: why the original is kept. */
      redrawSkipped?: string;
    }
  | {
      type: 'geometry';
      drawing: GeometryDrawingData;
    }
  | {
      // Data table (bảng số liệu). Rows are objects because Firestore cannot
      // store an array directly inside another array. Cells may hold $math$.
      type: 'table';
      header: boolean;
      rows: TableRow[];
    };

export interface TableRow {
  cells: string[];
}

export interface RichTextContent {
  version: 1;
  blocks: RichBlockNode[];
}

/** An image kept in the image store (Cloudinary) instead of inside the document. */
export interface StoredImage {
  provider: 'cloudinary';
  publicId: string;
  format: string;
  bytes: number;
  width?: number;
  height?: number;
}

export interface ChoiceOption {
  id: string;
  label: string; // e.g. A, B, C, D
  content: RichTextContent;
}

export interface TrueFalseStatement {
  id: string;
  label: string; // e.g. a, b, c, d
  statement: RichTextContent;
  isTrue?: boolean; // Stripped in public student snapshot before solution release
  points: number;
}

export interface HomeworkQuestion {
  id: string;
  order: number;
  type: QuestionType;
  prompt: RichTextContent;
  points: number;
  // Type 1: single_choice & Type 2: multiple_choice
  options?: ChoiceOption[];
  correctOptionId?: string; // For single_choice (admin/grading key only)
  correctOptionIds?: string[]; // For multiple_choice (admin/grading key only)
  // Type 3: true_false_multi
  statements?: TrueFalseStatement[];
  // Type 4: short_answer
  acceptableAnswers?: string[]; // Equivalent answers (normalized)
  // How the unit is checked: 'required' (default) the unit must be written as
  // in the key; 'optional' it may be left out, but a unit that is written must
  // still be the key's unit. Units are never converted (420 mm ≠ 42 cm).
  unitMode?: 'required' | 'optional';
  // Fractions of equal value count as correct (6/8 for 3/4); off by default
  // because many questions ask for one specific fraction.
  acceptEquivalentFractions?: boolean;
  // Type 5: essay
  rubric?: string;
  sampleSolution?: RichTextContent;
  // Teacher-only note set by AI import when the result needs a manual check
  aiReviewNote?: string;
  // Curriculum metadata from imported question sets (e.g. MimoEDU), for
  // practice by topic/skill/level and error statistics later on
  sourceId?: string;
  topicId?: string;
  topicName?: string;
  skillId?: string;
  level?: PracticeLevel;
}

export type PracticeLevel = 'nhan_biet' | 'thong_hieu' | 'van_dung' | 'thu_thach';

export const PRACTICE_LEVEL_LABELS: Record<PracticeLevel, string> = {
  nhan_biet: 'Nhận biết',
  thong_hieu: 'Thông hiểu',
  van_dung: 'Vận dụng',
  thu_thach: 'Thử thách',
};

export interface AdminAllowlistEntry {
  id: string; // email
  email: string;
  role: 'admin';
  addedBy: string;
  createdAt: string;
}

export interface ClassRoom {
  id: string;
  name: string;
  grade: string;
  schoolYear: string;
  description?: string;
  status: 'active' | 'archived';
  createdAt: string;
  updatedAt: string;
}

export interface Student {
  id: string;
  fullName: string;
  nickname?: string;
  avatarUrl?: string;
  grade: string;
  classIds: string[];
  dob?: string;
  internalNotes?: string; // Teacher only
  status: 'active' | 'dropped' | 'archived';
  accessCode: string; // 6-char permanent unique code
  createdAt: string;
  updatedAt: string;
}

export interface PublicStudentProfile {
  id: string;
  fullName: string;
  nickname?: string;
  avatarUrl?: string;
  grade: string;
  classIds: string[];
  dob?: string;
  status: 'active' | 'dropped' | 'archived';
  accessCode: string;
}

export interface StudentCodeIndex {
  code: string;
  studentId: string;
  status: 'active' | 'archived';
  createdAt: string;
}

export interface HomeworkAttachment {
  id: string;
  name: string;
  mimeType: string;
  url: string;
}

export interface Homework {
  id: string;
  title: string;
  description?: string;
  subject: string;
  grade?: string;
  questions: HomeworkQuestion[];
  attachments?: HomeworkAttachment[];
  answerSource: 'teacher' | 'ai';
  aiSolverEnabled: boolean;
  totalPoints: number;
  status: 'draft' | 'published' | 'archived';
  createdAt: string;
  updatedAt: string;
}

export interface Assignment {
  id: string;
  homeworkId: string;
  title: string;
  instructions?: string;
  targetType: 'class' | 'students';
  classIds?: string[];
  studentIds?: string[];
  assignedAt: string;
  dueAt: string;
  publicQuestionsSnapshot: HomeworkQuestion[]; // Answers stripped
  gradingKeySnapshot?: HomeworkQuestion[]; // Full questions with answers
  publishSolutions?: boolean;
  maxScore: number;
  status: 'active' | 'revoked' | 'closed';
  createdAt: string;
  updatedAt: string;
}

export type AssignmentProgressStatus =
  | 'assigned'
  | 'in_progress'
  | 'submitted'
  | 'graded'
  | 'returned';

export interface StudentAssignment {
  id: string; // `${assignmentId}_${studentId}`
  assignmentId: string;
  studentId: string;
  status: AssignmentProgressStatus;
  score?: number;
  maxScore: number;
  isScorePublished: boolean;
  submittedAt?: string;
  gradedAt?: string;
  updatedAt: string;
}

export interface StudentQuestionAnswer {
  questionId: string;
  type: QuestionType;
  selectedOptionId?: string;
  selectedOptionIds?: string[];
  statementAnswers?: Record<string, boolean>; // statementId -> true/false
  shortAnswerText?: string;
  essayContent?: RichTextContent;
}

export interface QuestionGradingResult {
  questionId: string;
  score: number;
  maxScore: number;
  isAutoGraded: boolean;
  isCorrect?: boolean;
  teacherComment?: string;
  aiSuggestedScore?: number;
  aiExplanation?: string;
  aiImprovementFeedback?: string;
}

export interface Submission {
  id: string; // `${assignmentId}_${studentId}`
  assignmentId: string;
  studentId: string;
  answers: StudentQuestionAnswer[];
  questionResults?: QuestionGradingResult[];
  totalScore?: number;
  maxScore: number;
  status: 'in_progress' | 'submitted' | 'graded' | 'returned';
  teacherOverallComment?: string;
  isPublished: boolean;
  submittedAt?: string;
  gradedAt?: string;
  updatedAt: string;
}

export interface CommentReport {
  id: string;
  studentId: string;
  type: 'monthly' | 'submission';
  month?: number;
  year?: number;
  strengths: string;
  improvements?: string;
  completionRate?: string;
  practiceSuggestions?: string;
  status: 'draft' | 'published';
  publishedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export type GameCategory =
  | 'Số học'
  | 'Phép tính'
  | 'Hình học'
  | 'Tư duy logic'
  | 'Ôn tập kiến thức';

export interface MathGame {
  id: string;
  title: string;
  description?: string;
  embedUrl: string;
  category: GameCategory;
  thumbnailUrl?: string;
  order: number;
  status: 'draft' | 'published' | 'archived';
  createdAt: string;
  updatedAt: string;
}

export interface AIJob {
  id: string;
  taskType: 'ocr_parse' | 'solve_math' | 'essay_grade';
  provider: string;
  model: string;
  status: 'processing' | 'completed' | 'failed';
  durationMs?: number;
  estimatedCostUsd?: number;
  createdAt: string;
}
