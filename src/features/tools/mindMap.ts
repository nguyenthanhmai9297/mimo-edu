/**
 * Data model and pure helpers for "Sơ đồ tư duy Mimo". Maps live in the
 * teacher's browser (autosave) or in JSON files – nothing goes to Firestore.
 */

export interface MindNode {
  id: string;
  parentId: string | null;
  label: string;
  color: string;
  icon?: string;
  x: number;
  y: number;
}

export type MindLayout = 'radial' | 'tree';
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
export const MIND_ICONS = ['⭐', '💡', '❓', '✅', '📏', '🔢', '➕', '➖', '✖️', '➗', '🕒', '💰', '📐', '🧮', '🎯', '📝'];
export const ROOT_COLOR = '#071A63';

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
  const node: MindNode = {
    id: newNodeId(),
    parentId,
    label,
    color,
    x: parent.x + (parent.parentId === null ? Math.cos(angle) * 240 : 220),
    y: parent.y + (parent.parentId === null ? Math.sin(angle) * 160 : siblings.length * 64),
  };
  return { doc: { ...doc, nodes: [...doc.nodes, node] }, id: node.id };
}

export function updateNode(doc: MindMapDoc, id: string, patch: Partial<Omit<MindNode, 'id' | 'parentId'>>): MindMapDoc {
  const nodes = doc.nodes.map((n) => (n.id === id ? { ...n, ...patch } : n));
  const root = nodes.find((n) => n.parentId === null)!;
  return { ...doc, nodes, title: root.id === id && patch.label !== undefined ? patch.label : doc.title };
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

function leafCount(doc: MindMapDoc, id: string): number {
  const kids = childrenOf(doc, id);
  return kids.length === 0 ? 1 : kids.reduce((s, k) => s + leafCount(doc, k.id), 0);
}

/** Horizontal tree: centre on the left, branches to the right, leaves evenly spaced. */
function layoutTree(doc: MindMapDoc): MindMapDoc {
  const pos = new Map<string, { x: number; y: number }>();
  let slot = 0;
  const place = (id: string, depth: number): number => {
    const kids = childrenOf(doc, id);
    let y: number;
    if (kids.length === 0) y = slot++ * 72;
    else {
      const ys = kids.map((k) => place(k.id, depth + 1));
      y = (ys[0] + ys[ys.length - 1]) / 2;
    }
    pos.set(id, { x: depth * 240, y });
    return y;
  };
  const root = rootOf(doc);
  const rootY = place(root.id, 0);
  return { ...doc, nodes: doc.nodes.map((n) => ({ ...n, x: pos.get(n.id)!.x, y: pos.get(n.id)!.y - rootY })) };
}

/** Radial: each main branch gets an angular sector proportional to its number of leaves. */
function layoutRadial(doc: MindMapDoc): MindMapDoc {
  const pos = new Map<string, { x: number; y: number }>();
  const root = rootOf(doc);
  pos.set(root.id, { x: 0, y: 0 });
  const place = (id: string, depth: number, from: number, to: number) => {
    const kids = childrenOf(doc, id);
    const total = kids.reduce((s, k) => s + leafCount(doc, k.id), 0) || 1;
    let start = from;
    for (const k of kids) {
      const span = ((to - from) * leafCount(doc, k.id)) / total;
      const mid = start + span / 2;
      const r = 230 + (depth - 1) * 190;
      pos.set(k.id, { x: Math.cos(mid) * r, y: Math.sin(mid) * r * 0.78 });
      place(k.id, depth + 1, start, start + span);
      start += span;
    }
  };
  place(root.id, 1, -Math.PI / 2, (3 * Math.PI) / 2);
  return { ...doc, nodes: doc.nodes.map((n) => ({ ...n, ...pos.get(n.id)! })) };
}

export function autoLayout(doc: MindMapDoc, layout: MindLayout = doc.layout): MindMapDoc {
  const next = { ...doc, layout };
  return layout === 'tree' ? layoutTree(next) : layoutRadial(next);
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
    layout: d.layout === 'tree' ? 'tree' : 'radial',
    edgeStyle: d.edgeStyle === 'straight' || d.edgeStyle === 'step' ? d.edgeStyle : 'curve',
    nodes: d.nodes.map((n) => ({
      id: n.id,
      parentId: n.parentId ?? null,
      label: n.label.slice(0, 200),
      color: typeof n.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(n.color) ? n.color : ROOT_COLOR,
      ...(typeof n.icon === 'string' && n.icon ? { icon: n.icon.slice(0, 8) } : {}),
      x: n.x,
      y: n.y,
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
  const moved = { ...doc, nodes: doc.nodes.map((n) => (n.id === id ? { ...n, parentId: newParentId, x: parent.x + 220, y: parent.y + 40 } : n)) };
  return parent.parentId === null ? moved : recolorBranch(moved, id, parent.color);
}
