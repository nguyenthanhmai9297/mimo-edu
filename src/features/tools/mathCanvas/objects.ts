import { newId, type GObject } from './geometry';
import { defaultNames, type BarRow, type SolidKind } from './solids';

/** Ready-to-place solids, cube models, grids and bar diagrams (all fully editable afterwards). */

export const SOLID_NAMES: Record<SolidKind, string> = {
  cube: 'Khối lập phương',
  cuboid: 'Hình hộp chữ nhật',
  pyramid: 'Hình chóp',
  cylinder: 'Hình trụ',
  cone: 'Hình nón',
  sphere: 'Hình cầu',
};

const SOLID_DIMS: Record<SolidKind, { w: number; h: number; d: number }> = {
  cube: { w: 3, h: 3, d: 3 },
  cuboid: { w: 4, h: 2.5, d: 2.5 },
  pyramid: { w: 3, h: 3.5, d: 3 },
  cylinder: { w: 3, h: 3.5, d: 3 },
  cone: { w: 3.2, h: 3.5, d: 3.2 },
  sphere: { w: 3.5, h: 3.5, d: 3.5 },
};

export function makeSolid(kind: SolidKind, x: number, y: number): Extract<GObject, { type: 'solid' }> {
  return {
    id: newId('o'),
    type: 'solid',
    x,
    y,
    spec: { kind, ...SOLID_DIMS[kind], size: 40, yaw: kind === 'cylinder' || kind === 'cone' || kind === 'sphere' ? 0 : 32, pitch: 18 },
    color: '#54C8FF',
    opacity: 0.45,
    showEdges: true,
    showHidden: true,
    showVertices: kind !== 'cylinder' && kind !== 'cone' && kind !== 'sphere',
    showLabels: kind !== 'cylinder' && kind !== 'cone' && kind !== 'sphere',
    labels: defaultNames(kind),
  };
}

export function makeCubes(x: number, y: number, cols = 3, rows = 3, heights?: number[]): Extract<GObject, { type: 'cubes' }> {
  return {
    id: newId('o'),
    type: 'cubes',
    x,
    y,
    size: 40,
    cols,
    rows,
    heights: heights ?? [3, 2, 1, 2, 1, 1, 1, 0, 0].slice(0, cols * rows),
    color: '#1267E9',
    view: 0,
    showCount: false,
  };
}

export function makeGrid(x: number, y: number, cols: number, rows: number, cell: number, fills: Record<string, string> = {}): Extract<GObject, { type: 'cellGrid' }> {
  return { id: newId('o'), type: 'cellGrid', x, y, cols, rows, cell, stroke: '#071A63', fills, showCount: true };
}

export function makeBars(x: number, y: number, rows: BarRow[], unit = 34): Extract<GObject, { type: 'bars' }> {
  return { id: newId('o'), type: 'bars', x, y, unit, rows: rows.map((r) => ({ ...r, braces: r.braces.map((b) => ({ ...b })) })) };
}

const BLUE = '#1267E9';
const PINK = '#E5484D';
const GREEN = '#22C38E';

/** Bar diagrams for the usual Toán 3 problems. */
export const BAR_TEMPLATES: { id: string; name: string; rows: BarRow[] }[] = [
  {
    id: 'hai-dai-luong',
    name: 'Hai đại lượng',
    rows: [
      { label: 'Số bé:', length: 4, parts: 1, color: BLUE, braces: [{ from: 0, to: 1, text: '24' }] },
      { label: 'Số lớn:', length: 7, parts: 1, color: PINK, braces: [{ from: 0, to: 1, text: '?' }] },
    ],
  },
  {
    id: 'gap-len',
    name: 'Gấp lên nhiều lần',
    rows: [
      { label: 'Bao nhỏ:', length: 3, parts: 1, color: BLUE, braces: [{ from: 0, to: 1, text: '6 kg' }] },
      { label: 'Bao lớn:', length: 9, parts: 3, color: PINK, braces: [{ from: 0, to: 3, text: '? kg' }] },
    ],
  },
  {
    id: 'giam-di',
    name: 'Giảm đi nhiều lần',
    rows: [
      { label: 'Lúc đầu:', length: 12, parts: 4, color: BLUE, braces: [{ from: 0, to: 4, text: '48 quả' }] },
      { label: 'Còn lại:', length: 3, parts: 1, color: PINK, braces: [{ from: 0, to: 1, text: '?' }] },
    ],
  },
  {
    id: 'gap-may-lan',
    name: 'Số lớn gấp mấy lần số bé',
    rows: [
      { label: 'Số bé:', length: 2, parts: 1, color: BLUE, braces: [{ from: 0, to: 1, text: '4' }] },
      { label: 'Số lớn:', length: 10, parts: 5, color: PINK, braces: [{ from: 0, to: 5, text: '20' }, { from: 0, to: 5, text: 'Gấp ? lần', below: true }] },
    ],
  },
  {
    id: 'mot-phan-may',
    name: 'Tìm một phần mấy',
    rows: [{ label: 'Cả sợi dây:', length: 12, parts: 4, color: BLUE, braces: [{ from: 0, to: 4, text: '24 m' }, { from: 0, to: 1, text: '?', below: true }] }],
  },
  {
    id: 'hai-buoc',
    name: 'Bài toán hai bước tính',
    rows: [
      { label: 'Thùng 1:', length: 5, parts: 1, color: BLUE, braces: [{ from: 0, to: 1, text: '25 l' }] },
      { label: 'Thùng 2:', length: 8, parts: 1, color: GREEN, braces: [{ from: 0, to: 1, text: 'nhiều hơn thùng 1 là 15 l', below: true }] },
      { label: 'Cả hai:', length: 13, parts: 1, color: PINK, braces: [{ from: 0, to: 1, text: '? l' }] },
    ],
  },
];
