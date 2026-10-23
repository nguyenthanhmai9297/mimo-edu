import React from 'react';
import { barRow, barRowYs, chainEdges, projectCubes, projectSolid, type Pt } from './solids';
import {
  add,
  placedBounds,
  INK,
  dist,
  len,
  mul,
  objectPoints,
  pointDeps,
  sub,
  type CanvasDoc,
  type GObject,
  type GPoint,
  type Positions,
  type Rect,
  type Stroke,
  type Vec,
} from './geometry';

/** Fonts with full Vietnamese support that exist on every computer (also inside exported files). */
export const CANVAS_FONT = "'Segoe UI', 'Helvetica Neue', Arial, sans-serif";

export interface SceneProps {
  doc: CanvasDoc;
  pos: Positions;
  /** Visible world area: infinite lines and rays are drawn across it. */
  area: Rect;
  /** Editor: invisible wide hit areas and selection highlight. Export: none of that. */
  interactive?: boolean;
  selected?: Set<string>;
  /** Only draw these objects (and their points). */
  only?: Set<string>;
  zoom?: number;
}

const dashArray = (s: Stroke) => (s.dash === 'dashed' ? `${s.width * 3} ${s.width * 2.2}` : undefined);

export function formatLength(px: number, unit: number): string {
  const v = Math.round((px / unit) * 10) / 10;
  return `${String(v).replace('.', ',')} cm`;
}

/** Clips the infinite line through A and B to the rectangle (with margin); ray: only from A towards B. */
function lineThrough(a: Vec, b: Vec, area: Rect, ray: boolean): [Vec, Vec] | null {
  const d = sub(b, a);
  const l = len(d);
  if (l < 1e-6) return null;
  const u = mul(d, 1 / l);
  const reach = Math.hypot(area.w, area.h) + dist(a, { x: area.x + area.w / 2, y: area.y + area.h / 2 });
  return [ray ? a : add(a, mul(u, -reach)), add(a, mul(u, reach))];
}

/** Position of a point's name: pushed away from the lines it belongs to. */
function labelOffset(doc: CanvasDoc, p: GPoint, pos: Positions): Vec {
  const me = pos.get(p.id)!;
  const neighbours: Vec[] = [];
  for (const o of doc.objects) {
    const ids = objectPoints(o);
    if (!ids.includes(p.id)) continue;
    if (o.type === 'polygon') {
      const i = ids.indexOf(p.id);
      neighbours.push(pos.get(ids[(i + 1) % ids.length])!, pos.get(ids[(i - 1 + ids.length) % ids.length])!);
    } else if (o.type !== 'rightMark') for (const id of ids) if (id !== p.id) neighbours.push(pos.get(id)!);
  }
  for (const id of pointDeps(p, doc)) {
    const v = pos.get(id);
    if (v && (p.def.kind === 'onSegment' || p.def.kind === 'foot' || p.def.kind === 'midpoint')) neighbours.push(v);
  }
  if (p.def.kind === 'onCircle') {
    const c = doc.objects.find((o) => o.id === (p.def as { circle: string }).circle);
    if (c?.type === 'circle') {
      const away = sub(me, pos.get(c.c)!);
      const l = len(away) || 1;
      return mul(away, 18 / l);
    }
  }
  let v: Vec = { x: 0, y: 0 };
  for (const n of neighbours) {
    const d = sub(me, n);
    const l = len(d);
    if (l > 1e-6) v = add(v, mul(d, 1 / l));
  }
  const l = len(v);
  // a point inside a straight line: put the name beside the line
  if (l < 0.3 && neighbours.length >= 2) {
    const d = sub(neighbours[0], me);
    const n = { x: d.y, y: -d.x };
    const nl = len(n) || 1;
    return mul(n.y > 0 ? mul(n, -1) : n, 18 / nl);
  }
  return l < 1e-6 ? { x: -13, y: -15 } : mul(v, 18 / l);
}

const HIT = 'transparent';

/** Mixes a colour with white (amount > 0) or black (amount < 0). */
export function tint(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => Math.round(amount >= 0 ? c + (255 - c) * amount : c * (1 + amount)));
  return `#${ch.map((c) => Math.max(0, Math.min(255, c)).toString(16).padStart(2, '0')).join('')}`;
}

const polyPath = (pts: Pt[]) => pts.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' ') + ' Z';
/** Polyline with breaks where a point is NaN. */
const brokenPath = (pts: Pt[]) => {
  let d = '';
  let pen = false;
  for (const p of pts) {
    if (Number.isNaN(p.x)) {
      pen = false;
      continue;
    }
    d += `${pen ? 'L' : 'M'}${p.x.toFixed(2)},${p.y.toFixed(2)} `;
    pen = true;
  }
  return d;
};

/** Curly brace from x0 to x1 at height y, opening towards the bar (dir −1: above the bar). */
export function bracePath(x0: number, x1: number, y: number, dir: 1 | -1): string {
  const h = 9 * dir;
  const mid = (x0 + x1) / 2;
  const r = Math.min(8, (x1 - x0) / 4);
  return `M${x0},${y} Q${x0},${y + h} ${x0 + r},${y + h} L${mid - r},${y + h} Q${mid},${y + h} ${mid},${y + 2 * h} Q${mid},${y + h} ${mid + r},${y + h} L${x1 - r},${y + h} Q${x1},${y + h} ${x1},${y}`;
}

export const Scene: React.FC<SceneProps> = ({ doc, pos, area, interactive = false, selected, only, zoom = 1 }) => {
  const unit = doc.grid.size;
  const sel = (id: string) => !!selected?.has(id);
  const highlight = '#FFB800';
  const hitW = 14 / zoom;
  const objects = only ? doc.objects.filter((o) => only.has(o.id)) : doc.objects;
  const pointIds = new Set(only ? objects.flatMap(objectPoints).concat(doc.points.filter((p) => only.has(p.id)).map((p) => p.id)) : doc.points.map((p) => p.id));
  const P = (id: string) => pos.get(id) ?? { x: 0, y: 0 };
  const lengthLabel = (a: Vec, b: Vec, key: string, inward?: Vec) => {
    let m = mul(add(a, b), 0.5);
    // a point in the middle (centre of a diameter, midpoint): move the label along the segment
    if (doc.points.some((p) => dist(P(p.id), m) < 16)) m = add(a, mul(sub(b, a), 0.75));
    const d = sub(b, a);
    const l = len(d) || 1;
    let n = { x: d.y / l, y: -d.x / l };
    if (inward && (m.x - inward.x) * n.x + (m.y - inward.y) * n.y < 0) n = mul(n, -1);
    const at = add(m, mul(n, 14));
    return (
      <text key={key} x={at.x} y={at.y} fontSize={14} fontFamily={CANVAS_FONT} fill="#5E6C84" textAnchor="middle" dominantBaseline="middle" pointerEvents="none">
        {formatLength(dist(a, b), unit)}
      </text>
    );
  };

  const renderObject = (o: GObject) => {
    const hl = interactive && sel(o.id);
    const hitProps = interactive ? { 'data-hit': 'object', 'data-id': o.id, style: { cursor: o.locked ? 'default' : 'move' } } : {};
    switch (o.type) {
      case 'segment':
      case 'line':
      case 'ray': {
        const a = P(o.a);
        const b = P(o.b);
        const ends = o.type === 'segment' ? ([a, b] as [Vec, Vec]) : lineThrough(a, b, area, o.type === 'ray');
        if (!ends) return null;
        const [s, e] = ends;
        return (
          <g key={o.id}>
            {hl && <line x1={s.x} y1={s.y} x2={e.x} y2={e.y} stroke={highlight} strokeWidth={o.style.width + 8 / zoom} strokeOpacity={0.45} strokeLinecap="round" />}
            <line x1={s.x} y1={s.y} x2={e.x} y2={e.y} stroke={o.style.stroke} strokeWidth={o.style.width} strokeDasharray={dashArray(o.style)} strokeLinecap="round" />
            {interactive && <line {...hitProps} x1={s.x} y1={s.y} x2={e.x} y2={e.y} stroke={HIT} strokeWidth={hitW} />}
            {o.type === 'segment' && (o.showLength || doc.showLengths) && lengthLabel(a, b, `${o.id}-len`)}
          </g>
        );
      }
      case 'polygon': {
        const pts = o.pts.map(P);
        const d = pts.map((v, i) => `${i ? 'L' : 'M'}${v.x},${v.y}`).join(' ') + ' Z';
        const centre = mul(pts.reduce(add, { x: 0, y: 0 }), 1 / Math.max(1, pts.length));
        return (
          <g key={o.id}>
            {hl && <path d={d} fill="none" stroke={highlight} strokeWidth={o.style.width + 8 / zoom} strokeOpacity={0.45} strokeLinejoin="round" />}
            <path
              {...hitProps}
              d={d}
              fill={o.style.fill === 'none' ? (interactive ? HIT : 'none') : o.style.fill}
              fillOpacity={o.style.fill === 'none' ? 1 : o.style.fillOpacity}
              stroke={o.style.stroke}
              strokeWidth={o.style.width}
              strokeDasharray={dashArray(o.style)}
              strokeLinejoin="round"
            />
            {interactive && <path {...hitProps} d={d} fill="none" stroke={HIT} strokeWidth={hitW} />}
            {(o.showLengths || doc.showLengths) && pts.map((v, i) => lengthLabel(v, pts[(i + 1) % pts.length], `${o.id}-len${i}`, centre))}
          </g>
        );
      }
      case 'circle': {
        const c = P(o.c);
        const r = dist(c, P(o.p));
        return (
          <g key={o.id}>
            {hl && <circle cx={c.x} cy={c.y} r={r} fill="none" stroke={highlight} strokeWidth={o.style.width + 8 / zoom} strokeOpacity={0.45} />}
            <circle
              {...hitProps}
              cx={c.x}
              cy={c.y}
              r={r}
              fill={o.style.fill === 'none' ? (interactive ? HIT : 'none') : o.style.fill}
              fillOpacity={o.style.fill === 'none' ? 1 : o.style.fillOpacity}
              stroke={o.style.stroke}
              strokeWidth={o.style.width}
              strokeDasharray={dashArray(o.style)}
            />
            {interactive && <circle {...hitProps} cx={c.x} cy={c.y} r={r} fill="none" stroke={HIT} strokeWidth={hitW} />}
          </g>
        );
      }
      case 'rightMark': {
        const o0 = P(o.o);
        const ua = sub(P(o.a), o0);
        const ub = sub(P(o.b), o0);
        const la = len(ua);
        const lb = len(ub);
        if (la < 1e-6 || lb < 1e-6) return null;
        const s = Math.min(o.size, la / 2, lb / 2);
        const p1 = add(o0, mul(ua, s / la));
        const p3 = add(o0, mul(ub, s / lb));
        const p2 = add(p1, mul(ub, s / lb));
        const d = `M${p1.x},${p1.y} L${p2.x},${p2.y} L${p3.x},${p3.y}`;
        return (
          <g key={o.id}>
            {hl && <path d={d} fill="none" stroke={highlight} strokeWidth={o.style.width + 8 / zoom} strokeOpacity={0.45} />}
            <path d={d} fill="none" stroke={o.style.stroke} strokeWidth={o.style.width} />
            {interactive && <path {...hitProps} d={`${d} L${o0.x},${o0.y} Z`} fill={HIT} stroke={HIT} strokeWidth={hitW / 2} />}
          </g>
        );
      }
      case 'solid': {
        const pic = projectSolid(o.spec, o.x, o.y);
        const b = pic.bounds;
        const names = o.labels;
        return (
          <g key={o.id}>
            {hl && <rect x={b.x - 8} y={b.y - 8} width={b.w + 16} height={b.h + 16} fill="none" stroke={highlight} strokeWidth={3 / zoom} strokeDasharray="6 4" rx={6} />}
            {pic.sphere ? (
              <>
                <circle cx={o.x} cy={o.y} r={pic.sphere.r} fill={o.color} fillOpacity={o.opacity} />
                <circle cx={o.x - pic.sphere.r * 0.35} cy={o.y - pic.sphere.r * 0.35} r={pic.sphere.r * 0.35} fill="#FFFFFF" fillOpacity={0.35 * o.opacity} />
                <circle cx={o.x} cy={o.y} r={pic.sphere.r} fill="none" stroke={INK} strokeWidth={2.4} />
                {o.showEdges && <path d={brokenPath(pic.sphere.front)} fill="none" stroke={INK} strokeWidth={2} />}
                {o.showEdges && o.showHidden && <path d={brokenPath(pic.sphere.back)} fill="none" stroke={INK} strokeWidth={1.6} strokeDasharray="6 5" />}
              </>
            ) : (
              <>
                {pic.faces.map((f, i) => (
                  <path key={i} d={polyPath(f.pts)} fill={tint(o.color, f.light > 0.85 ? (f.light - 0.85) * 2 : -(0.85 - f.light) * 0.9)} fillOpacity={o.opacity} stroke="none" />
                ))}
                {o.showEdges && o.showHidden && chainEdges(pic.hidden).map((c, i) => <path key={`h${i}`} d={brokenPath(c)} fill="none" stroke={INK} strokeWidth={1.6} strokeDasharray="6 5" strokeLinecap="round" strokeLinejoin="round" />)}
                {o.showEdges && chainEdges(pic.visible).map((c, i) => <path key={`v${i}`} d={brokenPath(c)} fill="none" stroke={INK} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />)}
              </>
            )}
            {pic.labels.map(({ at, label, index }) => (
              <g key={`n${index}`}>
                {o.showVertices && <circle cx={at.x} cy={at.y} r={3.6} fill={INK} />}
                {o.showLabels && names[index] && (
                  <text x={label.x} y={label.y} fontSize={18} fontStyle="italic" fontWeight={600} fontFamily={CANVAS_FONT} fill={INK} textAnchor="middle" dominantBaseline="middle" pointerEvents="none">
                    {names[index]}
                  </text>
                )}
              </g>
            ))}
            {interactive && <rect {...hitProps} x={b.x - 6} y={b.y - 6} width={b.w + 12} height={b.h + 12} fill={HIT} />}
          </g>
        );
      }
      case 'cubes': {
        const pic = projectCubes(o.cols, o.rows, o.heights, o.size, o.view, o.x, o.y);
        const b = placedBounds(o);
        const fill = { top: tint(o.color, 0.45), left: o.color, right: tint(o.color, -0.25) };
        return (
          <g key={o.id}>
            {hl && <rect x={b.x - 8} y={b.y - 8} width={b.w + 16} height={b.h + 16} fill="none" stroke={highlight} strokeWidth={3 / zoom} strokeDasharray="6 4" rx={6} />}
            {pic.faces.map((f, i) => (
              <path key={i} d={polyPath(f.pts)} fill={fill[f.shade]} stroke={INK} strokeWidth={1.6} strokeLinejoin="round" />
            ))}
            {o.showCount && (
              <text x={b.x + b.w / 2} y={b.y + b.h - 8} fontSize={18} fontWeight={700} fontFamily={CANVAS_FONT} fill={INK} textAnchor="middle">
                Có {pic.count} khối lập phương
              </text>
            )}
            {interactive && <rect {...hitProps} x={b.x - 6} y={b.y - 6} width={b.w + 12} height={b.h + 12} fill={HIT} />}
          </g>
        );
      }
      case 'cellGrid': {
        const W = o.cols * o.cell;
        const H = o.rows * o.cell;
        const filled = Object.keys(o.fills).filter((k) => {
          const [r, c] = k.split(',').map(Number);
          return r < o.rows && c < o.cols;
        });
        return (
          <g key={o.id}>
            {hl && <rect x={o.x - 6} y={o.y - 6} width={W + 12} height={H + 12} fill="none" stroke={highlight} strokeWidth={3 / zoom} strokeDasharray="6 4" />}
            {filled.map((k) => {
              const [r, c] = k.split(',').map(Number);
              return <rect key={k} x={o.x + c * o.cell} y={o.y + r * o.cell} width={o.cell} height={o.cell} fill={o.fills[k]} />;
            })}
            {Array.from({ length: o.cols + 1 }, (_, i) => (
              <line key={`c${i}`} x1={o.x + i * o.cell} y1={o.y} x2={o.x + i * o.cell} y2={o.y + H} stroke={o.stroke} strokeWidth={i === 0 || i === o.cols ? 2.6 : 1.4} />
            ))}
            {Array.from({ length: o.rows + 1 }, (_, i) => (
              <line key={`r${i}`} x1={o.x} y1={o.y + i * o.cell} x2={o.x + W} y2={o.y + i * o.cell} stroke={o.stroke} strokeWidth={i === 0 || i === o.rows ? 2.6 : 1.4} />
            ))}
            {o.showCount && (
              <text x={o.x + W / 2} y={o.y + H + 26} fontSize={17} fontWeight={700} fontFamily={CANVAS_FONT} fill={INK} textAnchor="middle">
                Đã tô {filled.length} ô vuông đơn vị
              </text>
            )}
            {interactive && <rect {...hitProps} data-grid={o.id} x={o.x} y={o.y} width={W} height={H} fill={HIT} />}
          </g>
        );
      }
      case 'bars': {
        const b = placedBounds(o);
        return (
          <g key={o.id}>
            {hl && <rect x={b.x - 4} y={b.y - 4} width={b.w + 8} height={b.h + 8} fill="none" stroke={highlight} strokeWidth={3 / zoom} strokeDasharray="6 4" />}
            {o.rows.map((row, i) => {
              const g = barRow(row, o.x, barRowYs(o.rows, o.y)[i], o.unit);
              return (
                <g key={i}>
                  <text x={o.x - 14} y={g.y} fontSize={18} fontWeight={700} fontFamily={CANVAS_FONT} fill={INK} textAnchor="end" dominantBaseline="middle">
                    {row.label}
                  </text>
                  <line x1={g.x0} y1={g.y} x2={g.x1} y2={g.y} stroke={row.color} strokeWidth={4} strokeLinecap="round" />
                  {g.ticks.map((t, j) => (
                    <line key={j} x1={t} y1={g.y - 9} x2={t} y2={g.y + 9} stroke={row.color} strokeWidth={j === 0 || j === g.ticks.length - 1 ? 3 : 2.2} />
                  ))}
                  {row.braces.map((br, j) => {
                    const from = Math.max(0, Math.min(g.ticks.length - 1, br.from));
                    const to = Math.max(from + 1, Math.min(g.ticks.length - 1, br.to));
                    const dir = br.below ? 1 : -1;
                    const y0 = g.y + dir * 14;
                    const xm = (g.ticks[from] + g.ticks[to]) / 2;
                    return (
                      <g key={`b${j}`}>
                        <path d={bracePath(g.ticks[from], g.ticks[to], y0, dir)} fill="none" stroke={INK} strokeWidth={1.8} />
                        <text x={xm} y={y0 + dir * 30} fontSize={br.text.trim() === '?' ? 22 : 17} fontWeight={700} fontFamily={CANVAS_FONT} fill={br.text.trim() === '?' ? '#E5484D' : INK} textAnchor="middle" dominantBaseline="middle">
                          {br.text}
                        </text>
                      </g>
                    );
                  })}
                </g>
              );
            })}
            {interactive && <rect {...hitProps} x={b.x} y={b.y} width={b.w} height={b.h} fill={HIT} />}
          </g>
        );
      }
      case 'text': {
        const lines = o.text.split('\n');
        const w = Math.max(...lines.map((l) => l.length), 1) * o.fontSize * 0.52;
        const h = lines.length * o.fontSize * 1.25;
        return (
          <g key={o.id} transform={o.rotation ? `rotate(${o.rotation} ${o.x} ${o.y})` : undefined}>
            {hl && <rect x={o.x - 4} y={o.y - o.fontSize} width={w + 8} height={h + 4} fill="none" stroke={highlight} strokeWidth={2 / zoom} strokeDasharray="4 3" />}
            <text x={o.x} y={o.y} fontSize={o.fontSize} fontFamily={CANVAS_FONT} fontWeight={o.bold ? 700 : 400} fill={o.color}>
              {lines.map((l, i) => (
                <tspan key={i} x={o.x} dy={i === 0 ? 0 : o.fontSize * 1.25}>
                  {l || ' '}
                </tspan>
              ))}
            </text>
            {interactive && <rect {...hitProps} x={o.x - 4} y={o.y - o.fontSize} width={w + 8} height={h + 4} fill={HIT} />}
          </g>
        );
      }
    }
  };

  const points = doc.points.filter((p) => pointIds.has(p.id));
  return (
    <g>
      {objects.map(renderObject)}
      {points.map((p) => {
        const v = P(p.id);
        const r = 4.5 / Math.max(zoom, 0.6);
        const defined = p.def.kind !== 'free';
        const showName = doc.showNames && p.showName && p.name;
        const off = showName ? labelOffset(doc, p, pos) : { x: 0, y: 0 };
        return (
          <g key={p.id}>
            {interactive && sel(p.id) && <circle cx={v.x} cy={v.y} r={r + 6 / zoom} fill={highlight} fillOpacity={0.5} />}
            <circle cx={v.x} cy={v.y} r={r} fill={defined ? '#FFFFFF' : p.color} stroke={p.color} strokeWidth={defined ? 2 : 0} />
            {showName && (
              <text
                x={v.x + off.x}
                y={v.y + off.y}
                fontSize={18}
                fontStyle="italic"
                fontWeight={600}
                fontFamily={CANVAS_FONT}
                fill={p.color}
                textAnchor="middle"
                dominantBaseline="middle"
                pointerEvents="none"
              >
                {p.name}
              </text>
            )}
            {interactive && <circle data-hit="point" data-id={p.id} cx={v.x} cy={v.y} r={11 / zoom} fill={HIT} style={{ cursor: 'grab' }} />}
          </g>
        );
      })}
    </g>
  );
};

/** Background grid (editor only unless the teacher exports it on purpose). */
export const GridLayer: React.FC<{ area: Rect; size: number; zoom: number }> = ({ area, size, zoom }) => {
  const step = size * zoom < 8 ? size * 5 : size;
  const x0 = Math.floor(area.x / step) * step;
  const y0 = Math.floor(area.y / step) * step;
  const lines: React.ReactNode[] = [];
  for (let x = x0; x <= area.x + area.w; x += step) {
    lines.push(<line key={`x${x}`} x1={x} y1={area.y} x2={x} y2={area.y + area.h} stroke={Math.round(x / step) % 5 === 0 ? '#C9DCF2' : '#E4EEF9'} strokeWidth={1 / zoom} />);
  }
  for (let y = y0; y <= area.y + area.h; y += step) {
    lines.push(<line key={`y${y}`} x1={area.x} y1={y} x2={area.x + area.w} y2={y} stroke={Math.round(y / step) % 5 === 0 ? '#C9DCF2' : '#E4EEF9'} strokeWidth={1 / zoom} />);
  }
  return <g pointerEvents="none">{lines}</g>;
};
