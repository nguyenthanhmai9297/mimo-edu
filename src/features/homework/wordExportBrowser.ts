import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { GeometryRenderer } from '../../components/editor/GeometryRenderer';
import type { GeometryDrawingData } from '../../types/domain';
import { readImageInfo, type WordExportDeps, type WordImage } from './wordExport';

/**
 * How the Word export gets its pictures in the browser: stored images are
 * downloaded as they are (Cloudinary allows it), inline ones decoded, and
 * geometry drawings drawn to a PNG at twice their size so lines stay sharp.
 */

/** Pixels per displayed pixel in drawn pictures (print sharpness). */
const DRAW_SCALE = 2;

function canvasPng(canvas: HTMLCanvasElement): Promise<Uint8Array> {
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? blob.arrayBuffer().then((b) => resolve(new Uint8Array(b)), reject) : reject(new Error('không tạo được ảnh PNG'))),
      'image/png'
    )
  );
}

/** Any picture the browser can show (WEBP, GIF, SVG…) redrawn as PNG for Word. */
async function toPng(blob: Blob): Promise<WordImage> {
  const bitmap = await createImageBitmap(blob);
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('trình duyệt không vẽ được ảnh');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0);
  return { data: await canvasPng(canvas), type: 'png', width: bitmap.width, height: bitmap.height };
}

async function loadImage(url: string): Promise<WordImage> {
  let blob: Blob;
  try {
    const res = await fetch(url, { mode: 'cors', credentials: 'omit' });
    if (!res.ok) throw new Error(`máy chủ ảnh trả về HTTP ${res.status}`);
    blob = await res.blob();
  } catch (error) {
    if (error instanceof TypeError) throw new Error('không kết nối được tới kho ảnh');
    throw error;
  }
  const data = new Uint8Array(await blob.arrayBuffer());
  const info = readImageInfo(data);
  return info ? { data, ...info } : toPng(blob);
}

async function renderGeometry(drawing: GeometryDrawingData): Promise<WordImage> {
  const width = drawing.width || 360;
  const height = drawing.height || 240;
  const markup = renderToStaticMarkup(React.createElement(GeometryRenderer, { drawing }));
  const svg = /<svg[\s\S]*<\/svg>/.exec(markup)?.[0];
  if (!svg) throw new Error('không vẽ được hình hình học');
  const standalone = svg.replace(
    '<svg',
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width * DRAW_SCALE}" height="${height * DRAW_SCALE}"`
  );
  const img = new Image();
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(standalone)}`;
  await img.decode();
  const canvas = document.createElement('canvas');
  canvas.width = width * DRAW_SCALE;
  canvas.height = height * DRAW_SCALE;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('trình duyệt không vẽ được hình');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  // Shown at the drawing's own size; the extra pixels are for printing
  return { data: await canvasPng(canvas), type: 'png', width, height };
}

export const browserWordDeps: WordExportDeps = { loadImage, renderGeometry };

/** Starts the download of a finished file. */
export function saveFile(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
