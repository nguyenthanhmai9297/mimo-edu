import { describe, it, expect } from 'vitest';
import {
  addChild,
  autoLayout,
  childrenOf,
  createMindMap,
  deleteNode,
  depthOf,
  descendantIds,
  moveNode,
  parseMindMap,
  recolorBranch,
  revealOrder,
  rootOf,
  updateNode,
} from '../features/tools/mindMap';

function sample() {
  let doc = createMindMap('Phân số', 'radial', ['Khái niệm', 'So sánh', 'Phép tính']);
  const [a, b] = childrenOf(doc, rootOf(doc).id);
  let r = addChild(doc, a.id, 'Tử số');
  doc = r.doc;
  const tu = r.id;
  r = addChild(doc, tu, 'Ví dụ 3/4');
  doc = r.doc;
  doc = addChild(doc, b.id, 'Cùng mẫu').doc;
  return { doc, a, b, tu, deep: r.id };
}

describe('Sơ đồ tư duy Mimo', () => {
  it('creates a central topic with main branches in different colours', () => {
    const doc = createMindMap('Phân số', 'radial', ['A', 'B', 'C']);
    const kids = childrenOf(doc, rootOf(doc).id);
    expect(kids).toHaveLength(3);
    expect(new Set(kids.map((k) => k.color)).size).toBe(3);
  });

  it('adds multi-level children that inherit the branch colour', () => {
    const { doc, a, deep } = sample();
    const node = doc.nodes.find((n) => n.id === deep)!;
    expect(depthOf(doc, deep)).toBe(3);
    expect(node.color).toBe(a.color);
    expect(descendantIds(doc, a.id)).toHaveLength(2);
  });

  it('edits labels (central label renames the map) and recolours a branch', () => {
    const { doc, a } = sample();
    expect(updateNode(doc, rootOf(doc).id, { label: 'Phân số lớp 3' }).title).toBe('Phân số lớp 3');
    const recoloured = recolorBranch(doc, a.id, '#22C38E');
    expect([a.id, ...descendantIds(doc, a.id)].every((id) => recoloured.nodes.find((n) => n.id === id)!.color === '#22C38E')).toBe(true);
    expect(rootOf(recoloured).color).toBe(rootOf(doc).color);
  });

  it('deletes a whole branch but never the central topic', () => {
    const { doc, a } = sample();
    const after = deleteNode(doc, a.id);
    expect(after.nodes).toHaveLength(doc.nodes.length - 3);
    expect(deleteNode(doc, rootOf(doc).id)).toBe(doc);
  });

  it('auto layouts: tree puts depth on x, radial spreads main branches around the centre', () => {
    const { doc, a, tu } = sample();
    const tree = autoLayout(doc, 'tree');
    const pos = (d: typeof tree, id: string) => d.nodes.find((n) => n.id === id)!;
    expect(pos(tree, rootOf(tree).id).x).toBe(0);
    expect(pos(tree, a.id).x).toBe(240);
    expect(pos(tree, tu).x).toBe(480);
    const radial = autoLayout(doc, 'radial');
    const mains = childrenOf(radial, rootOf(radial).id).map((k) => Math.atan2(k.y, k.x));
    expect(new Set(mains.map((x) => x.toFixed(2))).size).toBe(3);
    // no two nodes at the same spot
    expect(new Set(radial.nodes.map((n) => `${Math.round(n.x)},${Math.round(n.y)}`)).size).toBe(radial.nodes.length);
  });

  it('reveals branches level by level', () => {
    const { doc, a, b, deep } = sample();
    const order = revealOrder(doc);
    expect(order).toHaveLength(doc.nodes.length - 1);
    expect(order.indexOf(a.id)).toBeLessThan(order.indexOf(deep));
    expect(order.indexOf(b.id)).toBeLessThan(3);
  });

  it('round-trips through JSON and rejects broken files', () => {
    const { doc } = sample();
    expect(parseMindMap(JSON.parse(JSON.stringify(doc)))).toEqual(doc);
    expect(parseMindMap({ format: 'x' })).toMatch(/không phải/);
    expect(parseMindMap({ ...doc, nodes: [...doc.nodes, { ...doc.nodes[1] }] })).toMatch(/trùng/);
    expect(parseMindMap({ ...doc, nodes: doc.nodes.map((n) => ({ ...n, parentId: n.parentId ?? 'ghost' })) })).toMatch(/trung tâm|không tồn tại/);
    const cyc = JSON.parse(JSON.stringify(doc));
    const [x, y] = cyc.nodes.filter((n: { parentId: string | null }) => n.parentId !== null);
    x.parentId = y.id;
    y.parentId = x.id;
    expect(parseMindMap(cyc)).toMatch(/vòng lặp/);
  });

  it('moves a branch to a new parent but never under itself', () => {
    const { doc, a, b, tu, deep } = sample();
    const moved = moveNode(doc, tu, b.id);
    expect(moved.nodes.find((n) => n.id === tu)!.parentId).toBe(b.id);
    expect(moved.nodes.find((n) => n.id === deep)!.color).toBe(b.color);
    expect(moveNode(doc, a.id, deep)).toBe(doc);
    expect(moveNode(doc, rootOf(doc).id, a.id)).toBe(doc);
  });
});
