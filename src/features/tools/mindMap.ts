/**
 * Data model and pure helpers for "Sơ đồ tư duy Mimo". Maps live in the
 * teacher's browser (autosave) or in JSON files – nothing goes to Firestore.
 * A map is a tree: nodes with a parentId; edges are derived from it.
 */

export type MindShape = 'rounded' | 'circle' | 'ellipse';

export interface MindNode {
  id: string;
  parentId: string | null;
  label: string;
  /** Branch colour: border, edge and (for the centre and main branches) the default fill. */
  color: string;
  icon?: string;
  x: number;
  y: number;
  shape?: MindShape;
  /** Text size in px; default depends on the level. */
  fontSize?: number;
  /** Bold text (default true). */
  bold?: boolean;
  /** Background colour; default: branch colour for centre/main branches, white below. */
  fill?: string;
  /** Picture shown above the text (data URL, already shrunk). */
  image?: string;
  /** "Học sinh hoàn thiện": shown as ? until the teacher reveals it. The text is kept. */
  hidden?: boolean;
}

export type MindLayout = 'radial' | 'both' | 'tree';
export type MindEdgeStyle = 'curve' | 'straight' | 'step';

export interface MindMapDoc {
  format: 'mimoedu-mindmap';
  version: 1;
  title: string;
  layout: MindLayout;
  edgeStyle: MindEdgeStyle;
  nodes: MindNode[];
}

export const MIND_COLORS = ['#1267E9', '#FF76B5', '#FFB800', '#7B5CFF', '#13B5C9', '#22C38E', '#E5484D', '#071A63'];
export const MIND_FILLS = ['#FFFFFF', '#EAF5FF', '#FFF0F7', '#FFF8E1', '#F1EDFF', '#E6FAFC', '#EAFBF4', '#FFEEF0'];
export const MIND_ICONS = ['⭐', '💡', '❓', '✅', '❗', '📏', '🔢', '➕', '➖', '✖️', '➗', '🟰', '🕒', '💰', '📐', '🧮', '🎯', '📝', '🌡️', '⚖️', '🥛', '🍕', '⭕', '🔺'];
/** Quick-insert symbols for Toán lớp 3. */
export const MATH_SYMBOLS = ['+', '−', '×', ':', '=', '<', '>', '≤', '≥', '½', '⅓', '¼', '⅕', '⅙', '⅛', '…', 'cm', 'dm', 'mm', 'm', 'km', 'cm²', 'g', 'kg', 'ml', 'l', '°C', 'giờ', 'phút', 'đồng'];
export const ROOT_COLOR = '#071A63';
export const DEFAULT_FONT = [26, 20, 17] as const;
export const FONT_SIZES = [14, 17, 20, 24, 28, 34];

let counter = 0;
export const newNodeId = () => `n${Date.now().toString(36)}${(counter++).toString(36)}`;

export function rootOf(doc: MindMapDoc): MindNode {
  return doc.nodes.find((n) => n.parentId === null)!;
}

export function childrenOf(doc: MindMapDoc, id: string): MindNode[] {
  return doc.nodes.filter((n) => n.parentId === id);
}

export function descendantIds(doc: MindMapDoc, id: string): string[] {
  const out: string[] = [];
  const stack = [id];
  while (stack.length) {
    const cur = stack.pop()!;
    for (const c of childrenOf(doc, cur)) {
      out.push(c.id);
      stack.push(c.id);
    }
  }
  return out;
}

export function depthOf(doc: MindMapDoc, id: string): number {
  let d = 0;
  let cur = doc.nodes.find((n) => n.id === id);
  while (cur?.parentId) {
    d += 1;
    cur = doc.nodes.find((n) => n.id === cur!.parentId);
  }
  return d;
}

export function fontSizeOf(node: MindNode, depth: number): number {
  return node.fontSize ?? DEFAULT_FONT[Math.min(depth, 2)];
}

/** Approximate on-screen size of a node, used by the layouts when the real size is not known yet. */
export function estimateSize(node: MindNode, depth: number): { w: number; h: number } {
  const font = fontSizeOf(node, depth);
  const charW = font * 0.58;
  const maxText = 240;
  const padX = depth === 0 ? 56 : 36;
  const padY = depth === 0 ? 40 : 24;
  const lines = (node.label || '…').split('\n');
  let rows = 0;
  let widest = 0;
  for (const line of lines) {
    const w = Math.max(1, line.length + (node.icon ? 2 : 0)) * charW;
    rows += Math.max(1, Math.ceil(w / maxText));
    widest = Math.max(widest, Math.min(w, maxText));
  }
  let w = widest + padX;
  let h = rows * font * 1.35 + padY + (node.image ? 96 : 0);
  if (node.image) w = Math.max(w, 140);
  if (node.shape === 'circle') w = h = Math.max(w, h, 110);
  if (node.shape === 'ellipse') {
    w *= 1.25;
    h *= 1.3;
  }
  return { w, h };
}

export type SizeMap = Map<string, { w: number; h: number }>;

function sizesFor(doc: MindMapDoc, measured?: SizeMap): SizeMap {
  const out: SizeMap = new Map();
  for (const n of doc.nodes) out.set(n.id, measured?.get(n.id) ?? estimateSize(n, depthOf(doc, n.id)));
  return out;
}

export function createMindMap(title: string, layout: MindLayout = 'radial', branches: string[] = []): MindMapDoc {
  let doc: MindMapDoc = {
    format: 'mimoedu-mindmap',
    version: 1,
    title: title.trim() || 'Chủ đề',
    layout,
    edgeStyle: 'curve',
    nodes: [{ id: newNodeId(), parentId: null, label: title.trim() || 'Chủ đề', color: ROOT_COLOR, x: 0, y: 0 }],
  };
  for (const b of branches) doc = addChild(doc, rootOf(doc).id, b).doc;
  return autoLayout(doc);
}

/** Adds a child; main branches get the next palette colour, deeper nodes inherit their branch colour. */
export function addChild(doc: MindMapDoc, parentId: string, label = 'Ý mới'): { doc: MindMapDoc; id: string } {
  const parent = doc.nodes.find((n) => n.id === parentId);
  if (!parent) return { doc, id: '' };
  const siblings = childrenOf(doc, parentId);
  const color = parent.parentId === null ? MIND_COLORS[siblings.length % (MIND_COLORS.length - 1)] : parent.color;
  const angle = siblings.length * 0.9;
  const side = parent.x < rootOf(doc).x ? -1 : 1;
  const node: MindNode = {
    id: newNodeId(),
    parentId,
    label,
    color,
    x: parent.x + (parent.parentId === null ? Math.cos(angle) * 260 : side * 240),
    y: parent.y + (parent.parentId === null ? Math.sin(angle) * 180 : siblings.length * 70),
  };
  return { doc: { ...doc, nodes: [...doc.nodes, node] }, id: node.id };
}

export function updateNode(doc: MindMapDoc, id: string, patch: Partial<Omit<MindNode, 'id' | 'parentId'>>): MindMapDoc {
  const nodes = doc.nodes.map((n) => {
    if (n.id !== id) return n;
    const next = { ...n, ...patch };
    // undefined in a patch means "back to default": drop the key so JSON stays clean
    for (const k of Object.keys(patch) as (keyof MindNode)[]) if (next[k] === undefined) delete next[k];
    return next;
  });
  const root = nodes.find((n) => n.parentId === null)!;
  return { ...doc, nodes, title: root.id === id && patch.label !== undefined ? patch.label.split('\n')[0] : doc.title };
}

/** Recolours a node and everything under it. */
export function recolorBranch(doc: MindMapDoc, id: string, color: string): MindMapDoc {
  const ids = new Set([id, ...descendantIds(doc, id)]);
  return { ...doc, nodes: doc.nodes.map((n) => (ids.has(n.id) && n.parentId !== null ? { ...n, color } : n)) };
}

/** Deletes a node with its whole branch. The central topic cannot be deleted. */
export function deleteNode(doc: MindMapDoc, id: string): MindMapDoc {
  const node = doc.nodes.find((n) => n.id === id);
  if (!node || node.parentId === null) return doc;
  const gone = new Set([id, ...descendantIds(doc, id)]);
  return { ...doc, nodes: doc.nodes.filter((n) => !gone.has(n.id)) };
}

/** Copies a branch (with all its sub-branches) next to the original. Returns the copy's id. */
export function duplicateBranch(doc: MindMapDoc, id: string): { doc: MindMapDoc; id: string } {
  const node = doc.nodes.find((n) => n.id === id);
  if (!node || node.parentId === null) return { doc, id: '' };
  const ids = [id, ...descendantIds(doc, id)];
  const map = new Map(ids.map((old) => [old, newNodeId()]));
  const copies = doc.nodes
    .filter((n) => map.has(n.id))
    .map((n) => ({ ...n, id: map.get(n.id)!, parentId: n.id === id ? n.parentId : map.get(n.parentId!)!, x: n.x + 40, y: n.y + 90 }));
  // insert right after the original branch so the copy sits next to it in every layout
  const at = doc.nodes.findIndex((n) => n.id === id);
  const nodes = [...doc.nodes.slice(0, at + 1), ...copies, ...doc.nodes.slice(at + 1)];
  return { doc: { ...doc, nodes }, id: map.get(id)! };
}

const GAP_X = 70;
const GAP_Y = 22;

/** Height a subtree needs when its children are stacked vertically. */
function subtreeHeights(doc: MindMapDoc, sizes: SizeMap): Map<string, number> {
  const memo = new Map<string, number>();
  const calc = (id: string): number => {
    const kids = childrenOf(doc, id);
    const own = sizes.get(id)!.h + GAP_Y;
    const sum = kids.reduce((s, k) => s + calc(k.id), 0);
    const v = Math.max(own, sum);
    memo.set(id, v);
    return v;
  };
  calc(rootOf(doc).id);
  return memo;
}

/** Lays children of `id` out to one side (dir = 1 right, -1 left), stacked without overlap. */
function placeSide(
  doc: MindMapDoc,
  sizes: SizeMap,
  heights: Map<string, number>,
  pos: Map<string, { x: number; y: number }>,
  kids: MindNode[],
  parentX: number,
  parentW: number,
  centerY: number,
  dir: 1 | -1
) {
  const total = kids.reduce((s, k) => s + heights.get(k.id)!, 0);
  // all children of one parent share a column: as far out as the widest of them needs
  const colW = Math.max(...kids.map((k) => sizes.get(k.id)!.w), 0);
  const x = parentX + dir * (parentW / 2 + GAP_X + colW / 2);
  let y = centerY - total / 2;
  for (const k of kids) {
    const h = heights.get(k.id)!;
    const cy = y + h / 2;
    pos.set(k.id, { x, y: cy });
    const grand = childrenOf(doc, k.id);
    if (grand.length) placeSide(doc, sizes, heights, pos, grand, x, colW, cy, dir);
    y += h;
  }
}

/** Tree: centre on the left, all branches to the right. */
function layoutTree(doc: MindMapDoc, sizes: SizeMap): Map<string, { x: number; y: number }> {
  const heights = subtreeHeights(doc, sizes);
  const pos = new Map<string, { x: number; y: number }>();
  const root = rootOf(doc);
  pos.set(root.id, { x: 0, y: 0 });
  const kids = childrenOf(doc, root.id);
  if (kids.length) placeSide(doc, sizes, heights, pos, kids, 0, sizes.get(root.id)!.w, 0, 1);
  return pos;
}

/** Left/right: main branches split between both sides so the two halves have similar height. */
function layoutBoth(doc: MindMapDoc, sizes: SizeMap): Map<string, { x: number; y: number }> {
  const heights = subtreeHeights(doc, sizes);
  const pos = new Map<string, { x: number; y: number }>();
  const root = rootOf(doc);
  pos.set(root.id, { x: 0, y: 0 });
  const kids = childrenOf(doc, root.id);
  const right: MindNode[] = [];
  const left: MindNode[] = [];
  let hr = 0;
  // keep the teacher's order: first half (by height) right, rest left
  const total = kids.reduce((s, k) => s + heights.get(k.id)!, 0);
  for (const k of kids) {
    const h = heights.get(k.id)!;
    if (right.length === 0 || hr + h / 2 <= total / 2) {
      right.push(k);
      hr += h;
    } else left.push(k);
  }
  const rw = sizes.get(root.id)!.w;
  if (right.length) placeSide(doc, sizes, heights, pos, right, 0, rw, 0, 1);
  if (left.length) placeSide(doc, sizes, heights, pos, left, 0, rw, 0, -1);
  return pos;
}

function leafCount(doc: MindMapDoc, id: string): number {
  const kids = childrenOf(doc, id);
  return kids.length === 0 ? 1 : kids.reduce((s, k) => s + leafCount(doc, k.id), 0);
}

/** Radial: each main branch gets an angular sector proportional to its leaves; rings grow until nothing overlaps. */
function layoutRadial(doc: MindMapDoc, sizes: SizeMap): Map<string, { x: number; y: number }> {
  const root = rootOf(doc);
  const depthMax = Math.max(...doc.nodes.map((n) => depthOf(doc, n.id)));
  const ringW: number[] = [];
  for (const n of doc.nodes) {
    const d = depthOf(doc, n.id);
    ringW[d] = Math.max(ringW[d] ?? 0, Math.max(sizes.get(n.id)!.w, sizes.get(n.id)!.h * 1.6));
  }
  const radii: number[] = [0];
  for (let d = 1; d <= depthMax; d++) radii[d] = radii[d - 1] + (ringW[d - 1] ?? 0) / 2 + (ringW[d] ?? 0) / 2 + 60;

  const compute = () => {
    const pos = new Map<string, { x: number; y: number }>();
    pos.set(root.id, { x: 0, y: 0 });
    const place = (id: string, depth: number, from: number, to: number) => {
      const kids = childrenOf(doc, id);
      const total = kids.reduce((s, k) => s + leafCount(doc, k.id), 0) || 1;
      let start = from;
      for (const k of kids) {
        const span = ((to - from) * leafCount(doc, k.id)) / total;
        const mid = start + span / 2;
        pos.set(k.id, { x: Math.cos(mid) * radii[depth], y: Math.sin(mid) * radii[depth] * 0.82 });
        place(k.id, depth + 1, start, start + span);
        start += span;
      }
    };
    place(root.id, 1, -Math.PI / 2, (3 * Math.PI) / 2);
    return pos;
  };

  let pos = compute();
  for (let i = 0; i < 40; i++) {
    const bad = overlappingDepths(doc, sizes, pos);
    if (bad.size === 0) break;
    // push the crowded rings (and everything outside them) further out
    const first = Math.min(...bad);
    for (let d = first; d <= depthMax; d++) radii[d] *= 1.12;
    pos = compute();
  }
  return pos;
}

function overlappingDepths(doc: MindMapDoc, sizes: SizeMap, pos: Map<string, { x: number; y: number }>): Set<number> {
  const out = new Set<number>();
  const list = doc.nodes.map((n) => ({ n, p: pos.get(n.id)!, s: sizes.get(n.id)!, d: depthOf(doc, n.id) }));
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const a = list[i];
      const b = list[j];
      if (Math.abs(a.p.x - b.p.x) * 2 < a.s.w + b.s.w + 16 && Math.abs(a.p.y - b.p.y) * 2 < a.s.h + b.s.h + 10) {
        out.add(Math.max(a.d, b.d));
      }
    }
  }
  return out;
}

/** Overlapping node pairs (for checks); uses estimated sizes unless measured ones are given. */
export function findOverlaps(doc: MindMapDoc, measured?: SizeMap): [string, string][] {
  const sizes = sizesFor(doc, measured);
  const out: [string, string][] = [];
  for (let i = 0; i < doc.nodes.length; i++) {
    for (let j = i + 1; j < doc.nodes.length; j++) {
      const a = doc.nodes[i];
      const b = doc.nodes[j];
      const sa = sizes.get(a.id)!;
      const sb = sizes.get(b.id)!;
      if (Math.abs(a.x - b.x) * 2 < sa.w + sb.w && Math.abs(a.y - b.y) * 2 < sa.h + sb.h) out.push([a.id, b.id]);
    }
  }
  return out;
}

/** Re-arranges the whole map without overlaps; `measured` are real node sizes from the canvas when known. */
export function autoLayout(doc: MindMapDoc, layout: MindLayout = doc.layout, measured?: SizeMap): MindMapDoc {
  const next = { ...doc, layout };
  const sizes = sizesFor(next, measured);
  const pos = layout === 'tree' ? layoutTree(next, sizes) : layout === 'both' ? layoutBoth(next, sizes) : layoutRadial(next, sizes);
  return { ...next, nodes: next.nodes.map((n) => ({ ...n, x: Math.round(pos.get(n.id)!.x), y: Math.round(pos.get(n.id)!.y) })) };
}

/** Order in which hidden branches are revealed while presenting: level by level. */
export function revealOrder(doc: MindMapDoc): string[] {
  const order: string[] = [];
  let level = [rootOf(doc).id];
  while (level.length) {
    const next = level.flatMap((id) => childrenOf(doc, id).map((c) => c.id));
    order.push(...next);
    level = next;
  }
  return order;
}

/**
 * Presentation steps: each main branch on its own, then each of its
 * sub-branches together with everything under it, branch after branch.
 */
export function presentationSteps(doc: MindMapDoc): string[][] {
  const steps: string[][] = [];
  for (const main of childrenOf(doc, rootOf(doc).id)) {
    steps.push([main.id]);
    for (const sub of childrenOf(doc, main.id)) steps.push([sub.id, ...descendantIds(doc, sub.id)]);
  }
  return steps;
}

/** Nodes visible after `count` presentation steps (the centre is always shown). */
export function visibleAfter(doc: MindMapDoc, steps: string[][], count: number): Set<string> {
  return new Set([rootOf(doc).id, ...steps.slice(0, count).flat()]);
}

const isColor = (v: unknown): v is string => typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v);
const MAX_IMAGE = 1_500_000;

/** Validates an imported JSON file; returns the map or a Vietnamese error message. */
export function parseMindMap(json: unknown): MindMapDoc | string {
  if (typeof json !== 'object' || json === null) return 'Tệp không phải sơ đồ tư duy.';
  const d = json as Partial<MindMapDoc>;
  if (d.format !== 'mimoedu-mindmap' || d.version !== 1) return 'Tệp không phải sơ đồ tư duy MimoEDU (thiếu format/version).';
  if (!Array.isArray(d.nodes) || d.nodes.length === 0) return 'Sơ đồ không có nút nào.';
  const ids = new Set<string>();
  for (const n of d.nodes) {
    if (!n || typeof n.id !== 'string' || typeof n.label !== 'string' || typeof n.x !== 'number' || typeof n.y !== 'number') {
      return 'Có nút thiếu thông tin (id, nội dung hoặc vị trí).';
    }
    if (ids.has(n.id)) return `Mã nút "${n.id}" bị trùng.`;
    ids.add(n.id);
  }
  const roots = d.nodes.filter((n) => n.parentId === null);
  if (roots.length !== 1) return 'Sơ đồ phải có đúng một chủ đề trung tâm.';
  if (d.nodes.some((n) => n.parentId !== null && !ids.has(n.parentId as string))) return 'Có nhánh nối tới nút không tồn tại.';
  const doc: MindMapDoc = {
    format: 'mimoedu-mindmap',
    version: 1,
    title: typeof d.title === 'string' ? d.title : roots[0].label,
    layout: d.layout === 'tree' || d.layout === 'both' ? d.layout : 'radial',
    edgeStyle: d.edgeStyle === 'straight' || d.edgeStyle === 'step' ? d.edgeStyle : 'curve',
    nodes: d.nodes.map((n) => ({
      id: n.id,
      parentId: n.parentId ?? null,
      label: n.label.slice(0, 300),
      color: isColor(n.color) ? n.color : ROOT_COLOR,
      ...(typeof n.icon === 'string' && n.icon ? { icon: n.icon.slice(0, 8) } : {}),
      x: n.x,
      y: n.y,
      ...(n.shape === 'circle' || n.shape === 'ellipse' ? { shape: n.shape } : {}),
      ...(typeof n.fontSize === 'number' && n.fontSize >= 10 && n.fontSize <= 60 ? { fontSize: n.fontSize } : {}),
      ...(n.bold === false ? { bold: false } : {}),
      ...(isColor(n.fill) ? { fill: n.fill } : {}),
      ...(typeof n.image === 'string' && n.image.startsWith('data:image/') && n.image.length <= MAX_IMAGE ? { image: n.image } : {}),
      ...(n.hidden === true ? { hidden: true } : {}),
    })),
  };
  // Reject cycles: every node must reach the root
  for (const n of doc.nodes) {
    let cur: MindNode | undefined = n;
    for (let steps = 0; cur?.parentId; steps++) {
      if (steps > doc.nodes.length) return 'Sơ đồ có vòng lặp giữa các nhánh.';
      cur = doc.nodes.find((x) => x.id === cur!.parentId);
    }
  }
  return doc;
}

/** Nodes a branch may be moved under (not itself or its own descendants). */
export function possibleParents(doc: MindMapDoc, id: string): MindNode[] {
  const blocked = new Set([id, ...descendantIds(doc, id)]);
  return doc.nodes.filter((n) => !blocked.has(n.id));
}

/** Moves a branch under another node; a moved branch takes the colour of its new main branch. */
export function moveNode(doc: MindMapDoc, id: string, newParentId: string): MindMapDoc {
  const node = doc.nodes.find((n) => n.id === id);
  const parent = doc.nodes.find((n) => n.id === newParentId);
  if (!node || !parent || node.parentId === null || !possibleParents(doc, id).some((p) => p.id === newParentId)) return doc;
  const moved = { ...doc, nodes: doc.nodes.map((n) => (n.id === id ? { ...n, parentId: newParentId, x: parent.x + 240, y: parent.y + 40 } : n)) };
  return parent.parentId === null ? moved : recolorBranch(moved, id, parent.color);
}

// ------------------------------------------------------------------ templates

type Spec = [string, Spec[]?];

function fromSpec(title: string, branches: Spec[], layout: MindLayout = 'radial'): MindMapDoc {
  let doc = createMindMap(title, layout);
  const add = (parentId: string, spec: Spec) => {
    const r = addChild(doc, parentId, spec[0]);
    doc = r.doc;
    for (const s of spec[1] ?? []) add(r.id, s);
  };
  for (const b of branches) add(rootOf(doc).id, b);
  return autoLayout(doc);
}

export interface MindTemplate {
  id: string;
  name: string;
  build: () => MindMapDoc;
}

/** Ready-made Toán lớp 3 maps: a starting point, every word can be changed. */
export const MIND_TEMPLATES: MindTemplate[] = [
  {
    id: 'phep-tinh',
    name: 'Các phép tính với số tự nhiên',
    build: () =>
      fromSpec('Các phép tính\nvới số tự nhiên', [
        ['➕ Phép cộng', [['Số hạng + Số hạng = Tổng'], ['Ví dụ: 25 300 + 4 700 = 30 000']]],
        ['➖ Phép trừ', [['Số bị trừ − Số trừ = Hiệu'], ['Ví dụ: 8 000 − 2 500 = 5 500']]],
        ['✖️ Phép nhân', [['Thừa số × Thừa số = Tích'], ['Ví dụ: 1 250 × 4 = 5 000']]],
        ['➗ Phép chia', [['Số bị chia : Số chia = Thương'], ['Chia có dư: số dư < số chia']]],
        ['Thứ tự thực hiện', [['Nhân, chia trước\nCộng, trừ sau'], ['Có ngoặc: tính trong ngoặc trước']]],
      ]),
  },
  {
    id: 'do-dai',
    name: 'Bảng đơn vị đo độ dài',
    build: () =>
      fromSpec(
        'Đơn vị đo độ dài',
        [
          ['km', [['1 km = 1 000 m']]],
          ['m', [['1 m = 10 dm'], ['1 m = 100 cm']]],
          ['dm', [['1 dm = 10 cm']]],
          ['cm', [['1 cm = 10 mm']]],
          ['mm', [['Đơn vị nhỏ nhất\ntrong bảng']]],
          ['Ghi nhớ', [['Hai đơn vị liền nhau\ngấp/kém nhau 10 lần\n(trừ km và m)']]],
        ],
        'both'
      ),
  },
  {
    id: 'chu-vi-dien-tich',
    name: 'Chu vi và diện tích các hình',
    build: () =>
      fromSpec(
        'Chu vi và diện tích',
        [
          ['Hình chữ nhật', [['Chu vi = (dài + rộng) × 2'], ['Diện tích = dài × rộng']]],
          ['Hình vuông', [['Chu vi = cạnh × 4'], ['Diện tích = cạnh × cạnh']]],
          ['Hình tam giác', [['Chu vi = tổng độ dài 3 cạnh']]],
          ['Đơn vị', [['Chu vi: cm, dm, m'], ['Diện tích: cm²']]],
        ],
        'both'
      ),
  },
  {
    id: 'giai-toan',
    name: 'Các bước giải toán có lời văn',
    build: () =>
      fromSpec(
        'Giải toán có lời văn',
        [
          ['1. Đọc kĩ đề', [['Bài toán cho biết gì?'], ['Bài toán hỏi gì?']]],
          ['2. Tóm tắt', [['Bằng lời hoặc sơ đồ đoạn thẳng']]],
          ['3. Chọn phép tính', [['Thêm, gộp → cộng'], ['Bớt, còn lại → trừ'], ['Gấp, mỗi … có → nhân'], ['Chia đều, giảm đi → chia']]],
          ['4. Trình bày bài giải', [['Câu lời giải'], ['Phép tính + đơn vị'], ['Đáp số']]],
          ['5. Kiểm tra lại', [['Thử lại phép tính'], ['Đáp số có hợp lý không?']]],
        ],
        'tree'
      ),
  },
  {
    id: 'mot-phan-may',
    name: 'Một phần mấy',
    build: () =>
      fromSpec('Một phần mấy', [
        ['Khái niệm', [['Chia hình thành các phần bằng nhau'], ['Lấy 1 phần → một phần mấy']]],
        ['Cách viết', [['½ một phần hai'], ['⅓ một phần ba'], ['¼ một phần tư']]],
        ['Tìm ¼ của 12', [['12 : 4 = 3']]],
        ['Ví dụ thực tế', [['🍕 Bánh chia 4 phần,\năn 1 phần = ¼ cái bánh']]],
      ]),
  },
  {
    id: 'hinh-tron',
    name: 'Hình tròn: tâm, bán kính, đường kính',
    build: () =>
      fromSpec('⭕ Hình tròn', [
        ['Tâm O', [['Điểm chính giữa hình tròn']]],
        ['Bán kính', [['Đoạn thẳng nối tâm\nvới một điểm trên đường tròn'], ['Các bán kính dài bằng nhau']]],
        ['Đường kính', [['Đoạn thẳng đi qua tâm,\nhai đầu nằm trên đường tròn'], ['Đường kính = bán kính × 2']]],
        ['Vẽ bằng compa', [['Mở compa bằng bán kính'], ['Đặt đầu kim vào tâm, quay một vòng']]],
      ]),
  },
];
