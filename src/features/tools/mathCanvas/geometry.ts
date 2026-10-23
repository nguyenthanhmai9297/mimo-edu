/**
 * Data model of "Bảng vẽ Toán học" (Mimo Math Canvas).
 *
 * Points are separate from the objects that use them, so a segment, a polygon
 * and a right-angle mark that share a vertex stay joined when it is dragged.
 * A point is either free or defined from other points (on a side, at an
 * intersection, foot of an altitude, …); defined points are recomputed every
 * time, which is how a right triangle keeps its right angle.
 * World units are px; `grid.size` px = 1 cm.
 */

import { barsBounds, projectCubes, projectSolid, type BarRow, type SolidSpec } from './solids';

export interface Vec {
  x: number;
  y: number;
}

export type PointDef =
  | { kind: 'free'; x: number; y: number }
  /** On line AB at A + t·(B − A); 0 ≤ t ≤ 1 keeps it on the segment. */
  | { kind: 'onSegment'; a: string; b: string; t: number }
  /** On the circle object `circle` at `angle` (radians). */
  | { kind: 'onCircle'; circle: string; angle: number }
  /** Intersection of lines AB and CD. */
  | { kind: 'intersection'; a: string; b: string; c: string; d: string }
  /** Foot of the perpendicular from P to line AB. */
  | { kind: 'foot'; p: string; a: string; b: string }
  | { kind: 'midpoint'; a: string; b: string }
  /** O + k·perp(R − O): keeps a right angle at O (k changes when dragged unless fixed). */
  | { kind: 'perp'; o: string; r: string; k: number; fixed?: boolean }
  /** O + scale·rotate(R − O, angle); `free` says which value dragging may change. */
  | { kind: 'rotate'; o: string; r: string; angle: number; scale: number; free?: 'angle' | 'none' }
  /** P + (TO − FROM): fourth vertex of a parallelogram, rectangle, square. */
  | { kind: 'translate'; p: string; from: string; to: string }
  /** midpoint(A, B) + k·perp(B − A): apex of an isosceles triangle. */
  | { kind: 'apex'; a: string; b: string; k: number }
  /** P + k·(B − A): the vertex of a trapezoid that keeps its side parallel to AB. */
  | { kind: 'along'; p: string; a: string; b: string; k: number }
  /** 2·C − P: other end of a diameter through centre C. */
  | { kind: 'opposite'; p: string; c: string };

export interface GPoint {
  id: string;
  type: 'point';
  def: PointDef;
  name: string;
  showName: boolean;
  color: string;
}

export interface Stroke {
  stroke: string;
  width: number;
  dash: 'solid' | 'dashed';
  fill: string; // 'none' or a colour
  fillOpacity: number;
}

interface Base {
  id: string;
  locked?: boolean;
}

export type GObject =
  | (Base & { type: 'segment'; a: string; b: string; style: Stroke; showLength?: boolean })
  | (Base & { type: 'line'; a: string; b: string; style: Stroke })
  | (Base & { type: 'ray'; a: string; b: string; style: Stroke })
  | (Base & { type: 'polygon'; pts: string[]; style: Stroke; shape: ShapeKind; showLengths?: boolean })
  | (Base & { type: 'circle'; c: string; p: string; style: Stroke; showRadius?: boolean })
  | (Base & { type: 'rightMark'; o: string; a: string; b: string; size: number; style: Stroke })
  | (Base & { type: 'text'; x: number; y: number; text: string; fontSize: number; color: string; bold: boolean; rotation?: number })
  /** A 3D solid drawn in projection; (x, y) is its centre. */
  | (Base & {
      type: 'solid';
      x: number;
      y: number;
      spec: SolidSpec;
      color: string;
      opacity: number;
      showEdges: boolean;
      showHidden: boolean;
      showVertices: boolean;
      showLabels: boolean;
      labels: string[];
    })
  /** Columns of unit cubes on a floor of cols × rows; (x, y) is the back corner of the floor. */
  | (Base & { type: 'cubes'; x: number; y: number; size: number; cols: number; rows: number; heights: number[]; color: string; view: number; showCount: boolean })
  /** Grid of unit squares that can be coloured one by one; (x, y) is the top-left corner. */
  | (Base & { type: 'cellGrid'; x: number; y: number; cols: number; rows: number; cell: number; stroke: string; fills: Record<string, string>; showCount: boolean })
  /** Bar diagram (sơ đồ đoạn thẳng): rows of bars starting at the same x. */
  | (Base & { type: 'bars'; x: number; y: number; unit: number; rows: BarRow[] });

/** Objects placed by a position (not by points). */
export type PlacedObject = Extract<GObject, { x: number; y: number }>;
export const isPlaced = (o: GObject): o is PlacedObject => 'x' in o && 'y' in o;

export type ShapeKind =
  | 'polygon'
  | 'triangle'
  | 'right-triangle'
  | 'isosceles'
  | 'equilateral'
  | 'square'
  | 'rectangle'
  | 'parallelogram'
  | 'rhombus'
  | 'trapezoid';

export interface CanvasDoc {
  format: 'mimoedu-mathcanvas';
  version: 1;
  title: string;
  points: GPoint[];
  objects: GObject[];
  grid: { show: boolean; size: number; snap: boolean };
  showNames: boolean;
  showLengths: boolean;
}

export const INK = '#071A63';
export const COLORS = ['#071A63', '#1267E9', '#E5484D', '#22C38E', '#FFB800', '#7B5CFF', '#FF76B5', '#13B5C9', '#5E6C84', '#000000'];
export const FILLS = ['none', '#EAF5FF', '#FFF0F7', '#FFF8E1', '#F1EDFF', '#E6FAFC', '#EAFBF4', '#FFEEF0', '#1267E9', '#FFB800', '#22C38E', '#E5484D'];

export const defaultStroke = (patch: Partial<Stroke> = {}): Stroke => ({ stroke: INK, width: 2.5, dash: 'solid', fill: 'none', fillOpacity: 0.35, ...patch });

let counter = 0;
export const newId = (prefix = 'g') => `${prefix}${Date.now().toString(36)}${(counter++).toString(36)}`;

export function emptyDoc(title = 'Bản vẽ mới'): CanvasDoc {
  return {
    format: 'mimoedu-mathcanvas',
    version: 1,
    title,
    points: [],
    objects: [],
    grid: { show: true, size: 40, snap: true },
    showNames: true,
    showLengths: false,
  };
}

// ------------------------------------------------------------------ vector maths

export const sub = (a: Vec, b: Vec): Vec => ({ x: a.x - b.x, y: a.y - b.y });
export const add = (a: Vec, b: Vec): Vec => ({ x: a.x + b.x, y: a.y + b.y });
export const mul = (a: Vec, k: number): Vec => ({ x: a.x * k, y: a.y * k });
export const dot = (a: Vec, b: Vec) => a.x * b.x + a.y * b.y;
export const len = (a: Vec) => Math.hypot(a.x, a.y);
export const dist = (a: Vec, b: Vec) => Math.hypot(a.x - b.x, a.y - b.y);
/** Quarter turn that points "up" on screen for a vector to the right (y grows downwards). */
export const perp = (v: Vec): Vec => ({ x: v.y, y: -v.x });
export const rotateVec = (v: Vec, angle: number): Vec => ({
  x: v.x * Math.cos(angle) - v.y * Math.sin(angle),
  y: v.x * Math.sin(angle) + v.y * Math.cos(angle),
});

export function lineIntersection(a: Vec, b: Vec, c: Vec, d: Vec): Vec | null {
  const r = sub(b, a);
  const s = sub(d, c);
  const den = r.x * s.y - r.y * s.x;
  if (Math.abs(den) < 1e-9) return null;
  const t = ((c.x - a.x) * s.y - (c.y - a.y) * s.x) / den;
  return add(a, mul(r, t));
}

/** Parameter of the projection of P on line AB (0 = A, 1 = B). */
export function projectT(p: Vec, a: Vec, b: Vec): number {
  const ab = sub(b, a);
  const l2 = dot(ab, ab);
  return l2 < 1e-9 ? 0 : dot(sub(p, a), ab) / l2;
}

export function distToSegment(p: Vec, a: Vec, b: Vec): { d: number; t: number } {
  const t = Math.max(0, Math.min(1, projectT(p, a, b)));
  return { d: dist(p, add(a, mul(sub(b, a), t))), t };
}

/** Intersection of two segments (both parameters within 0..1), or null. */
export function segmentsCross(a: Vec, b: Vec, c: Vec, d: Vec): Vec | null {
  const p = lineIntersection(a, b, c, d);
  if (!p) return null;
  const t = projectT(p, a, b);
  const u = projectT(p, c, d);
  return t >= -1e-6 && t <= 1 + 1e-6 && u >= -1e-6 && u <= 1 + 1e-6 ? p : null;
}

// ------------------------------------------------------------------ resolving points

export type Positions = Map<string, Vec>;

/** Coordinates of every point, computing defined points from the ones they depend on. */
export function resolve(doc: CanvasDoc): Positions {
  const byId = new Map(doc.points.map((p) => [p.id, p]));
  const circles = new Map(doc.objects.filter((o) => o.type === 'circle').map((o) => [o.id, o as Extract<GObject, { type: 'circle' }>]));
  const out: Positions = new Map();
  const visiting = new Set<string>();
  const get = (id: string): Vec => {
    const done = out.get(id);
    if (done) return done;
    const pt = byId.get(id);
    if (!pt || visiting.has(id)) return { x: 0, y: 0 };
    visiting.add(id);
    const d = pt.def;
    let v: Vec;
    switch (d.kind) {
      case 'free':
        v = { x: d.x, y: d.y };
        break;
      case 'onSegment': {
        const a = get(d.a);
        v = add(a, mul(sub(get(d.b), a), d.t));
        break;
      }
      case 'onCircle': {
        const c = circles.get(d.circle);
        if (!c) {
          v = { x: 0, y: 0 };
          break;
        }
        const o = get(c.c);
        const r = dist(o, get(c.p));
        v = { x: o.x + r * Math.cos(d.angle), y: o.y + r * Math.sin(d.angle) };
        break;
      }
      case 'intersection':
        v = lineIntersection(get(d.a), get(d.b), get(d.c), get(d.d)) ?? get(d.a);
        break;
      case 'foot': {
        const a = get(d.a);
        v = add(a, mul(sub(get(d.b), a), projectT(get(d.p), a, get(d.b))));
        break;
      }
      case 'midpoint':
        v = mul(add(get(d.a), get(d.b)), 0.5);
        break;
      case 'perp': {
        const o = get(d.o);
        v = add(o, mul(perp(sub(get(d.r), o)), d.k));
        break;
      }
      case 'rotate': {
        const o = get(d.o);
        v = add(o, mul(rotateVec(sub(get(d.r), o), d.angle), d.scale));
        break;
      }
      case 'translate':
        v = add(get(d.p), sub(get(d.to), get(d.from)));
        break;
      case 'apex': {
        const a = get(d.a);
        const b = get(d.b);
        v = add(mul(add(a, b), 0.5), mul(perp(sub(b, a)), d.k));
        break;
      }
      case 'along': {
        v = add(get(d.p), mul(sub(get(d.b), get(d.a)), d.k));
        break;
      }
      case 'opposite':
        v = sub(mul(get(d.c), 2), get(d.p));
        break;
    }
    visiting.delete(id);
    out.set(id, v);
    return v;
  };
  for (const p of doc.points) get(p.id);
  return out;
}

/** Ids a point is computed from (directly). */
export function pointDeps(p: GPoint, doc: CanvasDoc): string[] {
  const d = p.def;
  switch (d.kind) {
    case 'free':
      return [];
    case 'onSegment':
    case 'midpoint':
      return [d.a, d.b];
    case 'onCircle': {
      const c = doc.objects.find((o) => o.id === d.circle);
      return c && c.type === 'circle' ? [c.c, c.p] : [];
    }
    case 'intersection':
      return [d.a, d.b, d.c, d.d];
    case 'foot':
      return [d.p, d.a, d.b];
    case 'perp':
      return [d.o, d.r];
    case 'rotate':
      return [d.o, d.r];
    case 'translate':
      return [d.p, d.from, d.to];
    case 'apex':
      return [d.a, d.b];
    case 'along':
      return [d.p, d.a, d.b];
    case 'opposite':
      return [d.p, d.c];
  }
}

/** Point ids an object is drawn from. */
export function objectPoints(o: GObject): string[] {
  switch (o.type) {
    case 'segment':
    case 'line':
    case 'ray':
      return [o.a, o.b];
    case 'polygon':
      return o.pts;
    case 'circle':
      return [o.c, o.p];
    case 'rightMark':
      return [o.o, o.a, o.b];
    default:
      return [];
  }
}

/** Can the point be dragged directly (free, or defined with a value that dragging may change)? */
export function isDraggable(p: GPoint): boolean {
  const d = p.def;
  return (
    d.kind === 'free' ||
    d.kind === 'onSegment' ||
    d.kind === 'onCircle' ||
    d.kind === 'apex' ||
    d.kind === 'along' ||
    (d.kind === 'perp' && !d.fixed) ||
    (d.kind === 'rotate' && d.free === 'angle')
  );
}

/**
 * New definition after dragging a point to `to`: free points move, a point on a
 * side slides along it, a right-angle vertex keeps the right angle, etc.
 * Returns null when the point can't be moved by itself.
 */
export function dragDef(p: GPoint, to: Vec, pos: Positions, doc: CanvasDoc): PointDef | null {
  const d = p.def;
  const P = (id: string) => pos.get(id) ?? { x: 0, y: 0 };
  switch (d.kind) {
    case 'free':
      return { kind: 'free', x: to.x, y: to.y };
    case 'onSegment':
      return { ...d, t: Math.max(0, Math.min(1, projectT(to, P(d.a), P(d.b)))) };
    case 'onCircle': {
      const c = doc.objects.find((o) => o.id === d.circle);
      if (!c || c.type !== 'circle') return null;
      const o = P(c.c);
      return { ...d, angle: Math.atan2(to.y - o.y, to.x - o.x) };
    }
    case 'perp': {
      if (d.fixed) return null;
      const o = P(d.o);
      const n = perp(sub(P(d.r), o));
      const l2 = dot(n, n);
      return l2 < 1e-9 ? null : { ...d, k: dot(sub(to, o), n) / l2 };
    }
    case 'rotate': {
      if (d.free !== 'angle') return null;
      const o = P(d.o);
      const base = sub(P(d.r), o);
      return { ...d, angle: Math.atan2(to.y - o.y, to.x - o.x) - Math.atan2(base.y, base.x) };
    }
    case 'apex': {
      const a = P(d.a);
      const b = P(d.b);
      const n = perp(sub(b, a));
      const l2 = dot(n, n);
      return l2 < 1e-9 ? null : { ...d, k: dot(sub(to, mul(add(a, b), 0.5)), n) / l2 };
    }
    case 'along': {
      const dir = sub(P(d.b), P(d.a));
      const l2 = dot(dir, dir);
      return l2 < 1e-9 ? null : { ...d, k: Math.max(0.05, dot(sub(to, P(d.p)), dir) / l2) };
    }
    default:
      return null;
  }
}

// ------------------------------------------------------------------ naming

const LETTERS = 'ABCDEFGHIKLMNPQRSTUVXY'.split('');

/** Next unused point name: A, B, C, … then A1, B1, … */
export function nextName(doc: CanvasDoc, preferred?: string): string {
  const used = new Set(doc.points.map((p) => p.name));
  if (preferred && !used.has(preferred)) return preferred;
  for (let round = 0; ; round++) {
    for (const l of LETTERS) {
      const name = round === 0 ? l : `${l}${round}`;
      if (!used.has(name)) return name;
    }
  }
}

// ------------------------------------------------------------------ building

export function addPoint(doc: CanvasDoc, def: PointDef, name?: string): { doc: CanvasDoc; id: string } {
  const id = newId('p');
  const point: GPoint = { id, type: 'point', def, name: name ?? nextName(doc), showName: true, color: INK };
  return { doc: { ...doc, points: [...doc.points, point] }, id };
}

export function addObject(doc: CanvasDoc, obj: Omit<GObject, 'id'> & { id?: string }): { doc: CanvasDoc; id: string } {
  const id = obj.id ?? newId('o');
  return { doc: { ...doc, objects: [...doc.objects, { ...obj, id } as GObject] }, id };
}

/** Adds a straight object (segment / line / ray) between two points, unless the same one exists. */
export function connect(doc: CanvasDoc, type: 'segment' | 'line' | 'ray', a: string, b: string, style: Stroke = defaultStroke()): { doc: CanvasDoc; id: string } {
  if (a === b) return { doc, id: '' };
  const same = doc.objects.find(
    (o) => o.type === type && ((o.a === a && o.b === b) || (type !== 'ray' && o.a === b && o.b === a))
  );
  if (same) return { doc, id: same.id };
  return addObject(doc, { type, a, b, style } as GObject);
}

/** Box from a drag on the canvas: left, right, top, bottom in world coordinates. */
export interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

const normBox = (b: Box): Box => ({ x0: Math.min(b.x0, b.x1), x1: Math.max(b.x0, b.x1), y0: Math.min(b.y0, b.y1), y1: Math.max(b.y0, b.y1) });

/**
 * Creates a ready-made shape inside a dragged box. Vertices are named in
 * order (A, B, C, …) and defined so the shape keeps its kind when a vertex is
 * dragged (a square stays square, a right triangle keeps its right angle).
 */
export function addShape(doc0: CanvasDoc, kind: ShapeKind, box: Box, style: Stroke = defaultStroke()): { doc: CanvasDoc; id: string; points: string[] } {
  const b = normBox(box);
  const w = Math.max(20, b.x1 - b.x0);
  const h = Math.max(20, b.y1 - b.y0);
  let doc = doc0;
  const pts: string[] = [];
  const P = (def: PointDef) => {
    const r = addPoint(doc, def);
    doc = r.doc;
    pts.push(r.id);
    return r.id;
  };
  const free = (x: number, y: number): PointDef => ({ kind: 'free', x, y });
  const marks: [number, number, number][] = []; // right-angle mark (right triangle) as indexes into pts: [o, a, b]

  switch (kind) {
    case 'triangle':
      P(free(b.x0 + w * 0.35, b.y0));
      P(free(b.x0, b.y1));
      P(free(b.x1, b.y1));
      break;
    case 'right-triangle': {
      // right angle at A (bottom left); C stays perpendicular to AB
      const A = P(free(b.x0, b.y1));
      const B = P(free(b.x1, b.y1));
      P({ kind: 'perp', o: A, r: B, k: h / w });
      marks.push([0, 1, 2]);
      break;
    }
    case 'isosceles': {
      // A is the apex over base BC: rename so the apex is A
      const B = P(free(b.x0, b.y1));
      const C = P(free(b.x1, b.y1));
      P({ kind: 'apex', a: B, b: C, k: h / w });
      pts.unshift(pts.pop()!);
      break;
    }
    case 'equilateral': {
      const B = P(free(b.x0, b.y1));
      const C = P(free(b.x0 + w, b.y1));
      P({ kind: 'rotate', o: B, r: C, angle: -Math.PI / 3, scale: 1, free: 'none' });
      pts.unshift(pts.pop()!);
      break;
    }
    case 'square': {
      const side = Math.min(w, h);
      const A = P(free(b.x0, b.y0 + side));
      const B = P(free(b.x0 + side, b.y0 + side));
      const D = P({ kind: 'perp', o: A, r: B, k: 1, fixed: true });
      P({ kind: 'translate', p: B, from: A, to: D });
      // order A B C D around the square
      pts.splice(2, 2, pts[3], pts[2]);
      break;
    }
    case 'rectangle': {
      const A = P(free(b.x0, b.y1));
      const B = P(free(b.x1, b.y1));
      const D = P({ kind: 'perp', o: A, r: B, k: h / w });
      P({ kind: 'translate', p: B, from: A, to: D });
      pts.splice(2, 2, pts[3], pts[2]);
      break;
    }
    case 'parallelogram': {
      const A = P(free(b.x0, b.y1));
      const B = P(free(b.x0 + w * 0.75, b.y1));
      const D = P(free(b.x0 + w * 0.25, b.y0));
      P({ kind: 'translate', p: B, from: A, to: D });
      pts.splice(2, 2, pts[3], pts[2]);
      break;
    }
    case 'rhombus': {
      const side = Math.min(w, h * 1.15);
      const A = P(free(b.x0, b.y1));
      const B = P(free(b.x0 + side, b.y1));
      const D = P({ kind: 'rotate', o: A, r: B, angle: -Math.PI / 3, scale: 1, free: 'angle' });
      P({ kind: 'translate', p: B, from: A, to: D });
      pts.splice(2, 2, pts[3], pts[2]);
      break;
    }
    case 'trapezoid': {
      const A = P(free(b.x0, b.y1));
      const B = P(free(b.x1, b.y1));
      const D = P(free(b.x0 + w * 0.2, b.y0));
      P({ kind: 'along', p: D, a: A, b: B, k: 0.55 });
      pts.splice(2, 2, pts[3], pts[2]);
      break;
    }
    case 'polygon':
      break;
  }

  // rename vertices A, B, C… in drawing order with names still free in the drawing
  const names: string[] = [];
  const taken = new Set(doc0.points.map((p) => p.name));
  for (const l of LETTERS) {
    if (names.length === pts.length) break;
    if (!taken.has(l)) names.push(l);
  }
  doc = { ...doc, points: doc.points.map((p) => (pts.includes(p.id) ? { ...p, name: names[pts.indexOf(p.id)] ?? nextName(doc) } : p)) };

  const r = addObject(doc, { type: 'polygon', pts, style, shape: kind } as GObject);
  doc = r.doc;
  for (const [o, a, c] of marks) {
    doc = addObject(doc, { type: 'rightMark', o: pts[o], a: pts[a], b: pts[c], size: 14, style: defaultStroke({ width: 2 }) } as GObject).doc;
  }
  return { doc, id: r.id, points: pts };
}

/** Right-angle marks at all four corners of a square / rectangle. */
export function addCornerMarks(doc: CanvasDoc, polygonId: string): CanvasDoc {
  const poly = doc.objects.find((o) => o.id === polygonId);
  if (!poly || poly.type !== 'polygon' || poly.pts.length !== 4) return doc;
  let next = doc;
  const p = poly.pts;
  for (let i = 0; i < 4; i++) {
    next = addObject(next, { type: 'rightMark', o: p[i], a: p[(i + 1) % 4], b: p[(i + 3) % 4], size: 12, style: defaultStroke({ width: 2 }) } as GObject).doc;
  }
  return next;
}

export function addCircle(doc0: CanvasDoc, center: Vec, through: Vec, style: Stroke = defaultStroke()): { doc: CanvasDoc; id: string; c: string; p: string } {
  let doc = doc0;
  const c = addPoint(doc, { kind: 'free', ...center }, nextName(doc, 'O'));
  doc = c.doc;
  // the point that sets the radius is a normal (named) point on the circle
  const p = addPoint(doc, { kind: 'free', ...through });
  doc = p.doc;
  const r = addObject(doc, { type: 'circle', c: c.id, p: p.id, style } as GObject);
  return { doc: r.doc, id: r.id, c: c.id, p: p.id };
}

/** All diagonals of a polygon (segments between non-adjacent vertices). */
export function addDiagonals(doc: CanvasDoc, polygonId: string, style?: Stroke): CanvasDoc {
  const poly = doc.objects.find((o) => o.id === polygonId);
  if (!poly || poly.type !== 'polygon' || poly.pts.length < 4) return doc;
  let next = doc;
  const n = poly.pts.length;
  for (let i = 0; i < n; i++) {
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue;
      next = connect(next, 'segment', poly.pts[i], poly.pts[j], style ?? { ...poly.style, fill: 'none' }).doc;
    }
  }
  return next;
}

/** Altitude from a vertex: foot H on the opposite side, segment and right-angle mark. */
export function addAltitude(doc0: CanvasDoc, polygonId: string, vertexIdx: number, name?: string): CanvasDoc {
  const poly = doc0.objects.find((o) => o.id === polygonId);
  if (!poly || poly.type !== 'polygon' || poly.pts.length !== 3) return doc0;
  const v = poly.pts[vertexIdx];
  const a = poly.pts[(vertexIdx + 1) % 3];
  const b = poly.pts[(vertexIdx + 2) % 3];
  const h = addPoint(doc0, { kind: 'foot', p: v, a, b }, nextName(doc0, name ?? 'H'));
  let doc = connect(h.doc, 'segment', v, h.id, { ...poly.style, fill: 'none', dash: 'dashed' }).doc;
  doc = addObject(doc, { type: 'rightMark', o: h.id, a: v, b: b, size: 12, style: defaultStroke({ width: 2 }) } as GObject).doc;
  return doc;
}

/** Median from a vertex: midpoint M of the opposite side and the segment. */
export function addMedian(doc0: CanvasDoc, polygonId: string, vertexIdx: number, name?: string): CanvasDoc {
  const poly = doc0.objects.find((o) => o.id === polygonId);
  if (!poly || poly.type !== 'polygon' || poly.pts.length !== 3) return doc0;
  const v = poly.pts[vertexIdx];
  const a = poly.pts[(vertexIdx + 1) % 3];
  const b = poly.pts[(vertexIdx + 2) % 3];
  const m = addPoint(doc0, { kind: 'midpoint', a, b }, nextName(doc0, name ?? 'M'));
  return connect(m.doc, 'segment', v, m.id, { ...poly.style, fill: 'none' }).doc;
}

/** Radius OA: a new point on the circle joined to the centre. */
export function addRadius(doc0: CanvasDoc, circleId: string, angle = -Math.PI / 4): CanvasDoc {
  const c = doc0.objects.find((o) => o.id === circleId);
  if (!c || c.type !== 'circle') return doc0;
  // first radius: join the centre to the point that sets the radius
  const joined = doc0.objects.some((o) => o.type === 'segment' && ((o.a === c.c && o.b === c.p) || (o.a === c.p && o.b === c.c)));
  if (!joined) return connect(doc0, 'segment', c.c, c.p, { ...c.style, fill: 'none' }).doc;
  const a = addPoint(doc0, { kind: 'onCircle', circle: circleId, angle });
  return connect(a.doc, 'segment', c.c, a.id, { ...c.style, fill: 'none' }).doc;
}

/** Diameter BC: a point on the circle and the opposite point through the centre. */
export function addDiameter(doc0: CanvasDoc, circleId: string, angle?: number): CanvasDoc {
  const c = doc0.objects.find((o) => o.id === circleId);
  if (!c || c.type !== 'circle') return doc0;
  if (angle === undefined) {
    // keep both ends away from the radius point so no two points sit on top of each other
    const pos = resolve(doc0);
    const o = pos.get(c.c)!;
    const r = pos.get(c.p)!;
    angle = Math.atan2(r.y - o.y, r.x - o.x) + (Math.PI * 2) / 3;
  }
  const b = addPoint(doc0, { kind: 'onCircle', circle: circleId, angle });
  const cc = addPoint(b.doc, { kind: 'opposite', p: b.id, c: c.c });
  return connect(cc.doc, 'segment', b.id, cc.id, { ...c.style, fill: 'none' }).doc;
}

/** Points that divide segment AB into n equal parts. */
export function divideSegment(doc0: CanvasDoc, a: string, b: string, n: number): CanvasDoc {
  let doc = doc0;
  for (let i = 1; i < n; i++) doc = addPoint(doc, { kind: 'onSegment', a, b, t: i / n }).doc;
  return doc;
}

// ------------------------------------------------------------------ deleting, copying

/** Everything that has to go when these points / objects are deleted (dependants included). */
export function deletionClosure(doc: CanvasDoc, ids: Iterable<string>): { points: Set<string>; objects: Set<string> } {
  const points = new Set<string>();
  const objects = new Set<string>();
  for (const id of ids) {
    if (doc.points.some((p) => p.id === id)) points.add(id);
    else if (doc.objects.some((o) => o.id === id)) objects.add(id);
  }
  let changed = true;
  while (changed) {
    changed = false;
    for (const o of doc.objects) {
      if (!objects.has(o.id) && objectPoints(o).some((p) => points.has(p))) {
        objects.add(o.id);
        changed = true;
      }
    }
    for (const p of doc.points) {
      if (points.has(p.id)) continue;
      const d = p.def;
      if (pointDeps(p, doc).some((x) => points.has(x)) || (d.kind === 'onCircle' && objects.has(d.circle))) {
        points.add(p.id);
        changed = true;
      }
    }
  }
  return { points, objects };
}

/**
 * Deletes points/objects safely. Deleting a point removes everything drawn
 * from it; deleting a shape also removes vertices nothing else uses.
 */
export function deleteItems(doc: CanvasDoc, ids: Iterable<string>): CanvasDoc {
  const { points, objects } = deletionClosure(doc, ids);
  let next: CanvasDoc = { ...doc, points: doc.points.filter((p) => !points.has(p.id)), objects: doc.objects.filter((o) => !objects.has(o.id)) };
  // points left without any object and that were vertices of deleted objects
  const usedBefore = new Set(doc.objects.filter((o) => objects.has(o.id)).flatMap(objectPoints));
  const stillUsed = new Set([...next.objects.flatMap(objectPoints), ...next.points.flatMap((p) => pointDeps(p, next))]);
  const orphan = [...usedBefore].filter((id) => !stillUsed.has(id) && next.points.some((p) => p.id === id));
  if (orphan.length) next = deleteItems(next, orphan);
  return next;
}

/** All points needed to draw these items (including the points they are computed from). */
export function pointClosure(doc: CanvasDoc, ids: Iterable<string>): Set<string> {
  const out = new Set<string>();
  const stack: string[] = [];
  for (const id of ids) {
    const o = doc.objects.find((x) => x.id === id);
    if (o) stack.push(...objectPoints(o));
    else if (doc.points.some((p) => p.id === id)) stack.push(id);
  }
  while (stack.length) {
    const id = stack.pop()!;
    if (out.has(id)) continue;
    out.add(id);
    const p = doc.points.find((x) => x.id === id);
    if (p) stack.push(...pointDeps(p, doc));
  }
  return out;
}

export interface Clip {
  points: GPoint[];
  objects: GObject[];
}

export function copyItems(doc: CanvasDoc, ids: Iterable<string>): Clip {
  const idList = [...ids];
  const objs = doc.objects.filter((o) => idList.includes(o.id));
  // circles that points on them depend on travel along
  const pts = pointClosure(doc, idList);
  for (const p of doc.points) if (pts.has(p.id) && p.def.kind === 'onCircle' && !objs.some((o) => o.id === (p.def as { circle: string }).circle)) {
    const c = doc.objects.find((o) => o.id === (p.def as { circle: string }).circle);
    if (c) objs.push(c);
  }
  return { points: doc.points.filter((p) => pts.has(p.id)), objects: objs };
}

/** Pastes a copy with new ids and names, moved by `offset`. Returns the new ids. */
export function pasteClip(doc: CanvasDoc, clip: Clip, offset: Vec): { doc: CanvasDoc; ids: string[] } {
  const map = new Map<string, string>();
  for (const p of clip.points) map.set(p.id, newId('p'));
  for (const o of clip.objects) map.set(o.id, newId('o'));
  const m = (id: string) => map.get(id) ?? id;
  let next = doc;
  const points: GPoint[] = [];
  for (const p of clip.points) {
    const d = p.def;
    const def: PointDef =
      d.kind === 'free'
        ? { kind: 'free', x: d.x + offset.x, y: d.y + offset.y }
        : (Object.fromEntries(Object.entries(d).map(([k, v]) => [k, typeof v === 'string' && k !== 'kind' && k !== 'free' ? m(v) : v])) as PointDef);
    const point = { ...p, id: m(p.id), def, name: nextName({ ...next, points: [...next.points, ...points] }, p.name) };
    points.push(point);
  }
  const objects: GObject[] = clip.objects.map((o) => {
    const copy = { ...o, id: m(o.id) } as GObject;
    switch (copy.type) {
      case 'segment':
      case 'line':
      case 'ray':
        return { ...copy, a: m(copy.a), b: m(copy.b) };
      case 'polygon':
        return { ...copy, pts: copy.pts.map(m) };
      case 'circle':
        return { ...copy, c: m(copy.c), p: m(copy.p) };
      case 'rightMark':
        return { ...copy, o: m(copy.o), a: m(copy.a), b: m(copy.b) };
      default:
        return { ...copy, x: copy.x + offset.x, y: copy.y + offset.y };
    }
  });
  next = { ...next, points: [...next.points, ...points], objects: [...next.objects, ...objects] };
  return { doc: next, ids: objects.length ? objects.map((o) => o.id) : points.map((p) => p.id) };
}

// ------------------------------------------------------------------ moving, transforming

/** Free points that move when these items are moved as a whole. */
export function freeBase(doc: CanvasDoc, ids: Iterable<string>): Set<string> {
  const all = pointClosure(doc, ids);
  return new Set([...all].filter((id) => doc.points.find((p) => p.id === id)?.def.kind === 'free'));
}

/** Applies a transform to the selected items: free points and positioned objects (text). */
export function transformItems(doc: CanvasDoc, ids: string[], f: (v: Vec) => Vec, scale = 1, rotation = 0): CanvasDoc {
  const base = freeBase(doc, ids);
  return {
    ...doc,
    points: doc.points.map((p) => (base.has(p.id) && p.def.kind === 'free' ? { ...p, def: { kind: 'free' as const, ...f({ x: p.def.x, y: p.def.y }) } } : p)),
    objects: doc.objects.map((o): GObject => {
      if (!ids.includes(o.id) || !isPlaced(o)) return o;
      const v = f({ x: o.x, y: o.y });
      switch (o.type) {
        case 'text':
          return { ...o, x: v.x, y: v.y, fontSize: Math.max(8, Math.round(o.fontSize * scale)), rotation: ((o.rotation ?? 0) + (rotation * 180) / Math.PI) % 360 };
        case 'solid':
          return { ...o, x: v.x, y: v.y, spec: { ...o.spec, size: Math.max(8, o.spec.size * scale) } };
        case 'cubes':
          return { ...o, x: v.x, y: v.y, size: Math.max(8, o.size * scale) };
        case 'cellGrid':
          return { ...o, x: v.x, y: v.y, cell: Math.max(8, o.cell * scale) };
        case 'bars':
          return { ...o, x: v.x, y: v.y, unit: Math.max(4, o.unit * scale) };
      }
    }),
  };
}

export const moveItems = (doc: CanvasDoc, ids: string[], delta: Vec) => transformItems(doc, ids, (v) => add(v, delta));

// ------------------------------------------------------------------ bounds

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** World-space bounds of items (all items when `ids` is omitted), with room for names and labels. */
export function bounds(doc: CanvasDoc, pos: Positions, ids?: Iterable<string>): Rect | null {
  const list = ids ? new Set(ids) : null;
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  const grow = (x: number, y: number, pad = 0) => {
    x0 = Math.min(x0, x - pad);
    y0 = Math.min(y0, y - pad);
    x1 = Math.max(x1, x + pad);
    y1 = Math.max(y1, y + pad);
  };
  for (const o of doc.objects) {
    if (list && !list.has(o.id)) continue;
    if (o.type === 'circle') {
      const c = pos.get(o.c)!;
      const r = dist(c, pos.get(o.p)!);
      grow(c.x - r, c.y - r, 4);
      grow(c.x + r, c.y + r, 4);
    } else if (o.type === 'text') {
      const lines = o.text.split('\n');
      const w = Math.max(...lines.map((l) => l.length)) * o.fontSize * 0.52;
      grow(o.x, o.y - o.fontSize);
      grow(o.x + w, o.y + o.fontSize * (lines.length - 1) + o.fontSize * 0.4);
    } else if (o.type === 'solid' || o.type === 'cubes' || o.type === 'cellGrid' || o.type === 'bars') {
      const b = placedBounds(o);
      grow(b.x, b.y, 18);
      grow(b.x + b.w, b.y + b.h, 18);
    } else if (o.type === 'line' || o.type === 'ray') {
      // drawn across the visible area; for bounds use the defining points
      for (const id of objectPoints(o)) grow(pos.get(id)!.x, pos.get(id)!.y, 24);
    } else {
      for (const id of objectPoints(o)) {
        const v = pos.get(id);
        if (v) grow(v.x, v.y, 4);
      }
    }
  }
  const pts = list ? pointClosure(doc, list) : new Set(doc.points.map((p) => p.id));
  for (const id of pts) {
    const v = pos.get(id);
    if (v) grow(v.x, v.y, 26); // point names sit around the point
  }
  if (!isFinite(x0)) return null;
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/** Bounds of a solid, cube model, grid or bar diagram (without margin). */
export function placedBounds(o: Extract<GObject, { type: 'solid' | 'cubes' | 'cellGrid' | 'bars' }>): Rect {
  switch (o.type) {
    case 'solid':
      return projectSolid(o.spec, o.x, o.y).bounds;
    case 'cubes': {
      const b = projectCubes(o.cols, o.rows, o.heights, o.size, o.view, o.x, o.y).bounds;
      return o.showCount ? { ...b, h: b.h + 34 } : b;
    }
    case 'cellGrid':
      return { x: o.x, y: o.y, w: o.cols * o.cell, h: o.rows * o.cell + (o.showCount ? 34 : 0) };
    case 'bars':
      return barsBounds(o.rows, o.x, o.y, o.unit);
  }
}

// ------------------------------------------------------------------ files

const isColor = (v: unknown) => typeof v === 'string' && (/^#[0-9a-fA-F]{6}$/.test(v) || v === 'none');

/** Validates an imported drawing; returns it or a Vietnamese message. */
export function parseCanvas(json: unknown): CanvasDoc | string {
  if (typeof json !== 'object' || json === null) return 'Tệp không phải bản vẽ.';
  const d = json as Partial<CanvasDoc>;
  if (d.format !== 'mimoedu-mathcanvas' || d.version !== 1) return 'Tệp không phải bản vẽ của Bảng vẽ Toán học MimoEDU.';
  if (!Array.isArray(d.points) || !Array.isArray(d.objects)) return 'Bản vẽ thiếu danh sách điểm hoặc hình.';
  const ids = new Set<string>();
  for (const p of d.points) {
    if (!p || typeof p.id !== 'string' || p.type !== 'point' || !p.def || typeof p.def.kind !== 'string') return 'Có điểm bị thiếu thông tin.';
    if (ids.has(p.id)) return `Mã "${p.id}" bị trùng.`;
    ids.add(p.id);
  }
  for (const o of d.objects) {
    if (!o || typeof o.id !== 'string' || typeof o.type !== 'string') return 'Có hình bị thiếu thông tin.';
    if (ids.has(o.id)) return `Mã "${o.id}" bị trùng.`;
    ids.add(o.id);
    if ('style' in o && o.style && (!isColor(o.style.stroke) || !isColor(o.style.fill))) return 'Màu sắc trong tệp không hợp lệ.';
  }
  const doc: CanvasDoc = {
    format: 'mimoedu-mathcanvas',
    version: 1,
    title: typeof d.title === 'string' ? d.title.slice(0, 80) : 'Bản vẽ',
    points: d.points,
    objects: d.objects,
    grid: {
      show: d.grid?.show !== false,
      size: typeof d.grid?.size === 'number' && d.grid.size >= 10 && d.grid.size <= 200 ? d.grid.size : 40,
      snap: d.grid?.snap !== false,
    },
    showNames: d.showNames !== false,
    showLengths: d.showLengths === true,
  };
  // every reference must exist
  for (const p of doc.points) if (pointDeps(p, doc).some((x) => !ids.has(x))) return `Điểm ${p.name} tham chiếu tới điểm không tồn tại.`;
  for (const o of doc.objects) if (objectPoints(o).some((x) => !ids.has(x))) return 'Có hình tham chiếu tới điểm không tồn tại.';
  return doc;
}
