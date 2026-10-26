import React, { useEffect, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, Download, Loader2, X } from 'lucide-react';
import { STUDIO_INPUT, STUDIO_LABEL } from '../../components/studio/StudioUi';
import {
  buildHomeworkDocx,
  DEFAULT_WORD_OPTIONS,
  WordExportError,
  wordFileName,
  type WordContent,
  type WordExportOptions,
  type WordHomework,
} from './wordExport';
import { browserWordDeps, saveFile } from './wordExportBrowser';

interface WordExportModalProps {
  open: boolean;
  onClose: () => void;
  homework: WordHomework;
  /** The editor has changes not saved yet (the file still follows what is on screen). */
  unsaved: boolean;
}

const CONTENT_CHOICES: { value: WordContent; title: string; desc: string }[] = [
  { value: 'exam', title: 'Đề không đáp án', desc: 'Phát cho học sinh làm bài' },
  { value: 'exam_with_answers', title: 'Đề kèm đáp án', desc: 'Đáp án màu đỏ ngay dưới từng câu' },
  { value: 'answers', title: 'File đáp án riêng', desc: 'Bảng đáp án, điểm và lời giải' },
];

const MARGIN_PRESETS: Record<string, WordExportOptions['margins']> = {
  'Chuẩn (trái 2,5 cm)': { top: 2, bottom: 2, left: 2.5, right: 1.5 },
  'Hẹp (1,5 cm)': { top: 1.5, bottom: 1.5, left: 1.5, right: 1.5 },
  'Rộng (2,5 cm)': { top: 2.5, bottom: 2.5, left: 3, right: 2 },
};

/** Remembered per browser: only layout choices, never the homework itself. */
const STORAGE_KEY = 'mimo.wordExport.v1';
function remembered(): Partial<WordExportOptions> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Partial<WordExportOptions>) : {};
  } catch {
    return {};
  }
}

const kb = (bytes: number) => `${Math.max(1, Math.round(bytes / 1024))} KB`;

export const WordExportModal: React.FC<WordExportModalProps> = ({ open, onClose, homework, unsaved }) => {
  const [options, setOptions] = useState<WordExportOptions>(() => ({ ...DEFAULT_WORD_OPTIONS, ...remembered() }));
  const [building, setBuilding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const preview = useRef<HTMLDivElement>(null);
  const run = useRef(0);

  const effective: WordExportOptions = { ...options, title: options.title.trim() || homework.title };
  const key = JSON.stringify([effective, homework]);

  const set = <K extends keyof WordExportOptions>(k: K, v: WordExportOptions[K]) => {
    setDone(null);
    setOptions((o) => ({ ...o, [k]: v }));
  };

  useEffect(() => {
    try {
      const { title: _t, ...layout } = options;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(layout));
    } catch {
      // Private window: options simply are not remembered
    }
  }, [options]);

  // Shrink the A4 page to the preview pane (it never scrolls sideways)
  const fitPreview = () => {
    const box = preview.current;
    const page = box?.querySelector<HTMLElement>('section.docx');
    if (!box || !page) return;
    box.style.zoom = '1';
    box.style.zoom = String(Math.min(1, (box.clientWidth - 8) / (page.offsetWidth + 32)));
  };
  useEffect(() => {
    window.addEventListener('resize', fitPreview);
    return () => window.removeEventListener('resize', fitPreview);
  }, []);

  const build = () => buildHomeworkDocx(homework, effective, browserWordDeps);

  // Preview: the real .docx, rendered page by page, rebuilt shortly after each change
  useEffect(() => {
    if (!open) return;
    const id = ++run.current;
    const timer = setTimeout(async () => {
      setBuilding(true);
      setError(null);
      try {
        const blob = await build();
        const { renderAsync } = await import('docx-preview');
        if (id !== run.current || !preview.current) return;
        preview.current.innerHTML = '';
        await renderAsync(blob, preview.current, undefined, { inWrapper: true, breakPages: true, ignoreLastRenderedPageBreak: true, renderFooters: true, experimental: true });
        fitPreview();
      } catch (err) {
        if (id === run.current) setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (id === run.current) setBuilding(false);
      }
    }, 450);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, key]);

  const download = async () => {
    setBuilding(true);
    setError(null);
    setDone(null);
    try {
      const blob = await build();
      if (!blob.size) throw new WordExportError('Tệp tạo ra bị rỗng.');
      const name = wordFileName(effective.title, effective.content);
      saveFile(blob, name);
      setDone(`Đã tạo và tải xuống ${name} (${kb(blob.size)}).`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBuilding(false);
    }
  };

  if (!open) return null;
  const marginName = Object.entries(MARGIN_PRESETS).find(([, m]) => JSON.stringify(m) === JSON.stringify(options.margins))?.[0] ?? 'Chuẩn (trái 2,5 cm)';
  const hasEssay = homework.questions.some((q) => q.type === 'essay');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-3" role="dialog" aria-modal="true" aria-label="Tải Word">
      <div className="flex max-h-[94vh] w-full max-w-6xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-[#EEF3F9] px-5 py-3">
          <div>
            <h2 className="text-lg font-extrabold text-[#172B4D]">Tải Word (.docx)</h2>
            <p className="text-xs text-[#5E6C84]">Chữ, bảng và công thức sửa được trong Word; hình được chèn riêng tại từng câu.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Đóng" className="rounded-xl p-2 text-[#5E6C84] hover:bg-[#F6FAFF]">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden lg:grid-cols-[340px_1fr]">
          <div className="space-y-4 overflow-y-auto border-r border-[#EEF3F9] p-5 text-sm">
            {unsaved && (
              <div className="flex gap-2 rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                Đề có thay đổi chưa lưu. Tệp Word theo đúng nội dung đang hiển thị trong trình soạn.
              </div>
            )}
            <fieldset>
              <legend className={STUDIO_LABEL}>Nội dung</legend>
              <div className="space-y-1.5">
                {CONTENT_CHOICES.map((c) => (
                  <label key={c.value} className={`flex cursor-pointer gap-2 rounded-xl border p-2.5 ${options.content === c.value ? 'border-[#2563EB] bg-[#EFF6FF]' : 'border-[#DCE7F3]'}`}>
                    <input type="radio" name="word-content" checked={options.content === c.value} onChange={() => set('content', c.value)} />
                    <span>
                      <span className="block text-xs font-extrabold text-[#172B4D]">{c.title}</span>
                      <span className="block text-xs text-[#5E6C84]">{c.desc}</span>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>

            <div>
              <label className={STUDIO_LABEL} htmlFor="word-title">Tiêu đề</label>
              <input id="word-title" className={STUDIO_INPUT} value={options.title} placeholder={homework.title} onChange={(e) => set('title', e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className={STUDIO_LABEL} htmlFor="word-school">Tên trường</label>
                <input id="word-school" className={STUDIO_INPUT} value={options.schoolName} placeholder="Trường TH …" onChange={(e) => set('schoolName', e.target.value)} />
              </div>
              <div>
                <label className={STUDIO_LABEL} htmlFor="word-subtitle">Dòng phụ</label>
                <input id="word-subtitle" className={STUDIO_INPUT} value={options.subtitle} placeholder="Thời gian: 35 phút" onChange={(e) => set('subtitle', e.target.value)} />
              </div>
            </div>
            <div>
              <label className={STUDIO_LABEL} htmlFor="word-date">Ngày tháng</label>
              <input id="word-date" className={STUDIO_INPUT} value={options.date} placeholder="Ngày …… tháng …… năm ……" onChange={(e) => set('date', e.target.value)} />
            </div>
            <label className="flex items-center gap-2 text-xs font-bold text-[#3B4A66]">
              <input type="checkbox" checked={options.studentFields} onChange={(e) => set('studentFields', e.target.checked)} />
              Dòng “Họ và tên … Lớp …” cho học sinh
            </label>
            <label className="flex items-center gap-2 text-xs font-bold text-[#3B4A66]">
              <input type="checkbox" checked={options.showPoints} onChange={(e) => set('showPoints', e.target.checked)} />
              Ghi điểm từng câu
            </label>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className={STUDIO_LABEL} htmlFor="word-orientation">Khổ A4</label>
                <select id="word-orientation" className={STUDIO_INPUT} value={options.orientation} onChange={(e) => set('orientation', e.target.value as WordExportOptions['orientation'])}>
                  <option value="portrait">Dọc</option>
                  <option value="landscape">Ngang</option>
                </select>
              </div>
              <div>
                <label className={STUDIO_LABEL} htmlFor="word-size">Cỡ chữ (Times New Roman)</label>
                <select id="word-size" className={STUDIO_INPUT} value={options.fontSize} onChange={(e) => set('fontSize', Number(e.target.value))}>
                  {[12, 13, 14].map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label className={STUDIO_LABEL} htmlFor="word-margins">Lề trang</label>
                <select id="word-margins" className={STUDIO_INPUT} value={marginName} onChange={(e) => set('margins', MARGIN_PRESETS[e.target.value])}>
                  {Object.keys(MARGIN_PRESETS).map((m) => <option key={m}>{m}</option>)}
                </select>
              </div>
              <div>
                <label className={STUDIO_LABEL} htmlFor="word-spacing">Giãn dòng</label>
                <select id="word-spacing" className={STUDIO_INPUT} value={options.lineSpacing} onChange={(e) => set('lineSpacing', Number(e.target.value))}>
                  {[1, 1.15, 1.3, 1.5].map((s) => <option key={s} value={s}>{String(s).replace('.', ',')}</option>)}
                </select>
              </div>
            </div>

            <div>
              <label className={STUDIO_LABEL} htmlFor="word-essay">Chỗ làm bài câu tự luận{hasEssay ? '' : ' (đề này không có câu tự luận)'}</label>
              <div className="flex gap-2">
                <select id="word-essay" className={STUDIO_INPUT} value={options.essaySpace} onChange={(e) => set('essaySpace', e.target.value as WordExportOptions['essaySpace'])}>
                  <option value="lines">Dòng kẻ chấm</option>
                  <option value="blank">Khoảng trống</option>
                  <option value="none">Không chừa</option>
                </select>
                <select aria-label="Số dòng" className={`${STUDIO_INPUT} w-24`} value={options.essayLines} disabled={options.essaySpace === 'none'} onChange={(e) => set('essayLines', Number(e.target.value))}>
                  {[3, 5, 8, 10, 15].map((n) => <option key={n} value={n}>{n} dòng</option>)}
                </select>
              </div>
            </div>
          </div>

          <div className="flex min-h-0 flex-col bg-[#EEF2F7]">
            <div className="flex items-center gap-2 border-b border-[#DCE7F3] bg-white px-4 py-2 text-xs text-[#5E6C84]">
              {building ? <Loader2 className="h-4 w-4 animate-spin text-[#2563EB]" /> : null}
              <span className="font-bold text-[#172B4D]">Xem trước</span>
              <span>{building ? 'Đang tạo tệp…' : error ? 'Chưa tạo được tệp' : 'Bố cục gần đúng; chỗ ngắt trang và dòng kẻ chấm xem chính xác khi mở bằng Word'}</span>
            </div>
            <div className="min-h-[300px] flex-1 overflow-auto p-3">
              {error && (
                <div role="alert" className="mb-3 rounded-xl border border-rose-300 bg-rose-50 p-3 text-sm font-bold text-rose-700">
                  Chưa tạo được tệp Word: {error}
                </div>
              )}
              <div ref={preview} data-testid="word-preview" />
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-[#EEF3F9] px-5 py-3">
          {done && (
            <span role="status" className="mr-auto flex items-center gap-1.5 text-xs font-bold text-[#1F9D6B]">
              <CheckCircle2 className="h-4 w-4" /> {done}
            </span>
          )}
          <button type="button" onClick={onClose} className="cartoon-button rounded-xl bg-white px-4 py-2 text-xs font-bold text-[#3B4A66]">
            Đóng
          </button>
          <button
            type="button"
            onClick={() => void download()}
            disabled={building}
            className="cartoon-button flex items-center gap-1.5 rounded-xl bg-[#2563EB] px-5 py-2 text-xs font-extrabold text-white disabled:opacity-50"
          >
            <Download className="h-4 w-4" />
            Tải Word (.docx)
          </button>
        </div>
      </div>
    </div>
  );
};
