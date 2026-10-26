import type { HomeworkQuestion } from '../../../types/domain';
import { fromHomeworkQuestion } from '../../tools/toolQuestions';
import type { BellQuestion } from './bellEngine';

/**
 * The questions of a saved homework that Rung chuông vàng can use, as they
 * are: choice and Đúng/Sai questions with their key, short answers with their
 * accepted answers. Questions still flagged for review after AI import, and
 * questions without an answer, are left out – nothing is made up.
 */
export function bellQuestionsOf(questions: HomeworkQuestion[]): { usable: BellQuestion[]; skipped: number } {
  const usable: BellQuestion[] = [];
  let skipped = 0;
  for (const q of [...questions].sort((a, b) => a.order - b.order)) {
    if (q.aiReviewNote) {
      skipped += 1;
      continue;
    }
    if (q.type === 'short_answer') {
      const answers = (q.acceptableAnswers ?? []).filter((a) => a.trim());
      if (!answers.length) {
        skipped += 1;
        continue;
      }
      usable.push({
        prompt: q.prompt,
        kind: 'short',
        answers,
        ...(q.unitMode === 'optional' ? { unitMode: 'optional' as const } : {}),
        ...(q.acceptEquivalentFractions ? { acceptEquivalentFractions: true } : {}),
        ...(q.sampleSolution ? { explanation: q.sampleSolution } : {}),
      });
      continue;
    }
    const converted = fromHomeworkQuestion(q, '');
    if (!converted.length) skipped += 1;
    for (const t of converted) usable.push({ prompt: t.prompt, kind: 'choice', options: t.options, correct: t.correct, multi: t.multi, ...(t.explanation ? { explanation: t.explanation } : {}) });
  }
  return { usable, skipped };
}
