import React, { useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import katex from 'katex';
import { Check, Crop, Pencil, Trash2, X } from 'lucide-react';
import { InputRule, mergeAttributes, Node, nodePasteRule } from '@tiptap/core';
import {
  NodeViewProps,
  NodeViewWrapper,
  ReactNodeViewRenderer,
} from '@tiptap/react';
import { GeometryDrawingData } from '../../types/domain';
import { GeometryBuilderModal } from './GeometryBuilderModal';
import { GeometryRenderer } from './GeometryRenderer';
import { MathField } from './MathField';
import { useFigureCrop } from './FigureCropContext';

/** Keep ProseMirror away from inputs and buttons living inside node views. */
const stopEvent = ({ event }: { event: Event }) => {
  const target = event.target as HTMLElement | null;
  return Boolean(target?.closest?.('input, textarea, button, math-field'));
};

function renderKatex(latex: string, displayMode: boolean): string {
  return katex.renderToString(latex || '\\square', { throwOnError: false, displayMode });
}

interface MathPopoverProps {
  anchorRef: React.RefObject<HTMLElement | null>;
  initialLatex: string;
  onSave: (latex: string) => void;
  onCancel: () => void;
}

/** Floating MathLive box, portalled out of the editor so typing isn't captured by ProseMirror. */
const MathPopover: React.FC<MathPopoverProps> = ({
  anchorRef,
  initialLatex,
  onSave,
  onCancel,
}) => {
  const [latex, setLatex] = useState(initialLatex);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  useLayoutEffect(() => {
    const rect = anchorRef.current?.getBoundingClientRect();
    if (!rect) return;
    const width = Math.min(440, window.innerWidth - 24);
    setPos({
      top: rect.bottom + window.scrollY + 6,
      left: Math.max(12, Math.min(rect.left + window.scrollX, window.innerWidth - width - 12)),
    });
  }, [anchorRef]);

  if (!pos) return null;

  return createPortal(
    <div
      // Clicks must not bubble (through React) back to the node view that opened us.
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        if (e.key === 'Escape') onCancel();
      }}
      style={{ top: pos.top, left: pos.left, width: Math.min(440, window.innerWidth - 24) }}
      className="absolute z-[60] rounded-xl border-2 border-slate-800 bg-white p-2.5 shadow-xl"
    >
      <MathField value={latex} onChange={setLatex} autoFocus onEnter={() => onSave(latex.trim())} />
      <div className="mt-2 flex items-center justify-between gap-2">
        <span className="text-[11px] text-slate-500">
          Gõ <b>/</b> phân số · <b>sqrt</b> căn · <b>goc</b> góc · ⌨ bàn phím Toán
        </span>
        <div className="flex gap-1.5">
          <button
            type="button"
            onClick={onCancel}
            aria-label="Hủy"
            className="rounded-lg border border-slate-300 p-1.5 text-slate-600 hover:bg-slate-100"
          >
            <X className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => onSave(latex.trim())}
            className="flex items-center gap-1 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-extrabold text-white"
          >
            <Check className="h-3.5 w-3.5" />
            Xong
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};

/** Shared editing behaviour for inline and display formulas. */
function useMathNodeEditing({ node, editor, getPos, updateAttributes, deleteNode }: NodeViewProps) {
  const [editing, setEditing] = useState<boolean>(!node.attrs.latex);
  const save = (latex: string) => {
    setEditing(false);
    if (!latex) {
      deleteNode();
      editor.commands.focus();
      return;
    }
    updateAttributes({ latex });
    const pos = getPos();
    if (typeof pos === 'number') {
      editor.chain().focus().setTextSelection(pos + node.nodeSize).run();
    }
  };
  const cancel = () => {
    setEditing(false);
    if (!node.attrs.latex) deleteNode();
    editor.commands.focus();
  };
  return { editing, setEditing, save, cancel };
}

const InlineMathView: React.FC<NodeViewProps> = (props) => {
  const { node, selected, editor } = props;
  const anchorRef = useRef<HTMLSpanElement>(null);
  const { editing, setEditing, save, cancel } = useMathNodeEditing(props);

  return (
    <NodeViewWrapper
      as="span"
      className={`mx-0.5 inline-block cursor-pointer rounded px-0.5 align-middle hover:bg-blue-50 ${
        selected || editing ? 'bg-blue-100 ring-2 ring-blue-500' : ''
      }`}
      onClick={() => editor.isEditable && setEditing(true)}
      title="Bấm để sửa công thức"
    >
      <span
        ref={anchorRef}
        contentEditable={false}
        dangerouslySetInnerHTML={{ __html: renderKatex(node.attrs.latex, false) }}
      />
      {editing && (
        <MathPopover anchorRef={anchorRef} initialLatex={node.attrs.latex} onSave={save} onCancel={cancel} />
      )}
    </NodeViewWrapper>
  );
};

const BlockMathView: React.FC<NodeViewProps> = (props) => {
  const { node, selected, editor } = props;
  const anchorRef = useRef<HTMLDivElement>(null);
  const { editing, setEditing, save, cancel } = useMathNodeEditing(props);

  return (
    <NodeViewWrapper
      className={`my-2 cursor-pointer overflow-x-auto rounded-lg px-3 py-2 text-center hover:bg-blue-50 ${
        selected || editing ? 'bg-blue-50 ring-2 ring-blue-500' : ''
      }`}
      onClick={() => editor.isEditable && setEditing(true)}
      title="Bấm để sửa công thức"
    >
      <div
        ref={anchorRef}
        contentEditable={false}
        dangerouslySetInnerHTML={{ __html: renderKatex(node.attrs.latex, true) }}
      />
      {editing && (
        <MathPopover anchorRef={anchorRef} initialLatex={node.attrs.latex} onSave={save} onCancel={cancel} />
      )}
    </NodeViewWrapper>
  );
};

const NodeActions: React.FC<{
  onEdit?: () => void;
  onRecrop?: () => void;
  onDelete: () => void;
}> = ({ onEdit, onRecrop, onDelete }) => (
  <div className="absolute right-2 top-2 flex gap-1 opacity-0 transition group-hover:opacity-100">
    {onRecrop && (
      <button
        type="button"
        onClick={onRecrop}
        className="flex items-center gap-1 rounded-lg border border-slate-800 bg-white px-2 py-1 text-[11px] font-bold text-slate-800"
      >
        <Crop className="h-3 w-3" />
        Cắt lại
      </button>
    )}
    {onEdit && (
      <button
        type="button"
        onClick={onEdit}
        className="flex items-center gap-1 rounded-lg border border-slate-800 bg-white px-2 py-1 text-[11px] font-bold text-slate-800"
      >
        <Pencil className="h-3 w-3" />
        Sửa hình
      </button>
    )}
    <button
      type="button"
      onClick={onDelete}
      aria-label="Xóa"
      className="rounded-lg border border-rose-300 bg-white p-1 text-rose-600 hover:bg-rose-50"
    >
      <Trash2 className="h-3.5 w-3.5" />
    </button>
  </div>
);

const ImageBlockView: React.FC<NodeViewProps> = ({ node, selected, updateAttributes, deleteNode }) => {
  const figureCrop = useFigureCrop();
  const canRecrop = figureCrop?.canRecrop(node.attrs.url) ?? false;
  const recrop = async () => {
    const url = await figureCrop?.recrop(node.attrs.url);
    if (url) updateAttributes({ url });
  };
  return (
    <NodeViewWrapper
      className={`group relative my-2 inline-block max-w-full rounded-xl border-2 bg-white p-2 ${
        selected ? 'border-blue-500' : 'border-transparent hover:border-slate-300'
      }`}
    >
      <div contentEditable={false}>
        <img
          src={node.attrs.url}
          alt={node.attrs.alt || 'Hình minh họa'}
          referrerPolicy="no-referrer"
          className="max-h-72 w-auto max-w-full rounded-lg object-contain"
          draggable={false}
        />
        <input
          type="text"
          value={node.attrs.caption}
          onChange={(e) => updateAttributes({ caption: e.target.value })}
          placeholder="Chú thích ảnh (không bắt buộc)"
          className="mt-1 w-full border-0 bg-transparent text-center text-xs text-slate-600 placeholder:text-slate-300 focus:outline-none"
        />
        <NodeActions onRecrop={canRecrop ? recrop : undefined} onDelete={deleteNode} />
      </div>
    </NodeViewWrapper>
  );
};

const GeometryView: React.FC<NodeViewProps> = ({ node, selected, updateAttributes, deleteNode }) => {
  const [editing, setEditing] = useState(false);
  return (
    <NodeViewWrapper
      className={`group relative my-2 rounded-xl border-2 p-2 ${
        selected ? 'border-blue-500' : 'border-transparent hover:border-slate-300'
      }`}
    >
      <div contentEditable={false} onDoubleClick={() => setEditing(true)}>
        <GeometryRenderer drawing={node.attrs.drawing as GeometryDrawingData} />
        <NodeActions onEdit={() => setEditing(true)} onDelete={deleteNode} />
      </div>
      {editing &&
        createPortal(
          <GeometryBuilderModal
            initialDrawing={node.attrs.drawing as GeometryDrawingData}
            onSave={(drawing) => {
              updateAttributes({ drawing });
              setEditing(false);
            }}
            onClose={() => setEditing(false)}
          />,
          document.body
        )}
    </NodeViewWrapper>
  );
};

export const InlineMath = Node.create({
  name: 'inlineMath',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,
  addAttributes() {
    return {
      latex: {
        default: '',
        parseHTML: (el) => el.getAttribute('data-latex') ?? '',
        renderHTML: (attrs) => ({ 'data-latex': attrs.latex }),
      },
    };
  },
  parseHTML() {
    return [{ tag: 'span[data-inline-math]' }];
  },
  renderHTML({ HTMLAttributes }) {
    return ['span', mergeAttributes(HTMLAttributes, { 'data-inline-math': '' })];
  },
  renderText({ node }) {
    return `$${node.attrs.latex}$`;
  },
  addNodeView() {
    return ReactNodeViewRenderer(InlineMathView, { stopEvent });
  },
  addInputRules() {
    // Typing $x^2$ turns into a formula as soon as the closing $ is typed.
    // (nodeInputRule would re-insert the closing "$", so use a custom rule.)
    return [
      new InputRule({
        find: /(^|[^$\\])\$([^$\s][^$]*)\$$/,
        handler: ({ state, range, match }) => {
          const start = range.from + (match[1]?.length ?? 0);
          state.tr.replaceWith(start, range.to, this.type.create({ latex: match[2] }));
        },
      }),
    ];
  },
  addPasteRules() {
    return [
      nodePasteRule({
        find: /\$([^$\n]+)\$/g,
        type: this.type,
        getAttributes: (match) => ({ latex: match[1] }),
      }),
    ];
  },
});

export const BlockMath = Node.create({
  name: 'blockMath',
  group: 'block',
  atom: true,
  selectable: true,
  addAttributes() {
    return {
      latex: {
        default: '',
        parseHTML: (el) => el.getAttribute('data-latex') ?? '',
        renderHTML: (attrs) => ({ 'data-latex': attrs.latex }),
      },
    };
  },
  parseHTML() {
    return [{ tag: 'div[data-block-math]' }];
  },
  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-block-math': '' })];
  },
  addNodeView() {
    return ReactNodeViewRenderer(BlockMathView, { stopEvent });
  },
});

export const ImageBlock = Node.create({
  name: 'imageBlock',
  group: 'block',
  atom: true,
  draggable: true,
  addAttributes() {
    return { url: { default: '' }, alt: { default: '' }, caption: { default: '' } };
  },
  parseHTML() {
    return [{ tag: 'figure[data-image-block]' }];
  },
  renderHTML({ HTMLAttributes }) {
    return ['figure', mergeAttributes(HTMLAttributes, { 'data-image-block': '' })];
  },
  addNodeView() {
    return ReactNodeViewRenderer(ImageBlockView, { stopEvent });
  },
});

export const Geometry = Node.create({
  name: 'geometry',
  group: 'block',
  atom: true,
  draggable: true,
  addAttributes() {
    return {
      drawing: {
        default: null,
        // Serialized so copy/paste inside the editor keeps the drawing.
        parseHTML: (el) => {
          try {
            return JSON.parse(el.getAttribute('data-drawing') || 'null');
          } catch {
            return null;
          }
        },
        renderHTML: (attrs) => ({ 'data-drawing': JSON.stringify(attrs.drawing) }),
      },
    };
  },
  parseHTML() {
    return [{ tag: 'div[data-geometry]' }];
  },
  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-geometry': '' })];
  },
  addNodeView() {
    return ReactNodeViewRenderer(GeometryView, { stopEvent });
  },
});
