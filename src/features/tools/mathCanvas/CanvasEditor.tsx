import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  Circle as CircleIcon,
  Crosshair,
  Download,
  Eraser,
  FileJson,
  FileText,
  FolderOpen,
  Grid3x3,
  Hand,
  ImageDown,
  Magnet,
  Minus,
  PaintBucket,
  MousePointer2,
  MoveUpRight,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  Redo2,
  Ruler,
  Save,
  Spline,
  Tag,
  Type,
  Undo2,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import {
  add,
  addCircle,
  addObject,
  addPoint,
  addShape,
  bounds,
  connect,
  copyItems,
  defaultStroke,
  deleteItems,
  dist,
  distToSegment,
  dragDef,
  isDraggable,
  mul,
  pasteClip,
  resolve,
  rotateVec,
  segmentsCross,
  sub,
  transformItems,
  type CanvasDoc,
  type Clip,
  type GObject,
  type GPoint,
  type Rect,
  type ShapeKind,
  type Stroke,
  type Vec,
} from './geometry';
import { download, drawingPdf, drawingPng, drawingSvg, fileName } from './canvasFiles';
import { BAR_TEMPLATES, makeBars, makeCubes, makeGrid, makeSolid } from './objects';
import { PropertiesPanel } from './PropertiesPanel';
import type { SolidKind } from './solids';
import { GridLayer, Scene } from './Scene';

export type ToolId =
  | 'select'
  | 'pan'
  | 'point'
  | 'segment'
  | 'line'
  | 'ray'
  | 'polygon'
  | `shape:${ShapeKind}`
  | 'circle'
  | 'rightMark'
  | 'text'
  | 'eraser'
  | 'cellGrid'
  | 'paint'
  | 'bars'
  | 'cubes'
  | `solid:${SolidKind}`;

/** Little outline of a shape for the toolbar. */
const Glyph: React.FC<{ d: string }> = ({ d }) => (
  <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round">
    <path d={d} />
  </svg>
);
const G = (d: string): React.FC => {
  const C: React.FC = () => <Glyph d={d} />;
  return C;
};

const TOOL_GROUPS: { title: string; tools: { id: ToolId; label: string; icon: React.ElementType; key?: string }[] }[] = [
  {
    title: 'Chọn',
    tools: [
      { id: 'select', label: 'Chọn, kéo, xoay', icon: MousePointer2, key: 'V' },
      { id: 'pan', label: 'Di chuyển vùng vẽ', icon: Hand, key: 'H' },
      { id: 'eraser', label: 'Tẩy / xóa', icon: Eraser, key: 'E' },
    ],
  },
  {
    title: 'Điểm và đường',
    tools: [
      { id: 'point', label: 'Điểm', icon: G('M12 12m-2.5 0a2.5 2.5 0 1 0 5 0a2.5 2.5 0 1 0 -5 0'), key: 'P' },
      { id: 'segment', label: 'Đoạn thẳng', icon: Minus, key: 'S' },
      { id: 'line', label: 'Đường thẳng', icon: G('M2 20L22 4'), key: 'L' },
      { id: 'ray', label: 'Tia', icon: MoveUpRight, key: 'R' },
      { id: 'rightMark', label: 'Góc vuông', icon: G('M5 4v15h15M5 13h6v6') },
    ],
  },
  {
    title: 'Hình phẳng',
    tools: [
      { id: 'shape:triangle', label: 'Tam giác', icon: G('M9 4L3 20h18z') },
      { id: 'shape:right-triangle', label: 'Tam giác vuông', icon: G('M4 4v16h16zM4 15h5v5') },
      { id: 'shape:isosceles', label: 'Tam giác cân', icon: G('M12 3L4 20h16z') },
      { id: 'shape:equilateral', label: 'Tam giác đều', icon: G('M12 4L3 19.6h18z') },
      { id: 'shape:square', label: 'Hình vuông', icon: G('M4 4h16v16H4z') },
      { id: 'shape:rectangle', label: 'Hình chữ nhật', icon: G('M2 7h20v10H2z') },
      { id: 'shape:parallelogram', label: 'Hình bình hành', icon: G('M7 6h15l-5 12H2z') },
      { id: 'shape:rhombus', label: 'Hình thoi', icon: G('M12 2l8 10-8 10-8-10z') },
      { id: 'shape:trapezoid', label: 'Hình thang', icon: G('M7 6h10l5 12H2z') },
      { id: 'polygon', label: 'Đa giác (bấm từng đỉnh)', icon: G('M12 3l8 6-3 11H7L4 9z'), key: 'G' },
      { id: 'circle', label: 'Hình tròn', icon: CircleIcon, key: 'C' },
    ],
  },
  {
    title: 'Toán lớp 3',
    tools: [
      { id: 'cellGrid', label: 'Lưới ô vuông', icon: Grid3x3 },
      { id: 'paint', label: 'Tô màu ô', icon: PaintBucket },
      { id: 'bars', label: 'Sơ đồ đoạn thẳng', icon: G('M3 8h12M3 5v6M9 5v6M15 5v6M3 17h18M3 14v6M21 14v6') },
      { id: 'cubes', label: 'Xếp khối lập phương', icon: G('M12 3l8 4-8 4-8-4zM4 7v9l8 5 8-5V7M12 11v10') },
      { id: 'text', label: 'Chữ, số, ký hiệu', icon: Type, key: 'T' },
    ],
  },
  {
    title: 'Hình khối 3D',
    tools: [
      { id: 'solid:cube', label: 'Khối lập phương', icon: G('M4 8l8-4 8 4v9l-8 4-8-4zM4 8l8 4 8-4M12 12v9') },
      { id: 'solid:cuboid', label: 'Hình hộp chữ nhật', icon: G('M2 9l7-4h13l-7 4zM2 9v9h13V9M15 9l7-4v9l-7 4') },
      { id: 'solid:pyramid', label: 'Hình chóp', icon: G('M12 3L3 17l7 4 11-5zM12 3l-2 18M12 3l9 13') },
      { id: 'solid:cylinder', label: 'Hình trụ', icon: G('M5 6a7 3 0 1 0 14 0a7 3 0 1 0 -14 0M5 6v12a7 3 0 0 0 14 0V6') },
      { id: 'solid:cone', label: 'Hình nón', icon: G('M12 3L5 18a7 3 0 0 0 14 0zM5 18a7 3 0 0 1 14 0') },
      { id: 'solid:sphere', label: 'Hình cầu', icon: G('M12 12m-9 0a9 9 0 1 0 18 0a9 9 0 1 0 -18 0M3 12a9 3 0 0 0 18 0') },
    ],
  },
];
const ALL_TOOLS = TOOL_GROUPS.flatMap((g) => g.tools);

type Drag =
  | { kind: 'pan'; sx: number; sy: number; view: View }
  | { kind: 'point'; id: string; start: CanvasDoc; moved: boolean }
  | { kind: 'move'; ids: string[]; from: Vec; start: CanvasDoc; moved: boolean }
  | { kind: 'marquee'; from: Vec }
  | { kind: 'create'; tool: ToolId; from: Vec }
  | { kind: 'scale' | 'rotate'; ids: string[]; centre: Vec; from: Vec; start: CanvasDoc }
  | { kind: 'orbit'; id: string; sx: number; sy: number; yaw: number; pitch: number; start: CanvasDoc };

interface View {
  x: number;
  y: number;
  zoom: number;
}

export interface EditorProps {
  doc: CanvasDoc;
  apply: (next: CanvasDoc) => void;
  live: (next: CanvasDoc) => void;
  commitFrom: (before: CanvasDoc) => void;
  undo: (() => void) | null;
  redo: (() => void) | null;
  presenting: boolean;
  saveState: { ok: boolean; message: string };
  onSaveNow: () => void;
  onLibrary: () => void;
  onImport: () => void;
}

const isTyping = (t: EventTarget | null) => !!(t as HTMLElement | null)?.closest?.('input, textarea, select, [contenteditable]');

export const CanvasEditor: React.FC<EditorProps> = ({ doc, apply, live, commitFrom, undo, redo, presenting, saveState, onSaveNow, onLibrary, onImport }) => {
  const [tool, setTool] = useState<ToolId>('select');
  const [selected, setSelected] = useState<string[]>([]);
  const [view, setView] = useState<View>({ x: 0, y: 0, zoom: 1 });
  // 0 until the canvas box has been measured: centring waits for the real size
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [draft, setDraft] = useState<string[]>([]);
  const [cursor, setCursor] = useState<Vec | null>(null);
  const [marquee, setMarquee] = useState<Rect | null>(null);
  const [createBox, setCreateBox] = useState<{ from: Vec; to: Vec } | null>(null);
  const [ink, setInkState] = useState<Stroke>(defaultStroke());
  const [leftOpen, setLeftOpen] = useState(!presenting);
  const [rightOpen, setRightOpen] = useState(!presenting);
  const [exportOpen, setExportOpen] = useState(false);
  const [exportGrid, setExportGrid] = useState(false);
  const [exportOnly, setExportOnly] = useState(false);
  const [message, setMessage] = useState('');
  /** Dragging a selected solid turns it instead of moving it. */
  const [orbit, setOrbit] = useState(false);
  const [paintColor, setPaintColor] = useState('#FFD34E');
  const svgRef = useRef<SVGSVGElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const drag = useRef<Drag | null>(null);
  const pointers = useRef(new Map<number, Vec>());
  const pinch = useRef<{ d: number; mid: Vec; view: View } | null>(null);
  const clipboard = useRef<Clip | null>(null);
  /** Doc before the first click of a multi-click tool, so the whole thing is one undo step. */
  const draftStart = useRef<CanvasDoc | null>(null);
  /** Doc before typing in a field started: the whole edit becomes one undo step. */
  const typingStart = useRef<CanvasDoc | null>(null);
  const liveTyping = useCallback(
    (next: CanvasDoc) => {
      if (!typingStart.current) typingStart.current = docRef.current;
      live(next);
    },
    [live]
  );
  const commitTyping = useCallback(() => {
    if (typingStart.current) commitFrom(typingStart.current);
    typingStart.current = null;
  }, [commitFrom]);
  const viewRef = useRef(view);
  viewRef.current = view;
  const docRef = useRef(doc);
  docRef.current = doc;

  const pos = useMemo(() => resolve(doc), [doc]);
  const selSet = useMemo(() => new Set(selected), [selected]);
  const area: Rect = { x: -view.x / view.zoom, y: -view.y / view.zoom, w: size.w / view.zoom, h: size.h / view.zoom };
  const tol = 10 / view.zoom;

  useEffect(() => {
    setLeftOpen(!presenting);
    setRightOpen(!presenting);
  }, [presenting]);

  // keep the canvas size in sync with its box
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const measure = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // forget selected items that no longer exist (after undo, delete…)
  useEffect(() => {
    setSelected((s) => {
      const keep = s.filter((id) => doc.points.some((p) => p.id === id) || doc.objects.some((o) => o.id === id));
      return keep.length === s.length ? s : keep;
    });
  }, [doc]);

  const fit = useCallback(
    (ids?: Iterable<string>) => {
      const b = bounds(docRef.current, resolve(docRef.current), ids);
      if (!b) {
        setView({ x: size.w / 2, y: size.h / 2, zoom: 1 });
        return;
      }
      const zoom = Math.max(0.2, Math.min(3, Math.min((size.w - 80) / b.w, (size.h - 80) / b.h)));
      setView({ zoom, x: size.w / 2 - (b.x + b.w / 2) * zoom, y: size.h / 2 - (b.y + b.h / 2) * zoom });
    },
    [size]
  );
  // centre the drawing once the canvas has its size
  const fitted = useRef(false);
  useEffect(() => {
    if (fitted.current || size.w < 50) return;
    fitted.current = true;
    if (doc.points.length || doc.objects.length) fit();
    else setView({ x: size.w / 2 - 300, y: size.h / 2 - 200, zoom: 1 });
  }, [size, fit, doc.points.length, doc.objects.length]);

  const toWorld = useCallback((cx: number, cy: number): Vec => {
    const r = svgRef.current!.getBoundingClientRect();
    const v = viewRef.current;
    return { x: (cx - r.left - v.x) / v.zoom, y: (cy - r.top - v.y) / v.zoom };
  }, []);

  const snapGrid = useCallback((w: Vec): Vec => {
    const g = docRef.current.grid;
    return g.snap ? { x: Math.round(w.x / g.size) * g.size, y: Math.round(w.y / g.size) * g.size } : w;
  }, []);

  /** Straight edges a new point can sit on: segments and polygon sides. */
  const edges = useCallback((d: CanvasDoc): [string, string][] => {
    const out: [string, string][] = [];
    for (const o of d.objects) {
      if (o.type === 'segment') out.push([o.a, o.b]);
      if (o.type === 'polygon') o.pts.forEach((p, i) => out.push([p, o.pts[(i + 1) % o.pts.length]]));
    }
    return out;
  }, []);

  /**
   * The point a click means: an existing point, a crossing of two lines, a
   * point on a side or a circle, or a new free point (on the grid if snapping).
   */
  const pointAt = useCallback(
    (d: CanvasDoc, w: Vec): { doc: CanvasDoc; id: string } => {
      const p = resolve(d);
      let best: { id: string; dd: number } | null = null;
      for (const pt of d.points) {
        const dd = dist(p.get(pt.id)!, w);
        if (dd < tol * 1.2 && (!best || dd < best.dd)) best = { id: pt.id, dd };
      }
      if (best) return { doc: d, id: best.id };
      const es = edges(d);
      for (let i = 0; i < es.length; i++) {
        for (let j = i + 1; j < es.length; j++) {
          const [a, b] = es[i];
          const [c, e] = es[j];
          if (new Set([a, b, c, e]).size < 4) continue;
          const x = segmentsCross(p.get(a)!, p.get(b)!, p.get(c)!, p.get(e)!);
          if (x && dist(x, w) < tol) return addPoint(d, { kind: 'intersection', a, b, c, d: e });
        }
      }
      let near: { a: string; b: string; t: number; dd: number } | null = null;
      for (const [a, b] of es) {
        const r = distToSegment(w, p.get(a)!, p.get(b)!);
        if (r.d < tol && r.t > 0.02 && r.t < 0.98 && (!near || r.d < near.dd)) near = { a, b, t: r.t, dd: r.d };
      }
      if (near) return addPoint(d, { kind: 'onSegment', a: near.a, b: near.b, t: Math.round(near.t * 1000) / 1000 });
      for (const o of d.objects) {
        if (o.type !== 'circle') continue;
        const c = p.get(o.c)!;
        const r = dist(c, p.get(o.p)!);
        if (Math.abs(dist(c, w) - r) < tol) return addPoint(d, { kind: 'onCircle', circle: o.id, angle: Math.atan2(w.y - c.y, w.x - c.x) });
      }
      const s = snapGrid(w);
      return addPoint(d, { kind: 'free', x: s.x, y: s.y });
    },
    [edges, snapGrid, tol]
  );

  const selectionTransformable = selected.some((id) => doc.objects.some((o) => o.id === id && !o.locked));
  const selBounds = tool === 'select' && selectionTransformable && selected.length > 0 ? bounds(doc, pos, selected.filter((id) => doc.objects.some((o) => o.id === id))) : null;

  // ------------------------------------------------------------ pointer input
  const hitOf = (e: React.PointerEvent | PointerEvent) => {
    const el = (e.target as Element).closest('[data-hit]') as HTMLElement | SVGElement | null;
    return el ? { kind: el.getAttribute('data-hit')!, id: el.getAttribute('data-id') ?? '' } : null;
  };

  const finishPolygon = (ids: string[]) => {
    if (ids.length >= 3) {
      const r = addObject(docRef.current, { type: 'polygon', pts: ids, style: { ...ink }, shape: ids.length === 3 ? 'triangle' : 'polygon' } as GObject);
      commitFrom(draftStart.current ?? docRef.current);
      live(r.doc);
      setSelected([r.id]);
    }
    draftStart.current = null;
    setDraft([]);
  };

  const onPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) {
      // two fingers: pinch to zoom / move, cancels what one finger started
      const [a, b] = [...pointers.current.values()];
      drag.current = null;
      setMarquee(null);
      setCreateBox(null);
      pinch.current = { d: dist(a, b), mid: mul(add(a, b), 0.5), view: viewRef.current };
      return;
    }
    if (pointers.current.size > 2) return;
    const w = toWorld(e.clientX, e.clientY);
    const hit = hitOf(e);
    const d = docRef.current;

    if (tool === 'pan' || e.button === 1 || e.button === 2) {
      drag.current = { kind: 'pan', sx: e.clientX, sy: e.clientY, view: viewRef.current };
      return;
    }
    if (tool === 'select') {
      if (hit?.kind === 'scale' || hit?.kind === 'rotate') {
        const ids = selected.filter((id) => d.objects.some((o) => o.id === id && !o.locked));
        const b = bounds(d, resolve(d), ids)!;
        drag.current = { kind: hit.kind, ids, centre: { x: b.x + b.w / 2, y: b.y + b.h / 2 }, from: w, start: d };
        return;
      }
      if (hit?.kind === 'point') {
        let p = d.points.find((x) => x.id === hit.id)!;
        if (!isDraggable(p)) {
          // a computed point lying on top of a movable one: grab the movable one
          const here = resolve(d).get(p.id)!;
          const under = d.points.find((x) => x.id !== p.id && isDraggable(x) && dist(resolve(d).get(x.id)!, here) < tol);
          if (under) p = under;
        }
        if (e.shiftKey) setSelected((s) => (s.includes(p.id) ? s.filter((x) => x !== p.id) : [...s, p.id]));
        else if (!selected.includes(p.id) || !isDraggable(p)) setSelected([p.id]);
        drag.current = isDraggable(p) ? { kind: 'point', id: p.id, start: d, moved: false } : null;
        if (!isDraggable(p)) setMessage('Điểm này được tính từ các điểm khác. Kéo các điểm tạo ra nó để thay đổi.');
        return;
      }
      if (hit?.kind === 'object') {
        const o = d.objects.find((x) => x.id === hit.id)!;
        if (orbit && o.type === 'solid' && !o.locked && !e.shiftKey) {
          setSelected([o.id]);
          drag.current = { kind: 'orbit', id: o.id, sx: e.clientX, sy: e.clientY, yaw: o.spec.yaw, pitch: o.spec.pitch, start: d };
          return;
        }
        let ids = selected;
        if (e.shiftKey) {
          ids = selected.includes(o.id) ? selected.filter((x) => x !== o.id) : [...selected, o.id];
          setSelected(ids);
        } else if (!selected.includes(o.id)) {
          ids = [o.id];
          setSelected(ids);
        }
        const movable = ids.filter((id) => !d.objects.find((x) => x.id === id)?.locked);
        drag.current = movable.length ? { kind: 'move', ids: movable, from: w, start: d, moved: false } : null;
        return;
      }
      if (!e.shiftKey) setSelected([]);
      drag.current = { kind: 'marquee', from: w };
      return;
    }
    if (tool === 'paint') {
      // colour one unit square of a grid (click again with the same colour to clear it)
      const g = [...d.objects].reverse().find((o) => o.type === 'cellGrid' && w.x >= o.x && w.y >= o.y && w.x < o.x + o.cols * o.cell && w.y < o.y + o.rows * o.cell);
      if (g && g.type === 'cellGrid') {
        const k = `${Math.floor((w.y - g.y) / g.cell)},${Math.floor((w.x - g.x) / g.cell)}`;
        const fills = { ...g.fills };
        if (fills[k] === paintColor) delete fills[k];
        else fills[k] = paintColor;
        apply({ ...d, objects: d.objects.map((o) => (o.id === g.id ? { ...g, fills } : o)) });
      } else setMessage('Hãy bấm vào một ô của lưới ô vuông để tô màu (vẽ lưới bằng công cụ "Lưới ô vuông").');
      return;
    }
    if (tool.startsWith('solid:') || tool === 'cubes' || tool === 'bars') {
      const at = snapGrid(w);
      const obj = tool === 'cubes' ? makeCubes(at.x, at.y) : tool === 'bars' ? makeBars(at.x + 80, at.y, BAR_TEMPLATES[0].rows) : makeSolid(tool.slice(6) as SolidKind, at.x, at.y);
      apply({ ...d, objects: [...d.objects, obj] });
      setSelected([obj.id]);
      setTool('select');
      setRightOpen(true);
      return;
    }
    if (tool === 'eraser') {
      if (hit && (hit.kind === 'point' || hit.kind === 'object')) {
        apply(deleteItems(d, [hit.id]));
        setSelected([]);
      }
      return;
    }
    if (tool === 'point') {
      const r = pointAt(d, w);
      if (r.doc !== d) apply(r.doc);
      setSelected([r.id]);
      return;
    }
    if (tool === 'segment' || tool === 'line' || tool === 'ray' || tool === 'rightMark' || tool === 'polygon') {
      if (draft.length === 0) draftStart.current = d;
      const r = pointAt(d, w);
      let next = r.doc;
      const ids = [...draft, r.id];
      if (tool === 'polygon') {
        if (draft.length >= 3 && r.id === draft[0]) {
          finishPolygon(draft);
          return;
        }
        if (draft.includes(r.id)) return;
        if (next !== d) live(next);
        setDraft(ids);
        return;
      }
      const need = tool === 'rightMark' ? 3 : 2;
      if (ids.length < need) {
        if (next !== d) live(next);
        setDraft(ids);
        return;
      }
      if (tool === 'rightMark') next = addObject(next, { type: 'rightMark', o: ids[0], a: ids[1], b: ids[2], size: 14, style: defaultStroke({ width: 2, stroke: ink.stroke }) } as GObject).doc;
      else next = connect(next, tool, ids[0], ids[1], { ...ink, fill: 'none' }).doc;
      // one undo step for the whole object, points included
      commitFrom(draftStart.current ?? d);
      live(next);
      draftStart.current = null;
      setDraft([]);
      return;
    }
    if (tool.startsWith('shape:') || tool === 'circle' || tool === 'cellGrid') {
      drag.current = { kind: 'create', tool, from: snapGrid(w) };
      setCreateBox({ from: snapGrid(w), to: snapGrid(w) });
      return;
    }
    if (tool === 'text') {
      const r = addObject(d, { type: 'text', x: w.x, y: w.y, text: 'Chú thích', fontSize: 22, color: ink.stroke, bold: false } as GObject);
      apply(r.doc);
      setSelected([r.id]);
      setTool('select');
      setRightOpen(true);
      window.setTimeout(() => textRef.current?.select(), 50);
    }
  };


  const onPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (pointers.current.has(e.pointerId)) pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch.current && pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      const p = pinch.current;
      const z = Math.max(0.15, Math.min(6, p.view.zoom * (dist(a, b) / Math.max(1, p.d))));
      const r = svgRef.current!.getBoundingClientRect();
      const mid = mul(add(a, b), 0.5);
      const wx = (p.mid.x - r.left - p.view.x) / p.view.zoom;
      const wy = (p.mid.y - r.top - p.view.y) / p.view.zoom;
      setView({ zoom: z, x: mid.x - r.left - wx * z, y: mid.y - r.top - wy * z });
      return;
    }
    const w = toWorld(e.clientX, e.clientY);
    setCursor(w);
    const dr = drag.current;
    if (!dr) return;
    switch (dr.kind) {
      case 'pan': {
        setView({ ...dr.view, x: dr.view.x + e.clientX - dr.sx, y: dr.view.y + e.clientY - dr.sy });
        break;
      }
      case 'point': {
        const d = docRef.current;
        const p = d.points.find((x) => x.id === dr.id);
        if (!p) break;
        const target = p.def.kind === 'free' && !e.altKey ? snapGrid(w) : w;
        const def = dragDef(p, target, resolve(d), d);
        if (def) {
          dr.moved = true;
          live({ ...d, points: d.points.map((x) => (x.id === p.id ? ({ ...x, def } as GPoint) : x)) });
        }
        break;
      }
      case 'move': {
        let delta = sub(w, dr.from);
        if (docRef.current.grid.snap && !e.altKey) {
          const g = docRef.current.grid.size;
          delta = { x: Math.round(delta.x / g) * g, y: Math.round(delta.y / g) * g };
        }
        if (Math.abs(delta.x) + Math.abs(delta.y) > 0) dr.moved = true;
        live(transformItems(dr.start, dr.ids, (v) => add(v, delta)));
        break;
      }
      case 'scale': {
        const f = Math.max(0.1, dist(w, dr.centre) / Math.max(1, dist(dr.from, dr.centre)));
        live(transformItems(dr.start, dr.ids, (v) => add(dr.centre, mul(sub(v, dr.centre), f)), f));
        break;
      }
      case 'rotate': {
        let a = Math.atan2(w.y - dr.centre.y, w.x - dr.centre.x) - Math.atan2(dr.from.y - dr.centre.y, dr.from.x - dr.centre.x);
        if (e.shiftKey || docRef.current.grid.snap) a = Math.round(a / (Math.PI / 12)) * (Math.PI / 12);
        live(transformItems(dr.start, dr.ids, (v) => add(dr.centre, rotateVec(sub(v, dr.centre), a)), 1, a));
        break;
      }
      case 'orbit': {
        const d = docRef.current;
        live({
          ...d,
          objects: d.objects.map((o) =>
            o.id === dr.id && o.type === 'solid'
              ? { ...o, spec: { ...o.spec, yaw: Math.round(dr.yaw + (e.clientX - dr.sx) * 0.5), pitch: Math.round(Math.max(-85, Math.min(85, dr.pitch + (e.clientY - dr.sy) * 0.4))) } }
              : o
          ),
        });
        break;
      }
      case 'marquee':
        setMarquee({ x: Math.min(dr.from.x, w.x), y: Math.min(dr.from.y, w.y), w: Math.abs(w.x - dr.from.x), h: Math.abs(w.y - dr.from.y) });
        break;
      case 'create':
        setCreateBox({ from: dr.from, to: snapGrid(w) });
        break;
    }
  };

  const onPointerUp = (e: React.PointerEvent<SVGSVGElement>) => {
    pointers.current.delete(e.pointerId);
    if (pinch.current) {
      if (pointers.current.size < 2) pinch.current = null;
      return;
    }
    const dr = drag.current;
    drag.current = null;
    if (!dr) return;
    const w = toWorld(e.clientX, e.clientY);
    switch (dr.kind) {
      case 'point':
      case 'move':
        if (dr.moved) commitFrom(dr.start);
        break;
      case 'scale':
      case 'rotate':
      case 'orbit':
        commitFrom(dr.start);
        break;
      case 'marquee': {
        const m = marquee;
        setMarquee(null);
        if (!m || m.w < 4 || m.h < 4) break;
        const d = docRef.current;
        const inside = (v: Vec) => v.x >= m.x && v.x <= m.x + m.w && v.y >= m.y && v.y <= m.y + m.h;
        const ids = [
          ...d.objects.filter((o) => {
            const b = bounds(d, pos, [o.id]);
            return b && inside({ x: b.x + 20, y: b.y + 20 }) && inside({ x: b.x + b.w - 20, y: b.y + b.h - 20 });
          }).map((o) => o.id),
        ];
        const pts = d.points.filter((p) => inside(pos.get(p.id)!)).map((p) => p.id);
        setSelected((s) => [...new Set([...(e.shiftKey ? s : []), ...(ids.length ? ids : pts)])]);
        break;
      }
      case 'create': {
        setCreateBox(null);
        const to = snapGrid(w);
        const small = Math.abs(to.x - dr.from.x) < 12 && Math.abs(to.y - dr.from.y) < 12;
        const d = docRef.current;
        if (dr.tool === 'cellGrid') {
          const g = d.grid.size;
          const x0 = Math.min(dr.from.x, to.x);
          const y0 = Math.min(dr.from.y, to.y);
          const cols = small ? 4 : Math.max(1, Math.min(30, Math.round(Math.abs(to.x - dr.from.x) / g)));
          const rows = small ? 3 : Math.max(1, Math.min(30, Math.round(Math.abs(to.y - dr.from.y) / g)));
          const obj = makeGrid(x0, y0, cols, rows, g);
          apply({ ...d, objects: [...d.objects, obj] });
          setSelected([obj.id]);
          setTool('paint');
        } else if (dr.tool === 'circle') {
          const through = small ? { x: dr.from.x + 3 * d.grid.size, y: dr.from.y } : to;
          const r = addCircle(d, dr.from, through, { ...ink });
          apply(r.doc);
          setSelected([r.id]);
        } else {
          const kind = dr.tool.slice(6) as ShapeKind;
          const box = small ? { x0: dr.from.x, y0: dr.from.y, x1: dr.from.x + 5 * d.grid.size, y1: dr.from.y + 3 * d.grid.size } : { x0: dr.from.x, y0: dr.from.y, x1: to.x, y1: to.y };
          const r = addShape(d, kind, box, { ...ink });
          apply(r.doc);
          setSelected([r.id]);
        }
        break;
      }
    }
  };

  const onWheel = useCallback((e: WheelEvent) => {
    e.preventDefault();
    const v = viewRef.current;
    const r = svgRef.current!.getBoundingClientRect();
    // pinch on a touchpad arrives as ctrl+wheel; two-finger scroll pans
    const trackpadScroll = !e.ctrlKey && e.deltaMode === 0 && (Math.abs(e.deltaX) > 0 || Math.abs(e.deltaY) < 40);
    if (trackpadScroll || e.shiftKey) {
      setView({ ...v, x: v.x - (e.shiftKey && !e.deltaX ? e.deltaY : e.deltaX), y: v.y - (e.shiftKey ? 0 : e.deltaY) });
      return;
    }
    const z = Math.max(0.15, Math.min(6, v.zoom * Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015))));
    const wx = (e.clientX - r.left - v.x) / v.zoom;
    const wy = (e.clientY - r.top - v.y) / v.zoom;
    setView({ zoom: z, x: e.clientX - r.left - wx * z, y: e.clientY - r.top - wy * z });
  }, []);
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [onWheel]);

  const zoomBy = (f: number) =>
    setView((v) => {
      const z = Math.max(0.15, Math.min(6, v.zoom * f));
      const cx = size.w / 2;
      const cy = size.h / 2;
      return { zoom: z, x: cx - ((cx - v.x) / v.zoom) * z, y: cy - ((cy - v.y) / v.zoom) * z };
    });

  // ------------------------------------------------------------ editing commands
  const removeSelected = useCallback(() => {
    if (!selected.length) return;
    apply(deleteItems(docRef.current, selected));
    setSelected([]);
  }, [selected, apply]);

  const duplicateSelected = useCallback(() => {
    if (!selected.length) return;
    const g = docRef.current.grid.size;
    const r = pasteClip(docRef.current, copyItems(docRef.current, selected), { x: g, y: g });
    apply(r.doc);
    setSelected(r.ids);
  }, [selected, apply]);

  const order = (front: boolean) => {
    const d = docRef.current;
    const chosen = d.objects.filter((o) => selected.includes(o.id));
    const rest = d.objects.filter((o) => !selected.includes(o.id));
    apply({ ...d, objects: front ? [...rest, ...chosen] : [...chosen, ...rest] });
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e.target)) return;
      const mod = e.ctrlKey || e.metaKey;
      const k = e.key.toLowerCase();
      if (mod && k === 'z') {
        e.preventDefault();
        (e.shiftKey ? redo : undo)?.();
      } else if (mod && k === 'y') {
        e.preventDefault();
        redo?.();
      } else if (mod && k === 'c' && selected.length) {
        clipboard.current = copyItems(docRef.current, selected);
      } else if (mod && k === 'x' && selected.length) {
        clipboard.current = copyItems(docRef.current, selected);
        removeSelected();
      } else if (mod && k === 'v' && clipboard.current) {
        e.preventDefault();
        const g = docRef.current.grid.size;
        const r = pasteClip(docRef.current, clipboard.current, { x: g, y: g });
        apply(r.doc);
        setSelected(r.ids);
      } else if (mod && k === 'd') {
        e.preventDefault();
        duplicateSelected();
      } else if (mod && k === 'a') {
        e.preventDefault();
        setSelected([...docRef.current.objects.map((o) => o.id)]);
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        removeSelected();
      } else if (e.key === 'Escape') {
        if (tool === 'polygon' && draft.length >= 3) finishPolygon(draft);
        else setDraft([]);
        draftStart.current = null;
        setSelected([]);
      } else if (e.key === 'Enter' && tool === 'polygon' && draft.length >= 3) {
        finishPolygon(draft);
      } else if (e.key.startsWith('Arrow') && selected.length) {
        e.preventDefault();
        const step = e.shiftKey ? docRef.current.grid.size : 2;
        const delta = { ArrowLeft: { x: -step, y: 0 }, ArrowRight: { x: step, y: 0 }, ArrowUp: { x: 0, y: -step }, ArrowDown: { x: 0, y: step } }[e.key]!;
        apply(transformItems(docRef.current, selected, (v) => add(v, delta)));
      } else if (!mod && !e.altKey) {
        const t = ALL_TOOLS.find((x) => x.key?.toLowerCase() === k);
        if (t) {
          setTool(t.id);
          setDraft([]);
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // ------------------------------------------------------------ export
  const exportAs = async (kind: 'png' | 'png-clear' | 'svg' | 'pdf-l' | 'pdf-p' | 'json') => {
    setExportOpen(false);
    const d = docRef.current;
    if (kind === 'json') {
      download(new Blob([JSON.stringify(d, null, 2)], { type: 'application/json' }), fileName(d.title, 'json'));
      return;
    }
    const onlyIds = exportOnly && selected.length ? new Set(selected.filter((id) => d.objects.some((o) => o.id === id))) : undefined;
    if (exportOnly && (!onlyIds || onlyIds.size === 0)) {
      setMessage('Hãy chọn ít nhất một hình để xuất riêng phần đang chọn.');
      return;
    }
    const opts = { only: onlyIds, grid: exportGrid, transparent: kind === 'png-clear' };
    try {
      if (kind === 'svg') {
        const s = drawingSvg(d, opts);
        if (!s) throw new Error('empty');
        download(new Blob([`<?xml version="1.0" encoding="UTF-8"?>\n${s.svg}`], { type: 'image/svg+xml;charset=utf-8' }), fileName(d.title, 'svg'));
      } else if (kind === 'png' || kind === 'png-clear') {
        const b = await drawingPng(d, opts);
        if (!b) throw new Error('empty');
        download(b, fileName(d.title, 'png'));
      } else {
        const b = await drawingPdf(d, kind === 'pdf-l' ? 'landscape' : 'portrait', opts);
        if (!b) throw new Error('empty');
        download(b, fileName(d.title, 'pdf'));
      }
      setMessage('');
    } catch {
      setMessage(d.points.length || d.objects.length ? 'Không xuất được tệp. Hãy thử lại.' : 'Bản vẽ đang trống, chưa có gì để xuất.');
    }
  };

  // ------------------------------------------------------------ preview of what is being drawn
  const preview = (() => {
    if (createBox) {
      const { from, to } = createBox;
      if (tool === 'circle') {
        return <circle cx={from.x} cy={from.y} r={dist(from, to)} fill="none" stroke="#1267E9" strokeDasharray="6 4" strokeWidth={1.5 / view.zoom} />;
      }
      return <rect x={Math.min(from.x, to.x)} y={Math.min(from.y, to.y)} width={Math.abs(to.x - from.x)} height={Math.abs(to.y - from.y)} fill="#EAF5FF" fillOpacity={0.5} stroke="#1267E9" strokeDasharray="6 4" strokeWidth={1.5 / view.zoom} />;
    }
    if (draft.length && cursor) {
      const pts = draft.map((id) => pos.get(id)!).filter(Boolean);
      const path = [...pts, cursor].map((v, i) => `${i ? 'L' : 'M'}${v.x},${v.y}`).join(' ');
      return <path d={path} fill="none" stroke="#1267E9" strokeWidth={2 / view.zoom} strokeDasharray="6 4" />;
    }
    return null;
  })();

  const hint: Record<string, string> = {
    select: 'Bấm để chọn (giữ Shift để chọn nhiều), kéo để di chuyển. Kéo nền để chọn theo vùng.',
    pan: 'Kéo để di chuyển vùng vẽ.',
    point: 'Bấm để đặt điểm: trên nền, trên cạnh, trên đường tròn hoặc tại chỗ hai đoạn cắt nhau.',
    segment: 'Bấm điểm đầu rồi điểm cuối (có thể là điểm có sẵn).',
    line: 'Bấm hai điểm mà đường thẳng đi qua.',
    ray: 'Bấm gốc của tia rồi một điểm trên tia.',
    rightMark: 'Bấm đỉnh góc vuông, rồi một điểm trên mỗi cạnh của góc.',
    polygon: 'Bấm lần lượt các đỉnh; bấm lại đỉnh đầu tiên (hoặc Enter) để khép hình.',
    circle: 'Kéo từ tâm ra để chọn bán kính (hoặc bấm một lần).',
    text: 'Bấm vào chỗ muốn đặt chữ.',
    eraser: 'Bấm vào điểm hoặc hình để xóa.',
    cellGrid: 'Kéo một khung theo lưới để tạo lưới ô vuông (hoặc bấm để tạo lưới 4 × 3).',
    paint: 'Bấm vào từng ô để tô màu; bấm lại để xóa màu. Đổi màu tô ở bảng bên phải.',
    bars: 'Bấm vào vùng vẽ để đặt sơ đồ đoạn thẳng, rồi sửa các thanh ở bảng bên phải.',
    cubes: 'Bấm vào vùng vẽ để đặt mô hình xếp khối, rồi thêm/bớt khối ở bảng bên phải.',
  };
  const currentHint = tool.startsWith('shape:')
    ? 'Kéo một khung trên vùng vẽ để vẽ hình (hoặc bấm một lần để vẽ cỡ mặc định).'
    : tool.startsWith('solid:')
      ? 'Bấm vào vùng vẽ để đặt khối. Xoay góc nhìn, đổi kích thước, nhãn đỉnh ở bảng bên phải.'
      : hint[tool];
  const iconBtn = 'flex h-9 w-9 items-center justify-center rounded-lg text-[#071A63] hover:bg-[#EAF5FF] disabled:opacity-35';

  return (
    <div className="flex flex-col gap-2">
      {/* ---- top bar */}
      <div className="flex flex-wrap items-center gap-1.5 rounded-2xl bg-white p-1.5 shadow-[var(--studio-shadow)] ring-1 ring-[#DCE7F3]">
        <button type="button" onClick={onLibrary} className={iconBtn} title="Thư viện bản vẽ" aria-label="Thư viện bản vẽ">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <input
          value={doc.title}
          maxLength={80}
          aria-label="Tên bản vẽ"
          onChange={(e) => liveTyping({ ...doc, title: e.target.value })}
          onBlur={commitTyping}
          className="min-w-[140px] flex-1 rounded-lg border-2 border-transparent bg-[#F6FAFF] px-2.5 py-1.5 font-display text-base font-extrabold text-[#071A63] focus:border-[#1267E9] focus:outline-none sm:max-w-[280px]"
        />
        <button type="button" onClick={onSaveNow} className={`studio-btn min-h-[36px] px-3 text-sm ${saveState.ok ? 'studio-btn-secondary' : 'studio-btn-danger'}`} title="Bản vẽ tự lưu trên máy này">
          <Save className="h-4 w-4" /> {saveState.ok ? saveState.message || 'Lưu' : 'Chưa lưu được'}
        </button>
        <span className="mx-0.5 h-6 w-px bg-[#DCE7F3]" />
        <button type="button" onClick={() => undo?.()} disabled={!undo} className={iconBtn} title="Hoàn tác (Ctrl+Z)" aria-label="Hoàn tác">
          <Undo2 className="h-5 w-5" />
        </button>
        <button type="button" onClick={() => redo?.()} disabled={!redo} className={iconBtn} title="Làm lại (Ctrl+Y)" aria-label="Làm lại">
          <Redo2 className="h-5 w-5" />
        </button>
        <span className="mx-0.5 h-6 w-px bg-[#DCE7F3]" />
        {(
          [
            ['Lưới', Grid3x3, doc.grid.show, () => apply({ ...doc, grid: { ...doc.grid, show: !doc.grid.show } })],
            ['Bắt dính lưới', Magnet, doc.grid.snap, () => apply({ ...doc, grid: { ...doc.grid, snap: !doc.grid.snap } })],
            ['Tên điểm', Tag, doc.showNames, () => apply({ ...doc, showNames: !doc.showNames })],
            ['Số đo', Ruler, doc.showLengths, () => apply({ ...doc, showLengths: !doc.showLengths })],
          ] as const
        ).map(([label, Icon, on, click]) => (
          <button
            key={label}
            type="button"
            onClick={click}
            aria-pressed={on}
            title={label}
            className={`inline-flex h-9 items-center gap-1 rounded-lg px-2 text-xs font-bold ${on ? 'bg-[#EAF5FF] text-[#1267E9] ring-1 ring-[#BFD6EE]' : 'text-[#5E6C84] hover:bg-[#F6FAFF]'}`}
          >
            <Icon className="h-4 w-4" /> <span className="hidden 2xl:inline">{label}</span>
          </button>
        ))}
        <select
          value={doc.grid.size}
          onChange={(e) => apply({ ...doc, grid: { ...doc.grid, size: Number(e.target.value) } })}
          aria-label="Cỡ ô lưới"
          title="Cỡ ô lưới (1 ô = 1 cm)"
          className="h-9 rounded-lg border border-[#DCE7F3] bg-white px-1.5 text-xs font-bold text-[#071A63]"
        >
          {[20, 30, 40, 50, 60].map((s) => (
            <option key={s} value={s}>
              Ô {s}px
            </option>
          ))}
        </select>
        <span className="mx-0.5 h-6 w-px bg-[#DCE7F3]" />
        <button type="button" onClick={() => zoomBy(1 / 1.25)} className={iconBtn} aria-label="Thu nhỏ" title="Thu nhỏ">
          <ZoomOut className="h-5 w-5" />
        </button>
        <span className="w-11 text-center text-xs font-bold text-[#5E6C84]">{Math.round(view.zoom * 100)}%</span>
        <button type="button" onClick={() => zoomBy(1.25)} className={iconBtn} aria-label="Phóng to" title="Phóng to">
          <ZoomIn className="h-5 w-5" />
        </button>
        <button type="button" onClick={() => fit()} className={iconBtn} aria-label="Xem toàn bộ hình" title="Xem toàn bộ hình">
          <Crosshair className="h-5 w-5" />
        </button>
        <div className="relative ml-auto flex items-center gap-1.5">
          {!rightOpen && (
            <button type="button" onClick={() => setRightOpen(true)} className="studio-btn studio-btn-secondary min-h-[36px] px-3 text-sm">
              <PanelRightOpen className="h-4 w-4" /> Thuộc tính
            </button>
          )}
          <button type="button" onClick={onImport} className="studio-btn studio-btn-secondary min-h-[36px] px-3 text-sm" title="Mở tệp JSON">
            <FolderOpen className="h-4 w-4" /> <span className="hidden xl:inline">Mở JSON</span>
          </button>
          <button type="button" onClick={() => setExportOpen((o) => !o)} aria-expanded={exportOpen} className="studio-btn studio-btn-primary min-h-[36px] px-3 text-sm">
            <Download className="h-4 w-4" /> Xuất file
          </button>
          {exportOpen && (
            <div className="absolute right-0 top-11 z-30 w-64 space-y-1 rounded-2xl bg-white p-2 shadow-xl ring-1 ring-[#DCE7F3]">
              {(
                [
                  ['png', 'Ảnh PNG nền trắng', ImageDown],
                  ['png-clear', 'Ảnh PNG nền trong suốt', ImageDown],
                  ['svg', 'Ảnh SVG (nét sắc mọi cỡ)', Spline],
                  ['pdf-l', 'PDF A4 ngang', FileText],
                  ['pdf-p', 'PDF A4 dọc', FileText],
                  ['json', 'Tệp JSON (để sửa tiếp)', FileJson],
                ] as const
              ).map(([k, l, Icon]) => (
                <button key={k} type="button" onClick={() => exportAs(k)} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm font-bold text-[#071A63] hover:bg-[#EAF5FF]">
                  <Icon className="h-4 w-4 text-[#1267E9]" /> {l}
                </button>
              ))}
              <label className="flex items-center gap-2 px-2.5 pt-1 text-xs font-bold text-[#5E6C84]">
                <input type="checkbox" checked={exportOnly} onChange={(e) => setExportOnly(e.target.checked)} className="h-4 w-4 accent-[#1267E9]" />
                Chỉ xuất hình đang chọn
              </label>
              <label className="flex items-center gap-2 px-2.5 pb-1 text-xs font-bold text-[#5E6C84]">
                <input type="checkbox" checked={exportGrid} onChange={(e) => setExportGrid(e.target.checked)} className="h-4 w-4 accent-[#1267E9]" />
                Xuất kèm lưới ô vuông
              </label>
            </div>
          )}
        </div>
      </div>

      {(message || !saveState.ok) && (
        <p className="flex items-center justify-between gap-2 rounded-xl bg-[#FFF8E1] px-3 py-1.5 text-sm font-bold text-[#7A5200]">
          {message || saveState.message}
          {message && (
            <button type="button" onClick={() => setMessage('')} className="text-xs underline">
              Đóng
            </button>
          )}
        </p>
      )}

      <div className="grid gap-2" style={{ gridTemplateColumns: `${leftOpen ? '176px' : '44px'} minmax(0,1fr)${rightOpen ? ' 300px' : ''}` }}>
        {/* ---- tools */}
        <aside className={`overflow-y-auto rounded-2xl bg-white p-1.5 shadow-[var(--studio-shadow)] ring-1 ring-[#DCE7F3] ${presenting ? 'max-h-[calc(100vh-190px)]' : 'max-h-[72vh]'}`}>
          <button
            type="button"
            onClick={() => setLeftOpen((o) => !o)}
            className="mb-1 flex h-8 w-full items-center justify-center rounded-lg text-[#5E6C84] hover:bg-[#F6FAFF]"
            aria-label={leftOpen ? 'Thu gọn thanh công cụ' : 'Mở thanh công cụ'}
            title={leftOpen ? 'Thu gọn' : 'Mở rộng'}
          >
            {leftOpen ? <PanelLeftClose className="h-4 w-4" /> : <PanelLeftOpen className="h-4 w-4" />}
          </button>
          {TOOL_GROUPS.map((g) => (
            <div key={g.title} className="mb-1.5">
              {leftOpen && <div className="px-1.5 pb-0.5 pt-1 text-[10px] font-bold uppercase tracking-wide text-[#5E6C84]">{g.title}</div>}
              {g.tools.map((t) => {
                const on = tool === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => {
                      setTool(t.id);
                      setDraft([]);
                      draftStart.current = null;
                    }}
                    aria-pressed={on}
                    title={`${t.label}${t.key ? ` (${t.key})` : ''}`}
                    className={`mb-0.5 flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[13px] font-bold ${on ? 'bg-[#071A63] text-white' : 'text-[#071A63] hover:bg-[#EAF5FF]'}`}
                  >
                    <t.icon className="h-[18px] w-[18px] shrink-0" />
                    {leftOpen && <span className="truncate">{t.label}</span>}
                  </button>
                );
              })}
            </div>
          ))}
          {tool === 'polygon' && draft.length >= 3 && leftOpen && (
            <button type="button" onClick={() => finishPolygon(draft)} className="studio-btn studio-btn-primary min-h-[34px] w-full text-sm">
              Khép hình
            </button>
          )}
        </aside>

        {/* ---- canvas */}
        <div className="flex min-w-0 flex-col gap-1">
          <div
            ref={wrapRef}
            className={`relative overflow-hidden rounded-2xl border border-[#DCE7F3] bg-white ${presenting ? 'h-[calc(100vh-190px)]' : 'h-[72vh] min-h-[460px]'}`}
            style={{ touchAction: 'none' }}
          >
            <svg
              ref={svgRef}
              width={size.w}
              height={size.h}
              className={`block select-none ${tool === 'pan' ? 'cursor-grab' : tool === 'select' ? 'cursor-default' : 'cursor-crosshair'}`}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
              onContextMenu={(e) => e.preventDefault()}
              onDoubleClick={(e) => {
                const hit = hitOf(e as unknown as React.PointerEvent);
                if (tool === 'polygon' && draft.length >= 3) finishPolygon(draft);
                else if (hit?.kind === 'point') {
                  setRightOpen(true);
                  window.setTimeout(() => nameRef.current?.select(), 30);
                } else if (hit?.kind === 'object' && doc.objects.find((o) => o.id === hit.id)?.type === 'text') {
                  setRightOpen(true);
                  window.setTimeout(() => textRef.current?.select(), 30);
                }
              }}
              role="img"
              aria-label="Vùng vẽ"
            >
              <g transform={`translate(${view.x} ${view.y}) scale(${view.zoom})`}>
                {doc.grid.show && <GridLayer area={area} size={doc.grid.size} zoom={view.zoom} />}
                <Scene doc={doc} pos={pos} area={area} interactive selected={selSet} zoom={view.zoom} />
                {preview}
                {marquee && <rect x={marquee.x} y={marquee.y} width={marquee.w} height={marquee.h} fill="#1267E9" fillOpacity={0.08} stroke="#1267E9" strokeDasharray="5 4" strokeWidth={1 / view.zoom} />}
                {selBounds && (
                  <g>
                    <rect x={selBounds.x} y={selBounds.y} width={selBounds.w} height={selBounds.h} fill="none" stroke="#1267E9" strokeDasharray="6 4" strokeWidth={1.2 / view.zoom} pointerEvents="none" />
                    <line x1={selBounds.x + selBounds.w / 2} y1={selBounds.y} x2={selBounds.x + selBounds.w / 2} y2={selBounds.y - 26 / view.zoom} stroke="#1267E9" strokeWidth={1.2 / view.zoom} pointerEvents="none" />
                    <circle data-hit="rotate" cx={selBounds.x + selBounds.w / 2} cy={selBounds.y - 26 / view.zoom} r={8 / view.zoom} fill="#FFFFFF" stroke="#1267E9" strokeWidth={2 / view.zoom} style={{ cursor: 'grab' }}>
                      <title>Kéo để xoay</title>
                    </circle>
                    <rect
                      data-hit="scale"
                      x={selBounds.x + selBounds.w - 7 / view.zoom}
                      y={selBounds.y + selBounds.h - 7 / view.zoom}
                      width={14 / view.zoom}
                      height={14 / view.zoom}
                      fill="#FFFFFF"
                      stroke="#1267E9"
                      strokeWidth={2 / view.zoom}
                      style={{ cursor: 'nwse-resize' }}
                    >
                      <title>Kéo để phóng to / thu nhỏ hình</title>
                    </rect>
                  </g>
                )}
              </g>
            </svg>
            {!doc.points.length && !doc.objects.length && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-center text-sm font-bold text-[#5E6C84]">
                Chọn một công cụ bên trái rồi vẽ trên vùng này
              </div>
            )}
          </div>
          <p className="truncate px-1 text-xs text-[#5E6C84]">{currentHint}</p>
        </div>

        {/* ---- properties */}
        {rightOpen && (
          <aside className={`overflow-y-auto rounded-2xl bg-white p-3 shadow-[var(--studio-shadow)] ring-1 ring-[#DCE7F3] ${presenting ? 'max-h-[calc(100vh-190px)]' : 'max-h-[72vh]'}`}>
            <button type="button" onClick={() => setRightOpen(false)} className="mb-2 flex h-8 w-full items-center justify-end gap-1 rounded-lg px-2 text-xs font-bold text-[#5E6C84] hover:bg-[#F6FAFF]">
              Thu gọn <PanelRightClose className="h-4 w-4" />
            </button>
            <PropertiesPanel
              doc={doc}
              selected={selected}
              apply={apply}
              live={liveTyping}
              commit={commitTyping}
              onSelect={setSelected}
              onDuplicate={duplicateSelected}
              onDelete={removeSelected}
              onOrder={order}
              textRef={textRef}
              nameRef={nameRef}
              ink={ink}
              setInk={(p) => setInkState((s) => ({ ...s, ...p }))}
              orbit={orbit}
              setOrbit={setOrbit}
              paintColor={paintColor}
              setPaintColor={setPaintColor}
              onPaintTool={() => setTool('paint')}
            />
          </aside>
        )}
      </div>
    </div>
  );
};
