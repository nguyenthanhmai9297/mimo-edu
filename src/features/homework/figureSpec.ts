import { z } from 'zod';

/**
 * A math figure described as data (points, segments, squared cells, clock
 * hands…) instead of pixels. AI reads a blurry figure into this description;
 * MimoEDU draws it itself (figureSvg.ts), so the redrawn figure is sharp and
 * holds only what the description says. Never raw SVG from the AI: every
 * value passes the schema below (bounded numbers, short plain strings) before
 * it is drawn, saved or exported.
 *
 * Coordinates are in the space of the image the AI looked at: x to the right,
 * y downward. Only relative positions matter; drawing rescales to fit.
 */

export const FIGURE_KINDS = ['geometry', 'grid', 'clock', 'fraction', 'diagram', 'table'] as const;
export type FigureKind = (typeof FIGURE_KINDS)[number];

export const FIGURE_FILLS = ['none', 'light', 'dark'] as const;
export type FigureFill = (typeof FIGURE_FILLS)[number];

export const LABEL_POSITIONS = ['auto', 'n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'] as const;
export const SEGMENT_LABEL_SIDES = ['auto', 'left', 'right', 'above', 'below'] as const;
/**
 * A squared cell: whole, or a half cell cut along a diagonal, named by the
 * corner that is cut off (cut_tl: the top-left corner is gone, the bottom-right
 * triangle remains). "Which corner is missing" is what one sees on the paper.
 */
export const CELL_SHAPES = ['square', 'cut_tl', 'cut_tr', 'cut_bl', 'cut_br'] as const;

const coord = z.number().finite().min(-5000).max(5000);
const id = z.string().trim().regex(/^[A-Za-z0-9_]{1,24}$/);
/** Plain text drawn in the figure (labels, measurements). React escapes it when drawing. */
const text = (max: number) => z.string().trim().max(max);

export const figureSpecSchema = z.object({
  kind: z.enum(FIGURE_KINDS),
  points: z
    .array(z.object({ id, label: text(12), x: coord, y: coord, labelPos: z.enum(LABEL_POSITIONS) }))
    .max(80),
  segments: z
    .array(z.object({ from: id, to: id, dashed: z.boolean(), label: text(24), labelSide: z.enum(SEGMENT_LABEL_SIDES) }))
    .max(200),
  polygons: z.array(z.object({ points: z.array(id).min(3).max(40), fill: z.enum(FIGURE_FILLS) })).max(40),
  circles: z.array(z.object({ center: id, radius: z.number().finite().positive().max(5000), fill: z.enum(FIGURE_FILLS) })).max(20),
  rightAngles: z.array(z.object({ at: id, from: id, to: id })).max(40),
  arrows: z.array(z.object({ x1: coord, y1: coord, x2: coord, y2: coord })).max(30),
  texts: z.array(z.object({ text: text(60), x: coord, y: coord })).max(40),
  grid: z.object({
    x: coord,
    y: coord,
    cellSize: z.number().finite().min(0).max(1000),
    cells: z
      .array(
        z.object({
          row: z.number().int().min(0).max(40),
          col: z.number().int().min(0).max(40),
          shape: z.enum(CELL_SHAPES),
          fill: z.enum(FIGURE_FILLS),
        })
      )
      .max(400),
  }),
  clocks: z
    .array(
      z.object({
        x: coord,
        y: coord,
        radius: z.number().finite().positive().max(2000),
        hour: z.number().int().min(1).max(12),
        minute: z.number().int().min(0).max(59),
      })
    )
    .max(6),
  fractions: z
    .array(
      z.object({
        shape: z.enum(['bar', 'circle']),
        x: coord,
        y: coord,
        size: z.number().finite().positive().max(2000),
        parts: z.number().int().min(1).max(24),
        shaded: z.array(z.number().int().min(0).max(23)).max(24),
      })
    )
    .max(12),
  table: z.object({
    header: z.boolean(),
    rows: z.array(z.object({ cells: z.array(text(80)).max(12) })).max(30),
  }),
});

export type FigureSpec = z.infer<typeof figureSpecSchema>;

/** A redrawn figure the teacher accepted, kept on the image block it replaces. */
export interface FigureRedraw {
  /** false: the teacher went back to the original picture (the drawing is kept to restore later). */
  active: boolean;
  spec: FigureSpec;
  approvedAt: string;
  /** 'ai': as AI drew it; 'edited': the teacher changed it before accepting. */
  origin: 'ai' | 'edited';
  /** Earlier accepted versions, newest first. */
  history?: { spec: FigureSpec; approvedAt: string }[];
}

export const MAX_REDRAW_HISTORY = 3;

export const EMPTY_SPEC: FigureSpec = {
  kind: 'geometry',
  points: [],
  segments: [],
  polygons: [],
  circles: [],
  rightAngles: [],
  arrows: [],
  texts: [],
  grid: { x: 0, y: 0, cellSize: 0, cells: [] },
  clocks: [],
  fractions: [],
  table: { header: false, rows: [] },
};

/** A checked copy of a figure description, or null when it is not one (never drawn, never saved). */
export function parseFigureSpec(value: unknown): FigureSpec | null {
  const parsed = figureSpecSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function parseFigureRedraw(value: unknown): FigureRedraw | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Partial<FigureRedraw>;
  const spec = parseFigureSpec(v.spec);
  if (!spec || typeof v.approvedAt !== 'string') return null;
  const history = (Array.isArray(v.history) ? v.history : [])
    .map((h) => ({ spec: parseFigureSpec(h?.spec), approvedAt: typeof h?.approvedAt === 'string' ? h.approvedAt : '' }))
    .filter((h): h is { spec: FigureSpec; approvedAt: string } => Boolean(h.spec))
    .slice(0, MAX_REDRAW_HISTORY);
  return { active: v.active !== false, spec, approvedAt: v.approvedAt, origin: v.origin === 'edited' ? 'edited' : 'ai', history };
}

/**
 * Lines a photo shows almost level or upright (within 5°) are made exactly so:
 * points joined by such a line get one shared y (or x). Points on several
 * lines keep every joint, since grouping is transitive.
 */
export function straightenSpec(spec: FigureSpec, maxDegrees = 5): FigureSpec {
  return snapLines(deskew(spec), maxDegrees);
}

/**
 * A photo taken at an angle tilts every line by the same amount. When most of
 * the drawn length is within 3° of one small tilt (1°–15°), the whole figure is
 * turned back by it. Figures whose lines go every which way are left alone.
 */
function deskew(spec: FigureSpec): FigureSpec {
  const byId = new Map(spec.points.map((p) => [p.id, p]));
  const lines = spec.segments
    .map((s) => {
      const a = byId.get(s.from);
      const b = byId.get(s.to);
      if (!a || !b) return null;
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      // Angle folded into (-45°, 45°]: level and upright lines share one tilt
      let deg = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
      deg = ((((deg + 45) % 90) + 90) % 90) - 45;
      return len > 0 ? { deg, len } : null;
    })
    .filter((l): l is { deg: number; len: number } => Boolean(l));
  const total = lines.reduce((t, l) => t + l.len, 0);
  if (!total) return spec;
  const sorted = [...lines].sort((x, y) => x.deg - y.deg);
  let acc = 0;
  const tilt = sorted.find((l) => (acc += l.len) >= total / 2)!.deg;
  const agree = lines.filter((l) => Math.abs(l.deg - tilt) <= 3).reduce((t, l) => t + l.len, 0);
  if (Math.abs(tilt) < 1 || Math.abs(tilt) > 15 || agree < total * 0.6) return spec;
  const rad = (-tilt * Math.PI) / 180;
  const cx = spec.points.reduce((t, p) => t + p.x, 0) / spec.points.length;
  const cy = spec.points.reduce((t, p) => t + p.y, 0) / spec.points.length;
  const turn = (x: number, y: number) => ({
    x: cx + (x - cx) * Math.cos(rad) - (y - cy) * Math.sin(rad),
    y: cy + (x - cx) * Math.sin(rad) + (y - cy) * Math.cos(rad),
  });
  return {
    ...spec,
    points: spec.points.map((p) => ({ ...p, ...turn(p.x, p.y) })),
    texts: spec.texts.map((t) => ({ ...t, ...turn(t.x, t.y) })),
    arrows: spec.arrows.map((a) => {
      const p1 = turn(a.x1, a.y1);
      const p2 = turn(a.x2, a.y2);
      return { x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y };
    }),
  };
}

function snapLines(spec: FigureSpec, maxDegrees: number): FigureSpec {
  const tan = Math.tan((maxDegrees * Math.PI) / 180);
  const byId = new Map(spec.points.map((p) => [p.id, p]));
  const groups = (axis: 'x' | 'y') => {
    const parent = new Map(spec.points.map((p) => [p.id, p.id]));
    const find = (x: string): string => (parent.get(x) === x ? x : find(parent.get(x)!));
    for (const s of spec.segments) {
      const a = byId.get(s.from);
      const b = byId.get(s.to);
      if (!a || !b) continue;
      const along = Math.abs(axis === 'y' ? b.x - a.x : b.y - a.y);
      const across = Math.abs(axis === 'y' ? b.y - a.y : b.x - a.x);
      if (along > 0 && across > 0 && across / along <= tan) parent.set(find(a.id), find(b.id));
      else if (along > 0 && across === 0) parent.set(find(a.id), find(b.id));
    }
    const sums = new Map<string, { total: number; n: number }>();
    for (const p of spec.points) {
      const root = find(p.id);
      const cur = sums.get(root) ?? { total: 0, n: 0 };
      sums.set(root, { total: cur.total + p[axis], n: cur.n + 1 });
    }
    return (id: string) => {
      const g = sums.get(find(id))!;
      return g.total / g.n;
    };
  };
  const levelY = groups('y');
  const uprightX = groups('x');
  return { ...spec, points: spec.points.map((p) => ({ ...p, x: Math.round(uprightX(p.id) * 10) / 10, y: Math.round(levelY(p.id) * 10) / 10 })) };
}

/** Sides each cell shape draws (a half cell keeps the two sides of its remaining corner). */
const CELL_SIDES: Record<(typeof CELL_SHAPES)[number], ReadonlyArray<'top' | 'right' | 'bottom' | 'left'>> = {
  square: ['top', 'right', 'bottom', 'left'],
  cut_tl: ['right', 'bottom'],
  cut_tr: ['bottom', 'left'],
  cut_bl: ['top', 'right'],
  cut_br: ['top', 'left'],
};

/**
 * Empty grid positions whose four sides are all drawn by neighbouring cells.
 * On paper such a hole looks like a cell, so the picture cannot show the
 * mistake; the teacher is told instead (the area would be off by one).
 */
export function enclosedEmptyCells(spec: FigureSpec): Array<{ row: number; col: number }> {
  const at = new Map(spec.grid.cells.map((c) => [`${c.row}:${c.col}`, CELL_SIDES[c.shape]]));
  const draws = (row: number, col: number, side: 'top' | 'right' | 'bottom' | 'left') => at.get(`${row}:${col}`)?.includes(side) ?? false;
  const holes: Array<{ row: number; col: number }> = [];
  const maxRow = Math.max(-1, ...spec.grid.cells.map((c) => c.row));
  const maxCol = Math.max(-1, ...spec.grid.cells.map((c) => c.col));
  for (let row = 1; row < maxRow; row++) {
    for (let col = 1; col < maxCol; col++) {
      if (at.has(`${row}:${col}`)) continue;
      if (draws(row - 1, col, 'bottom') && draws(row + 1, col, 'top') && draws(row, col - 1, 'right') && draws(row, col + 1, 'left')) holes.push({ row, col });
    }
  }
  return holes;
}

/** One character per cell in grid.rows: what remains of the cell, drawn as it looks. */
const ROW_SYMBOLS: Record<string, { shape: (typeof CELL_SHAPES)[number]; fill: FigureFill }> = {
  '■': { shape: 'square', fill: 'none' },
  '▪': { shape: 'square', fill: 'dark' },
  '▫': { shape: 'square', fill: 'light' },
  '◢': { shape: 'cut_tl', fill: 'none' },
  '◣': { shape: 'cut_tr', fill: 'none' },
  '◥': { shape: 'cut_bl', fill: 'none' },
  '◤': { shape: 'cut_br', fill: 'none' },
};

/** Cells from rows like ".◢■◣." – easier for the AI to keep columns aligned than row/col numbers. */
export function cellsFromRows(rows: string[]): FigureSpec['grid']['cells'] {
  return rows.slice(0, 40).flatMap((line, row) =>
    [...line.replace(/\s+/g, '')].slice(0, 40).flatMap((ch, col) => {
      const cell = ROW_SYMBOLS[ch];
      return cell ? [{ row, col, ...cell }] : [];
    })
  );
}

/** The rows text of a grid's cells (the inverse of cellsFromRows), for editing by hand. */
export function rowsFromCells(cells: FigureSpec['grid']['cells']): string[] {
  const symbol = new Map(Object.entries(ROW_SYMBOLS).map(([ch, c]) => [`${c.shape}:${c.fill}`, ch]));
  const at = new Map(cells.map((c) => [`${c.row}:${c.col}`, c]));
  const rows = Math.max(0, ...cells.map((c) => c.row + 1));
  const cols = Math.max(0, ...cells.map((c) => c.col + 1));
  return Array.from({ length: rows }, (_r, row) =>
    Array.from({ length: cols }, (_c, col) => {
      const c = at.get(`${row}:${col}`);
      return c ? (symbol.get(`${c.shape}:${c.fill}`) ?? symbol.get(`${c.shape}:none`)!) : '.';
    }).join('')
  );
}

/** Symbols a teacher types in the grid editor, with what each one draws. */
export const GRID_SYMBOL_HELP: Array<[string, string]> = [
  ['.', 'không có ô'],
  ['■', 'ô nguyên'],
  ['▪', 'ô tô đậm'],
  ['▫', 'ô tô nhạt'],
  ['◢', 'nửa ô dưới-phải'],
  ['◣', 'nửa ô dưới-trái'],
  ['◥', 'nửa ô trên-phải'],
  ['◤', 'nửa ô trên-trái'],
];

/** Area of the squared figure in cells (a half cell counts 0.5). */
export function gridArea(spec: FigureSpec): number {
  return spec.grid.cells.reduce((sum, c) => sum + (c.shape === 'square' ? 1 : 0.5), 0);
}

export function isEmptySpec(spec: FigureSpec): boolean {
  return (
    spec.points.length + spec.segments.length + spec.polygons.length + spec.circles.length + spec.arrows.length +
      spec.texts.length + spec.grid.cells.length + spec.clocks.length + spec.fractions.length + spec.table.rows.length ===
    0
  );
}

// ---------------------------------------------------------------------------
// Checks that need no AI: references, labels named in the question, scale
// ---------------------------------------------------------------------------

export interface FigureIssue {
  level: 'error' | 'warning' | 'info';
  message: string;
}

const MEASURE = /^\s*(\d+(?:[.,]\d+)?)\s*([a-zA-Zµ]+)\s*$/;

/** Point names the question text uses: "hình vuông ABCD", "điểm M", "cạnh BC". */
export function pointNamesInText(questionText: string): string[] {
  const names = new Set<string>();
  // Runs of 2–6 capitals after a figure word (ABCD, DEGK, BC…)
  // A single capital after "điểm" is a point; after other words it needs 2+ letters ("Hình H" names the figure)
  for (const m of questionText.matchAll(/(?:hình vuông|hình chữ nhật|hình thang|hình bình hành|hình thoi|hình tròn|hình|tam giác|tứ giác|cạnh|đoạn(?: thẳng)?|góc|đường(?: thẳng)?)\s+([A-Z]{2,6})(?![A-Za-zÀ-ỹ])|điểm\s+([A-Z])(?![A-Za-zÀ-ỹ])/giu)) {
    for (const ch of m[1] ?? m[2]) names.add(ch);
  }
  return [...names].sort();
}

export function checkFigureSpec(spec: FigureSpec, questionText = ''): FigureIssue[] {
  const issues: FigureIssue[] = [];
  const ids = new Set<string>();
  for (const p of spec.points) {
    if (ids.has(p.id)) issues.push({ level: 'error', message: `Điểm "${p.label || p.id}" bị khai báo hai lần.` });
    ids.add(p.id);
  }
  const missing = new Set<string>();
  const need = (pid: string) => {
    if (!ids.has(pid)) missing.add(pid);
  };
  spec.segments.forEach((s) => (need(s.from), need(s.to)));
  spec.polygons.forEach((p) => p.points.forEach(need));
  spec.circles.forEach((c) => need(c.center));
  spec.rightAngles.forEach((r) => (need(r.at), need(r.from), need(r.to)));
  if (missing.size) issues.push({ level: 'error', message: `Đường kẻ nối tới điểm không có trong hình: ${[...missing].join(', ')}.` });

  for (const s of spec.segments) {
    if (s.from === s.to) issues.push({ level: 'error', message: `Đoạn thẳng nối một điểm với chính nó (${s.from}).` });
  }
  const seenCells = new Set<string>();
  for (const c of spec.grid.cells) {
    const key = `${c.row}:${c.col}`;
    if (seenCells.has(key)) issues.push({ level: 'error', message: `Ô hàng ${c.row + 1}, cột ${c.col + 1} bị khai báo hai lần.` });
    seenCells.add(key);
  }
  if (spec.grid.cells.length && spec.grid.cellSize <= 0) issues.push({ level: 'error', message: 'Lưới ô vuông chưa có kích thước ô.' });
  for (const hole of enclosedEmptyCells(spec)) {
    issues.push({
      level: 'warning',
      message: `Ô hàng ${hole.row + 1}, cột ${hole.col + 1} để trống nhưng bốn cạnh đều được vẽ, trông như một ô của hình. Kiểm tra lại ô này có thuộc hình không.`,
    });
  }
  for (const f of spec.fractions) {
    if (f.shaded.some((i) => i >= f.parts)) issues.push({ level: 'error', message: `Hình phân số có ${f.parts} phần nhưng tô cả phần không tồn tại.` });
  }
  if (spec.kind === 'table') {
    const widths = new Set(spec.table.rows.map((r) => r.cells.length));
    if (!spec.table.rows.length) issues.push({ level: 'error', message: 'Bảng chưa có hàng nào.' });
    else if (widths.size > 1) issues.push({ level: 'warning', message: 'Các hàng của bảng không cùng số cột.' });
  } else if (isEmptySpec(spec)) {
    issues.push({ level: 'error', message: 'Hình vẽ lại đang trống.' });
  }

  const labels = spec.points.map((p) => p.label).filter(Boolean);
  const dupLabels = [...new Set(labels.filter((l, i) => labels.indexOf(l) !== i))];
  if (dupLabels.length) issues.push({ level: 'warning', message: `Có hai điểm cùng nhãn: ${dupLabels.join(', ')}.` });
  const named = pointNamesInText(questionText);
  const absent = named.filter((n) => !labels.includes(n));
  if (spec.kind === 'geometry' && absent.length) {
    issues.push({ level: 'warning', message: `Đề nhắc tới điểm ${absent.join(', ')} nhưng hình vẽ lại không có.` });
  }

  // Measurements of the same unit should share one scale when the figure is drawn to scale
  const byId = new Map(spec.points.map((p) => [p.id, p]));
  const ratios = new Map<string, { label: string; k: number }[]>();
  for (const s of spec.segments) {
    const m = MEASURE.exec(s.label.replace(/[²³]/g, ''));
    const a = byId.get(s.from);
    const b = byId.get(s.to);
    if (!m || !a || !b) continue;
    const value = Number(m[1].replace(',', '.'));
    const length = Math.hypot(a.x - b.x, a.y - b.y);
    if (value > 0 && length > 0) ratios.set(m[2], [...(ratios.get(m[2]) ?? []), { label: s.label, k: length / value }]);
  }
  for (const list of ratios.values()) {
    if (list.length < 2) continue;
    const ks = list.map((r) => r.k);
    if (Math.max(...ks) / Math.min(...ks) > 1.35) {
      issues.push({
        level: 'warning',
        message: `Độ dài vẽ không theo đúng tỉ lệ các số đo (${list.map((r) => r.label).join(', ')}). Đối chiếu với hình gốc.`,
      });
    }
  }

  if (spec.grid.cells.length) issues.push({ level: 'info', message: `Hình gồm ${gridArea(spec).toString().replace('.', ',')} ô vuông (nửa ô tính 0,5).` });
  return issues;
}

// ---------------------------------------------------------------------------
// Overall verdict for one redraw attempt
// ---------------------------------------------------------------------------

export type RedrawStatus = 'ok' | 'review' | 'wrong' | 'unsupported';

export interface FigureVerification {
  verdict: 'match' | 'minor_differences' | 'mismatch' | 'cannot_tell';
  differences: { kind: 'missing' | 'extra' | 'wrong'; detail: string }[];
  summary: string;
}

/**
 * ok: AI comparison found no difference and no check failed.
 * review: something needs a teacher's eye (unclear reading, warning, minor difference, comparison not run).
 * wrong: a check failed or the AI comparison found the drawing differs from the original.
 */
export function redrawStatus(issues: FigureIssue[], uncertain: string[], verification: FigureVerification | null): RedrawStatus {
  if (issues.some((i) => i.level === 'error') || verification?.verdict === 'mismatch') return 'wrong';
  if (issues.some((i) => i.level === 'warning') || uncertain.length > 0 || !verification || verification.verdict !== 'match') return 'review';
  return 'ok';
}
