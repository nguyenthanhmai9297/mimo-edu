import type { Homework, HomeworkQuestion, RichTextContent } from '../../types/domain';
import type { PracticeQuestion } from '../../types/practice';
import { richTextFromAIText } from '../../utils/richText';
import { shuffleList, type Random } from './toolUtils';

/**
 * One question as used by classroom tools (Kéo co, Mimo Quiz), whatever its
 * source: Kho học liệu Toán 3, Luyện Toán cùng Mimo or typed in by the teacher.
 * Lives only in the teacher's browser; nothing here is written to Firestore.
 */
export interface ToolQuestion {
  id: string;
  prompt: RichTextContent;
  options: RichTextContent[];
  /** Indexes into `options`. */
  correct: number[];
  multi: boolean;
  explanation?: RichTextContent;
  source: string;
}

export interface ManualQuestionDraft {
  id: string;
  prompt: string;
  options: string[];
  correct: number[];
}

const TRUE_FALSE = [richTextFromAIText('Đúng'), richTextFromAIText('Sai')];

/**
 * Converts one homework question. Choice questions keep their options;
 * "Đúng/Sai nhiều ý" become one Đúng/Sai question per statement. Questions
 * without a usable answer key (short answer, essay, missing key) are skipped.
 */
export function fromHomeworkQuestion(q: HomeworkQuestion, source: string): ToolQuestion[] {
  if ((q.type === 'single_choice' || q.type === 'multiple_choice') && q.options?.length) {
    const keys = q.type === 'single_choice' ? (q.correctOptionId ? [q.correctOptionId] : []) : q.correctOptionIds ?? [];
    const correct = q.options.map((o, i) => (keys.includes(o.id) ? i : -1)).filter((i) => i >= 0);
    if (correct.length === 0) return [];
    return [
      {
        id: `hw:${q.id}`,
        prompt: q.prompt,
        options: q.options.map((o) => o.content),
        correct,
        multi: correct.length > 1 || q.type === 'multiple_choice',
        explanation: q.sampleSolution,
        source,
      },
    ];
  }
  if (q.type === 'true_false_multi' && q.statements?.length) {
    return q.statements
      .filter((st) => typeof st.isTrue === 'boolean')
      .map((st) => ({
        id: `hw:${q.id}:${st.id}`,
        prompt: {
          version: 1 as const,
          blocks: [
            ...q.prompt.blocks,
            { type: 'paragraph' as const, align: 'left' as const, text: `Ý ${st.label}: ` },
            ...st.statement.blocks,
          ],
        },
        options: TRUE_FALSE,
        correct: [st.isTrue ? 0 : 1],
        multi: false,
        source,
      }));
  }
  return [];
}

export function fromHomework(hw: Homework): ToolQuestion[] {
  return hw.questions.flatMap((q) => fromHomeworkQuestion(q, hw.title));
}

export function fromPracticeQuestion(q: PracticeQuestion, source: string): ToolQuestion | null {
  const correct = q.options.map((o, i) => (q.correctAnswers.includes(o.id) ? i : -1)).filter((i) => i >= 0);
  if (correct.length === 0) return null;
  return {
    id: `pr:${q.id}`,
    prompt: richTextFromAIText(q.prompt),
    options: q.options.map((o) => richTextFromAIText(o.text)),
    correct,
    multi: correct.length > 1,
    explanation: q.explanation ? richTextFromAIText(q.explanation) : undefined,
    source,
  };
}

/** Validates a teacher-typed question; returns a message when it can't be used. */
export function manualQuestionProblem(d: ManualQuestionDraft): string | null {
  if (!d.prompt.trim()) return 'Chưa có nội dung câu hỏi.';
  const filled = d.options.filter((o) => o.trim());
  if (filled.length < 2) return 'Cần ít nhất 2 đáp án.';
  if (!d.correct.some((i) => d.options[i]?.trim())) return 'Chưa chọn đáp án đúng.';
  return null;
}

export function fromManual(d: ManualQuestionDraft): ToolQuestion | null {
  if (manualQuestionProblem(d)) return null;
  const kept = d.options.map((text, i) => ({ text: text.trim(), i })).filter((o) => o.text);
  const correct = kept.map((o, idx) => (d.correct.includes(o.i) ? idx : -1)).filter((i) => i >= 0);
  return {
    id: `manual:${d.id}`,
    prompt: richTextFromAIText(d.prompt),
    options: kept.map((o) => richTextFromAIText(o.text)),
    correct,
    multi: correct.length > 1,
    source: 'Câu hỏi tự nhập',
  };
}

/** Shuffles answer options (keeping the key in sync) so positions can't be memorised. */
export function shuffleOptions(q: ToolQuestion, random?: Random): ToolQuestion {
  const order = shuffleList(q.options.map((_, i) => i), random);
  return {
    ...q,
    options: order.map((i) => q.options[i]),
    correct: order.map((orig, pos) => (q.correct.includes(orig) ? pos : -1)).filter((p) => p >= 0),
  };
}

/** True when the chosen positions are exactly the correct ones. */
export function isAnswerCorrect(q: ToolQuestion, chosen: number[]): boolean {
  const a = [...new Set(chosen)].sort((x, y) => x - y);
  const b = [...q.correct].sort((x, y) => x - y);
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

/** Plain text of rich content, e.g. for short previews. */
export function richToPlain(content: RichTextContent | undefined): string {
  if (!content) return '';
  return content.blocks
    .map((b) => (b.type === 'paragraph' ? b.text : b.type === 'math' ? b.latex : b.type === 'list' ? b.items.join(', ') : ''))
    .join(' ')
    .replace(/\$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}
