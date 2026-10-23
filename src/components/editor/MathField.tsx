import React, {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
} from 'react';
import { MathfieldElement, VirtualKeyboardLayout } from 'mathlive';
import 'mathlive/fonts.css';

// Fonts are bundled through fonts.css; stop MathLive fetching them (and sounds) at runtime.
MathfieldElement.fontsDirectory = null;
MathfieldElement.soundsDirectory = null;

declare module 'react' {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace JSX {
    interface IntrinsicElements {
      'math-field': React.DetailedHTMLProps<
        React.HTMLAttributes<MathfieldElement>,
        MathfieldElement
      > & { placeholder?: string };
    }
  }
}

/** Virtual keyboard tab with the notation used in Vietnamese primary/secondary maths. */
const VN_MATH_LAYOUT: VirtualKeyboardLayout = {
  id: 'toan-vn',
  label: 'Toán',
  tooltip: 'Ký hiệu Toán phổ thông',
  rows: [
    [
      { latex: '\\frac{#@}{#?}', tooltip: 'Phân số' },
      { latex: '#@^{2}', tooltip: 'Bình phương' },
      { latex: '#@^{#?}', tooltip: 'Lũy thừa' },
      { latex: '\\sqrt{#0}', tooltip: 'Căn bậc hai' },
      { latex: '\\sqrt[#?]{#0}', tooltip: 'Căn bậc n' },
      { latex: '\\left|#0\\right|', tooltip: 'Giá trị tuyệt đối' },
      { latex: '\\left(#0\\right)', tooltip: 'Ngoặc tròn' },
      { latex: '\\overline{#0}', tooltip: 'Số có nhiều chữ số / số thập phân vô hạn tuần hoàn' },
      '[separator]',
      '[backspace]',
    ],
    [
      { latex: '\\widehat{#0}', tooltip: 'Góc' },
      { latex: '\\triangle', tooltip: 'Tam giác' },
      { latex: '#@^{\\circ}', tooltip: 'Độ' },
      { latex: '\\parallel', tooltip: 'Song song' },
      { latex: '\\perp', tooltip: 'Vuông góc' },
      { latex: '\\overrightarrow{#0}', tooltip: 'Vectơ' },
      { latex: '\\equiv', tooltip: 'Trùng nhau' },
      { latex: '\\backsim', tooltip: 'Đồng dạng' },
      '[separator]',
      '[left]',
      '[right]',
    ],
    [
      { latex: '\\le', tooltip: 'Nhỏ hơn hoặc bằng' },
      { latex: '\\ge', tooltip: 'Lớn hơn hoặc bằng' },
      { latex: '\\ne', tooltip: 'Khác' },
      { latex: '\\approx', tooltip: 'Xấp xỉ' },
      { latex: '\\pm', tooltip: 'Cộng trừ' },
      { latex: '\\times', tooltip: 'Nhân' },
      { latex: '\\div', tooltip: 'Chia' },
      { latex: '\\pi', tooltip: 'Số pi' },
      { latex: '\\infty', tooltip: 'Vô cực' },
      { latex: '\\%', tooltip: 'Phần trăm' },
    ],
    [
      { latex: '\\in', tooltip: 'Thuộc' },
      { latex: '\\notin', tooltip: 'Không thuộc' },
      { latex: '\\subset', tooltip: 'Tập con' },
      { latex: '\\cap', tooltip: 'Giao' },
      { latex: '\\cup', tooltip: 'Hợp' },
      { latex: '\\varnothing', tooltip: 'Tập rỗng' },
      { latex: '\\mathbb{N}', tooltip: 'Số tự nhiên' },
      { latex: '\\mathbb{Z}', tooltip: 'Số nguyên' },
      { latex: '\\mathbb{Q}', tooltip: 'Số hữu tỉ' },
      { latex: '\\mathbb{R}', tooltip: 'Số thực' },
    ],
    [
      {
        latex: '\\left\\{\\begin{array}{l}#?\\\\#?\\end{array}\\right.',
        label: 'Hệ {',
        tooltip: 'Hệ phương trình',
        class: 'small',
      },
      {
        latex: '\\left[\\begin{array}{l}#?\\\\#?\\end{array}\\right.',
        label: 'Tuyển [',
        tooltip: 'Hoặc (tuyển)',
        class: 'small',
      },
      { latex: '\\Rightarrow', tooltip: 'Suy ra' },
      { latex: '\\Leftrightarrow', tooltip: 'Tương đương' },
      { latex: 'x' },
      { latex: 'y' },
      { latex: '=' },
      { latex: '+' },
      { latex: '-' },
      '[return]',
    ],
  ],
};

/** Typed shortcuts, e.g. typing `goc` inserts the angle hat. */
const VN_INLINE_SHORTCUTS: Record<string, string> = {
  goc: '\\widehat{#?}',
  tamgiac: '\\triangle',
  songsong: '\\parallel',
  vuonggoc: '\\perp',
  thuoc: '\\in',
  tapR: '\\mathbb{R}',
  he: '\\left\\{\\begin{array}{l}#?\\\\#?\\end{array}\\right.',
};

let keyboardConfigured = false;
function configureVirtualKeyboard() {
  if (keyboardConfigured || typeof window === 'undefined' || !window.mathVirtualKeyboard) {
    return;
  }
  window.mathVirtualKeyboard.layouts = [VN_MATH_LAYOUT, 'numeric', 'symbols', 'alphabetic', 'greek'];
  keyboardConfigured = true;
}

export interface MathFieldHandle {
  /** Inserts LaTeX at the caret; `#0` wraps the selection, `#?` is a placeholder. */
  insert: (latex: string) => void;
  focus: () => void;
}

interface MathFieldProps {
  value: string;
  onChange: (latex: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
  onEnter?: () => void;
  className?: string;
}

export const MathField = forwardRef<MathFieldHandle, MathFieldProps>(
  ({ value, onChange, placeholder, autoFocus, onEnter, className = '' }, ref) => {
    const fieldRef = useRef<MathfieldElement>(null);
    const onChangeRef = useRef(onChange);
    const onEnterRef = useRef(onEnter);
    // Last value sent to the parent; lets us tell our own edits from external ones.
    const lastEmittedRef = useRef(value);
    onChangeRef.current = onChange;

    // Empty template slots (\placeholder{}) are editor-only; KaTeX can't render them.
    const emit = (mf: MathfieldElement) => {
      const latex = mf.getValue('latex-without-placeholders');
      lastEmittedRef.current = latex;
      onChangeRef.current(latex);
    };
    onEnterRef.current = onEnter;

    useImperativeHandle(ref, () => ({
      insert: (latex) => {
        const mf = fieldRef.current;
        if (!mf) return;
        mf.focus();
        mf.insert(latex, { selectionMode: 'placeholder', focus: true });
        emit(mf);
      },
      focus: () => fieldRef.current?.focus(),
    }));

    useEffect(() => {
      configureVirtualKeyboard();
      const mf = fieldRef.current;
      if (!mf) return;
      mf.inlineShortcuts = { ...mf.inlineShortcuts, ...VN_INLINE_SHORTCUTS };
      mf.value = value;
      if (autoFocus) requestAnimationFrame(() => mf.focus());

      const handleInput = () => emit(mf);
      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey && onEnterRef.current) {
          e.preventDefault();
          onEnterRef.current();
        }
      };
      mf.addEventListener('input', handleInput);
      mf.addEventListener('keydown', handleKeyDown, { capture: true });
      return () => {
        mf.removeEventListener('input', handleInput);
        mf.removeEventListener('keydown', handleKeyDown, { capture: true });
      };
      // Initial value only; later external changes are synced below.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
      const mf = fieldRef.current;
      if (mf && value !== lastEmittedRef.current) {
        lastEmittedRef.current = value;
        mf.setValue(value, { silenceNotifications: true });
      }
    }, [value]);

    return (
      <math-field
        ref={fieldRef}
        placeholder={placeholder}
        className={`block w-full rounded-lg border border-blue-300 bg-white px-3 py-2 text-xl focus-within:border-blue-600 ${className}`}
      />
    );
  }
);
MathField.displayName = 'MathField';
