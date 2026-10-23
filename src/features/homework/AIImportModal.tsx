import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  FileText,
  FileUp,
  Loader2,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import { HomeworkQuestion } from '../../types/domain';
import { cropFigure, NormalizedBox, padBox, pdfToPageImages } from './figureCrop';
import { apiUrl } from '../../lib/apiUrl';

/** A page of the original exam, kept so the teacher can compare while reviewing. */
export interface SourceFile {
  id: string;
  name: string;
  mimeType: string;
  objectUrl: string;
}

export interface ExtractedHomework {
  title?: string;
  description?: string;
  grade?: string;
  questions?: HomeworkQuestion[];
  figures?: {
    questionId: string;
    page: number;
    box: NormalizedBox;
    description: string;
  }[];
}

/** Where a cropped figure came from, so the teacher can adjust the crop later. */
export interface FigureCropInfo {
  sourceId: string;
  box: NormalizedBox;
}

interface PendingFile extends SourceFile {
  base64: string;
}

interface AIImportModalProps {
  open: boolean;
  onClose: () => void;
  onExtracted: (
    data: ExtractedHomework,
    solveWithAI: boolean,
    sources: SourceFile[],
    figureCrops: Record<string, FigureCropInfo>
  ) => void;
}

const ACCEPTED_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'application/pdf'];
// Vercel Serverless rejects request bodies above ~4.5MB; leave room for JSON overhead.
const MAX_TOTAL_BASE64 = 4_200_000;
const MAX_FILES = 20;
const COMPRESS_ABOVE_BYTES = 1.2 * 1024 * 1024;
const MAX_IMAGE_DIM = 2000;

function readAsDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function resolveMimeType(file: File): string {
  if (file.type && file.type !== 'image/jpg') return file.type;
  const ext = file.name.split('.').pop()?.toLowerCase() || '';
  if (ext === 'pdf') return 'application/pdf';
  if (ext === 'png') return 'image/png';
  if (ext === 'webp') return 'image/webp';
  return 'image/jpeg';
}

/** Downscales large photos so several pages fit within the upload budget. */
async function compressImage(dataUrl: string): Promise<string> {
  const img = new Image();
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error('Không đọc được ảnh.'));
    img.src = dataUrl;
  });
  const scale = Math.min(1, MAX_IMAGE_DIM / Math.max(img.width, img.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(img.width * scale);
  canvas.height = Math.round(img.height * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) return dataUrl;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', 0.85);
}

function newId(): string {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

async function blobToPending(blob: Blob, name: string, mimeType: string): Promise<PendingFile> {
  const dataUrl = await readAsDataUrl(blob);
  return {
    id: newId(),
    name,
    mimeType,
    base64: dataUrl.split(',')[1] || '',
    objectUrl: URL.createObjectURL(blob),
  };
}

/** Images become one page each; PDFs are rendered to one image per page. */
async function prepareFile(file: File): Promise<PendingFile[]> {
  let mimeType = resolveMimeType(file);
  const name = file.name || 'anh-dan.png';
  if (mimeType === 'application/pdf') {
    const pages = await pdfToPageImages(file);
    return Promise.all(
      pages.map((blob, idx) =>
        blobToPending(blob, pages.length > 1 ? `${name} – trang ${idx + 1}` : name, 'image/jpeg')
      )
    );
  }
  let blob: Blob = file;
  if (mimeType.startsWith('image/') && file.size > COMPRESS_ABOVE_BYTES) {
    const dataUrl = await compressImage(await readAsDataUrl(file));
    mimeType = 'image/jpeg';
    blob = await (await fetch(dataUrl)).blob();
  }
  return [await blobToPending(blob, name, mimeType)];
}

/** Crops AI-located figures from the source pages and appends them to their questions. */
async function insertFigures(
  data: ExtractedHomework,
  pages: PendingFile[]
): Promise<Record<string, FigureCropInfo>> {
  const crops: Record<string, FigureCropInfo> = {};
  for (const figure of data.figures ?? []) {
    const question = data.questions?.find((q) => q.id === figure.questionId);
    const page = pages[figure.page - 1];
    if (!question) continue;
    try {
      if (!page) throw new Error('missing page');
      const box = padBox(figure.box);
      const url = await cropFigure(page.objectUrl, box);
      question.prompt.blocks.push({ type: 'image', url, alt: figure.description });
      crops[url] = { sourceId: page.id, box };
    } catch {
      question.prompt.blocks.push({
        type: 'paragraph',
        align: 'left',
        text: `*[Hình vẽ trong đề gốc – cần chèn lại: ${figure.description}]*`,
      });
    }
  }
  return crops;
}

function formatMB(base64Length: number): string {
  return `${((base64Length * 3) / 4 / 1024 / 1024).toFixed(1)} MB`;
}

function loadingMessage(seconds: number, solveWithAI: boolean): string {
  if (seconds < 4) return 'Đang gửi file lên máy chủ…';
  if (seconds < 20) return 'Claude đang đọc đề và nhận diện câu hỏi…';
  return solveWithAI
    ? 'Đang dựng công thức và giải từng câu (đề dài có thể mất 1–3 phút)…'
    : 'Đang dựng công thức và phân loại câu hỏi…';
}

export const AIImportModal: React.FC<AIImportModalProps> = ({
  open,
  onClose,
  onExtracted,
}) => {
  const [files, setFiles] = useState<PendingFile[]>([]);
  const [solveWithAI, setSolveWithAI] = useState(true);
  const [dragOver, setDragOver] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const totalBase64 = files.reduce((sum, f) => sum + f.base64.length, 0);
  const overBudget = totalBase64 > MAX_TOTAL_BASE64;

  const addFiles = async (incoming: File[]) => {
    setError(null);
    const accepted = incoming.filter((f) => ACCEPTED_TYPES.includes(resolveMimeType(f)));
    if (accepted.length < incoming.length) {
      setError('Một số file bị bỏ qua: chỉ hỗ trợ PNG, JPG, WEBP hoặc PDF.');
    }
    if (accepted.length === 0) return;
    setPreparing(true);
    try {
      const prepared = (await Promise.all(accepted.map(prepareFile))).flat();
      if (files.length + prepared.length > MAX_FILES) {
        prepared.forEach((f) => URL.revokeObjectURL(f.objectUrl));
        setError(`Tối đa ${MAX_FILES} trang cho một đề. Hãy tách đề thành nhiều phần.`);
        return;
      }
      setFiles((prev) => [...prev, ...prepared]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không đọc được file.');
    } finally {
      setPreparing(false);
    }
  };

  // Allow pasting screenshots (e.g. copied from Zalo) straight into the dialog.
  useEffect(() => {
    if (!open) return;
    const onPaste = (e: ClipboardEvent) => {
      const pasted = Array.from(e.clipboardData?.files || []);
      if (pasted.length > 0) {
        e.preventDefault();
        void addFiles(pasted);
      }
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  });

  useEffect(() => {
    if (!loading) return;
    setElapsed(0);
    const timer = window.setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => window.clearInterval(timer);
  }, [loading]);

  if (!open) return null;

  const removeFile = (id: string) => {
    setFiles((prev) => {
      const target = prev.find((f) => f.id === id);
      if (target) URL.revokeObjectURL(target.objectUrl);
      return prev.filter((f) => f.id !== id);
    });
  };

  const moveFile = (idx: number, direction: -1 | 1) => {
    const target = idx + direction;
    if (target < 0 || target >= files.length) return;
    const copy = [...files];
    [copy[idx], copy[target]] = [copy[target], copy[idx]];
    setFiles(copy);
  };

  const closeAndReset = () => {
    if (loading) return;
    files.forEach((f) => URL.revokeObjectURL(f.objectUrl));
    setFiles([]);
    setError(null);
    onClose();
  };

  const runExtraction = async () => {
    if (files.length === 0) {
      setError('Vui lòng chọn ít nhất một ảnh hoặc file PDF đề Toán.');
      return;
    }
    if (overBudget) {
      setError('Tổng dung lượng vượt giới hạn 4 MB. Hãy bớt trang hoặc tách đề thành nhiều phần.');
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const res = await fetch(apiUrl('/api/ai/parse-homework'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          files: files.map((f) => ({ mimeType: f.mimeType, base64Data: f.base64 })),
          solveWithAI,
        }),
      });

      const rawText = await res.text();
      let data: ExtractedHomework & { error?: string };
      try {
        data = JSON.parse(rawText);
      } catch {
        if (res.status === 404) {
          throw new Error('Không tìm thấy API Server (/api/ai/parse-homework). Hãy kiểm tra bản deploy.');
        }
        if (res.status === 413) {
          throw new Error('Dung lượng ảnh/PDF quá lớn. Vui lòng bớt trang hoặc chọn file nhỏ hơn.');
        }
        if (res.status === 504) {
          throw new Error('Máy chủ xử lý quá lâu. Hãy tách đề thành nhiều phần nhỏ rồi thử lại.');
        }
        throw new Error(`Máy chủ trả về phản hồi không hợp lệ (HTTP ${res.status}).`);
      }
      if (!res.ok) {
        throw new Error(data.error || 'AI không thể chuyển đổi file này.');
      }

      const figureCrops = await insertFigures(data, files);
      onExtracted(
        data,
        solveWithAI,
        files.map(({ id, name, mimeType, objectUrl }) => ({ id, name, mimeType, objectUrl })),
        figureCrops
      );
      // Object URLs now belong to the editor's source panel.
      setFiles([]);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Chuyển đổi đề thất bại. Vui lòng thử lại.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
      <div className="cartoon-card flex max-h-[92vh] w-full max-w-2xl flex-col bg-white">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-amber-600" />
            <h2 className="font-display text-lg font-extrabold text-slate-900">
              Chuyển ảnh / PDF thành đề
            </h2>
          </div>
          <button
            type="button"
            onClick={closeAndReset}
            disabled={loading}
            aria-label="Đóng"
            className="rounded-lg border border-slate-300 p-1 hover:bg-slate-100 disabled:opacity-40"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-6 py-4">
          {error && (
            <div className="rounded-xl border border-rose-300 bg-rose-50 p-3 text-xs font-bold text-rose-700">
              {error}
            </div>
          )}

          {/* Drop zone */}
          <div
            role="button"
            tabIndex={0}
            onClick={() => inputRef.current?.click()}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click();
            }}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              void addFiles(Array.from(e.dataTransfer.files));
            }}
            className={`flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed p-6 text-center transition ${
              dragOver
                ? 'border-blue-600 bg-blue-50'
                : 'border-slate-800 bg-amber-50/60 hover:bg-amber-100/50'
            }`}
          >
            {preparing ? (
              <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
            ) : (
              <FileUp className="h-8 w-8 text-blue-600" />
            )}
            <span className="mt-2 font-display text-sm font-extrabold text-slate-900">
              Kéo thả, nhấn để chọn, hoặc dán (Ctrl+V) ảnh chụp đề
            </span>
            <span className="mt-1 text-xs text-slate-500">
              Chọn được nhiều trang cùng lúc · PNG, JPG, WEBP, PDF · PDF được tách thành từng trang · Hình vẽ trong đề được tự cắt vào câu hỏi
            </span>
            <input
              ref={inputRef}
              type="file"
              multiple
              accept={ACCEPTED_TYPES.join(',')}
              onChange={(e) => {
                void addFiles(Array.from(e.target.files || []));
                e.target.value = '';
              }}
              className="hidden"
            />
          </div>

          {/* Selected pages */}
          {files.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs font-bold text-slate-700">
                <span>{files.length} trang/file · theo đúng thứ tự trong đề</span>
                <span className={overBudget ? 'text-rose-600' : 'text-slate-500'}>
                  {formatMB(totalBase64)} / 4 MB
                </span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-slate-200">
                <div
                  className={`h-full rounded-full ${overBudget ? 'bg-rose-500' : 'bg-blue-600'}`}
                  style={{ width: `${Math.min(100, (totalBase64 / MAX_TOTAL_BASE64) * 100)}%` }}
                />
              </div>
              <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {files.map((f, idx) => (
                  <li
                    key={f.id}
                    className="flex items-center gap-3 rounded-xl border-2 border-slate-800 bg-white p-2"
                  >
                    <span className="w-5 text-center font-mono text-xs font-bold text-slate-500">
                      {idx + 1}
                    </span>
                    {f.mimeType === 'application/pdf' ? (
                      <div className="flex h-14 w-11 shrink-0 items-center justify-center rounded-md bg-rose-100">
                        <FileText className="h-5 w-5 text-rose-600" />
                      </div>
                    ) : (
                      <img
                        src={f.objectUrl}
                        alt=""
                        className="h-14 w-11 shrink-0 rounded-md border border-slate-200 object-cover"
                      />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-xs font-bold text-slate-900">{f.name}</div>
                      <div className="text-[11px] text-slate-500">{formatMB(f.base64.length)}</div>
                    </div>
                    <div className="flex items-center gap-0.5">
                      <button
                        type="button"
                        onClick={() => moveFile(idx, -1)}
                        disabled={idx === 0 || loading}
                        aria-label="Lên trên"
                        className="rounded p-1 hover:bg-slate-100 disabled:opacity-30"
                      >
                        <ArrowUp className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => moveFile(idx, 1)}
                        disabled={idx === files.length - 1 || loading}
                        aria-label="Xuống dưới"
                        className="rounded p-1 hover:bg-slate-100 disabled:opacity-30"
                      >
                        <ArrowDown className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => removeFile(f.id)}
                        disabled={loading}
                        aria-label="Xóa"
                        className="rounded p-1 text-rose-600 hover:bg-rose-50 disabled:opacity-30"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Mode */}
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {[
              {
                value: false,
                title: 'Chỉ chép đề',
                desc: 'AI chép nguyên văn câu hỏi, giáo viên tự nhập đáp án.',
              },
              {
                value: true,
                title: 'Chép đề + AI giải',
                desc: 'AI điền đáp án đề xuất và lời giải mẫu để giáo viên duyệt.',
              },
            ].map((mode) => (
              <button
                key={String(mode.value)}
                type="button"
                onClick={() => setSolveWithAI(mode.value)}
                disabled={loading}
                className={`rounded-xl border-2 p-3 text-left transition ${
                  solveWithAI === mode.value
                    ? 'border-blue-600 bg-blue-50'
                    : 'border-slate-300 bg-white hover:border-slate-500'
                }`}
              >
                <div className="text-xs font-extrabold text-slate-900">{mode.title}</div>
                <div className="mt-0.5 text-xs text-slate-600">{mode.desc}</div>
              </button>
            ))}
          </div>

          {loading && (
            <div className="flex items-center gap-3 rounded-xl border-2 border-blue-600 bg-blue-50 p-3">
              <Loader2 className="h-5 w-5 shrink-0 animate-spin text-blue-600" />
              <div className="text-xs text-slate-800">
                <div className="font-bold">{loadingMessage(elapsed, solveWithAI)}</div>
                <div className="text-slate-500">Đã chạy {elapsed} giây · Không đóng cửa sổ này</div>
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-slate-200 px-6 py-4">
          <span className="text-[11px] text-slate-500">
            Kết quả mở trong trình soạn đề, đặt cạnh đề gốc để bạn soát lại trước khi lưu.
          </span>
          <div className="flex shrink-0 gap-2">
            <button
              type="button"
              onClick={closeAndReset}
              disabled={loading}
              className="cartoon-button rounded-xl bg-white px-4 py-2 text-xs font-bold text-slate-700"
            >
              Hủy
            </button>
            <button
              type="button"
              onClick={runExtraction}
              disabled={loading || preparing || files.length === 0 || overBudget}
              className="cartoon-button flex items-center gap-1.5 rounded-xl bg-blue-600 px-5 py-2 text-xs font-extrabold text-white disabled:opacity-50"
            >
              <Sparkles className="h-4 w-4" />
              {loading ? 'Đang xử lý…' : 'Nhận diện đề'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
