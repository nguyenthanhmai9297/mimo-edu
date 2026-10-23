import React, { useEffect, useRef, useState } from 'react';
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  Box,
  Compass,
  Image as ImageIcon,
  Italic,
  List,
  ListOrdered,
  Sigma,
  SquareSigma,
} from 'lucide-react';
import { EditorContent, useEditor, useEditorState } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import TextAlign from '@tiptap/extension-text-align';
import Placeholder from '@tiptap/extension-placeholder';
import { GeometryDrawingData, RichTextContent } from '../../types/domain';
import { GeometryBuilderModal } from './GeometryBuilderModal';
import { Geometry3DModal } from '../geometry3d/Geometry3DModal';
import { BlockMath, Geometry, ImageBlock, InlineMath } from './editorNodes';
import { docToRichText, richTextToDoc } from './richTextDoc';

interface MathRichEditorProps {
  value: RichTextContent;
  onChange: (next: RichTextContent) => void;
  label?: string;
  compact?: boolean;
  placeholder?: string;
}

const ToolbarButton: React.FC<{
  onClick: () => void;
  active?: boolean;
  title: string;
  children: React.ReactNode;
  className?: string;
}> = ({ onClick, active, title, children, className = '' }) => (
  <button
    type="button"
    // Keep the editor's selection when clicking toolbar buttons.
    onMouseDown={(e) => e.preventDefault()}
    onClick={onClick}
    title={title}
    aria-label={title}
    aria-pressed={active}
    className={`flex h-7 items-center gap-1 rounded-md px-1.5 text-xs font-bold transition ${
      active ? 'bg-slate-800 text-white' : 'text-slate-700 hover:bg-slate-200'
    } ${className}`}
  >
    {children}
  </button>
);

const Divider = () => <span className="mx-0.5 h-5 w-px bg-slate-300" />;

/**
 * Single WYSIWYG editing surface for question content: text, inline and
 * display formulas (MathLive), lists, images and geometry drawings.
 */
export const MathRichEditor: React.FC<MathRichEditorProps> = ({
  value,
  onChange,
  label,
  compact = false,
  placeholder,
}) => {
  const [showGeometryModal, setShowGeometryModal] = useState(false);
  const [show3DModal, setShow3DModal] = useState(false);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  // Last value emitted by this editor, to tell our own updates from external ones.
  const lastEmittedRef = useRef(JSON.stringify(value));

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        blockquote: false,
        code: false,
        codeBlock: false,
        heading: false,
        horizontalRule: false,
        strike: false,
        underline: false,
        link: false,
      }),
      TextAlign.configure({ types: ['paragraph'] }),
      Placeholder.configure({
        placeholder:
          placeholder ??
          (compact
            ? 'Nhập nội dung…'
            : 'Nhập nội dung câu hỏi… Gõ $x^2$ hoặc bấm “Công thức” để chèn ký hiệu Toán'),
      }),
      InlineMath,
      BlockMath,
      ImageBlock,
      Geometry,
    ],
    content: richTextToDoc(value),
    editorProps: {
      attributes: {
        class: `tiptap-content focus:outline-none ${compact ? 'min-h-[2.25rem]' : 'min-h-[5.5rem]'}`,
      },
    },
    onUpdate: ({ editor: ed }) => {
      const next = docToRichText(ed.getJSON());
      const serialized = JSON.stringify(next);
      if (serialized === lastEmittedRef.current) return;
      lastEmittedRef.current = serialized;
      onChangeRef.current(next);
    },
  });

  // Apply external changes (e.g. AI import, undo at page level) without echoing them back.
  useEffect(() => {
    if (!editor) return;
    const serialized = JSON.stringify(value);
    if (serialized === lastEmittedRef.current) return;
    lastEmittedRef.current = serialized;
    editor.commands.setContent(richTextToDoc(value), { emitUpdate: false });
  }, [editor, value]);

  const state = useEditorState({
    editor,
    selector: ({ editor: ed }) => ({
      bold: ed?.isActive('bold') ?? false,
      italic: ed?.isActive('italic') ?? false,
      bulletList: ed?.isActive('bulletList') ?? false,
      orderedList: ed?.isActive('orderedList') ?? false,
      align: (['left', 'center', 'right'] as const).find((a) =>
        ed?.isActive({ textAlign: a })
      ),
    }),
  });

  if (!editor) return null;

  const insertImage = (url: string, caption = '') => {
    editor
      .chain()
      .focus()
      .insertContent({ type: 'imageBlock', attrs: { url, alt: caption || 'Hình minh họa', caption } })
      .run();
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || file.size > 2 * 1024 * 1024) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') insertImage(reader.result);
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="rounded-2xl border-2 border-slate-800 bg-white focus-within:border-blue-600">
      <div className="flex flex-wrap items-center gap-0.5 border-b border-slate-200 bg-slate-50 px-2 py-1 rounded-t-2xl">
        {label && (
          <span className="mr-1.5 text-xs font-extrabold text-slate-800">{label}</span>
        )}
        <ToolbarButton
          title="In đậm (Ctrl+B)"
          active={state?.bold}
          onClick={() => editor.chain().focus().toggleBold().run()}
        >
          <Bold className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton
          title="In nghiêng (Ctrl+I)"
          active={state?.italic}
          onClick={() => editor.chain().focus().toggleItalic().run()}
        >
          <Italic className="h-3.5 w-3.5" />
        </ToolbarButton>
        {!compact && (
          <>
            <ToolbarButton
              title="Danh sách gạch đầu dòng"
              active={state?.bulletList}
              onClick={() => editor.chain().focus().toggleBulletList().run()}
            >
              <List className="h-3.5 w-3.5" />
            </ToolbarButton>
            <ToolbarButton
              title="Danh sách đánh số"
              active={state?.orderedList}
              onClick={() => editor.chain().focus().toggleOrderedList().run()}
            >
              <ListOrdered className="h-3.5 w-3.5" />
            </ToolbarButton>
            <Divider />
            <ToolbarButton
              title="Căn trái"
              active={state?.align === 'left'}
              onClick={() => editor.chain().focus().setTextAlign('left').run()}
            >
              <AlignLeft className="h-3.5 w-3.5" />
            </ToolbarButton>
            <ToolbarButton
              title="Căn giữa"
              active={state?.align === 'center'}
              onClick={() => editor.chain().focus().setTextAlign('center').run()}
            >
              <AlignCenter className="h-3.5 w-3.5" />
            </ToolbarButton>
            <ToolbarButton
              title="Căn phải"
              active={state?.align === 'right'}
              onClick={() => editor.chain().focus().setTextAlign('right').run()}
            >
              <AlignRight className="h-3.5 w-3.5" />
            </ToolbarButton>
          </>
        )}
        <Divider />
        <ToolbarButton
          title="Chèn công thức vào dòng (hoặc gõ $...$)"
          onClick={() =>
            editor.chain().focus().insertContent({ type: 'inlineMath', attrs: { latex: '' } }).run()
          }
          className="text-blue-700"
        >
          <Sigma className="h-3.5 w-3.5" />
          Công thức
        </ToolbarButton>
        {!compact && (
          <ToolbarButton
            title="Công thức lớn trên một dòng riêng"
            onClick={() =>
              editor.chain().focus().insertContent({ type: 'blockMath', attrs: { latex: '' } }).run()
            }
            className="text-blue-700"
          >
            <SquareSigma className="h-3.5 w-3.5" />
            Dòng riêng
          </ToolbarButton>
        )}
        <Divider />
        <ToolbarButton title="Vẽ hình học phẳng" onClick={() => setShowGeometryModal(true)}>
          <Compass className="h-3.5 w-3.5 text-amber-700" />
          {!compact && 'Hình học'}
        </ToolbarButton>
        <ToolbarButton title="Hình học không gian 3D" onClick={() => setShow3DModal(true)}>
          <Box className="h-3.5 w-3.5 text-indigo-700" />
          {!compact && '3D'}
        </ToolbarButton>
        <ToolbarButton title="Chèn ảnh (tối đa 2MB)" onClick={() => imageInputRef.current?.click()}>
          <ImageIcon className="h-3.5 w-3.5 text-emerald-600" />
          {!compact && 'Ảnh'}
        </ToolbarButton>
        <input
          ref={imageInputRef}
          type="file"
          accept="image/*"
          onChange={handleImageUpload}
          className="hidden"
        />
      </div>

      <EditorContent
        editor={editor}
        className={`cursor-text ${compact ? 'px-3 py-1.5' : 'px-4 py-3'} text-[15px] text-slate-900`}
        onClick={() => !editor.isFocused && editor.commands.focus()}
      />

      {showGeometryModal && (
        <GeometryBuilderModal
          onSave={(drawing: GeometryDrawingData) => {
            editor.chain().focus().insertContent({ type: 'geometry', attrs: { drawing } }).run();
            setShowGeometryModal(false);
          }}
          onClose={() => setShowGeometryModal(false)}
        />
      )}

      {show3DModal && (
        <Geometry3DModal
          isOpen={show3DModal}
          onClose={() => setShow3DModal(false)}
          onInsertImage={(dataUrl, caption) => {
            insertImage(dataUrl, caption || '');
            setShow3DModal(false);
          }}
        />
      )}
    </div>
  );
};
