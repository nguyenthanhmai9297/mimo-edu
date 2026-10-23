import type { JSONContent } from '@tiptap/core';
import { RichBlockNode, RichTextContent, TextAlignment } from '../../types/domain';
import {
  InlineSegment,
  parseInlineSegments,
  serializeInlineSegments,
} from '../../utils/inlineMarks';

/**
 * Converts between the stored block model (RichTextContent) and the single
 * Tiptap document used by MathRichEditor. The stored model is unchanged so
 * existing homework, snapshots and the student renderer keep working.
 */

function inlineToNodes(
  text: string,
  forceBold = false,
  forceItalic = false
): JSONContent[] {
  return parseInlineSegments(text).map((seg) => {
    if (seg.kind === 'math') {
      return { type: 'inlineMath', attrs: { latex: seg.latex } };
    }
    const marks: JSONContent['marks'] = [];
    if (seg.bold || forceBold) marks.push({ type: 'bold' });
    if (seg.italic || forceItalic) marks.push({ type: 'italic' });
    return { type: 'text', text: seg.text, ...(marks.length ? { marks } : {}) };
  });
}

function paragraph(content: JSONContent[], align: TextAlignment = 'left'): JSONContent {
  return {
    type: 'paragraph',
    attrs: { textAlign: align },
    ...(content.length ? { content } : {}),
  };
}

export function richTextToDoc(value?: RichTextContent | null): JSONContent {
  const content: JSONContent[] = [];
  for (const block of value?.blocks ?? []) {
    switch (block.type) {
      case 'paragraph':
        content.push(
          paragraph(inlineToNodes(block.text, block.bold, block.italic), block.align)
        );
        break;
      case 'math':
        content.push(
          block.inline
            ? paragraph([{ type: 'inlineMath', attrs: { latex: block.latex } }])
            : { type: 'blockMath', attrs: { latex: block.latex } }
        );
        break;
      case 'list':
        content.push({
          type: block.ordered ? 'orderedList' : 'bulletList',
          content: (block.items.length ? block.items : ['']).map((item) => ({
            type: 'listItem',
            content: [paragraph(inlineToNodes(item))],
          })),
        });
        break;
      case 'image':
        content.push({
          type: 'imageBlock',
          attrs: { url: block.url, alt: block.alt ?? '', caption: block.caption ?? '' },
        });
        break;
      case 'geometry':
        content.push({ type: 'geometry', attrs: { drawing: block.drawing } });
        break;
    }
  }
  if (content.length === 0) content.push(paragraph([]));
  return { type: 'doc', content };
}

/** Serializes a paragraph's inline nodes; hard breaks split it into several lines. */
function nodesToLines(nodes: JSONContent[] = []): string[] {
  const lines: InlineSegment[][] = [[]];
  for (const node of nodes) {
    if (node.type === 'hardBreak') {
      lines.push([]);
    } else if (node.type === 'inlineMath') {
      const latex = String(node.attrs?.latex ?? '').trim();
      if (latex) lines[lines.length - 1].push({ kind: 'math', latex });
    } else if (node.type === 'text' && node.text) {
      const marks = node.marks?.map((m) => m.type) ?? [];
      lines[lines.length - 1].push({
        kind: 'text',
        text: node.text,
        bold: marks.includes('bold'),
        italic: marks.includes('italic'),
      });
    }
  }
  return lines.map(serializeInlineSegments);
}

function listItemText(item: JSONContent): string {
  return (item.content ?? [])
    .filter((child) => child.type === 'paragraph')
    .flatMap((child) => nodesToLines(child.content))
    .join(' ')
    .trim();
}

export function docToRichText(doc: JSONContent): RichTextContent {
  const blocks: RichBlockNode[] = [];
  for (const node of doc.content ?? []) {
    switch (node.type) {
      case 'paragraph': {
        const align = (node.attrs?.textAlign as TextAlignment) || 'left';
        for (const line of nodesToLines(node.content)) {
          if (line.trim()) blocks.push({ type: 'paragraph', align, text: line });
        }
        break;
      }
      case 'blockMath': {
        const latex = String(node.attrs?.latex ?? '').trim();
        if (latex) blocks.push({ type: 'math', inline: false, latex });
        break;
      }
      case 'bulletList':
      case 'orderedList': {
        const items = (node.content ?? []).map(listItemText).filter(Boolean);
        if (items.length) {
          blocks.push({ type: 'list', ordered: node.type === 'orderedList', items });
        }
        break;
      }
      case 'imageBlock':
        if (node.attrs?.url) {
          // No undefined fields: Firestore rejects them.
          blocks.push({
            type: 'image',
            url: node.attrs.url,
            ...(node.attrs.alt ? { alt: node.attrs.alt } : {}),
            ...(node.attrs.caption ? { caption: node.attrs.caption } : {}),
          });
        }
        break;
      case 'geometry':
        if (node.attrs?.drawing) {
          blocks.push({ type: 'geometry', drawing: node.attrs.drawing });
        }
        break;
    }
  }
  if (blocks.length === 0) blocks.push({ type: 'paragraph', align: 'left', text: '' });
  return { version: 1, blocks };
}
