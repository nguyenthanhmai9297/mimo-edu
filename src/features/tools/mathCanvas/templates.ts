import {
  addAltitude,
  addCircle,
  addDiagonals,
  addDiameter,
  addPoint,
  addRadius,
  addShape,
  connect,
  emptyDoc,
  type CanvasDoc,
  type GPoint,
} from './geometry';
import { BAR_TEMPLATES, makeBars, makeCubes, makeGrid, makeSolid } from './objects';
import type { SolidKind } from './solids';

/**
 * Ready-made drawings. Each one is built from real points and shapes, so
 * every vertex can be dragged and every label renamed.
 */
export interface CanvasTemplate {
  id: string;
  name: string;
  group: 'hinh-phang' | 'dem-hinh' | 'lop-3' | 'khoi-3d';
  build: () => CanvasDoc;
}

const named = (doc: CanvasDoc, name: string) => doc.points.find((p) => p.name === name)!.id;

/** Hides the names of helper points (division points of a grid). */
const quiet = (doc: CanvasDoc, ids: string[]): CanvasDoc => ({
  ...doc,
  points: doc.points.map((p): GPoint => (ids.includes(p.id) ? { ...p, showName: false } : p)),
});

/** Rectangle ABCD divided into `cols` × `rows` equal cells by segments between points on its sides. */
export function dividedRectangle(cols: number, rows: number, cell = 60, title = `Hình chữ nhật chia ${rows} × ${cols} ô`): CanvasDoc {
  const shape = addShape(emptyDoc(title), cols === rows ? 'square' : 'rectangle', { x0: 0, y0: 0, x1: cols * cell, y1: rows * cell });
  let doc = shape.doc;
  const [A, B, C, D] = shape.points;
  const helper: string[] = [];
  const on = (a: string, b: string, t: number) => {
    const r = addPoint(doc, { kind: 'onSegment', a, b, t });
    doc = r.doc;
    helper.push(r.id);
    return r.id;
  };
  for (let i = 1; i < cols; i++) {
    const top = on(D, C, i / cols);
    const bottom = on(A, B, i / cols);
    doc = connect(doc, 'segment', top, bottom).doc;
  }
  for (let j = 1; j < rows; j++) {
    const left = on(A, D, j / rows);
    const right = on(B, C, j / rows);
    doc = connect(doc, 'segment', left, right).doc;
  }
  return quiet(doc, helper);
}

/** A drawing holding one placed object. */
const single = (title: string, obj: CanvasDoc['objects'][number]): CanvasDoc => ({ ...emptyDoc(title), objects: [obj], grid: { show: false, size: 40, snap: true } });
const solid = (kind: SolidKind, title: string): CanvasTemplate => ({ id: `khoi-${kind}`, name: title, group: 'khoi-3d', build: () => single(title, makeSolid(kind, 0, 0)) });

export const CANVAS_TEMPLATES: CanvasTemplate[] = [
  {
    id: 'tam-giac-am',
    name: 'Tam giác ABC, điểm M trên BC, nối AM',
    group: 'hinh-phang',
    build: () => {
      let doc = addShape(emptyDoc('Tam giác ABC và đoạn AM'), 'triangle', { x0: 0, y0: 0, x1: 320, y1: 220 }).doc;
      const m = addPoint(doc, { kind: 'onSegment', a: named(doc, 'B'), b: named(doc, 'C'), t: 0.4 }, 'M');
      doc = connect(m.doc, 'segment', named(m.doc, 'A'), m.id).doc;
      return doc;
    },
  },
  {
    id: 'tam-giac-vuong-ah',
    name: 'Tam giác ABC vuông tại A, đường cao AH',
    group: 'hinh-phang',
    build: () => {
      const s = addShape(emptyDoc('Tam giác vuông ABC, đường cao AH'), 'right-triangle', { x0: 0, y0: 0, x1: 320, y1: 220 });
      return addAltitude(s.doc, s.id, 0, 'H');
    },
  },
  {
    id: 'hinh-vuong-cheo',
    name: 'Hình vuông ABCD và hai đường chéo',
    group: 'hinh-phang',
    build: () => {
      const s = addShape(emptyDoc('Hình vuông ABCD, đường chéo AC và BD'), 'square', { x0: 0, y0: 0, x1: 240, y1: 240 });
      return addDiagonals(s.doc, s.id);
    },
  },
  {
    id: 'hinh-tron',
    name: 'Hình tròn tâm O, bán kính OA, đường kính BC',
    group: 'hinh-phang',
    build: () => {
      const c = addCircle(emptyDoc('Hình tròn tâm O'), { x: 0, y: 0 }, { x: 110, y: -70 });
      let doc = addRadius(c.doc, c.id);
      doc = addDiameter(doc, c.id, Math.PI * 0.9);
      // show the lengths of the radius and diameter
      return { ...doc, objects: doc.objects.map((o) => (o.type === 'segment' ? { ...o, showLength: true } : o)) };
    },
  },
  {
    id: 'hcn-3x4',
    name: 'Hình chữ nhật chia 3 × 4 ô vuông',
    group: 'dem-hinh',
    build: () => dividedRectangle(4, 3),
  },
  {
    id: 'vuong-2x2',
    name: 'Hình vuông chia 4 ô',
    group: 'dem-hinh',
    build: () => dividedRectangle(2, 2, 90, 'Hình vuông chia 4 ô'),
  },
  {
    id: 'vuong-3x3',
    name: 'Hình vuông chia 9 ô',
    group: 'dem-hinh',
    build: () => dividedRectangle(3, 3, 70, 'Hình vuông chia 9 ô'),
  },
  {
    id: 'vuong-4x4',
    name: 'Hình vuông chia 16 ô',
    group: 'dem-hinh',
    build: () => dividedRectangle(4, 4, 55, 'Hình vuông chia 16 ô'),
  },
  {
    id: 'hcn-cheo',
    name: 'Hình chữ nhật có hai đường chéo',
    group: 'dem-hinh',
    build: () => {
      const s = addShape(emptyDoc('Hình chữ nhật có đường chéo – đếm tam giác'), 'rectangle', { x0: 0, y0: 0, x1: 320, y1: 180 });
      return addDiagonals(s.doc, s.id);
    },
  },
  {
    id: 'tam-giac-chia',
    name: 'Tam giác chia thành nhiều tam giác',
    group: 'dem-hinh',
    build: () => {
      let doc = addShape(emptyDoc('Đếm tam giác'), 'isosceles', { x0: 0, y0: 0, x1: 360, y1: 240 }).doc;
      const A = named(doc, 'A');
      const B = named(doc, 'B');
      const C = named(doc, 'C');
      for (const [t, n] of [
        [1 / 3, 'M'],
        [2 / 3, 'N'],
      ] as const) {
        const r = addPoint(doc, { kind: 'onSegment', a: B, b: C, t }, n);
        doc = connect(r.doc, 'segment', A, r.id).doc;
      }
      return doc;
    },
  },
  {
    id: 'dem-doan',
    name: 'Các điểm thẳng hàng – đếm đoạn thẳng',
    group: 'dem-hinh',
    build: () => {
      let doc = emptyDoc('Đếm đoạn thẳng');
      const a = addPoint(doc, { kind: 'free', x: 0, y: 0 }, 'A');
      const d = addPoint(a.doc, { kind: 'free', x: 360, y: 0 }, 'D');
      doc = connect(d.doc, 'segment', a.id, d.id).doc;
      doc = addPoint(doc, { kind: 'onSegment', a: a.id, b: d.id, t: 0.3 }, 'B').doc;
      doc = addPoint(doc, { kind: 'onSegment', a: a.id, b: d.id, t: 0.65 }, 'C').doc;
      return doc;
    },
  },
  {
    id: 'luoi-dien-tich',
    name: 'Lưới diện tích hình chữ nhật 4 × 3',
    group: 'lop-3',
    build: () => {
      const fills: Record<string, string> = {};
      for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++) fills[`${r + 1},${c + 1}`] = '#FFD34E';
      return { ...emptyDoc('Diện tích hình chữ nhật: 4 × 3 = 12 ô vuông'), objects: [makeGrid(0, 0, 6, 5, 40, fills)] };
    },
  },
  {
    id: 'luoi-to-mau',
    name: 'Lưới ô vuông trống để tô màu',
    group: 'lop-3',
    build: () => ({ ...emptyDoc('Lưới ô vuông'), objects: [makeGrid(0, 0, 8, 6, 40)] }),
  },
  ...BAR_TEMPLATES.map(
    (t): CanvasTemplate => ({
      id: `so-do-${t.id}`,
      name: `Sơ đồ đoạn thẳng: ${t.name.toLowerCase()}`,
      group: 'lop-3',
      build: () => single(`Sơ đồ đoạn thẳng – ${t.name.toLowerCase()}`, makeBars(0, 0, t.rows)),
    })
  ),
  {
    id: 'xep-khoi',
    name: 'Mô hình ghép nhiều khối lập phương',
    group: 'khoi-3d',
    build: () => single('Đếm khối lập phương', makeCubes(0, 0, 4, 3, [3, 2, 2, 1, 2, 1, 1, 0, 1, 1, 0, 0])),
  },
  solid('cube', 'Khối lập phương ABCD.EFGH'),
  solid('cuboid', 'Hình hộp chữ nhật ABCD.EFGH'),
  solid('pyramid', 'Hình chóp S.ABCD'),
  solid('cylinder', 'Hình trụ'),
  solid('cone', 'Hình nón'),
  solid('sphere', 'Hình cầu tâm O'),
];
