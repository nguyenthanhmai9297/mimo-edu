import { describe, it, expect } from 'vitest';
import { docToRichText, richTextToDoc } from '../components/editor/richTextDoc';
import { parseInlineSegments } from '../utils/inlineMarks';
import type { RichTextContent } from '../types/domain';

describe('richTextDoc round trip', () => {
  it('keeps text, inline/display math, lists, images and geometry', () => {
    const content: RichTextContent = {
      version: 1,
      blocks: [
        { type: 'paragraph', align: 'center', text: 'Tính $\\frac{3}{4}$ và **rút gọn**' },
        { type: 'math', inline: false, latex: 'x^2 - 5x + 6 = 0' },
        { type: 'list', ordered: true, items: ['Ý $a$', 'Ý b'] },
        { type: 'image', url: 'data:image/png;base64,AAA', alt: 'Hình', caption: 'Hình 1' },
        { type: 'geometry', drawing: { width: 10, height: 10, points: [], elements: [] } },
      ],
    };
    expect(docToRichText(richTextToDoc(content))).toEqual(content);
  });

  it('converts legacy paragraph-level bold into inline marks', () => {
    const legacy: RichTextContent = {
      version: 1,
      blocks: [{ type: 'paragraph', align: 'left', bold: true, text: 'Đề bài $x$' }],
    };
    expect(docToRichText(richTextToDoc(legacy)).blocks[0]).toEqual({
      type: 'paragraph',
      align: 'left',
      text: '**Đề bài **$x$',
    });
  });

  it('drops empty paragraphs and empty formulas but never returns no blocks', () => {
    const doc = {
      type: 'doc',
      content: [
        { type: 'paragraph' },
        { type: 'blockMath', attrs: { latex: '' } },
      ],
    };
    expect(docToRichText(doc).blocks).toEqual([{ type: 'paragraph', align: 'left', text: '' }]);
  });

  it('splits hard line breaks into separate paragraphs', () => {
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          attrs: { textAlign: 'left' },
          content: [
            { type: 'text', text: 'a) Dòng 1' },
            { type: 'hardBreak' },
            { type: 'text', text: 'b) Dòng 2' },
          ],
        },
      ],
    };
    expect(docToRichText(doc).blocks.map((b) => (b.type === 'paragraph' ? b.text : ''))).toEqual([
      'a) Dòng 1',
      'b) Dòng 2',
    ]);
  });
});

describe('parseInlineSegments', () => {
  it('does not treat asterisks inside formulas as formatting', () => {
    expect(parseInlineSegments('Cho $a*b*c$ và *nghiêng*')).toEqual([
      { kind: 'text', text: 'Cho ', bold: false, italic: false },
      { kind: 'math', latex: 'a*b*c' },
      { kind: 'text', text: ' và ', bold: false, italic: false },
      { kind: 'text', text: 'nghiêng', bold: false, italic: true },
    ]);
  });
});
