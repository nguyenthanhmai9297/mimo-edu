import React, { useState } from 'react';
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  Box,
  Compass,
  Eye,
  Image as ImageIcon,
  Italic,
  List,
  ListOrdered,
  Plus,
  Sigma,
  Trash2,
} from 'lucide-react';
import {
  GeometryDrawingData,
  RichBlockNode,
  RichTextContent,
  TextAlignment,
} from '../../types/domain';
import { GeometryBuilderModal } from './GeometryBuilderModal';
import { Geometry3DModal } from '../geometry3d/Geometry3DModal';
import { RichContentRenderer } from './RichContentRenderer';

interface MathRichEditorProps {
  value: RichTextContent;
  onChange: (next: RichTextContent) => void;
  label?: string;
  compact?: boolean;
}

const QUICK_MATH_MACROS = [
  { label: 'Phân số a/b', latex: '\\frac{a}{b}' },
  { label: 'Căn bậc hai', latex: '\\sqrt{x}' },
  { label: 'Số mũ x²', latex: 'x^{2}' },
  { label: 'Góc ABC', latex: '\\widehat{ABC}' },
  { label: 'Tam giác', latex: '\\triangle ABC' },
  { label: 'Nhân ×', latex: '\\times' },
  { label: 'Chia ÷', latex: '\\div' },
  { label: '≤', latex: '\\le' },
  { label: '≥', latex: '\\ge' },
  { label: 'Số π', latex: '\\pi' },
];

export const MathRichEditor: React.FC<MathRichEditorProps> = ({
  value,
  onChange,
  label,
  compact = false,
}) => {
  const [showPreview, setShowPreview] = useState(false);
  const [showGeometryModal, setShowGeometryModal] = useState(false);
  const [show3DModal, setShow3DModal] = useState(false);
  const [editingGeomIdx, setEditingGeomIdx] = useState<number | null>(null);

  const blocks =
    value?.blocks && value.blocks.length > 0
      ? value.blocks
      : [{ type: 'paragraph' as const, align: 'left' as const, text: '' }];

  const updateBlocks = (nextBlocks: RichBlockNode[]) => {
    onChange({
      version: 1,
      blocks:
        nextBlocks.length > 0
          ? nextBlocks
          : [{ type: 'paragraph', align: 'left', text: '' }],
    });
  };

  const updateBlockAt = (idx: number, updated: RichBlockNode) => {
    const copy = [...blocks];
    copy[idx] = updated;
    updateBlocks(copy);
  };

  const removeBlockAt = (idx: number) => {
    const copy = blocks.filter((_, i) => i !== idx);
    updateBlocks(copy);
  };

  const addParagraphBlock = () => {
    updateBlocks([
      ...blocks,
      { type: 'paragraph', align: 'left', bold: false, italic: false, text: '' },
    ]);
  };

  const addMathBlock = (initialLatex = '\\frac{a}{b}') => {
    updateBlocks([
      ...blocks,
      { type: 'math', inline: false, latex: initialLatex },
    ]);
  };

  const addListBlock = (ordered: boolean) => {
    updateBlocks([
      ...blocks,
      { type: 'list', ordered, items: ['Ý thứ nhất', 'Ý thứ hai'] },
    ]);
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        updateBlocks([
          ...blocks,
          {
            type: 'image',
            url: reader.result,
            alt: file.name,
            caption: '',
          },
        ]);
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleSaveGeometry = (drawing: GeometryDrawingData) => {
    if (editingGeomIdx !== null) {
      updateBlockAt(editingGeomIdx, { type: 'geometry', drawing });
    } else {
      updateBlocks([...blocks, { type: 'geometry', drawing }]);
    }
    setEditingGeomIdx(null);
    setShowGeometryModal(false);
  };

  return (
    <div className="rounded-2xl border-2 border-slate-800 bg-white">
      {/* Top Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b-2 border-slate-800 bg-slate-100 px-3 py-2">
        <div className="flex flex-wrap items-center gap-1.5">
          {label && (
            <span className="mr-2 text-xs font-extrabold text-slate-800">
              {label}
            </span>
          )}
          <button
            type="button"
            onClick={addParagraphBlock}
            className="flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-bold text-slate-800 hover:bg-amber-50"
          >
            <Plus className="h-3.5 w-3.5" />
            Đoạn văn
          </button>
          <button
            type="button"
            onClick={() => addMathBlock('\\frac{3}{4} + x = \\frac{7}{8}')}
            className="flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-bold text-blue-700 hover:bg-blue-50"
          >
            <Sigma className="h-3.5 w-3.5" />
            Công thức LaTeX
          </button>
          {!compact && (
            <>
              <button
                type="button"
                onClick={() => addListBlock(false)}
                className="flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                title="Danh sách chấm tròn"
              >
                <List className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => addListBlock(true)}
                className="flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                title="Danh sách đánh số"
              >
                <ListOrdered className="h-3.5 w-3.5" />
              </button>
            </>
          )}
          <button
            type="button"
            onClick={() => {
              setEditingGeomIdx(null);
              setShowGeometryModal(true);
            }}
            className="flex items-center gap-1 rounded-lg border border-slate-300 bg-amber-100 px-2.5 py-1 text-xs font-bold text-slate-900 hover:bg-amber-200"
          >
            <Compass className="h-3.5 w-3.5 text-amber-800" />
            Vẽ Hình Học
          </button>
          <button
            type="button"
            onClick={() => setShow3DModal(true)}
            className="flex items-center gap-1 rounded-lg border border-indigo-300 bg-indigo-100 px-2.5 py-1 text-xs font-bold text-indigo-900 hover:bg-indigo-200"
            title="Mô phỏng và chèn hình học không gian 3D"
          >
            <Box className="h-3.5 w-3.5 text-indigo-700" />
            Hình 3D
          </button>
          <label className="flex cursor-pointer items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-bold text-slate-700 hover:bg-slate-50">
            <ImageIcon className="h-3.5 w-3.5 text-emerald-600" />
            Chèn Ảnh
            <input
              type="file"
              accept="image/*"
              onChange={handleImageUpload}
              className="hidden"
            />
          </label>
        </div>

        <button
          type="button"
          onClick={() => setShowPreview((p) => !p)}
          className={`flex items-center gap-1 rounded-lg border border-slate-800 px-2.5 py-1 text-xs font-bold ${
            showPreview
              ? 'bg-blue-600 text-white'
              : 'bg-white text-slate-800 hover:bg-slate-50'
          }`}
        >
          <Eye className="h-3.5 w-3.5" />
          {showPreview ? 'Đang Xem Trước' : 'Xem Trước'}
        </button>
      </div>

      {/* Editor Body or Live Preview */}
      {showPreview ? (
        <div className="bg-[#FFFDF7] p-4">
          <div className="mb-2 text-[11px] font-bold text-slate-500">
            BẢN XEM TRƯỚC HIỂN THỊ TOÁN HỌC (KaTeX & HÌNH VẼ):
          </div>
          <RichContentRenderer content={value} />
        </div>
      ) : (
        <div className="space-y-3 p-3.5">
          {blocks.map((block, idx) => {
            if (block.type === 'paragraph') {
              return (
                <div
                  key={idx}
                  className="rounded-xl border border-slate-200 bg-slate-50/60 p-2.5"
                >
                  <div className="mb-1.5 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1">
                      <span className="mr-1 text-[11px] font-semibold text-slate-500">
                        Văn bản (hỗ trợ gõ $công_thức$):
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          updateBlockAt(idx, { ...block, bold: !block.bold })
                        }
                        className={`rounded p-1 ${
                          block.bold
                            ? 'bg-slate-800 text-white'
                            : 'text-slate-600 hover:bg-slate-200'
                        }`}
                        title="In đậm"
                      >
                        <Bold className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          updateBlockAt(idx, {
                            ...block,
                            italic: !block.italic,
                          })
                        }
                        className={`rounded p-1 ${
                          block.italic
                            ? 'bg-slate-800 text-white'
                            : 'text-slate-600 hover:bg-slate-200'
                        }`}
                        title="In nghiêng"
                      >
                        <Italic className="h-3.5 w-3.5" />
                      </button>
                      {(['left', 'center', 'right'] as TextAlignment[]).map(
                        (al) => (
                          <button
                            key={al}
                            type="button"
                            onClick={() =>
                              updateBlockAt(idx, { ...block, align: al })
                            }
                            className={`rounded p-1 ${
                              (block.align || 'left') === al
                                ? 'bg-blue-600 text-white'
                                : 'text-slate-600 hover:bg-slate-200'
                            }`}
                            title={`Căn ${al}`}
                          >
                            {al === 'left' && (
                              <AlignLeft className="h-3.5 w-3.5" />
                            )}
                            {al === 'center' && (
                              <AlignCenter className="h-3.5 w-3.5" />
                            )}
                            {al === 'right' && (
                              <AlignRight className="h-3.5 w-3.5" />
                            )}
                          </button>
                        )
                      )}
                    </div>
                    {blocks.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeBlockAt(idx)}
                        className="text-rose-600 hover:text-rose-800"
                        title="Xóa khối này"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                  <textarea
                    rows={compact ? 2 : 3}
                    value={block.text}
                    onChange={(e) =>
                      updateBlockAt(idx, { ...block, text: e.target.value })
                    }
                    placeholder="Nhập đề bài hoặc lời giải... Có thể bọc công thức trong dấu $ ví dụ: $\frac{3}{4} + \frac{1}{2}$"
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
                  />
                </div>
              );
            }

            if (block.type === 'math') {
              return (
                <div
                  key={idx}
                  className="rounded-xl border border-blue-200 bg-blue-50/50 p-3"
                >
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-1">
                      <span className="text-xs font-bold text-blue-900">
                        Công thức LaTeX:
                      </span>
                      {QUICK_MATH_MACROS.map((m) => (
                        <button
                          key={m.label}
                          type="button"
                          onClick={() =>
                            updateBlockAt(idx, {
                              ...block,
                              latex: `${block.latex} ${m.latex}`.trim(),
                            })
                          }
                          className="rounded border border-blue-300 bg-white px-1.5 py-0.5 text-[11px] font-semibold text-blue-800 hover:bg-blue-100"
                        >
                          {m.label}
                        </button>
                      ))}
                    </div>
                    <button
                      type="button"
                      onClick={() => removeBlockAt(idx)}
                      className="text-rose-600 hover:text-rose-800"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <input
                      type="text"
                      value={block.latex}
                      onChange={(e) =>
                        updateBlockAt(idx, { ...block, latex: e.target.value })
                      }
                      placeholder="\frac{a}{b} = c"
                      className="w-full rounded-lg border border-blue-300 bg-white px-3 py-1.5 font-mono text-sm"
                    />
                    <div className="flex items-center justify-center rounded-lg border border-slate-200 bg-white px-3 py-1">
                      <RichContentRenderer
                        content={{ version: 1, blocks: [block] }}
                      />
                    </div>
                  </div>
                </div>
              );
            }

            if (block.type === 'list') {
              return (
                <div
                  key={idx}
                  className="rounded-xl border border-slate-200 bg-slate-50 p-3"
                >
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-700">
                      Danh sách ({block.ordered ? 'Đánh số 1, 2, 3' : 'Gạch đầu dòng'})
                    </span>
                    <button
                      type="button"
                      onClick={() => removeBlockAt(idx)}
                      className="text-rose-600 hover:text-rose-800"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <textarea
                    rows={3}
                    value={(block.items || []).join('\n')}
                    onChange={(e) =>
                      updateBlockAt(idx, {
                        ...block,
                        items: e.target.value.split('\n'),
                      })
                    }
                    placeholder="Mỗi dòng là một mục trong danh sách..."
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm"
                  />
                </div>
              );
            }

            if (block.type === 'image') {
              return (
                <div
                  key={idx}
                  className="flex items-center justify-between gap-4 rounded-xl border border-slate-200 bg-slate-50 p-3"
                >
                  <div className="flex items-center gap-3">
                    <img
                      src={block.url}
                      alt={block.alt || 'Ảnh đính kèm'}
                      referrerPolicy="no-referrer"
                      className="h-16 w-20 rounded-lg border border-slate-300 object-cover"
                    />
                    <input
                      type="text"
                      value={block.caption || ''}
                      onChange={(e) =>
                        updateBlockAt(idx, {
                          ...block,
                          caption: e.target.value,
                        })
                      }
                      placeholder="Nhập chú thích ảnh..."
                      className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => removeBlockAt(idx)}
                    className="text-rose-600 hover:text-rose-800"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              );
            }

            if (block.type === 'geometry') {
              return (
                <div
                  key={idx}
                  className="rounded-xl border border-amber-300 bg-amber-50/40 p-3"
                >
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-800">
                      Hình vẽ hình học phẳng:
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setEditingGeomIdx(idx);
                          setShowGeometryModal(true);
                        }}
                        className="rounded-lg border border-slate-800 bg-white px-2.5 py-1 text-xs font-bold text-slate-800"
                      >
                        Chỉnh sửa hình
                      </button>
                      <button
                        type="button"
                        onClick={() => removeBlockAt(idx)}
                        className="text-rose-600 hover:text-rose-800"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                  <RichContentRenderer
                    content={{ version: 1, blocks: [block] }}
                  />
                </div>
              );
            }

            return null;
          })}
        </div>
      )}

      {showGeometryModal && (
        <GeometryBuilderModal
          initialDrawing={
            editingGeomIdx !== null &&
            blocks[editingGeomIdx]?.type === 'geometry'
              ? (blocks[editingGeomIdx] as { type: 'geometry'; drawing: GeometryDrawingData }).drawing
              : undefined
          }
          onSave={handleSaveGeometry}
          onClose={() => {
            setShowGeometryModal(false);
            setEditingGeomIdx(null);
          }}
        />
      )}

      {show3DModal && (
        <Geometry3DModal
          isOpen={show3DModal}
          onClose={() => setShow3DModal(false)}
          onInsertImage={(dataUrl, caption) => {
            updateBlocks([
              ...blocks,
              {
                type: 'image',
                url: dataUrl,
                alt: caption || 'Hình học 3D',
                caption: caption || '',
              },
            ]);
            setShow3DModal(false);
          }}
        />
      )}
    </div>
  );
};
