/**
 * Solids for "Bảng vẽ Toán học": cube, cuboid, pyramid, cylinder, cone and
 * sphere drawn as flat vector pictures. Each solid is a small mesh; it is
 * rotated (yaw, then pitch), projected straight onto the board, and split into
 * faces to fill, visible edges (solid) and hidden edges (dashed).
 * Also the stacked unit cubes (isometric) and the bar diagrams' layout.
 */

export type SolidKind = 'cube' | 'cuboid' | 'pyramid' | 'cylinder' | 'cone' | 'sphere';

export interface SolidSpec {
  kind: SolidKind;
  /** Width (x), height (y), depth (z) in units; cube uses w for all, round solids use w as diameter. */
  w: number;
  h: number;
  d: number;
  /** Pixels per unit. */
  size: number;
  /** Degrees. */
  yaw: number;
  pitch: number;
}

type V3 = [number, number, number];

interface Mesh {
  verts: V3[];
  faces: number[][];
  /** Edges that are drawn (box edges, rims). Others are only drawn where they form the outline. */
  feature: Set<string>;
  /** Vertex indexes that get a name, in the order of the name list. */
  named: number[];
  /** Default vertex names. */
  names: string[];
}

const key = (a: number, b: number) => (a < b ? `${a}-${b}` : `${b}-${a}`);
const SEG = 48;

function box(w: number, h: number, d: number): Mesh {
  const x = w / 2;
  const y = h / 2;
  const z = d / 2;
  // bottom A B C D (front-left, front-right, back-right, back-left), top E F G H above them
  const verts: V3[] = [
    [-x, -y, z],
    [x, -y, z],
    [x, -y, -z],
    [-x, -y, -z],
    [-x, y, z],
    [x, y, z],
    [x, y, -z],
    [-x, y, -z],
  ];
  const faces = [
    [0, 1, 2, 3],
    [4, 5, 6, 7],
    [0, 1, 5, 4],
    [1, 2, 6, 5],
    [2, 3, 7, 6],
    [3, 0, 4, 7],
  ];
  const feature = new Set<string>();
  for (const f of faces) f.forEach((a, i) => feature.add(key(a, f[(i + 1) % f.length])));
  return { verts, faces, feature, named: [0, 1, 2, 3, 4, 5, 6, 7], names: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'] };
}

function pyramid(w: number, h: number, d: number): Mesh {
  const x = w / 2;
  const z = d / 2;
  const verts: V3[] = [
    [-x, -h / 2, z],
    [x, -h / 2, z],
    [x, -h / 2, -z],
    [-x, -h / 2, -z],
    [0, h / 2, 0],
  ];
  const faces = [
    [0, 1, 2, 3],
    [0, 1, 4],
    [1, 2, 4],
    [2, 3, 4],
    [3, 0, 4],
  ];
  const feature = new Set<string>();
  for (const f of faces) f.forEach((a, i) => feature.add(key(a, f[(i + 1) % f.length])));
  return { verts, faces, feature, named: [0, 1, 2, 3, 4], names: ['A', 'B', 'C', 'D', 'S'] };
}

/** Cylinder (top radius = r) or cone (top radius 0): rims are feature edges, sides only outline. */
function round(r: number, h: number, cone: boolean): Mesh {
  const verts: V3[] = [];
  for (let i = 0; i < SEG; i++) {
    const a = (i / SEG) * Math.PI * 2;
    verts.push([Math.cos(a) * r, -h / 2, Math.sin(a) * r]);
  }
  const faces: number[][] = [];
  const feature = new Set<string>();
  const bottomCentre = cone ? SEG + 1 : SEG * 2;
  if (cone) {
    verts.push([0, h / 2, 0]); // apex S = index SEG
    for (let i = 0; i < SEG; i++) faces.push([i, (i + 1) % SEG, SEG]);
  } else {
    for (let i = 0; i < SEG; i++) {
      const a = (i / SEG) * Math.PI * 2;
      verts.push([Math.cos(a) * r, h / 2, Math.sin(a) * r]);
    }
    for (let i = 0; i < SEG; i++) faces.push([i, (i + 1) % SEG, SEG + ((i + 1) % SEG), SEG + i]);
    faces.push(Array.from({ length: SEG }, (_, i) => SEG + i));
    for (let i = 0; i < SEG; i++) feature.add(key(SEG + i, SEG + ((i + 1) % SEG)));
  }
  faces.push(Array.from({ length: SEG }, (_, i) => i));
  for (let i = 0; i < SEG; i++) feature.add(key(i, (i + 1) % SEG));
  // centres of the circles (named O, and O' / S)
  verts[bottomCentre] = [0, -h / 2, 0];
  if (!cone) verts[bottomCentre + 1] = [0, h / 2, 0];
  return cone
    ? { verts, faces, feature, named: [bottomCentre, SEG], names: ['O', 'S'] }
    : { verts, faces, feature, named: [bottomCentre, bottomCentre + 1], names: ['O', "O'"] };
}

function meshOf(s: SolidSpec): Mesh {
  switch (s.kind) {
    case 'cube':
      return box(s.w, s.w, s.w);
    case 'cuboid':
      return box(s.w, s.h, s.d);
    case 'pyramid':
      return pyramid(s.w, s.h, s.d);
    case 'cylinder':
      return round(s.w / 2, s.h, false);
    case 'cone':
      return round(s.w / 2, s.h, true);
    case 'sphere':
      return { verts: [[0, 0, 0]], faces: [], feature: new Set(), named: [0], names: ['O'] };
  }
}

function rotate(v: V3, yaw: number, pitch: number): V3 {
  const cy = Math.cos(yaw);
  const sy = Math.sin(yaw);
  const x1 = v[0] * cy + v[2] * sy;
  const z1 = -v[0] * sy + v[2] * cy;
  const cp = Math.cos(pitch);
  const sp = Math.sin(pitch);
  return [x1, v[1] * cp - z1 * sp, v[1] * sp + z1 * cp];
}

export interface Pt {
  x: number;
  y: number;
}

export interface SolidPicture {
  /** Front faces, back to front, with a brightness 0..1 for shading. */
  faces: { pts: Pt[]; light: number }[];
  visible: [Pt, Pt][];
  hidden: [Pt, Pt][];
  /** Named vertices with where to put the name. */
  labels: { at: Pt; label: Pt; index: number }[];
  /** Sphere: outline radius and the equator (front / back parts). */
  sphere?: { r: number; front: Pt[]; back: Pt[] };
  bounds: { x: number; y: number; w: number; h: number };
}

/** Flat picture of a solid centred at (cx, cy). */
export function projectSolid(s: SolidSpec, cx: number, cy: number): SolidPicture {
  const yaw = (s.yaw * Math.PI) / 180;
  const pitch = (s.pitch * Math.PI) / 180;
  const k = s.size;
  const to2d = (v: V3): Pt => ({ x: cx + v[0] * k, y: cy - v[1] * k });

  if (s.kind === 'sphere') {
    const r = (s.w / 2) * k;
    const front: Pt[] = [];
    const back: Pt[] = [];
    let run: { front: boolean; pts: Pt[] } | null = null;
    const runs: { front: boolean; pts: Pt[] }[] = [];
    for (let i = 0; i <= 96; i++) {
      const a = (i / 96) * Math.PI * 2;
      const v = rotate([Math.cos(a) * (s.w / 2), 0, Math.sin(a) * (s.w / 2)], yaw, pitch);
      const f = v[2] >= 0;
      const p = to2d(v);
      if (!run || run.front !== f) {
        run = { front: f, pts: run ? [run.pts[run.pts.length - 1]] : [] };
        runs.push(run);
      }
      run.pts.push(p);
    }
    for (const r2 of runs) (r2.front ? front : back).push(...r2.pts, { x: NaN, y: NaN });
    return {
      faces: [],
      visible: [],
      hidden: [],
      labels: [{ at: { x: cx, y: cy }, label: { x: cx - 14, y: cy - 12 }, index: 0 }],
      sphere: { r, front, back },
      bounds: { x: cx - r, y: cy - r, w: r * 2, h: r * 2 },
    };
  }

  const m = meshOf(s);
  const rv = m.verts.map((v) => rotate(v, yaw, pitch));
  const p2 = rv.map(to2d);
  const centre: V3 = [0, 0, 0];
  const faceInfo = m.faces.map((f) => {
    const a = rv[f[0]];
    const b = rv[f[1]];
    const c = rv[f[Math.min(2, f.length - 1)]];
    let n: V3 = [
      (b[1] - a[1]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[1] - a[1]),
      (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]),
      (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]),
    ];
    const mid = f.reduce<V3>((s2, i) => [s2[0] + rv[i][0] / f.length, s2[1] + rv[i][1] / f.length, s2[2] + rv[i][2] / f.length], [0, 0, 0]);
    // outward normal (solids are convex and centred)
    if (n[0] * (mid[0] - centre[0]) + n[1] * (mid[1] - centre[1]) + n[2] * (mid[2] - centre[2]) < 0) n = [-n[0], -n[1], -n[2]];
    const l = Math.hypot(...n) || 1;
    return { f, front: n[2] / l > 1e-6, z: mid[2], light: 0.55 + 0.45 * Math.max(0, (n[2] * 0.75 + n[1] * 0.55 - n[0] * 0.2) / l) };
  });
  // which faces touch each edge
  const adj = new Map<string, number[]>();
  faceInfo.forEach((fi, idx) => fi.f.forEach((a, i) => {
    const kk = key(a, fi.f[(i + 1) % fi.f.length]);
    adj.set(kk, [...(adj.get(kk) ?? []), idx]);
  }));
  const visible: [Pt, Pt][] = [];
  const hidden: [Pt, Pt][] = [];
  for (const [kk, fs] of adj) {
    const [a, b] = kk.split('-').map(Number);
    const fronts = fs.filter((i) => faceInfo[i].front).length;
    const isFeature = m.feature.has(kk);
    const outline = fronts > 0 && fronts < fs.length;
    if (isFeature) (fronts > 0 ? visible : hidden).push([p2[a], p2[b]]);
    else if (outline) visible.push([p2[a], p2[b]]);
  }
  const faces = faceInfo
    .filter((fi) => fi.front)
    .sort((a, b) => a.z - b.z)
    .map((fi) => ({ pts: fi.f.map((i) => p2[i]), light: fi.light }));

  // names pushed away from the middle of the picture
  const all = p2.filter((_, i) => i < (s.kind === 'cylinder' ? SEG * 2 : s.kind === 'cone' ? SEG + 1 : p2.length));
  const mx = all.reduce((t, p) => t + p.x, 0) / all.length;
  const my = all.reduce((t, p) => t + p.y, 0) / all.length;
  const labels = m.named.map((vi, index) => {
    const at = p2[vi];
    const isCentre = (s.kind === 'cylinder' || s.kind === 'cone') && index !== 1 + (s.kind === 'cone' ? 0 : 1) && m.names[index] !== 'S';
    let dx = at.x - mx;
    let dy = at.y - my;
    if (isCentre) {
      dx = 1;
      dy = 0.2;
    }
    const l = Math.hypot(dx, dy) || 1;
    return { at, label: { x: at.x + (dx / l) * 16, y: at.y + (dy / l) * 16 }, index };
  });

  const xs = p2.map((p) => p.x);
  const ys = p2.map((p) => p.y);
  const x0 = Math.min(...xs);
  const y0 = Math.min(...ys);
  return { faces, visible, hidden, labels, bounds: { x: x0, y: y0, w: Math.max(...xs) - x0, h: Math.max(...ys) - y0 } };
}

export function defaultNames(kind: SolidKind): string[] {
  return meshOf({ kind, w: 1, h: 1, d: 1, size: 1, yaw: 0, pitch: 0 }).names;
}

// ------------------------------------------------------------------ stacked unit cubes

export interface CubeFace {
  pts: Pt[];
  shade: 'top' | 'left' | 'right';
}

/**
 * Columns of unit cubes on a cols × rows floor (heights[r * cols + c]),
 * drawn in isometric view; `view` turns the model by quarter turns.
 */
export function projectCubes(cols: number, rows: number, heights: number[], size: number, view: number, ox: number, oy: number): { faces: CubeFace[]; bounds: { x: number; y: number; w: number; h: number }; count: number } {
  const turn = ((view % 4) + 4) % 4;
  const cos30 = Math.cos(Math.PI / 6);
  const cells: [number, number, number][] = [];
  let count = 0;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const h = heights[r * cols + c] ?? 0;
      count += h;
      // turn the floor position
      let x = c;
      let y = r;
      for (let t = 0; t < turn; t++) [x, y] = [y, (t % 2 === 0 ? cols : rows) - 1 - x];
      for (let z = 0; z < h; z++) cells.push([x, y, z]);
    }
  }
  // back to front: far cells first
  cells.sort((a, b) => a[0] + a[1] - (b[0] + b[1]) || a[2] - b[2]);
  const P = (x: number, y: number, z: number): Pt => ({ x: ox + (x - y) * cos30 * size, y: oy + (x + y) * 0.5 * size - z * size });
  const faces: CubeFace[] = [];
  for (const [x, y, z] of cells) {
    faces.push({ shade: 'top', pts: [P(x, y, z + 1), P(x + 1, y, z + 1), P(x + 1, y + 1, z + 1), P(x, y + 1, z + 1)] });
    faces.push({ shade: 'left', pts: [P(x, y + 1, z), P(x + 1, y + 1, z), P(x + 1, y + 1, z + 1), P(x, y + 1, z + 1)] });
    faces.push({ shade: 'right', pts: [P(x + 1, y, z), P(x + 1, y + 1, z), P(x + 1, y + 1, z + 1), P(x + 1, y, z + 1)] });
  }
  const pts = faces.flatMap((f) => f.pts);
  if (!pts.length) pts.push({ x: ox, y: oy });
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  const x0 = Math.min(...xs);
  const y0 = Math.min(...ys);
  return { faces, bounds: { x: x0, y: y0, w: Math.max(...xs) - x0, h: Math.max(...ys) - y0 }, count };
}

// ------------------------------------------------------------------ bar diagrams (sơ đồ đoạn thẳng)

export interface BarBrace {
  /** Part indexes [from, to) the brace covers. */
  from: number;
  to: number;
  text: string;
  /** Above (default) or below the bar. */
  below?: boolean;
}

export interface BarRow {
  label: string;
  /** Length of the bar in units. */
  length: number;
  /** Equal parts the bar is split into. */
  parts: number;
  color: string;
  braces: BarBrace[];
}

/** Vertical position of each bar: rows move apart when braces sit between them. */
export function barRowYs(rows: BarRow[], y: number): number[] {
  const ys: number[] = [];
  let cur = y;
  rows.forEach((r, i) => {
    ys.push(cur);
    const next = rows[i + 1];
    if (!next) return;
    const below = r.braces.some((b) => b.below);
    const above = next.braces.some((b) => !b.below);
    cur += Math.max(64, 30 + (below ? 56 : 0) + (above ? 56 : 0));
  });
  return ys;
}

/** Geometry of one bar row: start, end and the part ticks, with x starting at `x` for every row. */
export function barRow(row: BarRow, x: number, y: number, unit: number) {
  const len = Math.max(0.5, row.length) * unit;
  const n = Math.max(1, Math.round(row.parts));
  const ticks = Array.from({ length: n + 1 }, (_, i) => x + (len * i) / n);
  return { x0: x, x1: x + len, y, ticks, partW: len / n };
}

export function barsBounds(rows: BarRow[], x: number, y: number, unit: number) {
  const widest = Math.max(1, ...rows.map((r) => Math.max(0.5, r.length))) * unit;
  const labelW = Math.max(0, ...rows.map((r) => r.label.length)) * 11 + 16;
  const ys = barRowYs(rows, y);
  const top = y - (rows[0]?.braces.some((b) => !b.below) ? 60 : 20);
  const last = rows[rows.length - 1];
  const bottom = ys[ys.length - 1] + (last?.braces.some((b) => b.below) ? 60 : 20);
  // a brace text can be wider than its bar part
  const textW = Math.max(0, ...rows.flatMap((r) => r.braces.map((b) => b.text.length * 10)));
  return { x: x - labelW, y: top, w: labelW + Math.max(widest, textW) + 20, h: bottom - top };
}

/** Joins edges that share end points into polylines, so a dashed rim keeps an even dash pattern. */
export function chainEdges(edges: [Pt, Pt][]): Pt[][] {
  const k = (p: Pt) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`;
  const left = edges.map((e) => [...e] as [Pt, Pt]);
  const chains: Pt[][] = [];
  while (left.length) {
    const chain = [...left.pop()!];
    let grown = true;
    while (grown) {
      grown = false;
      for (let i = 0; i < left.length; i++) {
        const [a, b] = left[i];
        const head = k(chain[0]);
        const tail = k(chain[chain.length - 1]);
        if (k(a) === tail) chain.push(b);
        else if (k(b) === tail) chain.push(a);
        else if (k(b) === head) chain.unshift(a);
        else if (k(a) === head) chain.unshift(b);
        else continue;
        left.splice(i, 1);
        grown = true;
        break;
      }
    }
    chains.push(chain);
  }
  return chains;
}
