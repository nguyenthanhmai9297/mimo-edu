import { EMPTY_SPEC, type FigureSpec } from '../../features/homework/figureSpec';

/** Hình H of the grade 3 exam (câu 6), as read from the original: square ABCD on rectangle DEGK. */
export const HINH_H: FigureSpec = {
  ...EMPTY_SPEC,
  kind: 'geometry',
  points: [
    { id: 'A', label: 'A', x: 37, y: 30, labelPos: 'auto' },
    { id: 'B', label: 'B', x: 97, y: 30, labelPos: 'auto' },
    { id: 'C', label: 'C', x: 97, y: 92, labelPos: 'se' },
    { id: 'D', label: 'D', x: 37, y: 92, labelPos: 'w' },
    { id: 'E', label: 'E', x: 262, y: 92, labelPos: 'auto' },
    { id: 'G', label: 'G', x: 262, y: 168, labelPos: 'auto' },
    { id: 'K', label: 'K', x: 37, y: 168, labelPos: 'auto' },
  ],
  segments: [
    { from: 'A', to: 'B', dashed: false, label: '', labelSide: 'auto' },
    { from: 'B', to: 'C', dashed: false, label: '7 cm', labelSide: 'right' },
    { from: 'A', to: 'D', dashed: false, label: '', labelSide: 'auto' },
    { from: 'D', to: 'E', dashed: false, label: '', labelSide: 'auto' },
    { from: 'E', to: 'G', dashed: false, label: '9 cm', labelSide: 'right' },
    { from: 'G', to: 'K', dashed: false, label: '25 cm', labelSide: 'below' },
    { from: 'K', to: 'D', dashed: false, label: '', labelSide: 'auto' },
  ],
  texts: [{ text: 'Hình H', x: 120, y: 200 }],
};

/** Câu 4: squared figure (half cells cut by diagonals), the dark cell is 1 cm². */
export const LUOI_O: FigureSpec = {
  ...EMPTY_SPEC,
  kind: 'grid',
  grid: {
    x: 18,
    y: 22,
    cellSize: 22,
    cells: [
      { row: 0, col: 1, shape: 'cut_tl', fill: 'none' },
      { row: 0, col: 2, shape: 'square', fill: 'none' },
      { row: 0, col: 3, shape: 'cut_tr', fill: 'none' },
      { row: 1, col: 0, shape: 'cut_tl', fill: 'none' },
      { row: 1, col: 1, shape: 'square', fill: 'none' },
      { row: 1, col: 2, shape: 'square', fill: 'none' },
      { row: 1, col: 3, shape: 'square', fill: 'none' },
      { row: 1, col: 4, shape: 'cut_tr', fill: 'none' },
      { row: 2, col: 0, shape: 'square', fill: 'none' },
      { row: 2, col: 1, shape: 'square', fill: 'none' },
      { row: 2, col: 2, shape: 'square', fill: 'none' },
      { row: 2, col: 3, shape: 'square', fill: 'none' },
      { row: 2, col: 4, shape: 'square', fill: 'dark' },
    ],
  },
  arrows: [{ x1: 132, y1: 77, x2: 155, y2: 77 }],
  texts: [{ text: '1 cm²', x: 160, y: 77 }],
};

/** Câu 5 table, as a figure description. */
export const BANG_DOC_SACH: FigureSpec = {
  ...EMPTY_SPEC,
  kind: 'table',
  table: {
    header: true,
    rows: [
      { cells: ['Bạn', 'Thanh', 'Hóa', 'Việt', 'Nam'] },
      { cells: ['Số giờ đọc sách', '8 giờ', '13 giờ', '14 giờ', '10 giờ'] },
    ],
  },
};

export const DONG_HO: FigureSpec = { ...EMPTY_SPEC, kind: 'clock', clocks: [{ x: 100, y: 100, radius: 90, hour: 2, minute: 45 }] };
export const PHAN_SO: FigureSpec = {
  ...EMPTY_SPEC,
  kind: 'fraction',
  fractions: [
    { shape: 'bar', x: 0, y: 0, size: 200, parts: 4, shaded: [0, 1, 2] },
    { shape: 'circle', x: 300, y: 30, size: 110, parts: 6, shaded: [0, 1] },
  ],
};
