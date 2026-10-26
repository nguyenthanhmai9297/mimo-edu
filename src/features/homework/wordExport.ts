import { parseFigureSpec, type FigureSpec } from './figureSpec';
import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  ImageRun,
  LeaderType,
  Math as DocxMath,
  MathFraction,
  MathRadical,
  MathRun,
  MathSubScript,
  MathSuperScript,
  Packer,
  PageNumber,
  PageOrientation,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableLayoutType,
  TableRow,
  TabStopType,
  TextRun,
  VerticalAlign,
  WidthType,
  type MathComponent,
  type ParagraphChild,
} from 'docx';
import type { GeometryDrawingData, HomeworkQuestion, RichBlockNode, RichTextContent } from '../../types/domain';
import { parseInlineSegments } from '../../utils/inlineMarks';

/**
 * Builds a real Word (.docx) file from a homework as it is in the editor:
 * text, tables and formulas stay editable (formulas become Word equations),
 * every picture is its own image placed at its question. Nothing in the
 * questions or answers is changed; an answer that is missing stays missing.
 */

export type WordContent = 'exam' | 'exam_with_answers' | 'answers';

export interface WordExportOptions {
  content: WordContent;
  orientation: 'portrait' | 'landscape';
  /** Times New Roman size in points. */
  fontSize: number;
  /** Page margins in centimetres. */
  margins: { top: number; bottom: number; left: number; right: number };
  /** Line spacing multiple (1 = single). */
  lineSpacing: number;
  schoolName: string;
  title: string;
  /** Printed under the title, e.g. "Thời gian làm bài: 35 phút". */
  subtitle: string;
  /** "Họ và tên: …… Lớp: ……" line for students. */
  studentFields: boolean;
  /** Printed date line; empty for none. */
  date: string;
  showPoints: boolean;
  /** What students get under an essay question to write on. */
  essaySpace: 'lines' | 'blank' | 'none';
  essayLines: number;
  /**
   * Figures: 'original' prints every picture as it is; otherwise a figure the
   * teacher approved a sharp redraw for prints the redraw ('selected' and
   * 'suggest' only differ in which figures the dialog offers to redraw).
   */
  figureMode: FigureMode;
}

export type FigureMode = 'original' | 'selected' | 'suggest';

export const DEFAULT_WORD_OPTIONS: WordExportOptions = {
  content: 'exam',
  orientation: 'portrait',
  fontSize: 13,
  margins: { top: 2, bottom: 2, left: 2.5, right: 1.5 },
  lineSpacing: 1.15,
  schoolName: '',
  title: '',
  subtitle: '',
  studentFields: true,
  date: '',
  showPoints: true,
  essaySpace: 'lines',
  essayLines: 5,
  figureMode: 'selected',
};

export interface WordImage {
  data: Uint8Array;
  type: 'png' | 'jpg';
  /** Natural size in pixels. */
  width: number;
  height: number;
  /** The same picture as SVG (Word shows it sharp at any size; `data` is the fallback). */
  svg?: Uint8Array;
}

/**
 * Format and pixel size read from the image bytes themselves (a file named .png
 * may hold a JPEG). Returns null for anything Word cannot show as a picture here.
 */
export function readImageInfo(data: Uint8Array): { type: 'png' | 'jpg'; width: number; height: number } | null {
  const v = new DataView(data.buffer, data.byteOffset, data.byteLength);
  if (data.length > 24 && v.getUint32(0) === 0x89504e47) return { type: 'png', width: v.getUint32(16), height: v.getUint32(20) };
  if (data.length > 4 && data[0] === 0xff && data[1] === 0xd8) {
    let i = 2;
    while (i + 9 < data.length) {
      if (data[i] !== 0xff) return null;
      const marker = data[i + 1];
      if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
        i += 2;
        continue;
      }
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return { type: 'jpg', width: v.getUint16(i + 7), height: v.getUint16(i + 5) };
      }
      i += 2 + v.getUint16(i + 2);
    }
  }
  return null;
}

export interface WordExportDeps {
  loadImage: (url: string) => Promise<WordImage>;
  renderGeometry: (drawing: GeometryDrawingData) => Promise<WordImage>;
  /** Draws an approved figure redraw; without it figures print as their original picture. */
  renderFigure?: (spec: FigureSpec, width?: number) => Promise<WordImage>;
  /** Told when the file is made differently than asked (a redraw that failed and printed as the original). */
  onWarning?: (message: string) => void;
}

export interface WordHomework {
  title: string;
  description?: string;
  grade?: string;
  questions: HomeworkQuestion[];
}

export class WordExportError extends Error {}

const FONT = 'Times New Roman';
const CM_TWIPS = 567;
const A4 = { width: 11906, height: 16838 };
const ANSWER_COLOR = 'C00000';
/** Tallest a picture may be on the page, in centimetres. */
const MAX_IMAGE_HEIGHT_CM = 9;

const points = (n: number) => `${Number(n.toFixed(2))}`.replace('.', ',');

// ---------------------------------------------------------------------------
// LaTeX (the subset the editor and AI import write) → Word equation
// ---------------------------------------------------------------------------

const LATEX_SYMBOLS: Record<string, string> = {
  times: '×', div: '÷', cdot: '·', pm: '±', mp: '∓', le: '≤', leq: '≤', ge: '≥', geq: '≥', ne: '≠', neq: '≠',
  approx: '≈', lt: '<', gt: '>', circ: '°', degree: '°', pi: 'π', alpha: 'α', beta: 'β', angle: '∠', triangle: '△',
  perp: '⊥', parallel: '∥', infty: '∞', ldots: '…', dots: '…', cdots: '⋯', rightarrow: '→', to: '→', leftarrow: '←',
  Rightarrow: '⇒', in: '∈', notin: '∉', cup: '∪', cap: '∩', subset: '⊂', '%': '%', '{': '{', '}': '}', '$': '$',
  '#': '#', '&': '&', _: '_', ',': ' ', ';': ' ', ':': ' ', '!': '', ' ': ' ', quad: '  ', qquad: '    ',
  left: '', right: '', displaystyle: '', textstyle: '',
};

class LatexReader {
  pos = 0;
  constructor(private readonly src: string) {}
  done() {
    return this.pos >= this.src.length;
  }
  peek() {
    return this.src[this.pos];
  }
  next() {
    return this.src[this.pos++];
  }
  skipSpaces() {
    while (this.peek() === ' ') this.pos++;
  }
  command(): string {
    let name = '';
    if (!/[A-Za-z]/.test(this.peek() ?? '')) return this.next() ?? '';
    while (/[A-Za-z]/.test(this.peek() ?? '')) name += this.next();
    return name;
  }
  /** Raw text of a {…} group (or one character), for \text{…}. */
  rawGroup(): string {
    this.skipSpaces();
    if (this.peek() !== '{') return this.next() ?? '';
    this.pos++;
    let depth = 1;
    let out = '';
    while (!this.done()) {
      const c = this.next();
      if (c === '{') depth++;
      if (c === '}' && --depth === 0) break;
      out += c;
    }
    return out;
  }
  /** One argument: a {…} group, a command, or a single character. */
  argument(): MathComponent[] {
    this.skipSpaces();
    if (this.peek() === '{') return latexToMath(this.rawGroup());
    if (this.peek() === '\\') {
      const start = this.pos;
      this.pos++;
      this.command();
      return latexToMath(this.src.slice(start, this.pos));
    }
    const c = this.next();
    return c ? [new MathRun(c)] : [];
  }
}

/** Word equation parts for a LaTeX formula. Unknown commands are kept as their name, never dropped. */
export function latexToMath(latex: string): MathComponent[] {
  const r = new LatexReader(latex);
  const out: MathComponent[] = [];
  let text = '';
  const flush = () => {
    if (text) out.push(new MathRun(text));
    text = '';
  };
  /** The part a ^ or _ attaches to: the last character typed, or the last built part. */
  const takeBase = (): MathComponent[] => {
    if (text) {
      const base = text.slice(-1);
      text = text.slice(0, -1);
      flush();
      return [new MathRun(base)];
    }
    const last = out.pop();
    return last ? [last] : [new MathRun(' ')];
  };
  while (!r.done()) {
    const c = r.next();
    if (c === '\\') {
      const name = r.command();
      if (name === 'frac' || name === 'dfrac' || name === 'tfrac') {
        flush();
        out.push(new MathFraction({ numerator: r.argument(), denominator: r.argument() }));
      } else if (name === 'sqrt') {
        flush();
        let degree: MathComponent[] | undefined;
        r.skipSpaces();
        if (r.peek() === '[') {
          r.next();
          let d = '';
          while (!r.done() && r.peek() !== ']') d += r.next();
          r.next();
          degree = latexToMath(d);
        }
        out.push(new MathRadical({ children: r.argument(), ...(degree ? { degree } : {}) }));
      } else if (['text', 'mathrm', 'textrm', 'mbox', 'operatorname', 'mathbf', 'textbf', 'overline', 'widehat', 'hat', 'vec'].includes(name)) {
        flush();
        const inner = r.rawGroup();
        out.push(new MathRun(name === 'overline' || name === 'widehat' || name === 'hat' || name === 'vec' ? inner : inner.replace(/\\,/g, ' ')));
      } else if (name in LATEX_SYMBOLS) {
        text += LATEX_SYMBOLS[name];
      } else {
        text += name;
      }
    } else if (c === '^' || c === '_') {
      const base = takeBase();
      const script = r.argument();
      out.push(c === '^' ? new MathSuperScript({ children: base, superScript: script }) : new MathSubScript({ children: base, subScript: script }));
    } else if (c === '{' || c === '}') {
      // Plain grouping braces
    } else if (c === '~') {
      text += ' ';
    } else {
      text += c;
    }
  }
  flush();
  return out;
}

// ---------------------------------------------------------------------------
// Rich text → paragraphs
// ---------------------------------------------------------------------------

interface Ctx {
  options: WordExportOptions;
  deps: WordExportDeps;
  images: Map<string, Promise<WordImage>>;
  /** Content width in pixels (96 dpi), for sizing pictures. */
  contentWidthPx: number;
  /** Content width in twips, where dotted answer lines end. */
  contentWidthTwips: number;
  /** Where a picture belongs, for error messages. */
  where: string;
}

function inlineRuns(text: string, base: { bold?: boolean; italic?: boolean; color?: string } = {}): ParagraphChild[] {
  return parseInlineSegments(text).map((seg) =>
    seg.kind === 'math'
      ? new DocxMath({ children: latexToMath(seg.latex) })
      : new TextRun({ text: seg.text, bold: base.bold || seg.bold, italics: base.italic || seg.italic, color: base.color })
  );
}

async function picture(ctx: Ctx, key: string, load: () => Promise<WordImage>, alt: string): Promise<Paragraph> {
  let pending = ctx.images.get(key);
  if (!pending) {
    pending = load();
    ctx.images.set(key, pending);
  }
  let img: WordImage;
  try {
    img = await pending;
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new WordExportError(`Không tải được hình ở ${ctx.where} (${reason}). Hãy kiểm tra kết nối mạng rồi thử lại.`);
  }
  // Natural size, shrunk only to fit the page width and a sensible height; aspect ratio kept
  const maxH = (MAX_IMAGE_HEIGHT_CM / 2.54) * 96;
  const scale = Math.min(1, ctx.contentWidthPx / img.width, maxH / img.height);
  return new Paragraph({
    keepLines: true,
    keepNext: true,
    spacing: { before: 60, after: 60 },
    children: [
      img.svg
        ? new ImageRun({
            type: 'svg',
            data: img.svg,
            fallback: { type: 'png', data: img.data },
            transformation: { width: Math.round(img.width * scale), height: Math.round(img.height * scale) },
            altText: { name: alt || 'Hình', description: alt || 'Hình', title: alt || 'Hình' },
          })
        : new ImageRun({
            type: img.type,
            data: img.data,
            transformation: { width: Math.round(img.width * scale), height: Math.round(img.height * scale) },
            altText: { name: alt || 'Hình', description: alt || 'Hình', title: alt || 'Hình' },
          }),
    ],
  });
}

function dataTable(block: Extract<RichBlockNode, { type: 'table' }>, ctx: Ctx): Table {
  const columns = Math.max(1, ...block.rows.map((r) => r.cells.length));
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: block.rows.map(
      (row, rIdx) =>
        new TableRow({
          tableHeader: block.header && rIdx === 0,
          cantSplit: true,
          children: Array.from({ length: columns }, (_v, cIdx) => {
            const cell = row.cells[cIdx] ?? '';
            const head = block.header && rIdx === 0;
            return new TableCell({
              verticalAlign: VerticalAlign.CENTER,
              ...(head ? { shading: { type: ShadingType.CLEAR, fill: 'F2F2F2', color: 'auto' } } : {}),
              children: [
                new Paragraph({
                  alignment: AlignmentType.CENTER,
                  spacing: { before: 40, after: 40 },
                  keepNext: true,
                  children: inlineRuns(cell, { bold: head }),
                }),
              ],
            });
          }),
        })
    ),
  });
}

type Block = Paragraph | Table;

/**
 * Printed width of a redraw: close to the picture it replaces (a little larger,
 * so labels stay readable), between 360 and 440 px; 440 when the size is unknown.
 */
function redrawWidth(block: Extract<RichBlockNode, { type: 'image' }>): number | undefined {
  const w = block.media?.width;
  return w ? Math.round(Math.min(440, Math.max(360, w * 1.3))) : undefined;
}

/** The redraw to print instead of this picture, or null to print the picture itself. */
function approvedRedraw(block: Extract<RichBlockNode, { type: 'image' }>, ctx: Ctx): FigureSpec | null {
  if (ctx.options.figureMode === 'original' || !block.redraw?.active) return null;
  const spec = parseFigureSpec(block.redraw.spec);
  if (!spec) {
    ctx.deps.onWarning?.(`${ctx.where}: hình đã duyệt bị lỗi dữ liệu, tệp dùng hình gốc.`);
    return null;
  }
  if (spec.kind === 'table') return spec.table.rows.length ? spec : null;
  return ctx.deps.renderFigure ? spec : null;
}

/** Word blocks for rich content; `lead` is put in front of the first line (e.g. "Câu 4."). */
async function richBlocks(content: RichTextContent | undefined, ctx: Ctx, lead: ParagraphChild[] = [], style: { color?: string } = {}): Promise<Block[]> {
  const out: Block[] = [];
  let leadUsed = lead.length === 0;
  const withLead = (children: ParagraphChild[]) => {
    if (leadUsed) return children;
    leadUsed = true;
    return [...lead, ...children];
  };
  for (const block of content?.blocks ?? []) {
    if (block.type === 'paragraph') {
      if (!block.text.trim() && leadUsed) continue;
      out.push(
        new Paragraph({
          alignment: block.align === 'center' ? AlignmentType.CENTER : block.align === 'right' ? AlignmentType.RIGHT : AlignmentType.LEFT,
          keepNext: true,
          children: withLead(inlineRuns(block.text, { bold: block.bold, italic: block.italic, color: style.color })),
        })
      );
    } else if (block.type === 'math') {
      out.push(
        new Paragraph({
          alignment: block.inline ? AlignmentType.LEFT : AlignmentType.CENTER,
          keepNext: true,
          children: withLead([new DocxMath({ children: latexToMath(block.latex) })]),
        })
      );
    } else if (block.type === 'list') {
      block.items.forEach((item, i) =>
        out.push(
          new Paragraph({
            indent: { left: 360, hanging: 360 },
            keepNext: true,
            children: withLead([new TextRun({ text: block.ordered ? `${i + 1}.\t` : '•\t' }), ...inlineRuns(item, { color: style.color })]),
          })
        )
      );
    } else if (block.type === 'table') {
      if (!leadUsed) out.push(new Paragraph({ keepNext: true, children: withLead([]) }));
      out.push(dataTable(block, ctx));
    } else if (block.type === 'image') {
      if (!leadUsed) out.push(new Paragraph({ keepNext: true, children: withLead([]) }));
      if (!block.url) continue;
      const original = () => picture(ctx, block.url, () => ctx.deps.loadImage(block.url), block.alt ?? '');
      const redraw = approvedRedraw(block, ctx);
      if (redraw?.kind === 'table') {
        // A table read from a picture becomes a real Word table teachers can edit
        out.push(dataTable({ type: 'table', header: redraw.table.header, rows: redraw.table.rows }, ctx));
      } else if (redraw) {
        try {
          const width = redrawWidth(block);
          out.push(await picture(ctx, `figure:${width}:${JSON.stringify(redraw)}`, () => ctx.deps.renderFigure!(redraw, width), block.alt ?? ''));
        } catch {
          ctx.deps.onWarning?.(`${ctx.where}: không vẽ được hình đã duyệt, tệp dùng hình gốc.`);
          out.push(await original());
        }
      } else {
        out.push(await original());
      }
      if (block.caption) out.push(new Paragraph({ alignment: AlignmentType.LEFT, keepNext: true, children: [new TextRun({ text: block.caption, italics: true })] }));
    } else if (block.type === 'geometry') {
      if (!leadUsed) out.push(new Paragraph({ keepNext: true, children: withLead([]) }));
      out.push(await picture(ctx, `geometry:${JSON.stringify(block.drawing)}`, () => ctx.deps.renderGeometry(block.drawing), block.drawing.caption ?? 'Hình vẽ'));
      if (block.drawing.caption) out.push(new Paragraph({ keepNext: true, children: [new TextRun({ text: block.drawing.caption, italics: true })] }));
    }
  }
  if (!leadUsed) out.push(new Paragraph({ children: lead }));
  return out;
}

/** Plain one-line text of rich content (for answers and short option checks). */
function plainLine(content: RichTextContent | undefined): string {
  return (content?.blocks ?? [])
    .map((b) => (b.type === 'paragraph' ? b.text : b.type === 'math' ? `$${b.latex}$` : b.type === 'list' ? b.items.join('; ') : ''))
    .filter(Boolean)
    .join(' ');
}

const isSimple = (content: RichTextContent | undefined) =>
  (content?.blocks ?? []).every((b) => b.type === 'paragraph' || b.type === 'math');

// ---------------------------------------------------------------------------
// Questions
// ---------------------------------------------------------------------------

/** A sub-part line such as "a) Diện tích hình H là: …". */
const SUB_PART = /^\s*\(?([a-zđ])\)\s/i;

const firstText = (q: HomeworkQuestion) => {
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

function answerText(q: HomeworkQuestion): string | null {
  if (q.type === 'single_choice') {
    const o = q.options?.find((x) => x.id === q.correctOptionId);
    return o ? o.label : null;
  }
  if (q.type === 'multiple_choice') {
    const labels = (q.options ?? []).filter((x) => q.correctOptionIds?.includes(x.id)).map((x) => x.label);
    return labels.length ? labels.join(', ') : null;
  }
  if (q.type === 'true_false_multi') {
    const st = q.statements ?? [];
    if (!st.length || st.some((s) => typeof s.isTrue !== 'boolean')) return null;
    return st.map((s) => `${s.label}) ${s.isTrue ? 'Đ' : 'S'}`).join('; ');
  }
  if (q.type === 'short_answer') {
    const a = (q.acceptableAnswers ?? []).filter((x) => x.trim());
    return a.length ? a[0] + (a.length > 1 ? ` (chấp nhận: ${a.slice(1).join('; ')})` : '') : null;
  }
  return null;
}

const MISSING_ANSWER = 'chưa có đáp án – giáo viên cần nhập';

function dottedLine(ctx: Ctx): Paragraph {
  return new Paragraph({
    tabStops: [{ type: TabStopType.RIGHT, position: ctx.contentWidthTwips, leader: LeaderType.DOT }],
    spacing: { before: 120 },
    children: [new TextRun({ text: '\t' })],
  });
}

async function choiceBlocks(q: HomeworkQuestion, ctx: Ctx): Promise<Block[]> {
  const options = q.options ?? [];
  const label = (l: string) => new TextRun({ text: `${l}. `, bold: true });
  const simple = options.every((o) => isSimple(o.content));
  const longest = Math.max(0, ...options.map((o) => plainLine(o.content).length));
  // Short options side by side like a printed exam (4 or 2 per row); others one per line
  const perRow = simple ? (longest <= 14 ? 4 : longest <= 32 ? 2 : 1) : 1;
  if (perRow === 1) {
    const out: Block[] = [];
    for (const o of options) out.push(...(await richBlocks(o.content, ctx, [label(o.label)])));
    return out;
  }
  const rows: TableRow[] = [];
  for (let i = 0; i < options.length; i += perRow) {
    const slice = options.slice(i, i + perRow);
    rows.push(
      new TableRow({
        cantSplit: true,
        children: Array.from({ length: perRow }, (_v, k) =>
          new TableCell({
            width: { size: Math.floor(100 / perRow), type: WidthType.PERCENTAGE },
            children: slice[k]
              ? [new Paragraph({ keepNext: true, children: [label(slice[k].label), ...inlineRuns(plainLine(slice[k].content))] })]
              : [new Paragraph({ keepNext: true })],
          })
        ),
      })
    );
  }
  const none = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
  return [
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: { top: none, bottom: none, left: none, right: none, insideHorizontal: none, insideVertical: none },
      rows,
    }),
  ];
}

async function statementBlocks(q: HomeworkQuestion, ctx: Ctx, withAnswers: boolean): Promise<Block[]> {
  const rows = [];
  for (const st of q.statements ?? []) {
    const verdict = withAnswers && typeof st.isTrue === 'boolean' ? (st.isTrue ? 'Đ' : 'S') : '';
    rows.push(
      new TableRow({
        cantSplit: true,
        children: [
          new TableCell({
            width: { size: 88, type: WidthType.PERCENTAGE },
            children: await richBlocks(st.statement, ctx, [new TextRun({ text: `${st.label}) `, bold: true })]),
          }),
          new TableCell({
            width: { size: 12, type: WidthType.PERCENTAGE },
            verticalAlign: VerticalAlign.CENTER,
            children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: verdict, bold: true, color: ANSWER_COLOR })] })],
          }),
        ],
      })
    );
  }
  return rows.length ? [new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows })] : [];
}

function answerParagraphs(q: HomeworkQuestion, prefix: string): Paragraph[] {
  const out: Paragraph[] = [];
  const answer = answerText(q);
  if (q.type !== 'essay' || answer) {
    out.push(
      new Paragraph({
        keepNext: true,
        children: [
          new TextRun({ text: `${prefix}Đáp án: `, bold: true, color: ANSWER_COLOR }),
          ...inlineRuns(answer ?? MISSING_ANSWER, { color: ANSWER_COLOR, italic: !answer }),
        ],
      })
    );
  }
  if (q.aiReviewNote) {
    out.push(new Paragraph({ keepNext: true, children: [new TextRun({ text: `${prefix}Cần giáo viên kiểm tra: ${q.aiReviewNote}`, italics: true, color: ANSWER_COLOR })] }));
  }
  return out;
}

async function questionGroupBlocks(group: HomeworkQuestion[], number: number, ctx: Ctx, withAnswers: boolean): Promise<Block[]> {
  const total = group.reduce((s, q) => s + (q.points || 0), 0);
  const lead = [
    new TextRun({ text: `Câu ${number}. `, bold: true }),
    ...(ctx.options.showPoints && total > 0 ? [new TextRun({ text: `(${points(total)} điểm) `, italics: true })] : []),
  ];
  const out: Block[] = [];
  const shown = new Set<string>();
  for (const [i, q] of group.entries()) {
    ctx.where = `Câu ${number}`;
    // A picture repeated in each sub-part (the shared figure) is printed once
    const prompt: RichTextContent = {
      ...q.prompt,
      blocks: q.prompt.blocks.filter((b) => {
        if (b.type !== 'image') return true;
        if (shown.has(b.url)) return false;
        shown.add(b.url);
        return true;
      }),
    };
    out.push(...(await richBlocks(prompt, ctx, i === 0 ? lead : [])));
    if (q.type === 'single_choice' || q.type === 'multiple_choice') out.push(...(await choiceBlocks(q, ctx)));
    if (q.type === 'true_false_multi') out.push(...(await statementBlocks(q, ctx, withAnswers)));
    if (q.type === 'short_answer' && !/[.…_]{3,}/.test(plainLine(q.prompt))) {
      out.push(new Paragraph({ keepNext: true, tabStops: [{ type: TabStopType.RIGHT, position: ctx.contentWidthTwips, leader: LeaderType.DOT }], children: [new TextRun({ text: 'Trả lời: \t' })] }));
    }
    if (q.type === 'essay' && !withAnswers) {
      if (ctx.options.essaySpace === 'lines') for (let k = 0; k < ctx.options.essayLines; k++) out.push(dottedLine(ctx));
      if (ctx.options.essaySpace === 'blank') for (let k = 0; k < ctx.options.essayLines; k++) out.push(new Paragraph({ spacing: { before: 120 }, children: [] }));
    }
    if (withAnswers) {
      const part = group.length > 1 ? `${SUB_PART.exec(firstText(q))?.[1] ?? i + 1}) ` : '';
      if (q.type !== 'true_false_multi') out.push(...answerParagraphs(q, part));
      if (q.type === 'essay') {
        out.push(new Paragraph({ children: [new TextRun({ text: `${part}Lời giải:`, bold: true, color: ANSWER_COLOR })] }));
        out.push(...(q.sampleSolution && plainLine(q.sampleSolution).trim()
          ? await richBlocks(q.sampleSolution, ctx, [], { color: ANSWER_COLOR })
          : [new Paragraph({ children: [new TextRun({ text: MISSING_ANSWER, italics: true, color: ANSWER_COLOR })] })]));
        if (q.rubric?.trim()) out.push(new Paragraph({ children: [new TextRun({ text: `Hướng dẫn chấm: ${q.rubric}`, color: ANSWER_COLOR })] }));
      }
    }
  }
  // Everything above keeps with the next block, so a question moves to the next page whole; this ends the chain
  out.push(new Paragraph({ spacing: { after: 80 }, children: [] }));
  return out;
}

/** The separate answer key: one row per question, solutions under it. */
async function answerKeyBlocks(groups: HomeworkQuestion[][], ctx: Ctx): Promise<Block[]> {
  const cell = (children: ParagraphChild[], bold = false, shade = false) =>
    new TableCell({
      verticalAlign: VerticalAlign.CENTER,
      ...(shade ? { shading: { type: ShadingType.CLEAR, fill: 'F2F2F2', color: 'auto' } } : {}),
      children: [new Paragraph({ alignment: bold ? AlignmentType.CENTER : AlignmentType.LEFT, children: children.length ? children : [new TextRun({ text: '' })] })],
    });
  const header = new TableRow({
    tableHeader: true,
    children: ['Câu', 'Đáp án', 'Điểm'].map((t) => cell([new TextRun({ text: t, bold: true })], true, true)),
  });
  const rows = [header];
  const solutions: Block[] = [];
  for (const [g, group] of groups.entries()) {
    for (const [i, q] of group.entries()) {
      const name = group.length > 1 ? `${g + 1}${SUB_PART.exec(firstText(q))?.[1] ?? String.fromCharCode(97 + i)}` : `${g + 1}`;
      const answer = answerText(q);
      const text = q.type === 'essay' ? (q.sampleSolution && plainLine(q.sampleSolution).trim() ? 'Xem lời giải bên dưới' : MISSING_ANSWER) : answer ?? MISSING_ANSWER;
      const runs = inlineRuns(text, { italic: text === MISSING_ANSWER });
      if (q.aiReviewNote) runs.push(new TextRun({ text: ' – Cần giáo viên kiểm tra', italics: true, color: ANSWER_COLOR }));
      rows.push(new TableRow({ cantSplit: true, children: [cell([new TextRun({ text: name, bold: true })], true), cell(runs), cell([new TextRun(points(q.points || 0))], true)] }));
      if (q.type === 'essay') {
        ctx.where = `Câu ${name}`;
        solutions.push(new Paragraph({ spacing: { before: 160 }, keepNext: true, children: [new TextRun({ text: `Câu ${name}. Lời giải`, bold: true })] }));
        solutions.push(...(q.sampleSolution && plainLine(q.sampleSolution).trim()
          ? await richBlocks(q.sampleSolution, ctx)
          : [new Paragraph({ children: [new TextRun({ text: MISSING_ANSWER, italics: true })] })]));
        if (q.rubric?.trim()) solutions.push(new Paragraph({ children: [new TextRun({ text: `Hướng dẫn chấm: ${q.rubric}` })] }));
      }
    }
  }
  const w = ctx.contentWidthTwips;
  const columnWidths = [Math.round(w * 0.12), w - Math.round(w * 0.12) - Math.round(w * 0.14), Math.round(w * 0.14)];
  return [new Table({ width: { size: w, type: WidthType.DXA }, layout: TableLayoutType.FIXED, columnWidths, rows }), ...solutions];
}

function headerBlocks(hw: WordHomework, o: WordExportOptions, widthTwips: number): Paragraph[] {
  const out: Paragraph[] = [];
  if (o.schoolName.trim()) out.push(new Paragraph({ children: [new TextRun({ text: o.schoolName.trim(), bold: true })] }));
  const title = (o.title || hw.title).trim();
  out.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 120, after: 60 },
      children: [new TextRun({ text: (o.content === 'answers' ? `ĐÁP ÁN – ${title}` : title).toUpperCase(), bold: true, size: (o.fontSize + 2) * 2 })],
    })
  );
  if (o.subtitle.trim()) out.push(new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: o.subtitle.trim(), italics: true })] }));
  if (o.studentFields && o.content !== 'answers') {
    out.push(
      new Paragraph({
        spacing: { before: 160 },
        tabStops: [
          { type: TabStopType.LEFT, position: Math.round(widthTwips * 0.68), leader: LeaderType.DOT },
          { type: TabStopType.RIGHT, position: widthTwips, leader: LeaderType.DOT },
        ],
        children: [new TextRun({ text: 'Họ và tên: \tLớp: \t' })],
      })
    );
  }
  if (o.date.trim()) out.push(new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: o.date.trim(), italics: true })] }));
  if (hw.description?.trim() && o.content !== 'answers') {
    out.push(new Paragraph({ spacing: { before: 120 }, children: inlineRuns(hw.description.trim(), { italic: true }) }));
  }
  out.push(new Paragraph({ spacing: { after: 60 }, children: [] }));
  return out;
}

/** The .docx file of a homework. Throws WordExportError with the reason when it cannot be made. */
export async function buildHomeworkDocx(hw: WordHomework, options: WordExportOptions, deps: WordExportDeps): Promise<Blob> {
  if (!hw.questions.length) throw new WordExportError('Đề chưa có câu hỏi nào để xuất.');
  const o = options;
  const pageWidth = o.orientation === 'landscape' ? A4.height : A4.width;
  const contentWidthTwips = pageWidth - (o.margins.left + o.margins.right) * CM_TWIPS;
  if (contentWidthTwips < 3 * CM_TWIPS) throw new WordExportError('Lề trang quá lớn, không còn chỗ cho nội dung.');
  const ctx: Ctx = {
    options: o,
    deps,
    images: new Map(),
    contentWidthPx: Math.floor((contentWidthTwips / 1440) * 96),
    contentWidthTwips: Math.floor(contentWidthTwips),
    where: '',
  };
  const groups = groupQuestions(hw.questions);
  const body: Block[] = [...headerBlocks(hw, o, Math.floor(contentWidthTwips))];
  if (o.content === 'answers') {
    body.push(...(await answerKeyBlocks(groups, ctx)));
  } else {
    for (const [i, group] of groups.entries()) body.push(...(await questionGroupBlocks(group, i + 1, ctx, o.content === 'exam_with_answers')));
  }
  // Word reports a file whose body ends with a table as damaged; always close with a paragraph
  body.push(new Paragraph({ children: [] }));

  const doc = new Document({
    creator: 'MimoEDU',
    title: o.title || hw.title,
    styles: {
      default: {
        document: {
          run: { font: FONT, size: Math.round(o.fontSize * 2) },
          paragraph: { spacing: { line: Math.round(240 * o.lineSpacing), after: 60 } },
        },
      },
    },
    sections: [
      {
        properties: {
          page: {
            size: { width: A4.width, height: A4.height, orientation: o.orientation === 'landscape' ? PageOrientation.LANDSCAPE : PageOrientation.PORTRAIT },
            margin: {
              top: Math.round(o.margins.top * CM_TWIPS),
              bottom: Math.round(o.margins.bottom * CM_TWIPS),
              left: Math.round(o.margins.left * CM_TWIPS),
              right: Math.round(o.margins.right * CM_TWIPS),
            },
          },
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [new TextRun({ children: ['Trang ', PageNumber.CURRENT, '/', PageNumber.TOTAL_PAGES], size: 20 })],
              }),
            ],
          }),
        },
        children: body,
      },
    ],
  });
  return Packer.toBlob(doc);
}

/** File name for a download, e.g. "kiem-tra-cuoi-nam-de.docx". */
export function wordFileName(title: string, content: WordContent): string {
  const slug =
    title
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/đ/g, 'd')
      .replace(/Đ/g, 'D')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 60) || 'bai-tap';
  const suffix = content === 'exam' ? 'de' : content === 'exam_with_answers' ? 'de-kem-dap-an' : 'dap-an';
  return `${slug}-${suffix}.docx`;
}
