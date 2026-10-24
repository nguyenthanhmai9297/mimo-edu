import { RichBlockNode, RichTextContent, TableRow } from '../types/domain.js';

const isTableLine = (line: string) => line.startsWith('|') && line.endsWith('|') && line.length > 1;
const isSeparatorLine = (line: string) => /^\|(\s*:?-{2,}:?\s*\|)+$/.test(line);

/** Markdown-style table lines ("| a | b |", optional "|---|---|" after the header) → table block. */
function tableFromLines(lines: string[]): RichBlockNode {
  const header = lines.length > 1 && isSeparatorLine(lines[1]);
  const rows: TableRow[] = lines
    .filter((line) => !isSeparatorLine(line))
    .map((line) => ({ cells: line.slice(1, -1).split('|').map((cell) => cell.trim()) }));
  const width = Math.max(...rows.map((r) => r.cells.length));
  for (const row of rows) while (row.cells.length < width) row.cells.push('');
  return { type: 'table', header, rows };
}

/**
 * Converts AI text (inline `$...$` LaTeX, `\n` line breaks, standalone
 * `$$...$$` display lines, `| a | b |` table lines) into structured rich
 * text. Extra formulas from `latexList` are appended as display blocks.
 */
export function richTextFromAIText(
  text: string,
  latexList: string[] = []
): RichTextContent {
  const blocks: RichBlockNode[] = [];
  const lines = (text || '').split(/\r?\n/).map((l) => l.trim());
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    if (isTableLine(line)) {
      const tableLines = [line];
      while (i + 1 < lines.length && isTableLine(lines[i + 1])) tableLines.push(lines[++i]);
      if (tableLines.filter((l) => !isSeparatorLine(l)).length > 0) {
        blocks.push(tableFromLines(tableLines));
        continue;
      }
    }
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
