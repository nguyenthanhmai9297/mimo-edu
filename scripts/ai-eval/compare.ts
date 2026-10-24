import type { ParsedHomeworkOutput } from '../../src/services/aiAdapter';
import type { HomeworkQuestion } from '../../src/types/domain';
import { normalizeShortAnswer, shortAnswerMatches } from '../../src/utils/gradingEngine';

/** What one question of a sample exam must look like after AI conversion. */
export type ExpectedQuestion = {
  no: number;
  type: HomeworkQuestion['type'];
  /** Details that must be copied; each entry lists accepted spellings. */
  mustContain?: string[][];
  options?: number;
  correct?: string | string[];
  statements?: boolean[];
  answer?: string;
  unitMode?: 'optional';
  figure?: boolean;
  /** The prompt must keep a data table as a table block. */
  table?: boolean;
  allowEssay?: boolean;
  allowShortAnswer?: boolean;
  skill: string;
};
export type AnswerKey = { file: string; mimeType: string; grade: string; questions: ExpectedQuestion[] };
export type QuestionVerdict = { no: number; skill: string; recognized: boolean; solved: boolean | null; notes: string[] };

const text = (value: unknown): string => {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map(text).join(' ');
  if (value && typeof value === 'object') return Object.values(value).map(text).join(' ');
  return '';
};
const squash = (s: string) => s.replace(/\$/g, '').replace(/\s+/g, ' ').trim();

/**
 * Checks an AI conversion against the known exam, question by question (in
 * order): recognized = right type, details copied, right number of options /
 * statements, figure located; solved = the AI's key gives the right answer.
 */
export function compareWithKey(result: ParsedHomeworkOutput, key: AnswerKey, solve: boolean): QuestionVerdict[] {
  return key.questions.map((exp, i) => {
    const q = result.questions[i];
    if (!q) return { no: exp.no, skill: exp.skill, recognized: false, solved: solve ? false : null, notes: ['AI không trả về câu này'] };
    const notes: string[] = [];
    const all = squash(text([q.prompt, q.options, q.statements]));
    const typeOk =
      q.type === exp.type || (exp.allowEssay && q.type === 'essay') || (exp.allowShortAnswer && q.type === 'short_answer');
    if (!typeOk) notes.push(`dạng câu ${q.type}, cần ${exp.type}`);
    for (const variants of exp.mustContain ?? []) {
      if (!variants.some((v) => all.includes(squash(v)))) notes.push(`thiếu "${variants[0]}"`);
    }
    if (exp.options && (q.options?.length ?? 0) !== exp.options) notes.push(`${q.options?.length ?? 0} lựa chọn, cần ${exp.options}`);
    if (exp.statements && (q.statements?.length ?? 0) !== exp.statements.length) {
      notes.push(`${q.statements?.length ?? 0} mệnh đề, cần ${exp.statements.length}`);
    }
    if (exp.figure && !result.figures.some((f) => f.questionId === q.id)) notes.push('không khoanh vùng hình vẽ');
    if (exp.table && !q.prompt.blocks.some((b) => b.type === 'table')) notes.push('bảng không giữ cấu trúc');
    const recognized = notes.length === 0;

    let solved: boolean | null = null;
    if (solve) {
      const label = (id?: string) => q.options?.find((o) => o.id === id)?.label;
      if (exp.type === 'single_choice') solved = label(q.correctOptionId) === exp.correct;
      else if (exp.type === 'multiple_choice') {
        solved = (q.correctOptionIds ?? []).map(label).sort().join(',') === [...(exp.correct as string[])].sort().join(',');
      } else if (exp.type === 'true_false_multi') {
        solved = JSON.stringify(q.statements?.map((s) => s.isTrue)) === JSON.stringify(exp.statements);
      } else if (q.type === 'short_answer') {
        solved = (q.acceptableAnswers ?? []).some((k) => shortAnswerMatches(exp.answer!, k, { unitMode: exp.unitMode }));
      } else {
        // Worked solutions write units as "1 000 (kg)", so look for the final number itself
        const number = normalizeShortAnswer(exp.answer!).split(' ')[0].replace(/[.]/g, '\\.');
        solved = new RegExp(`(?<![\\d.])${number}(?![\\d.])`).test(normalizeShortAnswer(text(q.sampleSolution)));
      }
      if (!solved) {
        const given = q.acceptableAnswers ?? q.correctOptionIds?.map(label) ?? label(q.correctOptionId) ?? q.statements?.map((s) => s.isTrue);
        notes.push(`đáp án AI: ${JSON.stringify(given ?? null)}`);
      }
    }
    if (q.aiReviewNote) notes.push(`AI tự gắn cờ: ${q.aiReviewNote}`);
    return { no: exp.no, skill: exp.skill, recognized, solved, notes };
  });
}
