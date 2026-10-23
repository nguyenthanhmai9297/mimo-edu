import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  applyNodeChanges,
  BaseEdge,
  Background,
  Controls,
  Handle,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type Edge,
  type EdgeProps,
  type Node,
  type NodeChange,
  type NodeProps,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { toJpeg, toPng } from 'html-to-image';
import {
  ArrowLeft,
  Bold,
  ChevronLeft,
  ChevronRight,
  Circle,
  Copy,
  Crosshair,
  Download,
  Eye,
  EyeOff,
  FilePlus2,
  FileText,
  FolderOpen,
  GitBranchPlus,
  ImageDown,
  ImagePlus,
  LayoutGrid,
  Library,
  Maximize2,
  Minimize2,
  MonitorPlay,
  Pencil,
  Plus,
  Redo2,
  RotateCcw,
  Save,
  Square,
  Trash2,
  Undo2,
  Users,
  X,
} from 'lucide-react';
import {
  addChild,
  autoLayout,
  childrenOf,
  createMindMap,
  deleteNode,
  depthOf,
  descendantIds,
  duplicateBranch,
  fontSizeOf,
  FONT_SIZES,
  MATH_SYMBOLS,
  MIND_COLORS,
  MIND_FILLS,
  MIND_ICONS,
  MIND_TEMPLATES,
  moveNode,
  parseMindMap,
  possibleParents,
  presentationSteps,
  recolorBranch,
  rootOf,
  updateNode,
  visibleAfter,
  type MindEdgeStyle,
  type MindLayout,
  type MindMapDoc,
  type MindNode,
  type MindShape,
  type SizeMap,
} from './mindMap';
import {
  deleteMap,
  duplicateMap,
  jpegToA4Pdf,
  listMaps,
  loadMap,
  newMapId,
  renameMap,
  saveMap,
  shrinkImage,
  type SavedMindMap,
} from './mindMapStore';

// ------------------------------------------------------------------ nodes & edges

interface MindNodeData extends Record<string, unknown> {
  node: MindNode;
  depth: number;
  /** Not shown yet (presentation step). */
  veiled: boolean;
  /** Shown as "?" (Học sinh hoàn thiện). */
  masked: boolean;
  /** Design view: marks nodes that will be hidden for students. */
  markHidden: boolean;
}
type MindFlowNode = Node<MindNodeData, 'mind'>;
type MindFlowEdge = Edge<{ style: MindEdgeStyle; color: string; width: number; veiled: boolean }, 'mind'>;

/** Inline text editing on the canvas (design view only). */
const EditCtx = createContext<{ editingId: string | null; commit: (id: string, label: string | null) => void }>({
  editingId: null,
  commit: () => undefined,
});

const CENTER_HANDLE: React.CSSProperties = { top: '50%', left: '50%', width: 1, height: 1, minWidth: 0, minHeight: 0, opacity: 0, border: 0, transform: 'translate(-50%, -50%)' };

function isDark(hex: string): boolean {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  return 0.299 * r + 0.587 * g + 0.114 * b < 150;
}

const InlineEditor: React.FC<{ id: string; initial: string; onDone: (id: string, label: string | null) => void }> = ({ id, initial, onDone }) => {
  const [value, setValue] = useState(initial);
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);
  return (
    <textarea
      ref={ref}
      value={value}
      rows={Math.max(1, value.split('\n').length)}
      maxLength={300}
      aria-label="Sửa nội dung nút"
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => onDone(id, value)}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Escape') onDone(id, null);
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) onDone(id, value);
      }}
      className="nodrag nowheel block w-[220px] resize-none rounded-lg bg-white/95 p-1 text-center text-[#172B4D] outline-none ring-2 ring-[#FFD34E]"
      style={{ font: 'inherit' }}
    />
  );
};

const MindNodeView: React.FC<NodeProps<MindFlowNode>> = ({ data, selected }) => {
  const { editingId, commit } = useContext(EditCtx);
  const { node, depth, veiled, masked, markHidden } = data;
  const fill = node.fill ?? (depth <= 1 ? node.color : '#FFFFFF');
  const text = isDark(fill) ? '#FFFFFF' : '#172B4D';
  const font = fontSizeOf(node, depth);
  const shape: MindShape = node.shape ?? 'rounded';
  const shapeCls =
    shape === 'circle'
      ? 'flex aspect-square min-w-[110px] flex-col items-center justify-center rounded-full px-5 py-5'
      : shape === 'ellipse'
        ? 'rounded-[50%] px-10 py-6'
        : depth === 0
          ? 'rounded-[28px] px-7 py-5'
          : 'rounded-2xl px-4 py-2.5';
  const editing = editingId === node.id;
  return (
    <div
      className={`relative max-w-[300px] whitespace-pre-wrap break-words border-[3px] text-center font-display leading-snug transition-[opacity,transform] duration-500 ${shapeCls} ${
        depth === 0 ? 'shadow-[0_10px_30px_rgba(7,26,99,0.25)]' : depth === 1 ? 'shadow-md' : ''
      } ${selected ? 'ring-4 ring-[#FFD34E] ring-offset-2' : ''} ${markHidden ? 'outline-dashed outline-[3px] outline-offset-4 outline-[#7B5CFF]' : ''} ${
        veiled ? 'pointer-events-none scale-75 opacity-0' : 'opacity-100'
      } ${masked ? 'cursor-pointer' : ''}`}
      style={{ background: fill, borderColor: node.color, color: text, fontSize: font, fontWeight: node.bold === false ? 600 : 800 }}
    >
      <Handle type="target" position={Position.Left} style={CENTER_HANDLE} isConnectable={false} />
      <div className={masked ? 'invisible' : ''}>
        {node.image && <img src={node.image} alt="" draggable={false} className="mx-auto mb-1.5 max-h-[96px] max-w-[200px] rounded-lg object-contain" />}
        {editing ? (
          <InlineEditor id={node.id} initial={node.label} onDone={commit} />
        ) : (
          <>
            {node.icon && <span className="mr-1.5">{node.icon}</span>}
            {node.label || '…'}
          </>
        )}
      </div>
      {masked && (
        <span className="absolute inset-0 flex items-center justify-center font-display font-extrabold" style={{ fontSize: Math.max(28, font * 1.4) }} aria-label="Ô đáp án đang ẩn">
          ?
        </span>
      )}
      {markHidden && (
        <span data-export-ignore className="absolute -right-3 -top-3 flex h-7 w-7 items-center justify-center rounded-full bg-[#7B5CFF] text-white shadow" title="Ẩn với học sinh">
          <EyeOff className="h-4 w-4" />
        </span>
      )}
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

function buildEdges(doc: MindMapDoc, veiled?: (id: string) => boolean): MindFlowEdge[] {
  const rootId = rootOf(doc).id;
  return doc.nodes
    .filter((n) => n.parentId)
    .map((n) => ({
      id: `e-${n.id}`,
      source: n.parentId!,
      target: n.id,
      type: 'mind' as const,
      data: { style: doc.edgeStyle, color: n.color, width: n.parentId === rootId ? 6 : 3.5, veiled: veiled?.(n.id) ?? false },
    }));
}

// ------------------------------------------------------------------ files

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

function download(data: Blob | string, name: string) {
  const url = typeof data === 'string' ? data : URL.createObjectURL(data);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  if (typeof data !== 'string') window.setTimeout(() => URL.revokeObjectURL(url), 3000);
}

const nextFrame = () => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));

// ------------------------------------------------------------------ small UI pieces

const ToolBtn: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement> & { icon: React.ElementType; label: string; primary?: boolean }> = ({
  icon: Icon,
  label,
  primary,
  className = '',
  ...rest
}) => (
  <button type="button" title={label} className={`studio-btn ${primary ? 'studio-btn-primary' : 'studio-btn-secondary'} min-h-[40px] px-3 ${className}`} {...rest}>
    <Icon className="h-4 w-4" /> <span className="hidden xl:inline">{label}</span>
  </button>
);

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div>
    <div className="mb-1.5 text-xs font-bold uppercase tracking-wide text-[#5E6C84]">{title}</div>
    {children}
  </div>
);

// ------------------------------------------------------------------ library (start screen)

const LibraryScreen: React.FC<{
  onOpen: (id: string, doc: MindMapDoc) => void;
  onImport: () => void;
  notice: string;
}> = ({ onOpen, onImport, notice }) => {
  const [maps, setMaps] = useState<SavedMindMap[]>(() => listMaps());
  const [title, setTitle] = useState('');
  const [branches, setBranches] = useState('');
  const [layout, setLayout] = useState<MindLayout>('radial');
  const [renaming, setRenaming] = useState<{ id: string; title: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [error, setError] = useState('');
  const refresh = () => setMaps(listMaps());

  const create = (doc: MindMapDoc) => {
    const id = newMapId();
    const r = saveMap(id, doc);
    if (!r.ok) setError(r.message);
    onOpen(id, doc);
  };

  return (
    <div className="space-y-6">
      {(notice || error) && <p className="rounded-xl bg-[#FFEDF1] px-4 py-2 text-sm font-bold text-[#D93B5B]">{error || notice}</p>}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <section className="space-y-4">
          <div className="studio-card space-y-4 p-5">
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
                rows={3}
                placeholder={'Khái niệm\nCách tính\nVí dụ'}
                className="mt-1 w-full rounded-xl border-2 border-[#DCE7F3] px-3 py-2 text-sm focus:border-[#1267E9] focus:outline-none"
              />
            </label>
            <div className="grid grid-cols-3 gap-2">
              {(
                [
                  ['radial', 'Tỏa tròn', 'Nhánh tỏa ra xung quanh'],
                  ['both', 'Trái – phải', 'Nhánh chia hai bên'],
                  ['tree', 'Sơ đồ cây', 'Nhánh xếp sang phải'],
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
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() =>
                  create(
                    createMindMap(
                      title,
                      layout,
                      branches
                        .split('\n')
                        .map((b) => b.trim())
                        .filter(Boolean)
                        .slice(0, 12)
                    )
                  )
                }
                className="studio-btn studio-btn-primary min-h-[48px] flex-1 text-base"
              >
                <FilePlus2 className="h-5 w-5" /> Tạo sơ đồ
              </button>
              <button type="button" onClick={onImport} className="studio-btn studio-btn-secondary min-h-[48px]">
                <FolderOpen className="h-5 w-5" /> Mở tệp JSON
              </button>
            </div>
          </div>

          <div>
            <h2 className="mb-2 font-display text-base font-extrabold text-[#172B4D]">Mẫu sơ đồ Toán lớp 3 (sửa được mọi nội dung)</h2>
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {MIND_TEMPLATES.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => create(t.build())}
                  className="studio-card flex items-center gap-3 p-3 text-left transition hover:ring-2 hover:ring-[#54C8FF]"
                >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#EAF5FF] text-[#1267E9]">
                    <LayoutGrid className="h-5 w-5" />
                  </span>
                  <span className="text-sm font-bold text-[#071A63]">{t.name}</span>
                </button>
              ))}
            </div>
          </div>
        </section>

        <aside className="studio-card h-fit space-y-3 p-4">
          <h2 className="flex items-center gap-2 font-display text-base font-extrabold text-[#071A63]">
            <Library className="h-5 w-5 text-[#1267E9]" /> Sơ đồ đã lưu trên máy này
          </h2>
          {maps.length === 0 && <p className="text-sm text-[#5E6C84]">Chưa có sơ đồ nào. Sơ đồ sẽ tự lưu khi bạn chỉnh sửa.</p>}
          <ul className="space-y-2">
            {maps.map((m) => (
              <li key={m.id} className="rounded-xl bg-[#F6FAFF] p-3 ring-1 ring-[#DCE7F3]">
                {renaming?.id === m.id ? (
                  <form
                    className="flex gap-1.5"
                    onSubmit={(e) => {
                      e.preventDefault();
                      const r = renameMap(m.id, renaming.title);
                      if (!r.ok) setError(r.message);
                      setRenaming(null);
                      refresh();
                    }}
                  >
                    <input
                      autoFocus
                      value={renaming.title}
                      maxLength={80}
                      aria-label="Tên mới"
                      onChange={(e) => setRenaming({ id: m.id, title: e.target.value })}
                      className="min-w-0 flex-1 rounded-lg border-2 border-[#1267E9] px-2 py-1 text-sm font-bold"
                    />
                    <button type="submit" className="studio-btn studio-btn-primary min-h-[34px] px-3 text-sm">
                      Lưu
                    </button>
                  </form>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      const doc = loadMap(m.id);
                      if (doc) onOpen(m.id, doc);
                      else setError('Không mở được sơ đồ này (dữ liệu hỏng).');
                    }}
                    className="block w-full text-left"
                  >
                    <div className="truncate font-display font-extrabold text-[#071A63]">{m.title}</div>
                    <div className="text-xs text-[#5E6C84]">
                      {m.nodeCount} ý · sửa lúc {new Date(m.updatedAt).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })}
                    </div>
                  </button>
                )}
                {confirmDelete === m.id ? (
                  <div role="alertdialog" className="mt-2 flex flex-wrap items-center gap-2 rounded-lg bg-[#FFF1F4] p-2 text-xs font-bold text-[#D93B5B]">
                    Xóa hẳn sơ đồ này?
                    <button
                      type="button"
                      onClick={() => {
                        deleteMap(m.id);
                        setConfirmDelete(null);
                        refresh();
                      }}
                      className="rounded-full bg-[#D93B5B] px-3 py-1 text-white"
                    >
                      Xóa
                    </button>
                    <button type="button" onClick={() => setConfirmDelete(null)} className="rounded-full bg-white px-3 py-1 text-slate-600 ring-1 ring-slate-300">
                      Hủy
                    </button>
                  </div>
                ) : (
                  <div className="mt-2 flex flex-wrap gap-1.5 text-xs font-bold">
                    <button type="button" onClick={() => setRenaming({ id: m.id, title: m.title })} className="inline-flex items-center gap-1 rounded-full bg-white px-2.5 py-1 text-[#1267E9] ring-1 ring-[#DCE7F3]">
                      <Pencil className="h-3.5 w-3.5" /> Đổi tên
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const r = duplicateMap(m.id);
                        if (!r.ok) setError(r.message);
                        refresh();
                      }}
                      className="inline-flex items-center gap-1 rounded-full bg-white px-2.5 py-1 text-[#1267E9] ring-1 ring-[#DCE7F3]"
                    >
                      <Copy className="h-3.5 w-3.5" /> Nhân bản
                    </button>
                    <button type="button" onClick={() => setConfirmDelete(m.id)} className="inline-flex items-center gap-1 rounded-full bg-white px-2.5 py-1 text-[#D93B5B] ring-1 ring-[#FFC9D1]">
                      <Trash2 className="h-3.5 w-3.5" /> Xóa
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
          <p className="text-xs leading-relaxed text-[#5E6C84]">
            Sơ đồ chỉ lưu trên trình duyệt của máy này. Muốn dùng ở máy khác, mở sơ đồ rồi bấm <b>Xuất JSON</b>.
          </p>
        </aside>
      </div>
    </div>
  );
};

// ------------------------------------------------------------------ presentation (fullscreen)

const PresentationInner: React.FC<{ doc: MindMapDoc; kind: 'slides' | 'student'; onExit: () => void }> = ({ doc, kind, onExit }) => {
  const flow = useReactFlow<MindFlowNode, MindFlowEdge>();
  const steps = useMemo(() => presentationSteps(doc), [doc]);
  const [step, setStep] = useState(kind === 'slides' ? 0 : steps.length);
  const [shown, setShown] = useState<Set<string>>(new Set());
  const hiddenIds = useMemo(() => doc.nodes.filter((n) => n.hidden).map((n) => n.id), [doc]);
  const visible = useMemo(() => visibleAfter(doc, steps, step), [doc, steps, step]);

  const nodes = useMemo<MindFlowNode[]>(
    () =>
      doc.nodes.map((n) => ({
        id: n.id,
        type: 'mind' as const,
        position: { x: n.x, y: n.y },
        draggable: false,
        selectable: false,
        data: { node: n, depth: depthOf(doc, n.id), veiled: !visible.has(n.id), masked: !!n.hidden && !shown.has(n.id), markHidden: false },
      })),
    [doc, visible, shown]
  );
  const edges = useMemo(() => buildEdges(doc, (id) => !visible.has(id)), [doc, visible]);

  const fit = useCallback(() => window.setTimeout(() => flow.fitView({ padding: 0.06, duration: 300 }), 50), [flow]);
  useEffect(() => {
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, [fit]);

  const next = useCallback(() => setStep((s) => Math.min(steps.length, s + 1)), [steps.length]);
  const prev = useCallback(() => setStep((s) => Math.max(0, s - 1)), []);
  const showAll = () => {
    setStep(steps.length);
    setShown(new Set(hiddenIds));
  };
  const reset = () => {
    setStep(kind === 'slides' ? 0 : steps.length);
    setShown(new Set());
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (['ArrowRight', ' ', 'PageDown'].includes(e.key)) {
        e.preventDefault();
        next();
      } else if (['ArrowLeft', 'PageUp'].includes(e.key)) {
        e.preventDefault();
        prev();
      } else if (e.key === 'Escape' && !document.fullscreenElement) onExit();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [next, prev, onExit]);

  const revealedCount = hiddenIds.filter((id) => shown.has(id)).length;
  const bigBtn = 'studio-btn min-h-[52px] px-5 text-base';

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="flex shrink-0 items-center justify-between gap-3">
        <span className="truncate font-display text-[3vh] font-extrabold text-[#071A63]">{doc.title}</span>
        <span className="shrink-0 rounded-full bg-[#EAF5FF] px-3 py-1 text-sm font-bold text-[#1267E9]">
          {kind === 'slides' ? 'Trình chiếu từng nhánh' : 'Học sinh hoàn thiện sơ đồ'}
        </span>
      </div>
      <div className="mimo-mindmap min-h-0 flex-1 overflow-hidden rounded-2xl border border-[#DCE7F3] bg-white">
        <ReactFlow<MindFlowNode, MindFlowEdge>
          nodes={nodes}
          edges={edges}
          nodeTypes={NODE_TYPES}
          edgeTypes={EDGE_TYPES}
          nodeOrigin={[0.5, 0.5]}
          nodesDraggable={false}
          nodesConnectable={false}
          elementsSelectable={false}
          onNodeClick={(_, n) => n.data.masked && setShown((s) => new Set([...s, n.id]))}
          onPaneClick={() => kind === 'slides' && next()}
          minZoom={0.1}
          maxZoom={2.5}
          fitView
          fitViewOptions={{ padding: 0.06 }}
          proOptions={{ hideAttribution: true }}
        >
          <Background color="#EAF2FB" gap={28} />
        </ReactFlow>
      </div>
      <div className="flex shrink-0 flex-wrap items-center justify-center gap-2">
        {kind === 'slides' && (
          <>
            <button type="button" onClick={prev} disabled={step === 0} className={`${bigBtn} studio-btn-secondary`}>
              <ChevronLeft className="h-5 w-5" /> Trước
            </button>
            <span className="min-w-[110px] text-center text-base font-bold text-[#5E6C84]">
              Bước {step}/{steps.length}
            </span>
            <button type="button" onClick={next} disabled={step >= steps.length} className={`${bigBtn} studio-btn-accent`}>
              Tiếp theo <ChevronRight className="h-5 w-5" />
            </button>
          </>
        )}
        {hiddenIds.length > 0 && (
          <span className="text-base font-bold text-[#7B5CFF]">
            Đáp án đã hiện {revealedCount}/{hiddenIds.length} · bấm vào ô “?” để hiện
          </span>
        )}
        <button type="button" onClick={showAll} className={`${bigBtn} studio-btn-secondary`}>
          <Eye className="h-5 w-5" /> {kind === 'slides' ? 'Hiện tất cả' : 'Hiện toàn bộ đáp án'}
        </button>
        <button type="button" onClick={reset} className={`${bigBtn} studio-btn-secondary`}>
          <RotateCcw className="h-5 w-5" /> Đặt lại
        </button>
        <button type="button" onClick={onExit} className={`${bigBtn} studio-btn-secondary`}>
          <Minimize2 className="h-5 w-5" /> Thoát trình chiếu
        </button>
      </div>
    </div>
  );
};

/** Fullscreen presentation over the whole page: no sidebar, no editing tools, no scrolling. */
const Presentation: React.FC<{ doc: MindMapDoc; kind: 'slides' | 'student'; onExit: () => void }> = ({ doc, kind, onExit }) => {
  const ref = useRef<HTMLDivElement>(null);
  const [host] = useState<Element>(() => document.fullscreenElement ?? document.body);
  useEffect(() => {
    const el = ref.current;
    if (el && document.fullscreenElement !== el) el.requestFullscreen?.().catch(() => undefined);
    let entered = false;
    const onChange = () => {
      if (document.fullscreenElement === ref.current) entered = true;
      else if (entered) onExit();
    };
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, [onExit]);
  const exit = () => {
    if (document.fullscreenElement === ref.current) void document.exitFullscreen().catch(() => undefined);
    onExit();
  };
  return createPortal(
    <div ref={ref} role="dialog" aria-label="Sơ đồ tư duy – trình chiếu" className="fixed inset-0 z-[95] bg-gradient-to-br from-[#F6FAFF] via-white to-[#EAF5FF] px-[2vw] py-[2vh]">
      <ReactFlowProvider>
        <PresentationInner doc={doc} kind={kind} onExit={exit} />
      </ReactFlowProvider>
    </div>,
    host
  );
};

// ------------------------------------------------------------------ editor

type Mode = 'design' | 'student';

interface EditorProps {
  doc: MindMapDoc;
  setDoc: (next: MindMapDoc, record?: boolean) => void;
  undo: (() => void) | null;
  redo: (() => void) | null;
  presenting: boolean;
  saveState: { ok: boolean; message: string };
  onSaveNow: () => void;
  onLibrary: () => void;
  onImport: () => void;
}

const Editor: React.FC<EditorProps> = ({ doc, setDoc, undo, redo, presenting, saveState, onSaveNow, onLibrary, onImport }) => {
  const flow = useReactFlow<MindFlowNode, MindFlowEdge>();
  const [mode, setMode] = useState<Mode>('design');
  const [show, setShow] = useState<'slides' | 'student' | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [rfNodes, setRfNodes] = useState<MindFlowNode[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [autoArrange, setAutoArrange] = useState(true);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [message, setMessage] = useState('');
  const [canvasFull, setCanvasFull] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLInputElement>(null);
  const selected = doc.nodes.find((n) => n.id === selectedId) ?? null;
  const design = mode === 'design';

  useEffect(() => setConfirmDelete(false), [selectedId]);

  useEffect(() => {
    setRfNodes((prev) => {
      const old = new Map(prev.map((n) => [n.id, n]));
      return doc.nodes.map((n) => ({
        ...old.get(n.id),
        id: n.id,
        type: 'mind' as const,
        position: { x: n.x, y: n.y },
        selected: !exporting && n.id === selectedId,
        data: { node: n, depth: depthOf(doc, n.id), veiled: false, masked: false, markHidden: !exporting && !!n.hidden },
      }));
    });
  }, [doc, selectedId, exporting]);

  const edges = useMemo(() => buildEdges(doc), [doc]);

  const onNodesChange = useCallback((changes: NodeChange<MindFlowNode>[]) => {
    setRfNodes((nds) => applyNodeChanges(changes.filter((c) => c.type !== 'select' && c.type !== 'remove'), nds));
  }, []);

  const fit = useCallback(() => window.setTimeout(() => flow.fitView({ padding: 0.12, duration: 400 }), 60), [flow]);
  useEffect(() => {
    fit();
  }, [presenting, canvasFull, fit]);

  /** Real node sizes from the canvas so the auto layout never overlaps. */
  const measured = useCallback((): SizeMap => {
    const m: SizeMap = new Map();
    for (const n of flow.getNodes()) if (n.measured?.width && n.measured?.height) m.set(n.id, { w: n.measured.width, h: n.measured.height });
    return m;
  }, [flow]);

  const arrange = useCallback(
    (next: MindMapDoc, layout: MindLayout = next.layout) => autoLayout(next, layout, measured()),
    [measured]
  );

  /** Structural change: optionally re-arranged; once more after the new node has its real size. */
  const change = useCallback(
    (next: MindMapDoc, select?: string) => {
      setDoc(autoArrange ? arrange(next) : next);
      if (select !== undefined) setSelectedId(select);
      if (autoArrange) {
        window.setTimeout(() => {
          const settled = autoLayout(next, next.layout, measured());
          setDoc(settled, false);
        }, 120);
      }
    },
    [arrange, autoArrange, measured, setDoc]
  );

  const add = useCallback(
    (parentId: string) => {
      const r = addChild(doc, parentId);
      change(r.doc, r.id);
      window.setTimeout(() => setEditingId(r.id), 160);
    },
    [doc, change]
  );

  const remove = useCallback(() => {
    if (!selected || selected.parentId === null) return;
    change(deleteNode(doc, selected.id), selected.parentId);
  }, [doc, selected, change]);

  const duplicate = useCallback(() => {
    if (!selected || selected.parentId === null) return;
    const r = duplicateBranch(doc, selected.id);
    change(r.doc, r.id);
  }, [doc, selected, change]);

  const commitLabel = useCallback(
    (id: string, label: string | null) => {
      setEditingId(null);
      if (label === null) return;
      const node = doc.nodes.find((n) => n.id === id);
      if (!node || node.label === label) return;
      const next = updateNode(doc, id, { label });
      setDoc(next);
      if (autoArrange) window.setTimeout(() => setDoc(autoLayout(next, next.layout, measured()), false), 120);
    },
    [doc, setDoc, autoArrange, measured]
  );

  const toggleHidden = useCallback(
    (id: string) => {
      const node = doc.nodes.find((n) => n.id === id);
      if (!node || node.parentId === null) return;
      setDoc(updateNode(doc, id, { hidden: node.hidden ? undefined : true }));
    },
    [doc, setDoc]
  );

  // keyboard shortcuts (design view, not while typing)
  useEffect(() => {
    if (show) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest('input, textarea, select, [contenteditable]')) return;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        (e.shiftKey ? redo : undo)?.();
      } else if (mod && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        redo?.();
      } else if (design && selected) {
        if (e.key === 'Tab') {
          e.preventDefault();
          add(selected.id);
        } else if (e.key === 'Enter' && selected.parentId) {
          e.preventDefault();
          add(selected.parentId);
        } else if (e.key === 'F2') {
          e.preventDefault();
          setEditingId(selected.id);
        } else if (mod && e.key.toLowerCase() === 'd') {
          e.preventDefault();
          duplicate();
        } else if (e.key === 'Delete' || e.key === 'Backspace') {
          e.preventDefault();
          remove();
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [show, design, selected, add, remove, duplicate, undo, redo]);

  // canvas fullscreen (editing with the whole screen)
  useEffect(() => {
    const onChange = () => setCanvasFull(document.fullscreenElement === rootRef.current && !!rootRef.current);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);
  const toggleCanvasFull = () => {
    if (document.fullscreenElement === rootRef.current) void document.exitFullscreen().catch(() => undefined);
    else void rootRef.current?.requestFullscreen?.().catch(() => setMessage('Trình duyệt không cho mở toàn màn hình.'));
  };

  // ---- export: always the whole map, whatever is on screen
  const capture = async (kind: 'png' | 'pdf') => {
    const el = rootRef.current?.querySelector<HTMLElement>('.react-flow__viewport');
    if (!el) return;
    setBusy(kind === 'png' ? 'Đang xuất PNG…' : 'Đang xuất PDF…');
    setExporting(true);
    setEditingId(null);
    try {
      await nextFrame();
      const bounds = flow.getNodesBounds(flow.getNodes());
      const pad = 48;
      const width = Math.ceil(bounds.width + pad * 2);
      const height = Math.ceil(bounds.height + pad * 2);
      // sharp text: aim for ~3200 px on the long side, but keep the canvas a safe size
      const ratio = Math.max(1, Math.min(3, 3200 / Math.max(width, height), Math.sqrt(36_000_000 / (width * height))));
      const options = {
        backgroundColor: '#FFFFFF',
        width,
        height,
        pixelRatio: ratio,
        style: { width: `${width}px`, height: `${height}px`, transform: `translate(${pad - bounds.x}px, ${pad - bounds.y}px) scale(1)` },
        filter: (n: HTMLElement) => !(n instanceof HTMLElement && n.dataset?.exportIgnore !== undefined),
      };
      if (kind === 'png') {
        download(await toPng(el, options), fileName(doc.title, 'png'));
      } else {
        const url = await toJpeg(el, { ...options, quality: 0.95 });
        const bytes = new Uint8Array(await (await fetch(url)).arrayBuffer());
        const pdf = jpegToA4Pdf(bytes, Math.round(width * ratio), Math.round(height * ratio), doc.title);
        download(new Blob([pdf as BlobPart], { type: 'application/pdf' }), fileName(doc.title, 'pdf'));
      }
      setMessage('');
    } catch {
      setMessage('Không xuất được hình. Nếu sơ đồ có ảnh rất lớn, hãy thử bỏ bớt ảnh rồi xuất lại.');
    } finally {
      setExporting(false);
      setBusy(null);
    }
  };

  const exportJson = () => download(new Blob([JSON.stringify(doc, null, 2)], { type: 'application/json' }), fileName(doc.title, 'json'));

  const onImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !selected) return;
    const r = await shrinkImage(file);
    if (!r.ok) setMessage(r.message);
    else {
      setMessage('');
      change(updateNode(doc, selected.id, { image: r.url }));
    }
  };

  const insertText = (s: string) => {
    if (!selected) return;
    setDoc(updateNode(doc, selected.id, { label: selected.label + s }));
  };

  const hiddenCount = doc.nodes.filter((n) => n.hidden).length;
  const showPanel = !presenting;
  const parents = selected && selected.parentId ? possibleParents(doc, selected.id) : [];
  const childCount = selected ? descendantIds(doc, selected.id).length : 0;

  return (
    <EditCtx.Provider value={{ editingId, commit: commitLabel }}>
      <div ref={rootRef} className={`space-y-3 ${canvasFull ? 'flex h-screen flex-col bg-white p-3' : ''}`}>
        {/* ---- top bar: file, title, modes */}
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <ToolBtn icon={ArrowLeft} label="Thư viện sơ đồ" onClick={onLibrary} />
          <input
            value={doc.title}
            maxLength={80}
            aria-label="Tên sơ đồ"
            onChange={(e) => setDoc({ ...doc, title: e.target.value }, false)}
            onBlur={() => setDoc(doc)}
            className="min-w-[160px] flex-1 rounded-xl border-2 border-transparent bg-[#F6FAFF] px-3 py-2 font-display text-lg font-extrabold text-[#071A63] hover:border-[#DCE7F3] focus:border-[#1267E9] focus:outline-none sm:max-w-[360px]"
          />
          <button
            type="button"
            onClick={onSaveNow}
            className={`studio-btn min-h-[40px] px-3 ${saveState.ok ? 'studio-btn-secondary' : 'studio-btn-danger'}`}
            title="Sơ đồ tự lưu trên máy này mỗi khi bạn sửa"
          >
            <Save className="h-4 w-4" /> {saveState.ok ? saveState.message || 'Lưu' : 'Chưa lưu được'}
          </button>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <div className="flex overflow-hidden rounded-full border border-[#DCE7F3] bg-white text-sm font-bold">
              {(
                [
                  ['design', 'Thiết kế', Pencil],
                  ['student', 'Học sinh hoàn thiện', Users],
                ] as const
              ).map(([v, l, Icon]) => (
                <button
                  key={v}
                  type="button"
                  aria-pressed={mode === v}
                  onClick={() => {
                    setMode(v);
                    setEditingId(null);
                  }}
                  className={`inline-flex min-h-[40px] items-center gap-1.5 px-3.5 ${mode === v ? 'bg-[#071A63] text-white' : 'text-[#071A63]'}`}
                >
                  <Icon className="h-4 w-4" /> {l}
                </button>
              ))}
            </div>
            <button type="button" onClick={() => setShow(mode === 'student' ? 'student' : 'slides')} className="studio-btn studio-btn-accent min-h-[40px] px-4">
              <MonitorPlay className="h-4 w-4" /> Trình chiếu
            </button>
          </div>
        </div>

        {/* ---- edit bar */}
        <div className="flex shrink-0 flex-wrap items-center gap-1.5 rounded-2xl bg-[#F6FAFF] p-1.5 ring-1 ring-[#DCE7F3]">
          <ToolBtn icon={Undo2} label="Hoàn tác" onClick={() => undo?.()} disabled={!undo} />
          <ToolBtn icon={Redo2} label="Làm lại" onClick={() => redo?.()} disabled={!redo} />
          <span className="mx-1 h-6 w-px bg-[#DCE7F3]" />
          {design && (
            <>
              <ToolBtn icon={Plus} label="Nhánh chính" primary onClick={() => add(rootOf(doc).id)} />
              <ToolBtn icon={GitBranchPlus} label="Nhánh con" onClick={() => selected && add(selected.id)} disabled={!selected} />
              <ToolBtn icon={Copy} label="Nhân bản" onClick={duplicate} disabled={!selected?.parentId} />
              <span className="mx-1 h-6 w-px bg-[#DCE7F3]" />
            </>
          )}
          <div className="flex overflow-hidden rounded-full border border-[#DCE7F3] bg-white text-sm font-bold">
            {(
              [
                ['radial', 'Tỏa tròn'],
                ['both', 'Trái – phải'],
                ['tree', 'Cây'],
              ] as const
            ).map(([v, l]) => (
              <button
                key={v}
                type="button"
                aria-pressed={doc.layout === v}
                onClick={() => {
                  setDoc(arrange(doc, v));
                  fit();
                }}
                className={`min-h-[38px] px-3 ${doc.layout === v ? 'bg-[#1267E9] text-white' : 'text-[#1267E9]'}`}
              >
                {l}
              </button>
            ))}
          </div>
          <ToolBtn
            icon={LayoutGrid}
            label="Tự sắp xếp"
            onClick={() => {
              setDoc(arrange(doc));
              fit();
            }}
          />
          <ToolBtn icon={Crosshair} label="Về giữa" onClick={fit} />
          <label className="flex items-center gap-1.5 px-1 text-sm font-bold text-[#5E6C84]">
            <input type="checkbox" checked={autoArrange} onChange={(e) => setAutoArrange(e.target.checked)} className="h-4 w-4 accent-[#1267E9]" />
            Tự xếp khi thêm
          </label>
          <select
            value={doc.edgeStyle}
            aria-label="Kiểu đường nối"
            onChange={(e) => setDoc({ ...doc, edgeStyle: e.target.value as MindEdgeStyle })}
            className="min-h-[38px] rounded-full border border-[#DCE7F3] bg-white px-3 text-sm font-bold text-[#172B4D]"
          >
            <option value="curve">Nối cong mềm</option>
            <option value="straight">Nối thẳng</option>
            <option value="step">Nối bậc thang</option>
          </select>
          <div className="ml-auto flex flex-wrap items-center gap-1.5">
            <ToolBtn icon={ImageDown} label="Xuất PNG" onClick={() => capture('png')} disabled={!!busy} />
            <ToolBtn icon={FileText} label="Xuất PDF" onClick={() => capture('pdf')} disabled={!!busy} />
            <ToolBtn icon={Download} label="Xuất JSON" onClick={exportJson} />
            <ToolBtn icon={FolderOpen} label="Nhập JSON" onClick={onImport} />
            <ToolBtn icon={canvasFull ? Minimize2 : Maximize2} label={canvasFull ? 'Thu nhỏ' : 'Toàn màn hình'} onClick={toggleCanvasFull} />
          </div>
        </div>

        {(busy || message || !saveState.ok) && (
          <p className={`shrink-0 rounded-xl px-4 py-2 text-sm font-bold ${busy ? 'bg-[#EAF5FF] text-[#1267E9]' : 'bg-[#FFEDF1] text-[#D93B5B]'}`}>
            {busy ?? (message || saveState.message)}
          </p>
        )}

        <div className={`grid gap-3 ${showPanel ? 'lg:grid-cols-[minmax(0,1fr)_320px]' : ''} ${canvasFull ? 'min-h-0 flex-1' : ''}`}>
          <div
            className={`mimo-mindmap overflow-hidden rounded-2xl border border-[#DCE7F3] bg-white ${
              canvasFull ? 'h-full min-h-0' : presenting ? 'h-[calc(100vh-230px)]' : 'h-[70vh] min-h-[460px]'
            } ${mode === 'student' ? 'ring-2 ring-[#7B5CFF]' : ''}`}
          >
            <ReactFlow<MindFlowNode, MindFlowEdge>
              nodes={rfNodes}
              edges={edges}
              nodeTypes={NODE_TYPES}
              edgeTypes={EDGE_TYPES}
              nodeOrigin={[0.5, 0.5]}
              onNodesChange={onNodesChange}
              onNodeClick={(_, n) => (design ? setSelectedId(n.id) : toggleHidden(n.id))}
              onNodeDoubleClick={(_, n) => {
                if (!design) return;
                setSelectedId(n.id);
                setEditingId(n.id);
              }}
              onNodeDragStop={(_, n) => {
                const cur = doc.nodes.find((x) => x.id === n.id);
                if (cur && (cur.x !== n.position.x || cur.y !== n.position.y)) setDoc(updateNode(doc, n.id, { x: n.position.x, y: n.position.y }));
              }}
              onPaneClick={() => {
                setSelectedId(null);
                setEditingId(null);
              }}
              nodesDraggable={design && !editingId}
              nodesConnectable={false}
              deleteKeyCode={null}
              zoomOnDoubleClick={false}
              minZoom={0.1}
              maxZoom={2.5}
              fitView
              fitViewOptions={{ padding: 0.12 }}
            >
              <Background color="#DCE7F3" gap={28} />
              <Controls showInteractive={false} position="bottom-left" />
            </ReactFlow>
          </div>

          {showPanel && (
            <aside className={`studio-card space-y-4 overflow-y-auto p-4 ${canvasFull ? 'min-h-0' : 'max-h-[70vh] min-h-[460px]'}`}>
              {mode === 'student' ? (
                <div className="space-y-3 text-sm text-[#172B4D]">
                  <p className="font-display text-base font-extrabold text-[#071A63]">Học sinh hoàn thiện sơ đồ</p>
                  <ol className="list-decimal space-y-1 pl-4 text-[#5E6C84]">
                    <li>Bấm vào các ô muốn ẩn với học sinh (bấm lại để bỏ ẩn). Nội dung gốc vẫn được giữ nguyên.</li>
                    <li>
                      Bấm <b>Trình chiếu</b>: các ô đó hiện dấu “?”.
                    </li>
                    <li>Khi học sinh trả lời, bấm vào từng ô để hiện đáp án, hoặc “Hiện toàn bộ đáp án”.</li>
                    <li>Bấm “Đặt lại” để ẩn lại và dạy lớp khác.</li>
                  </ol>
                  <p className="rounded-xl bg-[#F1EDFF] px-3 py-2 font-bold text-[#6A4BE6]">Đang ẩn {hiddenCount} ô</p>
                  <button
                    type="button"
                    disabled={hiddenCount === 0}
                    onClick={() => setDoc({ ...doc, nodes: doc.nodes.map(({ hidden: _h, ...n }) => n) })}
                    className="studio-btn studio-btn-secondary w-full"
                  >
                    <Eye className="h-4 w-4" /> Bỏ ẩn tất cả
                  </button>
                  <button type="button" onClick={() => setShow('student')} className="studio-btn studio-btn-accent w-full">
                    <MonitorPlay className="h-4 w-4" /> Trình chiếu cho học sinh
                  </button>
                </div>
              ) : !selected ? (
                <div className="space-y-3 text-sm text-[#5E6C84]">
                  <p className="font-display text-base font-extrabold text-[#071A63]">Bấm vào một ý để chỉnh sửa</p>
                  <ul className="list-disc space-y-1 pl-4">
                    <li>Bấm đúp vào ý để sửa chữ ngay trên sơ đồ (Ctrl + Enter để xong, có thể xuống dòng).</li>
                    <li>Kéo ý để đổi vị trí; cuộn chuột hoặc chụm hai ngón để phóng to/thu nhỏ; kéo nền để di chuyển.</li>
                    <li>
                      Phím tắt: <b>Tab</b> nhánh con · <b>Enter</b> cùng cấp · <b>F2</b> sửa · <b>Ctrl+D</b> nhân bản · <b>Delete</b> xóa · <b>Ctrl+Z</b>/<b>Ctrl+Y</b>
                    </li>
                  </ul>
                  <button type="button" onClick={() => add(rootOf(doc).id)} className="studio-btn studio-btn-primary w-full">
                    <Plus className="h-4 w-4" /> Thêm nhánh chính
                  </button>
                </div>
              ) : (
                <>
                  <Section title={selected.parentId ? 'Nội dung ý' : 'Chủ đề trung tâm'}>
                    <textarea
                      value={selected.label}
                      rows={3}
                      maxLength={300}
                      aria-label="Nội dung ý đang chọn"
                      onChange={(e) => setDoc(updateNode(doc, selected.id, { label: e.target.value }), false)}
                      onBlur={() => setDoc(doc)}
                      className="w-full rounded-xl border-2 border-[#DCE7F3] px-3 py-2 text-base font-bold text-[#172B4D] focus:border-[#1267E9] focus:outline-none"
                    />
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {MATH_SYMBOLS.map((s) => (
                        <button key={s} type="button" onClick={() => insertText(s)} className="min-h-[30px] min-w-[30px] rounded-lg bg-[#F6FAFF] px-1.5 text-sm font-bold text-[#071A63] ring-1 ring-[#DCE7F3] hover:bg-[#EAF5FF]">
                          {s}
                        </button>
                      ))}
                    </div>
                  </Section>

                  <div className="grid grid-cols-2 gap-2">
                    <button type="button" onClick={() => add(selected.id)} className="studio-btn studio-btn-primary">
                      <GitBranchPlus className="h-4 w-4" /> Nhánh con
                    </button>
                    <button type="button" disabled={!selected.parentId} onClick={() => selected.parentId && add(selected.parentId)} className="studio-btn studio-btn-secondary">
                      <Plus className="h-4 w-4" /> Cùng cấp
                    </button>
                  </div>

                  <Section title="Chữ">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <button
                        type="button"
                        aria-pressed={selected.bold !== false}
                        onClick={() => setDoc(updateNode(doc, selected.id, { bold: selected.bold === false ? undefined : false }))}
                        className={`flex h-9 w-9 items-center justify-center rounded-lg ${selected.bold !== false ? 'bg-[#071A63] text-white' : 'bg-[#F6FAFF] text-[#071A63] ring-1 ring-[#DCE7F3]'}`}
                        title="Chữ đậm"
                      >
                        <Bold className="h-4 w-4" />
                      </button>
                      {FONT_SIZES.map((s) => {
                        const on = fontSizeOf(selected, depthOf(doc, selected.id)) === s;
                        return (
                          <button
                            key={s}
                            type="button"
                            aria-pressed={on}
                            onClick={() => change(updateNode(doc, selected.id, { fontSize: s }))}
                            className={`h-9 min-w-[36px] rounded-lg px-1.5 text-sm font-bold ${on ? 'bg-[#1267E9] text-white' : 'bg-[#F6FAFF] text-[#071A63] ring-1 ring-[#DCE7F3]'}`}
                          >
                            {s}
                          </button>
                        );
                      })}
                    </div>
                  </Section>

                  <Section title="Hình dạng">
                    <div className="grid grid-cols-3 gap-1.5">
                      {(
                        [
                          ['rounded', 'Bo góc', Square],
                          ['circle', 'Tròn', Circle],
                          ['ellipse', 'Elip', Circle],
                        ] as const
                      ).map(([v, l, Icon]) => {
                        const on = (selected.shape ?? 'rounded') === v;
                        return (
                          <button
                            key={v}
                            type="button"
                            aria-pressed={on}
                            onClick={() => change(updateNode(doc, selected.id, { shape: v === 'rounded' ? undefined : v }))}
                            className={`flex min-h-[38px] items-center justify-center gap-1 rounded-lg text-sm font-bold ${on ? 'bg-[#1267E9] text-white' : 'bg-[#F6FAFF] text-[#071A63] ring-1 ring-[#DCE7F3]'}`}
                          >
                            <Icon className={`h-4 w-4 ${v === 'ellipse' ? 'scale-x-150' : ''}`} /> {l}
                          </button>
                        );
                      })}
                    </div>
                  </Section>

                  {selected.parentId && (
                    <Section title="Màu nhánh (cả nhánh con)">
                      <div className="flex flex-wrap gap-1.5">
                        {MIND_COLORS.map((c) => (
                          <button
                            key={c}
                            type="button"
                            aria-label={`Màu nhánh ${c}`}
                            onClick={() => setDoc(recolorBranch(doc, selected.id, c))}
                            className={`h-8 w-8 rounded-full ${selected.color === c ? 'ring-4 ring-[#FFD34E] ring-offset-1' : ''}`}
                            style={{ background: c }}
                          />
                        ))}
                      </div>
                    </Section>
                  )}

                  <Section title="Màu nền ô">
                    <div className="flex flex-wrap gap-1.5">
                      <button
                        type="button"
                        onClick={() => setDoc(updateNode(doc, selected.id, { fill: undefined }))}
                        className={`h-8 rounded-full px-2.5 text-xs font-bold text-[#5E6C84] ring-1 ring-[#DCE7F3] ${!selected.fill ? 'bg-[#EAF5FF] ring-2 ring-[#1267E9]' : 'bg-white'}`}
                      >
                        Mặc định
                      </button>
                      {[...MIND_FILLS, ...MIND_COLORS].map((c) => (
                        <button
                          key={c}
                          type="button"
                          aria-label={`Màu nền ${c}`}
                          onClick={() => setDoc(updateNode(doc, selected.id, { fill: c }))}
                          className={`h-8 w-8 rounded-full ring-1 ring-[#DCE7F3] ${selected.fill === c ? 'ring-4 ring-[#FFD34E] ring-offset-1' : ''}`}
                          style={{ background: c }}
                        />
                      ))}
                    </div>
                  </Section>

                  <Section title="Biểu tượng">
                    <div className="grid grid-cols-7 gap-1">
                      <button
                        type="button"
                        onClick={() => change(updateNode(doc, selected.id, { icon: undefined }))}
                        className={`h-9 rounded-lg text-[11px] font-bold text-[#5E6C84] ${!selected.icon ? 'bg-[#EAF5FF] ring-2 ring-[#1267E9]' : 'bg-[#F6FAFF]'}`}
                      >
                        Không
                      </button>
                      {MIND_ICONS.map((ic) => (
                        <button
                          key={ic}
                          type="button"
                          onClick={() => change(updateNode(doc, selected.id, { icon: ic }))}
                          className={`h-9 rounded-lg text-lg ${selected.icon === ic ? 'bg-[#EAF5FF] ring-2 ring-[#1267E9]' : 'bg-[#F6FAFF]'}`}
                        >
                          {ic}
                        </button>
                      ))}
                    </div>
                  </Section>

                  <Section title="Hình ảnh">
                    <div className="flex gap-2">
                      <button type="button" onClick={() => imageRef.current?.click()} className="studio-btn studio-btn-secondary flex-1">
                        <ImagePlus className="h-4 w-4" /> {selected.image ? 'Đổi ảnh' : 'Chèn ảnh từ máy'}
                      </button>
                      {selected.image && (
                        <button type="button" onClick={() => change(updateNode(doc, selected.id, { image: undefined }))} className="studio-btn studio-btn-secondary" aria-label="Bỏ ảnh">
                          <X className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </Section>

                  {selected.parentId && (
                    <>
                      <label className="block">
                        <span className="text-xs font-bold uppercase tracking-wide text-[#5E6C84]">Chuyển sang nhánh</span>
                        <select
                          value={selected.parentId}
                          onChange={(e) => change(moveNode(doc, selected.id, e.target.value))}
                          className="mt-1 w-full rounded-xl border-2 border-[#DCE7F3] bg-white px-3 py-2 text-sm"
                        >
                          {parents.map((p) => (
                            <option key={p.id} value={p.id}>
                              {'— '.repeat(depthOf(doc, p.id))}
                              {p.label.split('\n')[0] || '…'}
                            </option>
                          ))}
                        </select>
                      </label>
                      <div className="grid grid-cols-2 gap-2">
                        <button type="button" onClick={duplicate} className="studio-btn studio-btn-secondary">
                          <Copy className="h-4 w-4" /> Nhân bản
                        </button>
                        {confirmDelete ? (
                          <button type="button" onClick={remove} className="studio-btn studio-btn-danger">
                            <Trash2 className="h-4 w-4" /> Xóa cả {childCount} nhánh con?
                          </button>
                        ) : (
                          <button type="button" onClick={() => (childCount > 0 ? setConfirmDelete(true) : remove())} className="studio-btn studio-btn-danger">
                            <Trash2 className="h-4 w-4" /> Xóa ý
                          </button>
                        )}
                      </div>
                    </>
                  )}
                </>
              )}
            </aside>
          )}
        </div>
        <input ref={imageRef} type="file" accept="image/*" className="hidden" onChange={onImage} data-testid="mindmap-image" />
      </div>
      {show && <Presentation doc={doc} kind={show} onExit={() => setShow(null)} />}
    </EditCtx.Provider>
  );
};

// ------------------------------------------------------------------ tool

/** "Sơ đồ tư duy Mimo": maps stay in this browser (autosave library) or JSON files – nothing is sent to the server. */
export const MindMapTool: React.FC<{ presenting: boolean }> = ({ presenting }) => {
  const [current, setCurrent] = useState<{ id: string; doc: MindMapDoc } | null>(null);
  const [error, setError] = useState('');
  const [saveState, setSaveState] = useState({ ok: true, message: '' });
  const past = useRef<MindMapDoc[]>([]);
  const future = useRef<MindMapDoc[]>([]);
  const lastRecorded = useRef<MindMapDoc | null>(null);
  const docRef = useRef<MindMapDoc | null>(null);
  docRef.current = current?.doc ?? null;
  const fileRef = useRef<HTMLInputElement>(null);
  const [, force] = useState(0);

  const persist = useCallback((id: string, doc: MindMapDoc) => {
    const r = saveMap(id, doc);
    setSaveState(r.ok ? { ok: true, message: `Đã lưu ${new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}` } : { ok: false, message: r.message });
  }, []);

  // autosave a moment after each change
  useEffect(() => {
    if (!current) return;
    const id = window.setTimeout(() => persist(current.id, current.doc), 500);
    return () => window.clearTimeout(id);
  }, [current, persist]);

  /** record=false: live typing / layout settling; the change joins the previous undo step. */
  const setDoc = useCallback((next: MindMapDoc, record = true) => {
    if (record) {
      const base = lastRecorded.current;
      if (base && base !== next) {
        past.current = [...past.current.slice(-59), base];
        future.current = [];
        force((x) => x + 1);
      }
      lastRecorded.current = next;
    } else if (lastRecorded.current && docRef.current === lastRecorded.current) {
      // a quiet follow-up of a recorded change (e.g. layout settling) belongs to the same step
      lastRecorded.current = next;
    }
    setCurrent((c) => (c ? { ...c, doc: next } : c));
  }, []);

  const open = (id: string, doc: MindMapDoc) => {
    past.current = [];
    future.current = [];
    lastRecorded.current = doc;
    setError('');
    setCurrent({ id, doc });
  };

  /** Pending typing counts as a step before undo/redo. */
  const settle = () => {
    const cur = docRef.current;
    if (cur && lastRecorded.current && cur !== lastRecorded.current) {
      past.current = [...past.current.slice(-59), lastRecorded.current];
      future.current = [];
      lastRecorded.current = cur;
    }
  };

  const undo = () => {
    settle();
    const prev = past.current.pop();
    const cur = docRef.current;
    if (!prev || !cur) return;
    future.current.push(cur);
    lastRecorded.current = prev;
    setCurrent((c) => (c ? { ...c, doc: prev } : c));
    force((x) => x + 1);
  };

  const redo = () => {
    settle();
    const next = future.current.pop();
    const cur = docRef.current;
    if (!next || !cur) return;
    past.current.push(cur);
    lastRecorded.current = next;
    setCurrent((c) => (c ? { ...c, doc: next } : c));
    force((x) => x + 1);
  };

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const parsed = parseMindMap(JSON.parse(await file.text()));
      if (typeof parsed === 'string') setError(parsed);
      else {
        const id = newMapId();
        const r = saveMap(id, parsed);
        if (!r.ok) setError(r.message);
        open(id, parsed);
      }
    } catch {
      setError('Không đọc được tệp. Hãy chọn tệp .json được lưu từ Sơ đồ tư duy Mimo.');
    }
  };

  return (
    <ReactFlowProvider>
      <input ref={fileRef} type="file" accept=".json,application/json" className="hidden" onChange={onFile} data-testid="mindmap-file" />
      {current ? (
        <>
          {error && <p className="mb-3 rounded-xl bg-[#FFEDF1] px-4 py-2 text-sm font-bold text-[#D93B5B]">{error}</p>}
          <Editor
            key={current.id}
            doc={current.doc}
            setDoc={setDoc}
            undo={past.current.length || (docRef.current && docRef.current !== lastRecorded.current) ? undo : null}
            redo={future.current.length ? redo : null}
            presenting={presenting}
            saveState={saveState}
            onSaveNow={() => persist(current.id, current.doc)}
            onLibrary={() => {
              persist(current.id, current.doc);
              setCurrent(null);
              setSaveState({ ok: true, message: '' });
            }}
            onImport={() => fileRef.current?.click()}
          />
        </>
      ) : (
        <LibraryScreen onOpen={open} onImport={() => fileRef.current?.click()} notice={error} />
      )}
    </ReactFlowProvider>
  );
};

// re-exported for tests of the export pipeline
export { childrenOf };
