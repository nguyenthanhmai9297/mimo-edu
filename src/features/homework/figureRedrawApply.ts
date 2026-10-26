import type { HomeworkQuestion, RichTextContent } from '../../types/domain';
import type { FigureRedraw } from './figureSpec';

/** Which picture an image block shows: the stored image id survives saving, a fresh crop only has its url. */
export const figureKeyOf = (b: { url: string; media?: { publicId: string } }) => b.media?.publicId ?? b.url;

/**
 * The questions with the redraw of one picture set (or removed with null) on
 * every block showing it – a figure shared by sub-parts a) and b) is one picture.
 */
export function withFigureRedraw(questions: HomeworkQuestion[], figureKey: string, redraw: FigureRedraw | null): HomeworkQuestion[] {
  const apply = (c: RichTextContent): RichTextContent => {
    if (!c?.blocks.some((b) => b.type === 'image' && figureKeyOf(b) === figureKey)) return c;
    return {
      ...c,
      blocks: c.blocks.map((b) => {
        if (b.type !== 'image' || figureKeyOf(b) !== figureKey) return b;
        const { redraw: _old, ...rest } = b;
        return redraw ? { ...rest, redraw } : rest;
      }),
    };
  };
  return questions.map((q) => ({
    ...q,
    prompt: apply(q.prompt),
    ...(q.options ? { options: q.options.map((o) => ({ ...o, content: apply(o.content) })) } : {}),
    ...(q.statements ? { statements: q.statements.map((s) => ({ ...s, statement: apply(s.statement) })) } : {}),
  }));
}
