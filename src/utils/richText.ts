import { RichBlockNode, RichTextContent } from '../types/domain.js';

/**
 * Converts AI text (inline `$...$` LaTeX, `\n` line breaks, standalone
 * `$$...$$` display lines) into structured rich text. Extra formulas from
 * `latexList` are appended as display blocks.
 */
export function richTextFromAIText(
  text: string,
  latexList: string[] = []
): RichTextContent {
  const blocks: RichBlockNode[] = [];
  for (const rawLine of (text || '').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    const display = line.match(/^\$\$([\s\S]+)\$\$$/) || line.match(/^\\\[([\s\S]+)\\\]$/);
    if (display) {
      blocks.push({ type: 'math', inline: false, latex: display[1].trim() });
    } else {
      blocks.push({ type: 'paragraph', align: 'left', text: line });
    }
  }
  for (const latex of latexList) {
    if (latex.trim()) {
      blocks.push({ type: 'math', inline: false, latex: latex.trim() });
    }
  }
  if (blocks.length === 0) {
    blocks.push({ type: 'paragraph', align: 'left', text: '' });
  }
  return { version: 1, blocks };
}
