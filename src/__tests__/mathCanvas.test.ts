import { describe, it, expect } from 'vitest';
import {
  addAltitude,
  addCircle,
  addDiagonals,
  addDiameter,
  addPoint,
  addRadius,
  addShape,
  bounds,
  connect,
  copyItems,
  deleteItems,
  dist,
  dot,
  dragDef,
  emptyDoc,
  moveItems,
  parseCanvas,
  pasteClip,
  resolve,
  segmentsCross,
  sub,
  type CanvasDoc,
  type GPoint,
} from '../features/tools/mathCanvas/geometry';
import { chainEdges, projectCubes, projectSolid, barRow } from '../features/tools/mathCanvas/solids';
import { makeSolid } from '../features/tools/mathCanvas/objects';
import { CANVAS_TEMPLATES } from '../features/tools/mathCanvas/templates';

const pt = (doc: CanvasDoc, name: string) => doc.points.find((p) => p.name === name)!;
const at = (doc: CanvasDoc, name: string) => resolve(doc).get(pt(doc, name).id)!;
/** Drags a point the way the canvas does. */
function drag(doc: CanvasDoc, name: string, to: { x: number; y: number }): CanvasDoc {
  const p = pt(doc, name);
  const def = dragDef(p, to, resolve(doc), doc);
  if (!def) return doc;
  return { ...doc, points: doc.points.map((x) => (x.id === p.id ? ({ ...x, def } as GPoint) : x)) };
}
const angleAt = (doc: CanvasDoc, o: string, a: string, b: string) => {
  const u = sub(at(doc, a), at(doc, o));
  const v = sub(at(doc, b), at(doc, o));
  return (Math.acos(dot(u, v) / (Math.hypot(u.x, u.y) * Math.hypot(v.x, v.y))) * 180) / Math.PI;
};
const box = { x0: 100, y0: 100, x1: 300, y1: 260 };

describe('Bảng vẽ Toán học – hình phẳng', () => {
  it('tam giác ABC thường, M trên BC, nối AM: M trượt trên BC và AM luôn nối đúng', () => {
    let doc = addShape(emptyDoc(), 'triangle', box).doc;
    expect(doc.points.map((p) => p.name)).toEqual(['A', 'B', 'C']);
    const B = pt(doc, 'B').id;
    const C = pt(doc, 'C').id;
    const m = addPoint(doc, { kind: 'onSegment', a: B, b: C, t: 0.5 }, 'M');
    doc = connect(m.doc, 'segment', pt(m.doc, 'A').id, m.id).doc;
    // dragging M off the side keeps it on BC
    doc = drag(doc, 'M', { x: 260, y: 400 });
    const t = (at(doc, 'M').x - at(doc, 'B').x) / (at(doc, 'C').x - at(doc, 'B').x);
    expect(at(doc, 'M').y).toBeCloseTo(at(doc, 'B').y);
    expect(t).toBeGreaterThan(0.7);
    // moving C moves M with the side
    doc = drag(doc, 'C', { x: 400, y: 300 });
    const M = at(doc, 'M');
    const Bv = at(doc, 'B');
    const Cv = at(doc, 'C');
    expect(dist(Bv, M) + dist(M, Cv)).toBeCloseTo(dist(Bv, Cv));
    const seg = doc.objects.find((o) => o.type === 'segment')!;
    expect(seg.type === 'segment' && [seg.a, seg.b]).toEqual([pt(doc, 'A').id, pt(doc, 'M').id]);
  });

  it('tam giác ABC vuông tại A, đường cao AH: góc vuông giữ nguyên khi kéo đỉnh', () => {
    const shape = addShape(emptyDoc(), 'right-triangle', box);
    let doc = shape.doc;
    expect(doc.objects.filter((o) => o.type === 'rightMark')).toHaveLength(1);
    expect(angleAt(doc, 'A', 'B', 'C')).toBeCloseTo(90);
    doc = drag(doc, 'B', { x: 420, y: 180 }); // tilt AB
    doc = drag(doc, 'C', { x: 60, y: 20 }); // stretch AC
    expect(angleAt(doc, 'A', 'B', 'C')).toBeCloseTo(90);
    // altitude from A (vertex index 0) onto BC
    doc = addAltitude(doc, shape.id, 0, 'H');
    expect(angleAt(doc, 'H', 'A', 'B')).toBeCloseTo(90);
    expect(doc.objects.filter((o) => o.type === 'rightMark')).toHaveLength(2);
    doc = drag(doc, 'B', { x: 380, y: 320 });
    expect(angleAt(doc, 'H', 'A', 'C')).toBeCloseTo(90);
    expect(angleAt(doc, 'A', 'B', 'C')).toBeCloseTo(90);
  });

  it('hình vuông ABCD với hai đường chéo AC, BD cắt nhau tại một điểm', () => {
    const shape = addShape(emptyDoc(), 'square', box);
    let doc = addDiagonals(shape.doc, shape.id);
    const segs = doc.objects.filter((o) => o.type === 'segment');
    expect(segs).toHaveLength(2);
    expect(doc.points.map((p) => p.name).sort()).toEqual(['A', 'B', 'C', 'D']);
    const side = (a: string, b: string) => dist(at(doc, a), at(doc, b));
    expect(side('A', 'B')).toBeCloseTo(side('B', 'C'));
    expect(side('A', 'C')).toBeCloseTo(side('B', 'D'));
    // the square stays a square when a base vertex is dragged
    doc = drag(doc, 'B', { x: 330, y: 200 });
    expect(side('A', 'B')).toBeCloseTo(side('C', 'D'));
    expect(side('A', 'B')).toBeCloseTo(side('A', 'D'));
    expect(angleAt(doc, 'B', 'A', 'C')).toBeCloseTo(90);
    expect(segmentsCross(at(doc, 'A'), at(doc, 'C'), at(doc, 'B'), at(doc, 'D'))).not.toBeNull();
    // C and D are defined by A and B: they can't be dragged on their own
    expect(dragDef(pt(doc, 'C'), { x: 0, y: 0 }, resolve(doc), doc)).toBeNull();
  });

  it('hình tròn tâm O, bán kính OA, đường kính BC qua tâm', () => {
    const c = addCircle(emptyDoc(), { x: 200, y: 200 }, { x: 280, y: 200 });
    let doc = addRadius(c.doc, c.id);
    doc = addDiameter(doc, c.id);
    expect(pt(doc, 'O')).toBeTruthy();
    const names = doc.points.map((p) => p.name);
    expect(names).toHaveLength(4); // O, radius point, B, C
    const [, , b, cc] = doc.points;
    const pos = resolve(doc);
    const O = pos.get(pt(doc, 'O').id)!;
    expect(dist(O, pos.get(b.id)!)).toBeCloseTo(80);
    expect(dist(pos.get(b.id)!, pos.get(cc.id)!)).toBeCloseTo(160);
    // dragging the radius point makes the circle bigger; B and C follow
    doc = drag(doc, names[1], { x: 320, y: 200 });
    const pos2 = resolve(doc);
    expect(dist(pos2.get(b.id)!, pos2.get(cc.id)!)).toBeCloseTo(240);
    // dragging B rotates the diameter, still through O
    doc = drag(doc, b.name, { x: 200, y: 50 });
    const pos3 = resolve(doc);
    const mid = { x: (pos3.get(b.id)!.x + pos3.get(cc.id)!.x) / 2, y: (pos3.get(b.id)!.y + pos3.get(cc.id)!.y) / 2 };
    expect(dist(mid, O)).toBeCloseTo(0);
    expect(pos3.get(b.id)!.y).toBeLessThan(200);
  });

  it('các hình đặc biệt giữ đúng tính chất khi kéo đỉnh', () => {
    for (const kind of ['isosceles', 'equilateral', 'rectangle', 'parallelogram', 'rhombus', 'trapezoid'] as const) {
      let doc = addShape(emptyDoc(), kind, box).doc;
      doc = drag(doc, 'B', { x: 90, y: 300 });
      const s = (a: string, b: string) => dist(at(doc, a), at(doc, b));
      if (kind === 'isosceles') expect(s('A', 'B')).toBeCloseTo(s('A', 'C'));
      if (kind === 'equilateral') {
        expect(s('A', 'B')).toBeCloseTo(s('B', 'C'));
        expect(s('A', 'C')).toBeCloseTo(s('B', 'C'));
      }
      if (kind === 'rectangle') expect(angleAt(doc, 'A', 'B', 'D')).toBeCloseTo(90);
      if (kind === 'parallelogram' || kind === 'rectangle') expect(s('A', 'B')).toBeCloseTo(s('C', 'D'));
      if (kind === 'rhombus') {
        expect(s('A', 'B')).toBeCloseTo(s('A', 'D'));
        expect(s('B', 'C')).toBeCloseTo(s('C', 'D'));
      }
      if (kind === 'trapezoid') {
        const ab = sub(at(doc, 'B'), at(doc, 'A'));
        const dc = sub(at(doc, 'C'), at(doc, 'D'));
        expect(ab.x * dc.y - ab.y * dc.x).toBeCloseTo(0); // AB ∥ DC
      }
    }
  });

  it('giao điểm hai đoạn thẳng là một điểm và đi theo khi kéo', () => {
    let doc = emptyDoc();
    const ids: string[] = [];
    for (const [x, y] of [[0, 0], [200, 200], [0, 200], [200, 0]]) {
      const r = addPoint(doc, { kind: 'free', x, y });
      doc = r.doc;
      ids.push(r.id);
    }
    doc = connect(doc, 'segment', ids[0], ids[1]).doc;
    doc = connect(doc, 'segment', ids[2], ids[3]).doc;
    const i = addPoint(doc, { kind: 'intersection', a: ids[0], b: ids[1], c: ids[2], d: ids[3] }, 'I');
    doc = i.doc;
    expect(at(doc, 'I')).toEqual({ x: 100, y: 100 });
    doc = drag(doc, 'B', { x: 400, y: 200 });
    const I = at(doc, 'I');
    expect(I.y).toBeCloseTo(I.x / 2);
  });

  it('xóa một đỉnh xóa an toàn các hình dùng đỉnh đó; xóa hình bỏ các đỉnh không còn dùng', () => {
    const shape = addShape(emptyDoc(), 'right-triangle', box);
    let doc = addAltitude(shape.doc, shape.id, 0, 'H');
    const afterB = deleteItems(doc, [pt(doc, 'B').id]);
    expect(afterB.objects).toHaveLength(0); // polygon, altitude, both marks
    expect(afterB.points.map((p) => p.name).sort()).toEqual([]); // C depended on B, H on B, A unused
    doc = deleteItems(doc, [shape.id]);
    expect(doc.objects.some((o) => o.type === 'polygon')).toBe(false);
    expect(parseCanvas(JSON.parse(JSON.stringify(doc)))).toEqual(doc);
  });

  it('sao chép, dán, di chuyển và tính khung bao không cắt mất tên điểm', () => {
    const shape = addShape(emptyDoc(), 'square', box);
    let doc = shape.doc;
    const clip = copyItems(doc, [shape.id]);
    const pasted = pasteClip(doc, clip, { x: 300, y: 0 });
    doc = pasted.doc;
    expect(doc.points).toHaveLength(8);
    expect(new Set(doc.points.map((p) => p.name)).size).toBe(8);
    const pos = resolve(doc);
    const b = bounds(doc, pos)!;
    expect(b.x).toBeLessThanOrEqual(100 - 20);
    expect(b.x + b.w).toBeGreaterThanOrEqual(300 + 260 + 20);
    doc = moveItems(doc, pasted.ids, { x: 0, y: 50 });
    const moved = resolve(doc);
    const copyA = doc.points[4];
    expect(moved.get(copyA.id)!.y).toBeCloseTo(pos.get(copyA.id)!.y + 50);
    expect(parseCanvas({ format: 'x' })).toMatch(/không phải/);
  });

  it('khối lập phương ABCD.EFGH: 9 cạnh thấy, 3 cạnh khuất; xoay góc nhìn đổi cạnh khuất', () => {
    const cube = makeSolid('cube', 0, 0);
    expect(cube.labels).toEqual(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']);
    const pic = projectSolid(cube.spec, 0, 0);
    expect(pic.visible).toHaveLength(9);
    expect(pic.hidden).toHaveLength(3);
    expect(pic.faces).toHaveLength(3);
    expect(pic.labels).toHaveLength(8);
    const turned = projectSolid({ ...cube.spec, yaw: cube.spec.yaw + 90 }, 0, 0);
    expect(turned.hidden).toHaveLength(3);
    expect(JSON.stringify(turned.hidden)).not.toEqual(JSON.stringify(pic.hidden));
    // straight on: only the front face is seen, the back edges are all hidden behind it
    const front = projectSolid({ ...cube.spec, yaw: 0, pitch: 0 }, 0, 0);
    expect(front.faces).toHaveLength(1);
  });

  it('hình chóp, hình trụ, hình nón, hình cầu có cấu trúc đúng', () => {
    const pyr = projectSolid(makeSolid('pyramid', 0, 0).spec, 0, 0);
    expect(pyr.visible.length + pyr.hidden.length).toBe(8);
    const cyl = projectSolid({ ...makeSolid('cylinder', 0, 0).spec, pitch: 20 }, 0, 0);
    expect(cyl.hidden.length).toBeGreaterThan(10); // back half of the bottom rim
    expect(chainEdges(cyl.hidden)).toHaveLength(1); // drawn as one dashed arc
    expect(cyl.visible.length).toBeGreaterThan(48); // top rim + front of bottom rim + 2 outlines
    const cone = projectSolid({ ...makeSolid('cone', 0, 0).spec, pitch: 20 }, 0, 0);
    expect(cone.labels.map((l) => l.index)).toEqual([0, 1]);
    const sphere = projectSolid({ ...makeSolid('sphere', 0, 0).spec, pitch: 20 }, 0, 0);
    expect(sphere.sphere!.r).toBeCloseTo(70);
    expect(sphere.sphere!.back.length).toBeGreaterThan(10);
  });

  it('mô hình xếp khối đếm đúng số khối; sơ đồ đoạn thẳng chia đều', () => {
    const m = projectCubes(3, 2, [3, 1, 0, 2, 0, 1], 40, 1, 0, 0);
    expect(m.count).toBe(7);
    expect(m.faces).toHaveLength(21);
    const row = barRow({ label: 'Số lớn', length: 9, parts: 3, color: '#000000', braces: [] }, 100, 0, 30);
    expect(row.ticks).toEqual([100, 190, 280, 370]);
  });

  it('mọi mẫu dựng sẵn mở ra là đối tượng sửa được và qua được kiểm tra tệp', () => {
    expect(CANVAS_TEMPLATES.length).toBeGreaterThanOrEqual(20);
    for (const t of CANVAS_TEMPLATES) {
      const doc = t.build();
      expect(doc.objects.length + doc.points.length).toBeGreaterThan(0);
      expect(parseCanvas(JSON.parse(JSON.stringify(doc)))).toEqual(doc);
      expect(bounds(doc, resolve(doc))).not.toBeNull();
    }
  });
});
