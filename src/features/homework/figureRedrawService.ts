import { apiUrl } from '../../lib/apiUrl';
import { auth } from '../../lib/firebase/config';
import {
  checkFigureSpec,
  parseFigureSpec,
  redrawStatus,
  type FigureIssue,
  type FigureSpec,
  type FigureVerification,
  type RedrawStatus,
} from './figureSpec';
import { figureSvgMarkup } from './figureSvg';
import { svgToPng } from './wordExportBrowser';

/**
 * Redrawing one figure in the browser: the picture goes to the AI, which
 * describes it; MimoEDU draws that description; the AI then compares the
 * drawing with the picture, and MimoEDU's own checks run on top. Nothing here
 * replaces a picture – the teacher looks at the result and decides.
 */

export interface RedrawAttempt {
  spec: FigureSpec | null;
  redrawable: boolean;
  /** Why the AI could not redraw it (when `redrawable` is false). */
  reason: string;
  readings: { pointLabels: string[]; measurements: string[]; otherText: string[] };
  /** What the AI could not read for sure. */
  uncertain: string[];
  verification: FigureVerification | null;
  /** Set when the comparison could not run (the drawing then needs a closer look). */
  verifyError: string;
  issues: FigureIssue[];
  status: RedrawStatus;
  costUsd: number;
}

interface MediaFile {
  mimeType: string;
  base64Data: string;
}

/** Room left under the server's 1.5 MB limit per picture. */
const MAX_BASE64 = 1_400_000;

async function postAI<T>(path: string, body: unknown): Promise<T> {
  const token = await auth.currentUser?.getIdToken();
  if (!token) throw new Error('Thầy cô cần đăng nhập lại để dùng AI.');
  const res = await fetch(apiUrl(path), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(data.error || `Máy chủ AI trả về lỗi ${res.status}.`);
  return data;
}

const base64Of = (bytes: Uint8Array) => {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
};

/**
 * The figure picture as sent to the AI: on white, enlarged when small (thin
 * lines and small labels of a cropped figure read better), never over 1600 px.
 */
export async function figureForAI(url: string): Promise<MediaFile> {
  let blob: Blob;
  try {
    const res = await fetch(url, { mode: 'cors', credentials: 'omit' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    blob = await res.blob();
  } catch {
    throw new Error('Không tải được hình gốc. Hãy kiểm tra kết nối mạng rồi thử lại.');
  }
  const bitmap = await createImageBitmap(blob);
  const long = Math.max(bitmap.width, bitmap.height);
  const k = Math.min(1600 / long, Math.max(1, 900 / long));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * k);
  canvas.height = Math.round(bitmap.height * k);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Trình duyệt không xử lý được hình.');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const png = canvas.toDataURL('image/png').split(',')[1];
  if (png.length <= MAX_BASE64) return { mimeType: 'image/png', base64Data: png };
  return { mimeType: 'image/jpeg', base64Data: canvas.toDataURL('image/jpeg', 0.9).split(',')[1] };
}

/** MimoEDU's drawing of a description, as the PNG the AI compares with the original. */
async function drawingForAI(spec: FigureSpec): Promise<MediaFile> {
  const { svg, width, height } = figureSvgMarkup(spec);
  return { mimeType: 'image/png', base64Data: base64Of(await svgToPng(svg, width, height, 2)) };
}

/** Asks the AI whether a drawing shows the same figure as the original. */
export async function compareWithOriginal(
  original: MediaFile,
  spec: FigureSpec,
  questionText: string
): Promise<{ verification: FigureVerification; costUsd: number }> {
  const res = await postAI<{ verification: FigureVerification; estimatedCostUsd?: number }>('/api/ai/compare-figure', {
    original,
    redrawn: await drawingForAI(spec),
    questionText,
  });
  return { verification: res.verification, costUsd: res.estimatedCostUsd ?? 0 };
}

/** Reads, draws, compares and checks one figure. */
export async function redrawWithAI(imageUrl: string, questionText: string, hint = ''): Promise<RedrawAttempt> {
  const original = await figureForAI(imageUrl);
  const read = await postAI<{
    redrawable: boolean;
    reason: string;
    spec: unknown;
    readings: RedrawAttempt['readings'];
    uncertain: string[];
    estimatedCostUsd?: number;
  }>('/api/ai/redraw-figure', { image: original, questionText, hint });
  let costUsd = read.estimatedCostUsd ?? 0;
  // Never trusted as sent: the description is checked again here before it is drawn
  const spec = read.redrawable ? parseFigureSpec(read.spec) : null;
  const base = {
    redrawable: Boolean(spec),
    reason: spec ? '' : read.reason || 'AI chưa mô tả được hình này.',
    readings: read.readings ?? { pointLabels: [], measurements: [], otherText: [] },
    uncertain: read.uncertain ?? [],
  };
  if (!spec) return { ...base, spec: null, verification: null, verifyError: '', issues: [], status: 'unsupported', costUsd };
  let verification: FigureVerification | null = null;
  let verifyError = '';
  try {
    const cmp = await compareWithOriginal(original, spec, questionText);
    verification = cmp.verification;
    costUsd += cmp.costUsd;
  } catch (error) {
    verifyError = error instanceof Error ? error.message : String(error);
  }
  const issues = checkFigureSpec(spec, questionText);
  return { ...base, spec, verification, verifyError, issues, status: redrawStatus(issues, base.uncertain, verification), costUsd };
}

/** What a first reading got wrong, said to the AI for a second reading. */
function retryHint(a: RedrawAttempt): string {
  const notes = [
    ...(a.verification?.differences ?? []).map((d) => d.detail),
    ...a.issues.filter((i) => i.level !== 'info').map((i) => i.message),
    ...a.uncertain,
  ];
  return notes.length ? `Lần đọc trước chưa đúng: ${notes.join('; ')}. Hãy đọc lại thật kỹ hình gốc.`.slice(0, 500) : '';
}

/**
 * The automatic redraw: when the first drawing does not match (or something is
 * unsure), the AI reads the picture once more, told what was off; the better
 * outcome is returned. At most two readings per figure.
 */
export async function redrawAutomatically(imageUrl: string, questionText: string): Promise<RedrawAttempt> {
  const first = await redrawWithAI(imageUrl, questionText);
  if (first.status === 'ok' || first.status === 'unsupported') return first;
  const second = await redrawWithAI(imageUrl, questionText, retryHint(first));
  second.costUsd += first.costUsd;
  if (second.status === 'ok' || !first.spec) return second;
  // Neither matches: keep the reading the checks liked better ("review" before "wrong")
  return second.status === 'review' || first.status === 'wrong' ? second : { ...first, costUsd: second.costUsd };
}
