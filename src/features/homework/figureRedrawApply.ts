import type { HomeworkQuestion, RichBlockNode, RichTextContent } from '../../types/domain';
import type { FigureRedraw } from './figureSpec';
import type { ReviewFigure } from './FigureRedrawReview';
import { groupQuestions } from './questionGroups';

/** Which picture an image block shows: the stored image id survives saving, a fresh crop only has its url. */
export const figureKeyOf = (b: { url: string; media?: { publicId: string } }) => b.media?.publicId ?? b.url;

type ImageBlock = Extract<RichBlockNode, { type: 'image' }>;

/** The questions with every block showing one picture changed – a figure shared by sub-parts a) and b) is one picture. */
function mapFigure(questions: HomeworkQuestion[], figureKey: string, change: (b: ImageBlock) => ImageBlock): HomeworkQuestion[] {
  const apply = (c: RichTextContent): RichTextContent => {
    if (!c?.blocks.some((b) => b.type === 'image' && figureKeyOf(b) === figureKey)) return c;
    return { ...c, blocks: c.blocks.map((b) => (b.type === 'image' && figureKeyOf(b) === figureKey ? change(b) : b)) };
  };
  return questions.map((q) => ({
    ...q,
    prompt: apply(q.prompt),
    ...(q.options ? { options: q.options.map((o) => ({ ...o, content: apply(o.content) })) } : {}),
    ...(q.statements ? { statements: q.statements.map((s) => ({ ...s, statement: apply(s.statement) })) } : {}),
  }));
}

/** The questions with the redraw of one picture set (or removed with null). */
export function withFigureRedraw(questions: HomeworkQuestion[], figureKey: string, redraw: FigureRedraw | null): HomeworkQuestion[] {
  return mapFigure(questions, figureKey, (b) => {
    const { redraw: _old, redrawSkipped: _skipped, ...rest } = b;
    return redraw ? { ...rest, redraw } : rest;
  });
}

/** Marks one picture as kept original by automatic redrawing, with the reason shown to the teacher. */
export function withFigureSkipped(questions: HomeworkQuestion[], figureKey: string, reason: string): HomeworkQuestion[] {
  return mapFigure(questions, figureKey, (b) => ({ ...b, redrawSkipped: reason.slice(0, 200) || 'AI chưa chắc chắn' }));
}

/** Each distinct picture of the homework, with the question it belongs to. */
export function collectFigures(questions: HomeworkQuestion[]): ReviewFigure[] {
  const seen = new Map<string, ReviewFigure>();
  const text = (c: RichTextContent | undefined) =>
    (c?.blocks ?? []).map((b) => (b.type === 'paragraph' ? b.text : b.type === 'list' ? b.items.join('; ') : b.type === 'table' ? b.rows.map((r) => r.cells.join(' | ')).join('\n') : '')).filter(Boolean).join('\n');
  groupQuestions(questions).forEach((group, i) => {
    const questionText = group.map((q) => text(q.prompt)).join('\n');
    for (const q of group) {
      const contents = [q.prompt, ...(q.options ?? []).map((o) => o.content), ...(q.statements ?? []).map((st) => st.statement)];
      for (const c of contents) {
        for (const b of c?.blocks ?? []) {
          if (b.type !== 'image' || !b.url) continue;
          const key = figureKeyOf(b);
          if (!seen.has(key))
            seen.set(key, {
              key, url: b.url, label: `Câu ${i + 1}`, questionText,
              ...(b.redraw ? { redraw: b.redraw } : {}),
              ...(b.redrawSkipped ? { skipped: b.redrawSkipped } : {}),
            });
        }
      }
    }
  });
  return [...seen.values()];
}
