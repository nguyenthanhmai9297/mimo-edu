import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  applyNodeChanges,
  BaseEdge,
  Background,
  Controls,
  Handle,
  Position,
  ReactFlow,
  ReactFlowProvider,
  getViewportForBounds,
  useReactFlow,
  type Edge,
  type EdgeProps,
  type Node,
  type NodeChange,
  type NodeProps,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { toPng } from 'html-to-image';
import {
  ChevronRight,
  Download,
  Eye,
  EyeOff,
  FilePlus2,
  FolderOpen,
  GitBranchPlus,
  ImageDown,
  LayoutGrid,
  Plus,
  Trash2,
  Undo2,
} from 'lucide-react';
import {
  addChild,
  autoLayout,
  createMindMap,
  deleteNode,
  depthOf,
  MIND_COLORS,
  MIND_ICONS,
  moveNode,
  parseMindMap,
  possibleParents,
  recolorBranch,
  revealOrder,
  rootOf,
  updateNode,
  type MindEdgeStyle,
  type MindLayout,
  type MindMapDoc,
} from './mindMap';

const STORAGE_KEY = 'mimoedu.tools.mindmap.current';

type MindFlowNode = Node<{ label: string; icon?: string; color: string; depth: number; veiled: boolean }, 'mind'>;
type MindFlowEdge = Edge<{ style: MindEdgeStyle; color: string; width: number; veiled: boolean }, 'mind'>;

const CENTER_HANDLE: React.CSSProperties = { top: '50%', left: '50%', width: 1, height: 1, minWidth: 0, minHeight: 0, opacity: 0, border: 0, transform: 'translate(-50%, -50%)' };

const MindNodeView: React.FC<NodeProps<MindFlowNode>> = ({ data, selected }) => {
  const { label, icon, color, depth, veiled } = data;
  const base = 'max-w-[260px] whitespace-pre-wrap break-words text-center font-display font-extrabold leading-snug transition-all duration-500';
  const look =
    depth === 0
      ? 'rounded-[28px] px-7 py-5 text-[26px] text-white shadow-[0_10px_30px_rgba(7,26,99,0.25)]'
      : depth === 1
        ? 'rounded-2xl px-5 py-3 text-[20px] text-white shadow-md'
        : 'rounded-xl border-[3px] bg-white px-4 py-2 text-[17px] text-[#172B4D]';
  return (
    <div
      className={`${base} ${look} ${selected ? 'ring-4 ring-[#FFD34E] ring-offset-2' : ''} ${veiled ? 'pointer-events-none scale-75 opacity-0' : 'opacity-100'}`}
      style={depth <= 1 ? { background: color } : { borderColor: color }}
    >
      <Handle type="target" position={Position.Left} style={CENTER_HANDLE} isConnectable={false} />
      {icon && <span className="mr-1.5">{icon}</span>}
      {label || '…'}
      <Handle type="source" position={Position.Right} style={CENTER_HANDLE} isConnectable={false} />
    </div>
  );
};

const MindEdgeView: React.FC<EdgeProps<MindFlowEdge>> = ({ id, sourceX, sourceY, targetX, targetY, data }) => {
  const mx = (sourceX + targetX) / 2;
  const path =
    data?.style === 'straight'
      ? `M${sourceX},${sourceY} L${targetX},${targetY}`
      : data?.style === 'step'
        ? `M${sourceX},${sourceY} H${mx} V${targetY} H${targetX}`
        : `M${sourceX},${sourceY} C${mx},${sourceY} ${mx},${targetY} ${targetX},${targetY}`;
  return (
    <BaseEdge
      id={id}
      path={path}
      style={{ stroke: data?.color, strokeWidth: data?.width, strokeLinecap: 'round', opacity: data?.veiled ? 0 : 1, transition: 'opacity 0.5s' }}
    />
  );
};

const NODE_TYPES = { mind: MindNodeView };
const EDGE_TYPES = { mind: MindEdgeView };

function loadSaved(): MindMapDoc | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const doc = parseMindMap(JSON.parse(raw));
    return typeof doc === 'string' ? null : doc;
  } catch {
    return null;
  }
}

function fileName(title: string, ext: string) {
  const slug = title
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();
  return `so-do-tu-duy-${slug || 'mimo'}.${ext}`;
}

function downloadUrl(url: string, name: string) {
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

// ------------------------------------------------------------------ start screen

const StartScreen: React.FC<{ saved: MindMapDoc | null; onOpen: (doc: MindMapDoc) => void; onImport: () => void }> = ({ saved, onOpen, onImport }) => {
  const [title, setTitle] = useState('');
  const [branches, setBranches] = useState('');
  const [layout, setLayout] = useState<MindLayout>('radial');
  const create = () =>
    onOpen(
      createMindMap(
        title,
        layout,
        branches
          .split('\n')
          .map((b) => b.trim())
          .filter(Boolean)
          .slice(0, 12)
      )
    );
  return (
    <div className="mx-auto grid max-w-4xl gap-6 md:grid-cols-[minmax(0,1fr)_280px]">
      <section className="studio-card space-y-4 p-5">
        <h2 className="font-display text-lg font-extrabold text-[#071A63]">Tạo sơ đồ tư duy mới</h2>
        <label className="block">
          <span className="text-xs font-bold text-[#5E6C84]">Chủ đề trung tâm</span>
          <input
            value={title}
            maxLength={80}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Ví dụ: Phép nhân trong phạm vi 1000"
            className="mt-1 w-full rounded-xl border-2 border-[#DCE7F3] px-3 py-2.5 text-base font-bold focus:border-[#1267E9] focus:outline-none"
          />
        </label>
        <label className="block">
          <span className="text-xs font-bold text-[#5E6C84]">Các nhánh chính (mỗi dòng một nhánh, có thể để trống)</span>
          <textarea
            value={branches}
            onChange={(e) => setBranches(e.target.value)}
            rows={4}
            placeholder={'Khái niệm\nCách tính\nVí dụ\nLưu ý'}
            className="mt-1 w-full rounded-xl border-2 border-[#DCE7F3] px-3 py-2 text-sm focus:border-[#1267E9] focus:outline-none"
          />
        </label>
        <div>
          <span className="text-xs font-bold text-[#5E6C84]">Mẫu sơ đồ</span>
          <div className="mt-1 grid grid-cols-2 gap-2">
            {(
              [
                ['radial', 'Tỏa tròn', 'Chủ đề ở giữa, nhánh tỏa ra xung quanh'],
                ['tree', 'Sơ đồ cây', 'Chủ đề bên trái, nhánh xếp sang phải'],
              ] as const
            ).map(([v, name, hint]) => (
              <button
                key={v}
                type="button"
                aria-pressed={layout === v}
                onClick={() => setLayout(v)}
                className={`rounded-xl border-2 p-3 text-left ${layout === v ? 'border-[#1267E9] bg-[#EAF5FF]' : 'border-[#DCE7F3] bg-white'}`}
              >
                <div className="font-bold text-[#071A63]">{name}</div>
                <div className="text-xs text-[#5E6C84]">{hint}</div>
              </button>
            ))}
          </div>
        </div>
        <button type="button" onClick={create} className="studio-btn studio-btn-primary min-h-[48px] w-full text-base">
          <FilePlus2 className="h-5 w-5" /> Tạo sơ đồ
        </button>
      </section>
      <aside className="space-y-3">
        {saved && (
          <button type="button" onClick={() => onOpen(saved)} className="studio-card w-full p-4 text-left hover:ring-2 hover:ring-[#54C8FF]">
            <div className="text-xs font-bold text-[#1F9D6B]">Sơ đồ đang làm dở</div>
            <div className="mt-1 font-display font-extrabold text-[#071A63]">{saved.title}</div>
            <div className="text-xs text-[#5E6C84]">{saved.nodes.length} ý · bấm để tiếp tục</div>
          </button>
        )}
        <button type="button" onClick={onImport} className="studio-btn studio-btn-secondary min-h-[48px] w-full">
          <FolderOpen className="h-5 w-5" /> Mở tệp sơ đồ (.json)
        </button>
        <p className="text-xs leading-relaxed text-[#5E6C84]">
          Sơ đồ được tự lưu trên máy này. Muốn dùng ở máy khác, bấm <b>Lưu tệp</b> rồi mở lại tệp đó.
        </p>
      </aside>
    </div>
  );
};

// ------------------------------------------------------------------ editor

const Editor: React.FC<{
  doc: MindMapDoc;
  setDoc: (next: MindMapDoc, record?: boolean) => void;
  undo: (() => void) | null;
  presenting: boolean;
  onNew: () => void;
  onImport: () => void;
}> = ({ doc, setDoc, undo, presenting, onNew, onImport }) => {
  const flow = useReactFlow<MindFlowNode, MindFlowEdge>();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [revealed, setRevealed] = useState<number | null>(null);
  const [rfNodes, setRfNodes] = useState<MindFlowNode[]>([]);
  const [busy, setBusy] = useState(false);
  const labelRef = useRef<HTMLTextAreaElement>(null);
  const selected = doc.nodes.find((n) => n.id === selectedId) ?? null;
  const order = useMemo(() => revealOrder(doc), [doc]);
  const visible = useMemo(() => (revealed === null ? null : new Set([rootOf(doc).id, ...order.slice(0, revealed)])), [revealed, order, doc]);

  useEffect(() => {
    setRfNodes((prev) => {
      const old = new Map(prev.map((n) => [n.id, n]));
      return doc.nodes.map((n) => ({
        ...old.get(n.id),
        id: n.id,
        type: 'mind' as const,
        position: { x: n.x, y: n.y },
        selected: n.id === selectedId,
        data: { label: n.label, icon: n.icon, color: n.color, depth: depthOf(doc, n.id), veiled: !!visible && !visible.has(n.id) },
      }));
    });
  }, [doc, selectedId, visible]);

  const edges = useMemo<MindFlowEdge[]>(
    () =>
      doc.nodes
        .filter((n) => n.parentId)
        .map((n) => ({
          id: `e-${n.id}`,
          source: n.parentId!,
          target: n.id,
          type: 'mind' as const,
          data: { style: doc.edgeStyle, color: n.color, width: n.parentId === rootOf(doc).id ? 6 : 3.5, veiled: !!visible && !visible.has(n.id) },
        })),
    [doc, visible]
  );

  const onNodesChange = useCallback((changes: NodeChange<MindFlowNode>[]) => {
    setRfNodes((nds) => applyNodeChanges(changes.filter((c) => c.type !== 'select' && c.type !== 'remove'), nds));
  }, []);

  const fit = useCallback(() => window.setTimeout(() => flow.fitView({ padding: 0.15, duration: 400 }), 60), [flow]);
  useEffect(() => {
    fit();
  }, [presenting, fit]);

  const add = useCallback(
    (parentId: string) => {
      const r = addChild(doc, parentId);
      setDoc(r.doc);
      setSelectedId(r.id);
      window.setTimeout(() => labelRef.current?.select(), 30);
    },
    [doc, setDoc]
  );

  const remove = useCallback(() => {
    if (!selected || selected.parentId === null) return;
    setDoc(deleteNode(doc, selected.id));
    setSelectedId(selected.parentId);
  }, [doc, selected, setDoc]);

  const revealNext = useCallback(() => setRevealed((r) => (r === null ? null : Math.min(order.length, r + 1))), [order.length]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest('input, textarea, select')) return;
      if (revealed !== null && (e.key === ' ' || e.key === 'ArrowRight' || e.key === 'PageDown')) {
        e.preventDefault();
        revealNext();
      } else if (revealed === null && selected) {
        if (e.key === 'Tab') {
          e.preventDefault();
          add(selected.id);
        } else if (e.key === 'Enter' && selected.parentId) {
          e.preventDefault();
          add(selected.parentId);
        } else if (e.key === 'Delete' || e.key === 'Backspace') {
          e.preventDefault();
          remove();
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [revealed, selected, add, remove, revealNext]);

  const relayout = (layout: MindLayout = doc.layout) => {
    setDoc(autoLayout(doc, layout));
    fit();
  };

  const saveJson = () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify(doc, null, 2)], { type: 'application/json' }));
    downloadUrl(url, fileName(doc.title, 'json'));
    window.setTimeout(() => URL.revokeObjectURL(url), 2000);
  };

  const exportPng = async () => {
    const el = document.querySelector<HTMLElement>('.mimo-mindmap .react-flow__viewport');
    if (!el) return;
    setBusy(true);
    try {
      const bounds = flow.getNodesBounds(flow.getNodes().filter((n) => !n.data.veiled));
      const width = Math.min(4000, Math.max(1200, Math.ceil(bounds.width * 1.6)));
      const height = Math.min(3000, Math.max(800, Math.ceil(bounds.height * 1.6)));
      const vp = getViewportForBounds(bounds, width, height, 0.2, 3, 0.08);
      const url = await toPng(el, {
        backgroundColor: '#FFFFFF',
        width,
        height,
        pixelRatio: 1,
        style: { width: `${width}px`, height: `${height}px`, transform: `translate(${vp.x}px, ${vp.y}px) scale(${vp.zoom})` },
      });
      downloadUrl(url, fileName(doc.title, 'png'));
    } finally {
      setBusy(false);
    }
  };

  const showControls = !presenting;
  const parents = selected && selected.parentId ? possibleParents(doc, selected.id) : [];

  return (
    <div className="space-y-3">
      {/* toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        {showControls && (
          <>
            <button type="button" onClick={onNew} className="studio-btn studio-btn-secondary">
              <FilePlus2 className="h-4 w-4" /> Sơ đồ mới
            </button>
            <button type="button" onClick={onImport} className="studio-btn studio-btn-secondary">
              <FolderOpen className="h-4 w-4" /> Mở tệp
            </button>
            <button type="button" onClick={saveJson} className="studio-btn studio-btn-secondary">
              <Download className="h-4 w-4" /> Lưu tệp
            </button>
            <button type="button" onClick={exportPng} disabled={busy} className="studio-btn studio-btn-secondary">
              <ImageDown className="h-4 w-4" /> {busy ? 'Đang xuất…' : 'Xuất ảnh PNG'}
            </button>
            <button type="button" onClick={() => undo?.()} disabled={!undo} className="studio-btn studio-btn-secondary">
              <Undo2 className="h-4 w-4" /> Hoàn tác
            </button>
            <span className="mx-1 hidden h-6 w-px bg-[#DCE7F3] sm:block" />
            <div className="flex overflow-hidden rounded-full border border-[#DCE7F3] bg-white text-sm font-bold">
              {(
                [
                  ['radial', 'Tỏa tròn'],
                  ['tree', 'Cây'],
                ] as const
              ).map(([v, l]) => (
                <button key={v} type="button" aria-pressed={doc.layout === v} onClick={() => relayout(v)} className={`px-3 py-2 ${doc.layout === v ? 'bg-[#1267E9] text-white' : 'text-[#1267E9]'}`}>
                  {l}
                </button>
              ))}
            </div>
            <button type="button" onClick={() => relayout()} className="studio-btn studio-btn-secondary">
              <LayoutGrid className="h-4 w-4" /> Tự sắp xếp
            </button>
            <label className="flex items-center gap-1.5 text-sm font-bold text-[#5E6C84]">
              Nhánh
              <select
                value={doc.edgeStyle}
                onChange={(e) => setDoc({ ...doc, edgeStyle: e.target.value as MindEdgeStyle })}
                className="rounded-full border border-[#DCE7F3] bg-white px-3 py-2 text-sm text-[#172B4D]"
              >
                <option value="curve">Cong mềm</option>
                <option value="straight">Thẳng</option>
                <option value="step">Bậc thang</option>
              </select>
            </label>
          </>
        )}
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {revealed === null ? (
            <button
              type="button"
              onClick={() => {
                setSelectedId(null);
                setRevealed(0);
              }}
              className="studio-btn studio-btn-navy"
            >
              <EyeOff className="h-4 w-4" /> Mở dần từng nhánh
            </button>
          ) : (
            <>
              <span className="text-sm font-bold text-[#5E6C84]">
                Đã mở {revealed}/{order.length}
              </span>
              <button type="button" onClick={revealNext} disabled={revealed >= order.length} className={`studio-btn studio-btn-accent ${presenting ? 'min-h-[52px] px-6 text-lg' : ''}`}>
                <ChevronRight className="h-5 w-5" /> Hiện nhánh tiếp
              </button>
              <button type="button" onClick={() => setRevealed(order.length)} className="studio-btn studio-btn-secondary">
                <Eye className="h-4 w-4" /> Hiện tất cả
              </button>
              <button type="button" onClick={() => setRevealed(null)} className="studio-btn studio-btn-secondary">
                Thoát mở dần
              </button>
            </>
          )}
        </div>
      </div>

      <div className={`grid gap-3 ${showControls && revealed === null ? 'lg:grid-cols-[minmax(0,1fr)_300px]' : ''}`}>
        <div
          className={`mimo-mindmap overflow-hidden rounded-2xl border border-[#DCE7F3] bg-white ${presenting ? 'h-[calc(100vh-170px)]' : 'h-[68vh] min-h-[420px]'}`}
        >
          <ReactFlow<MindFlowNode, MindFlowEdge>
            nodes={rfNodes}
            edges={edges}
            nodeTypes={NODE_TYPES}
            edgeTypes={EDGE_TYPES}
            nodeOrigin={[0.5, 0.5]}
            onNodesChange={onNodesChange}
            onNodeClick={(_, n) => revealed === null && setSelectedId(n.id)}
            onNodeDoubleClick={(_, n) => {
              if (revealed !== null) return;
              setSelectedId(n.id);
              window.setTimeout(() => labelRef.current?.select(), 30);
            }}
            onNodeDragStop={(_, n) => setDoc(updateNode(doc, n.id, { x: n.position.x, y: n.position.y }))}
            onPaneClick={() => (revealed !== null ? revealNext() : setSelectedId(null))}
            nodesDraggable={revealed === null}
            nodesConnectable={false}
            deleteKeyCode={null}
            minZoom={0.15}
            maxZoom={2.5}
            fitView
            fitViewOptions={{ padding: 0.15 }}
          >
            <Background color="#DCE7F3" gap={28} />
            <Controls showInteractive={false} position="bottom-left" />
          </ReactFlow>
        </div>

        {showControls && revealed === null && (
          <aside className="studio-card space-y-4 p-4">
            {!selected ? (
              <div className="space-y-2 text-sm text-[#5E6C84]">
                <p className="font-bold text-[#071A63]">Bấm vào một ý trên sơ đồ để sửa.</p>
                <ul className="list-disc space-y-1 pl-4">
                  <li>Kéo ý để di chuyển, cuộn chuột để phóng to/thu nhỏ, kéo nền để di chuyển sơ đồ.</li>
                  <li>
                    Phím tắt: <b>Tab</b> thêm nhánh con, <b>Enter</b> thêm nhánh cùng cấp, <b>Delete</b> xóa.
                  </li>
                </ul>
                <button type="button" onClick={() => add(rootOf(doc).id)} className="studio-btn studio-btn-primary w-full">
                  <Plus className="h-4 w-4" /> Thêm nhánh chính
                </button>
              </div>
            ) : (
              <>
                <label className="block">
                  <span className="text-xs font-bold text-[#5E6C84]">{selected.parentId ? 'Nội dung ý' : 'Chủ đề trung tâm'}</span>
                  <textarea
                    ref={labelRef}
                    value={selected.label}
                    rows={3}
                    maxLength={200}
                    onChange={(e) => setDoc(updateNode(doc, selected.id, { label: e.target.value }), false)}
                    onBlur={() => setDoc(doc)}
                    className="mt-1 w-full rounded-xl border-2 border-[#DCE7F3] px-3 py-2 text-base font-bold text-[#172B4D] focus:border-[#1267E9] focus:outline-none"
                  />
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button type="button" onClick={() => add(selected.id)} className="studio-btn studio-btn-primary">
                    <GitBranchPlus className="h-4 w-4" /> Nhánh con
                  </button>
                  <button type="button" disabled={!selected.parentId} onClick={() => selected.parentId && add(selected.parentId)} className="studio-btn studio-btn-secondary">
                    <Plus className="h-4 w-4" /> Cùng cấp
                  </button>
                </div>
                {selected.parentId && (
                  <>
                    <div>
                      <span className="text-xs font-bold text-[#5E6C84]">Màu nhánh</span>
                      <div className="mt-1 flex flex-wrap gap-1.5">
                        {MIND_COLORS.map((c) => (
                          <button
                            key={c}
                            type="button"
                            aria-label={`Màu ${c}`}
                            onClick={() => setDoc(recolorBranch(doc, selected.id, c))}
                            className={`h-8 w-8 rounded-full ${selected.color === c ? 'ring-4 ring-[#FFD34E] ring-offset-1' : ''}`}
                            style={{ background: c }}
                          />
                        ))}
                      </div>
                    </div>
                    <label className="block">
                      <span className="text-xs font-bold text-[#5E6C84]">Thuộc nhánh</span>
                      <select
                        value={selected.parentId}
                        onChange={(e) => setDoc(moveNode(doc, selected.id, e.target.value))}
                        className="mt-1 w-full rounded-xl border-2 border-[#DCE7F3] bg-white px-3 py-2 text-sm"
                      >
                        {parents.map((p) => (
                          <option key={p.id} value={p.id}>
                            {'— '.repeat(depthOf(doc, p.id))}
                            {p.label || '…'}
                          </option>
                        ))}
                      </select>
                    </label>
                  </>
                )}
                <div>
                  <span className="text-xs font-bold text-[#5E6C84]">Biểu tượng</span>
                  <div className="mt-1 grid grid-cols-6 gap-1">
                    <button
                      type="button"
                      onClick={() => setDoc(updateNode(doc, selected.id, { icon: undefined }))}
                      className={`h-9 rounded-lg text-xs font-bold text-[#5E6C84] ${!selected.icon ? 'bg-[#EAF5FF] ring-2 ring-[#1267E9]' : 'bg-[#F6FAFF]'}`}
                    >
                      Không
                    </button>
                    {MIND_ICONS.map((ic) => (
                      <button
                        key={ic}
                        type="button"
                        onClick={() => setDoc(updateNode(doc, selected.id, { icon: ic }))}
                        className={`h-9 rounded-lg text-lg ${selected.icon === ic ? 'bg-[#EAF5FF] ring-2 ring-[#1267E9]' : 'bg-[#F6FAFF]'}`}
                      >
                        {ic}
                      </button>
                    ))}
                  </div>
                </div>
                {selected.parentId && (
                  <button type="button" onClick={remove} className="studio-btn studio-btn-danger w-full">
                    <Trash2 className="h-4 w-4" /> Xóa ý này {doc.nodes.some((n) => n.parentId === selected.id) ? '(cả nhánh con)' : ''}
                  </button>
                )}
              </>
            )}
          </aside>
        )}
      </div>
      {revealed !== null && (
        <p className="text-center text-sm text-[#5E6C84]">Bấm vào nền sơ đồ, phím cách hoặc mũi tên phải để hiện nhánh tiếp theo.</p>
      )}
    </div>
  );
};

// ------------------------------------------------------------------ tool

/** "Sơ đồ tư duy Mimo": maps stay in this browser (autosave) or JSON files – nothing is sent to the server. */
export const MindMapTool: React.FC<{ presenting: boolean }> = ({ presenting }) => {
  const [doc, setDocState] = useState<MindMapDoc | null>(null);
  const [saved] = useState(loadSaved);
  const [error, setError] = useState('');
  const history = useRef<MindMapDoc[]>([]);
  const lastRecorded = useRef<MindMapDoc | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [, force] = useState(0);

  useEffect(() => {
    if (!doc) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(doc));
    } catch {
      /* storage full or blocked – the map still works for this session */
    }
  }, [doc]);

  /** record=false: live typing; the change becomes one undo step when the field loses focus. */
  const setDoc = useCallback((next: MindMapDoc, record = true) => {
    if (record) {
      const base = lastRecorded.current;
      if (base && base !== next) {
        history.current = [...history.current.slice(-39), base];
        force((x) => x + 1);
      }
      lastRecorded.current = next;
    }
    setDocState(next);
  }, []);

  const open = (next: MindMapDoc) => {
    history.current = [];
    lastRecorded.current = next;
    setError('');
    setDocState(next);
  };

  const undo = () => {
    const prev = history.current.pop();
    if (!prev) return;
    lastRecorded.current = prev;
    setDocState(prev);
    force((x) => x + 1);
  };

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const parsed = parseMindMap(JSON.parse(await file.text()));
      if (typeof parsed === 'string') setError(parsed);
      else open(parsed);
    } catch {
      setError('Không đọc được tệp. Hãy chọn tệp .json được lưu từ Sơ đồ tư duy Mimo.');
    }
  };

  return (
    <ReactFlowProvider>
      <input ref={fileRef} type="file" accept=".json,application/json" className="hidden" onChange={onFile} data-testid="mindmap-file" />
      {error && <p className="mb-3 rounded-xl bg-[#FFEDF1] px-4 py-2 text-sm font-bold text-[#D93B5B]">{error}</p>}
      {doc ? (
        <Editor
          doc={doc}
          setDoc={setDoc}
          undo={history.current.length ? undo : null}
          presenting={presenting}
          onNew={() => setDocState(null)}
          onImport={() => fileRef.current?.click()}
        />
      ) : (
        <StartScreen saved={saved ?? loadSaved()} onOpen={open} onImport={() => fileRef.current?.click()} />
      )}
    </ReactFlowProvider>
  );
};
