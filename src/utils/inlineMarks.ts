/**
 * Inline formatting stored inside paragraph text:
 *   $latex$        inline formula
 *   ***text***     bold + italic
 *   **text**       bold
 *   *text*         italic
 */
export type InlineSegment =
  | { kind: 'math'; latex: string }
  | { kind: 'text'; text: string; bold: boolean; italic: boolean };

const MATH_SPLIT = /(\$[^$]+\$)/g;
const MARK_SPLIT = /(\*\*\*[^*]+?\*\*\*|\*\*[^*]+?\*\*|\*[^*\s][^*]*?\*)/g;

export function parseInlineSegments(text: string): InlineSegment[] {
  const segments: InlineSegment[] = [];
  for (const part of (text || '').split(MATH_SPLIT)) {
    if (!part) continue;
    if (part.length > 2 && part.startsWith('$') && part.endsWith('$')) {
      segments.push({ kind: 'math', latex: part.slice(1, -1) });
      continue;
    }
    for (const piece of part.split(MARK_SPLIT)) {
      if (!piece) continue;
      if (piece.length > 6 && piece.startsWith('***') && piece.endsWith('***')) {
        segments.push({ kind: 'text', text: piece.slice(3, -3), bold: true, italic: true });
      } else if (piece.length > 4 && piece.startsWith('**') && piece.endsWith('**')) {
        segments.push({ kind: 'text', text: piece.slice(2, -2), bold: true, italic: false });
      } else if (piece.length > 2 && piece.startsWith('*') && piece.endsWith('*')) {
        segments.push({ kind: 'text', text: piece.slice(1, -1), bold: false, italic: true });
      } else {
        segments.push({ kind: 'text', text: piece, bold: false, italic: false });
      }
    }
  }
  return segments;
}

export function serializeInlineSegments(segments: InlineSegment[]): string {
  return segments
    .map((seg) => {
      if (seg.kind === 'math') return `$${seg.latex}$`;
      if (!seg.text.trim()) return seg.text;
      if (seg.bold && seg.italic) return `***${seg.text}***`;
      if (seg.bold) return `**${seg.text}**`;
      if (seg.italic) return `*${seg.text}*`;
      return seg.text;
    })
    .join('');
}
