import { z } from 'zod';
import {
  ChoiceOption,
  HomeworkQuestion,
  PRACTICE_LEVEL_LABELS,
  PracticeLevel,
} from '../../types/domain';
import { richTextFromAIText } from '../../utils/richText';

/**
 * Converts MimoEDU question sets (schemaVersion 1.x, one topic per file)
 * into homework drafts the teacher can review and save.
 */

const LEVELS = ['nhan_biet', 'thong_hieu', 'van_dung', 'thu_thach'] as const;

const mimoQuestionSchema = z.object({
  id: z.string().min(1),
  grade: z.number().optional(),
  topicId: z.string().optional(),
  topicName: z.string().optional(),
  skillId: z.string().optional(),
  level: z.enum(LEVELS),
  type: z.string(),
  prompt: z.string().min(1),
  options: z.array(z.object({ id: z.string(), text: z.string() })).optional(),
  correctAnswer: z.union([z.string(), z.array(z.string())]),
  explanation: z.string().optional(),
  status: z.string().optional(),
});

export const mimoDatasetSchema = z.object({
  schemaVersion: z.string(),
  datasetId: z.string(),
  title: z.string(),
  notes: z.string().optional(),
  questions: z.array(mimoQuestionSchema).min(1),
});

export type MimoDataset = z.infer<typeof mimoDatasetSchema>;
type MimoQuestion = z.infer<typeof mimoQuestionSchema>;

export interface MimoHomeworkDraft {
  title: string;
  description: string;
  grade: string;
  questions: HomeworkQuestion[];
  /** Source questions that could not be converted (unsupported type). */
  skippedIds: string[];
}

export function isMimoDataset(json: unknown): json is MimoDataset {
  return mimoDatasetSchema.safeParse(json).success;
}

export function countByLevel(dataset: MimoDataset): Record<PracticeLevel, number> {
  const counts = { nhan_biet: 0, thong_hieu: 0, van_dung: 0, thu_thach: 0 };
  for (const q of dataset.questions) counts[q.level] += 1;
  return counts;
}

function convertQuestion(q: MimoQuestion, order: number, points: number): HomeworkQuestion | null {
  const answers = (Array.isArray(q.correctAnswer) ? q.correctAnswer : [q.correctAnswer]).map((a) =>
    a.trim().toUpperCase()
  );
  // MimoEDU "multiple_choice" means a choice question; with one answer it is our single_choice.
  if (!['multiple_choice', 'single_choice'].includes(q.type) || !q.options?.length) return null;

  const id = `mimo_${q.id.replace(/[^A-Za-z0-9_-]/g, '_')}`;
  const options: ChoiceOption[] = q.options.map((opt) => ({
    id: `${id}_opt_${opt.id}`,
    label: opt.id,
    content: richTextFromAIText(opt.text),
  }));
  const correctIds = options
    .filter((o) => answers.includes(o.label.toUpperCase()))
    .map((o) => o.id);
  const isMulti = answers.length > 1;

  return {
    id,
    order,
    type: isMulti ? 'multiple_choice' : 'single_choice',
    prompt: richTextFromAIText(q.prompt),
    points,
    options,
    ...(isMulti ? { correctOptionIds: correctIds } : correctIds[0] ? { correctOptionId: correctIds[0] } : {}),
    ...(correctIds.length !== answers.length
      ? { aiReviewNote: `Đáp án trong file (${answers.join(', ')}) không khớp phương án nào.` }
      : {}),
    // Shown to students as "Lời giải tham khảo" once the teacher releases solutions
    ...(q.explanation ? { sampleSolution: richTextFromAIText(q.explanation) } : {}),
    sourceId: q.id,
    ...(q.topicId ? { topicId: q.topicId } : {}),
    ...(q.topicName ? { topicName: q.topicName } : {}),
    ...(q.skillId ? { skillId: q.skillId } : {}),
    level: q.level,
  };
}

/** Splits 10 points evenly (two decimals); the last question absorbs rounding. */
function splitPoints(count: number, total = 10): number[] {
  const each = Math.floor((total / count) * 100) / 100;
  const points = Array(count).fill(each);
  points[count - 1] = Number((total - each * (count - 1)).toFixed(2));
  return points;
}

export function buildHomeworkFromMimo(
  dataset: MimoDataset,
  levels: PracticeLevel[]
): MimoHomeworkDraft {
  const selected = dataset.questions.filter((q) => levels.includes(q.level));
  const supported = selected.filter((q) => ['multiple_choice', 'single_choice'].includes(q.type) && q.options?.length);
  const points = supported.length ? splitPoints(supported.length) : [];
  const questions = supported
    .map((q, idx) => convertQuestion(q, idx + 1, points[idx]))
    .filter((q): q is HomeworkQuestion => q !== null);

  const levelText =
    levels.length === LEVELS.length
      ? 'Tất cả mức độ'
      : levels.map((l) => PRACTICE_LEVEL_LABELS[l]).join(', ');
  const grade = dataset.questions[0]?.grade;

  return {
    title: `${dataset.title} – ${levelText}`.slice(0, 200),
    description: `Bộ câu hỏi MimoEDU "${dataset.title}" (${dataset.datasetId}). Mức độ: ${levelText}.`,
    grade: grade ? `Khối ${grade}` : 'Khối 3',
    questions,
    skippedIds: selected.filter((q) => !supported.includes(q)).map((q) => q.id),
  };
}
