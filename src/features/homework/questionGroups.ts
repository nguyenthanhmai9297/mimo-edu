import type { HomeworkQuestion } from '../../types/domain';

export const SUB_PART = /^\s*\(?([a-zđ])\)\s/i;

export const firstText = (q: HomeworkQuestion) => {
  const first = q.prompt.blocks.find((b) => b.type === 'paragraph' && b.text.trim());
  return first?.type === 'paragraph' ? first.text : '';
};

/**
 * Questions as numbered on paper: a question whose prompt opens with "b)" right
 * after one that has "a)" is a sub-part of the same "Câu" (AI import splits
 * "6a", "6b" into separate questions so each can be marked on its own).
 */
export function groupQuestions(questions: HomeworkQuestion[]): HomeworkQuestion[][] {
  const groups: HomeworkQuestion[][] = [];
  const sorted = [...questions].sort((a, b) => a.order - b.order);
  for (const q of sorted) {
    const sub = SUB_PART.exec(firstText(q));
    const prev = groups[groups.length - 1];
    const prevHasPart = prev?.some((p) => p.prompt.blocks.some((b) => b.type === 'paragraph' && SUB_PART.test(b.text)));
    if (sub && sub[1].toLowerCase() !== 'a' && prev && prevHasPart) prev.push(q);
    else groups.push([q]);
  }
  return groups;
}
