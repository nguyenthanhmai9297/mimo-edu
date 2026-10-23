import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

/** [xMin, yMin, xMax, yMax] normalized to 0–1000 of the page size. */
export type NormalizedBox = [number, number, number, number];

const PAGE_RENDER_WIDTH = 1600;
const FIGURE_MAX_WIDTH = 1000;
// Small margin so AI boxes that are slightly tight don't clip labels.
const FIGURE_PADDING = 15;

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Không đọc được ảnh trang đề.'));
    img.src = url;
  });
}

function canvasToBlob(canvas: HTMLCanvasElement, quality = 0.85): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Không tạo được ảnh.'))),
      'image/jpeg',
      quality
    );
  });
}

/** Renders every page of a PDF to a JPEG so pages can be sent to AI and cropped. */
export async function pdfToPageImages(file: File): Promise<Blob[]> {
  const loadingTask = getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
  try {
    const pdf = await loadingTask.promise;
    const pages: Blob[] = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const base = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: PAGE_RENDER_WIDTH / base.width });
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(viewport.width);
      canvas.height = Math.round(viewport.height);
      await page.render({ canvas, viewport }).promise;
      pages.push(await canvasToBlob(canvas, 0.82));
      page.cleanup();
    }
    return pages;
  } finally {
    await loadingTask.destroy();
  }
}

export function padBox(box: NormalizedBox, padding = FIGURE_PADDING): NormalizedBox {
  return [
    Math.max(0, box[0] - padding),
    Math.max(0, box[1] - padding),
    Math.min(1000, box[2] + padding),
    Math.min(1000, box[3] + padding),
  ];
}

/** Crops a normalized region from a page image and returns it as a JPEG data URL. */
export async function cropFigure(pageUrl: string, box: NormalizedBox): Promise<string> {
  const img = await loadImage(pageUrl);
  const sx = (box[0] / 1000) * img.naturalWidth;
  const sy = (box[1] / 1000) * img.naturalHeight;
  const sw = ((box[2] - box[0]) / 1000) * img.naturalWidth;
  const sh = ((box[3] - box[1]) / 1000) * img.naturalHeight;
  if (sw < 4 || sh < 4) throw new Error('Vùng cắt quá nhỏ.');

  const scale = Math.min(1, FIGURE_MAX_WIDTH / sw);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(sw * scale);
  canvas.height = Math.round(sh * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Trình duyệt không hỗ trợ cắt ảnh.');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', 0.85);
}
