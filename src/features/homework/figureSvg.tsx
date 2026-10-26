import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { FigureFill, FigureSpec } from './figureSpec';

/**
 * Draws a figure description (figureSpec.ts) as a clean print-style SVG:
 * black lines, Times New Roman labels, grey/dark fills. The figure is scaled
 * so its longer side is TARGET px; labels keep a fixed size so they stay
 * readable whatever the source coordinates were. Everything drawn comes from
 * the checked description and text goes through React, so no markup from
 * the AI ever reaches the page or the Word file.
 */

const TARGET = 440;
const FONT = 'Times New Roman, Times, serif';
const FONT_SIZE = 18;
const INK = '#111111';
const FILLS: Record<FigureFill, string> = { none: 'none', light: '#D9D9D9', dark: '#3A3A3A' };
const MARGIN = 10;

type Box = { x1: number; y1: number; x2: number; y2: number };
const textWidth = (s: string, size = FONT_SIZE) => Math.max(size * 0.5, [...s].length * size * 0.52);

interface Layout {
  elements: React.ReactNode[];
  box: Box;
}

function layout(spec: FigureSpec): Layout {
  // ---- source extent → scale
  const xs: number[] = [];
  const ys: number[] = [];
  const add = (x: number, y: number) => (xs.push(x), ys.push(y));
  spec.points.forEach((p) => add(p.x, p.y));
  spec.arrows.forEach((a) => (add(a.x1, a.y1), add(a.x2, a.y2)));
  spec.texts.forEach((t) => add(t.x, t.y));
  const byId = new Map(spec.points.map((p) => [p.id, p]));
  spec.circles.forEach((c) => {
    const p = byId.get(c.center);
    if (p) (add(p.x - c.radius, p.y - c.radius), add(p.x + c.radius, p.y + c.radius));
  });
  const g = spec.grid;
  for (const c of g.cells) (add(g.x + c.col * g.cellSize, g.y + c.row * g.cellSize), add(g.x + (c.col + 1) * g.cellSize, g.y + (c.row + 1) * g.cellSize));
  spec.clocks.forEach((c) => (add(c.x - c.radius, c.y - c.radius), add(c.x + c.radius, c.y + c.radius)));
  spec.fractions.forEach((f) =>
    f.shape === 'bar' ? (add(f.x, f.y), add(f.x + f.size, f.y + f.size * 0.28)) : (add(f.x - f.size / 2, f.y - f.size / 2), add(f.x + f.size / 2, f.y + f.size / 2))
  );
  const minX = xs.length ? Math.min(...xs) : 0;
  const minY = ys.length ? Math.min(...ys) : 0;
  const spanX = xs.length ? Math.max(...xs) - minX : 0;
  const spanY = ys.length ? Math.max(...ys) - minY : 0;
  const s = Math.max(spanX, spanY) > 0 ? TARGET / Math.max(spanX, spanY) : 1;
  const X = (x: number) => (x - minX) * s;
  const Y = (y: number) => (y - minY) * s;

  const els: React.ReactNode[] = [];
  const box: Box = { x1: Infinity, y1: Infinity, x2: -Infinity, y2: -Infinity };
  const grow = (x: number, y: number) => {
    box.x1 = Math.min(box.x1, x);
    box.y1 = Math.min(box.y1, y);
    box.x2 = Math.max(box.x2, x);
    box.y2 = Math.max(box.y2, y);
  };
  let k = 0;
  const label = (str: string, x: number, y: number, anchor: 'start' | 'middle' | 'end' = 'middle', size = FONT_SIZE) => {
    if (!str) return;
    const w = textWidth(str, size);
    const left = anchor === 'middle' ? x - w / 2 : anchor === 'end' ? x - w : x;
    grow(left, y - size * 0.6);
    grow(left + w, y + size * 0.6);
    els.push(
      <text key={`t${k++}`} x={r(x)} y={r(y)} textAnchor={anchor} dominantBaseline="central" fontFamily={FONT} fontSize={size} fill={INK}>
        {str}
      </text>
    );
  };

  // Centre of the drawn points: labels go away from it
  const pts = spec.points.map((p) => ({ ...p, X: X(p.x), Y: Y(p.y) }));
  const P = new Map(pts.map((p) => [p.id, p]));
  const cx = pts.length ? pts.reduce((a, p) => a + p.X, 0) / pts.length : 0;
  const cy = pts.length ? pts.reduce((a, p) => a + p.Y, 0) / pts.length : 0;

  // ---- squared cells
  const cs = g.cellSize * s;
  for (const c of g.cells) {
    const x0 = X(g.x + c.col * g.cellSize);
    const y0 = Y(g.y + c.row * g.cellSize);
    const tl = [x0, y0];
    const tr = [x0 + cs, y0];
    const bl = [x0, y0 + cs];
    const br = [x0 + cs, y0 + cs];
    const corners =
      c.shape === 'square' ? [tl, tr, br, bl] : c.shape === 'cut_tl' ? [tr, br, bl] : c.shape === 'cut_tr' ? [tl, br, bl] : c.shape === 'cut_bl' ? [tl, tr, br] : [tl, tr, bl];
    corners.forEach(([x, y]) => grow(x, y));
    els.push(<polygon key={`c${k++}`} points={corners.map(([x, y]) => `${r(x)},${r(y)}`).join(' ')} fill={FILLS[c.fill]} stroke={INK} strokeWidth={1.6} strokeLinejoin="round" />);
  }

  // ---- polygons, circles (under the lines)
  for (const poly of spec.polygons) {
    const ps = poly.points.map((pid) => P.get(pid)).filter((p): p is (typeof pts)[number] => Boolean(p));
    if (ps.length < 3) continue;
    ps.forEach((p) => grow(p.X, p.Y));
    els.push(<polygon key={`p${k++}`} points={ps.map((p) => `${r(p.X)},${r(p.Y)}`).join(' ')} fill={FILLS[poly.fill]} stroke={INK} strokeWidth={2} strokeLinejoin="round" />);
  }
  for (const c of spec.circles) {
    const p = P.get(c.center);
    if (!p) continue;
    const rad = c.radius * s;
    grow(p.X - rad, p.Y - rad);
    grow(p.X + rad, p.Y + rad);
    els.push(<circle key={`o${k++}`} cx={r(p.X)} cy={r(p.Y)} r={r(rad)} fill={FILLS[c.fill]} stroke={INK} strokeWidth={2} />);
  }

  // ---- segments with their measurement
  for (const seg of spec.segments) {
    const a = P.get(seg.from);
    const b = P.get(seg.to);
    if (!a || !b) continue;
    grow(a.X, a.Y);
    grow(b.X, b.Y);
    els.push(
      <line key={`s${k++}`} x1={r(a.X)} y1={r(a.Y)} x2={r(b.X)} y2={r(b.Y)} stroke={INK} strokeWidth={2} strokeLinecap="round" strokeDasharray={seg.dashed ? '8 6' : undefined} />
    );
    if (seg.label) {
      const mx = (a.X + b.X) / 2;
      const my = (a.Y + b.Y) / 2;
      const len = Math.hypot(b.X - a.X, b.Y - a.Y) || 1;
      let nx = -(b.Y - a.Y) / len;
      let ny = (b.X - a.X) / len;
      const side = seg.labelSide;
      if (side === 'auto') {
        if ((mx - cx) * nx + (my - cy) * ny < 0) (nx = -nx, ny = -ny);
      } else {
        const want = side === 'left' ? [-1, 0] : side === 'right' ? [1, 0] : side === 'above' ? [0, -1] : [0, 1];
        if (nx * want[0] + ny * want[1] < 0) (nx = -nx, ny = -ny);
      }
      const w = textWidth(seg.label);
      const gap = 6 + Math.abs(nx) * (w / 2) + Math.abs(ny) * (FONT_SIZE * 0.6);
      label(seg.label, mx + nx * gap, my + ny * gap);
    }
  }

  // ---- right-angle marks (only where the description has them)
  for (const ra of spec.rightAngles) {
    const o = P.get(ra.at);
    const a = P.get(ra.from);
    const b = P.get(ra.to);
    if (!o || !a || !b) continue;
    const u = unit(a.X - o.X, a.Y - o.Y);
    const v = unit(b.X - o.X, b.Y - o.Y);
    const m = 12;
    const path = `M${r(o.X + u[0] * m)},${r(o.Y + u[1] * m)} L${r(o.X + (u[0] + v[0]) * m)},${r(o.Y + (u[1] + v[1]) * m)} L${r(o.X + v[0] * m)},${r(o.Y + v[1] * m)}`;
    els.push(<path key={`r${k++}`} d={path} fill="none" stroke={INK} strokeWidth={1.4} />);
  }

  // ---- arrows
  for (const ar of spec.arrows) {
    const x1 = X(ar.x1);
    const y1 = Y(ar.y1);
    const x2 = X(ar.x2);
    const y2 = Y(ar.y2);
    const [ux, uy] = unit(x2 - x1, y2 - y1);
    const h = 10;
    const head = [
      [x2, y2],
      [x2 - ux * h - uy * h * 0.55, y2 - uy * h + ux * h * 0.55],
      [x2 - ux * h + uy * h * 0.55, y2 - uy * h - ux * h * 0.55],
    ];
    grow(x1, y1);
    head.forEach(([x, y]) => grow(x, y));
    els.push(<line key={`a${k++}`} x1={r(x1)} y1={r(y1)} x2={r(x2 - ux * h * 0.8)} y2={r(y2 - uy * h * 0.8)} stroke={INK} strokeWidth={1.8} />);
    els.push(<polygon key={`h${k++}`} points={head.map(([x, y]) => `${r(x)},${r(y)}`).join(' ')} fill={INK} />);
  }

  // ---- clocks
  for (const c of spec.clocks) {
    const x = X(c.x);
    const y = Y(c.y);
    const rad = c.radius * s;
    grow(x - rad, y - rad);
    grow(x + rad, y + rad);
    els.push(<circle key={`k${k++}`} cx={r(x)} cy={r(y)} r={r(rad)} fill="#FFFFFF" stroke={INK} strokeWidth={2.5} />);
    for (let i = 0; i < 60; i++) {
      const ang = (i * Math.PI) / 30;
      const inner = rad * (i % 5 === 0 ? 0.86 : 0.93);
      els.push(
        <line key={`m${k++}`} x1={r(x + Math.sin(ang) * inner)} y1={r(y - Math.cos(ang) * inner)} x2={r(x + Math.sin(ang) * rad * 0.98)} y2={r(y - Math.cos(ang) * rad * 0.98)} stroke={INK} strokeWidth={i % 5 === 0 ? 2 : 1} />
      );
    }
    const numSize = Math.max(11, Math.min(20, rad * 0.16));
    for (let n = 1; n <= 12; n++) {
      const ang = (n * Math.PI) / 6;
      label(String(n), x + Math.sin(ang) * rad * 0.72, y - Math.cos(ang) * rad * 0.72, 'middle', numSize);
    }
    const hourAng = (((c.hour % 12) + c.minute / 60) * Math.PI) / 6;
    const minAng = (c.minute * Math.PI) / 30;
    els.push(<line key={`hh${k++}`} x1={r(x)} y1={r(y)} x2={r(x + Math.sin(hourAng) * rad * 0.42)} y2={r(y - Math.cos(hourAng) * rad * 0.42)} stroke={INK} strokeWidth={5} strokeLinecap="round" />);
    els.push(<line key={`mh${k++}`} x1={r(x)} y1={r(y)} x2={r(x + Math.sin(minAng) * rad * 0.6)} y2={r(y - Math.cos(minAng) * rad * 0.6)} stroke={INK} strokeWidth={3} strokeLinecap="round" />);
    els.push(<circle key={`kc${k++}`} cx={r(x)} cy={r(y)} r={4} fill={INK} />);
  }

  // ---- fraction shapes
  for (const f of spec.fractions) {
    const shaded = new Set(f.shaded);
    if (f.shape === 'bar') {
      const x0 = X(f.x);
      const y0 = Y(f.y);
      const w = f.size * s;
      const h = w * 0.28;
      grow(x0, y0);
      grow(x0 + w, y0 + h);
      for (let i = 0; i < f.parts; i++) {
        els.push(<rect key={`f${k++}`} x={r(x0 + (w * i) / f.parts)} y={r(y0)} width={r(w / f.parts)} height={r(h)} fill={shaded.has(i) ? FILLS.light : 'none'} stroke={INK} strokeWidth={1.8} />);
      }
    } else {
      const x0 = X(f.x);
      const y0 = Y(f.y);
      const rad = (f.size * s) / 2;
      grow(x0 - rad, y0 - rad);
      grow(x0 + rad, y0 + rad);
      for (let i = 0; i < f.parts; i++) {
        const a1 = (i / f.parts) * 2 * Math.PI;
        const a2 = ((i + 1) / f.parts) * 2 * Math.PI;
        const d =
          f.parts === 1
            ? undefined
            : `M${r(x0)},${r(y0)} L${r(x0 + Math.sin(a1) * rad)},${r(y0 - Math.cos(a1) * rad)} A${r(rad)},${r(rad)} 0 ${a2 - a1 > Math.PI ? 1 : 0} 1 ${r(x0 + Math.sin(a2) * rad)},${r(y0 - Math.cos(a2) * rad)} Z`;
        els.push(
          d ? (
            <path key={`f${k++}`} d={d} fill={shaded.has(i) ? FILLS.light : 'none'} stroke={INK} strokeWidth={1.8} strokeLinejoin="round" />
          ) : (
            <circle key={`f${k++}`} cx={r(x0)} cy={r(y0)} r={r(rad)} fill={shaded.has(0) ? FILLS.light : 'none'} stroke={INK} strokeWidth={1.8} />
          )
        );
      }
    }
  }

  // ---- point labels and lone points
  const used = new Set<string>();
  spec.segments.forEach((sg) => (used.add(sg.from), used.add(sg.to)));
  spec.polygons.forEach((pg) => pg.points.forEach((pid) => used.add(pid)));
  for (const p of pts) {
    grow(p.X, p.Y);
    if (!used.has(p.id)) els.push(<circle key={`d${k++}`} cx={r(p.X)} cy={r(p.Y)} r={3.2} fill={INK} />);
    if (!p.label) continue;
    let dir: [number, number];
    if (p.labelPos === 'auto') {
      dir = Math.hypot(p.X - cx, p.Y - cy) < 1 ? [0.7, -0.7] : unit(p.X - cx, p.Y - cy);
    } else {
      const d: Record<string, [number, number]> = { n: [0, -1], s: [0, 1], e: [1, 0], w: [-1, 0], ne: [0.7, -0.7], nw: [-0.7, -0.7], se: [0.7, 0.7], sw: [-0.7, 0.7] };
      dir = d[p.labelPos];
    }
    label(p.label, p.X + dir[0] * 15, p.Y + dir[1] * 15);
  }

  // ---- free text (captions, "1 cm²", "Hình H")
  for (const t of spec.texts) label(t.text, X(t.x), Y(t.y), 'start');

  return { elements: els, box };
}

/** A table description drawn as a plain ruled table (preview; Word gets a real table). */
function tableLayout(spec: FigureSpec): Layout {
  const rows = spec.table.rows;
  const cols = Math.max(1, ...rows.map((row) => row.cells.length));
  const widths = Array.from({ length: cols }, (_v, c) => Math.max(48, ...rows.map((row) => textWidth(row.cells[c] ?? '', 16) + 20)));
  const h = 32;
  const els: React.ReactNode[] = [];
  let y = 0;
  rows.forEach((row, ri) => {
    let x = 0;
    widths.forEach((w, ci) => {
      const head = spec.table.header && ri === 0;
      els.push(<rect key={`tr${ri}-${ci}`} x={x} y={y} width={r(w)} height={h} fill={head ? '#F2F2F2' : '#FFFFFF'} stroke={INK} strokeWidth={1.2} />);
      els.push(
        <text key={`tt${ri}-${ci}`} x={r(x + w / 2)} y={y + h / 2} textAnchor="middle" dominantBaseline="central" fontFamily={FONT} fontSize={16} fontWeight={head ? 'bold' : 'normal'} fill={INK}>
          {row.cells[ci] ?? ''}
        </text>
      );
      x += w;
    });
    y += h;
  });
  return { elements: els, box: { x1: 0, y1: 0, x2: widths.reduce((a, b) => a + b, 0), y2: Math.max(h, y) } };
}

const r = (n: number) => Math.round(n * 10) / 10;
function unit(x: number, y: number): [number, number] {
  const l = Math.hypot(x, y) || 1;
  return [x / l, y / l];
}

export interface FigureSvgProps {
  spec: FigureSpec;
  /** Display width; the drawing keeps its proportions. */
  width?: number;
  className?: string;
}

export function figureSize(spec: FigureSpec): { width: number; height: number } {
  const { box } = spec.kind === 'table' ? tableLayout(spec) : layout(spec);
  if (!Number.isFinite(box.x1)) return { width: 120, height: 60 };
  return { width: Math.ceil(box.x2 - box.x1 + MARGIN * 2), height: Math.ceil(box.y2 - box.y1 + MARGIN * 2) };
}

export const FigureSvg: React.FC<FigureSvgProps> = ({ spec, width, className }) => {
  const { elements, box } = spec.kind === 'table' ? tableLayout(spec) : layout(spec);
  const ok = Number.isFinite(box.x1);
  const vb = ok ? { x: box.x1 - MARGIN, y: box.y1 - MARGIN, w: box.x2 - box.x1 + MARGIN * 2, h: box.y2 - box.y1 + MARGIN * 2 } : { x: 0, y: 0, w: 120, h: 60 };
  const w = width ?? Math.ceil(vb.w);
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={`${r(vb.x)} ${r(vb.y)} ${r(vb.w)} ${r(vb.h)}`}
      width={w}
      height={Math.round((w * vb.h) / vb.w)}
      className={className}
      role="img"
    >
      <rect x={r(vb.x)} y={r(vb.y)} width={r(vb.w)} height={r(vb.h)} fill="#FFFFFF" />
      {elements}
    </svg>
  );
};

/** Standalone SVG file text for a figure, at its natural size (or the given width). */
export function figureSvgMarkup(spec: FigureSpec, width?: number): { svg: string; width: number; height: number } {
  const size = figureSize(spec);
  const w = width ?? size.width;
  const h = Math.round((w * size.height) / size.width);
  const svg = renderToStaticMarkup(<FigureSvg spec={spec} width={w} />);
  return { svg, width: w, height: h };
}
