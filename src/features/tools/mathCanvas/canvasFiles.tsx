import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { jpegToA4 } from '../../../utils/pdfImage';
import { bounds, parseCanvas, resolve, type CanvasDoc, type Rect } from './geometry';
import { GridLayer, Scene } from './Scene';

/**
 * Saving drawings in this browser and exporting them (SVG, PNG, PDF, JSON).
 * Exports are drawn from the data, never from the screen: no handles, no
 * selection boxes, and the grid only when asked for.
 */

// ------------------------------------------------------------------ local library

export interface SavedCanvas {
  id: string;
  title: string;
  updatedAt: string;
  count: number;
}
export type StoreResult = { ok: true } | { ok: false; message: string };

const INDEX_KEY = 'mimoedu.tools.mathcanvas.v1';
const DOC_KEY = (id: string) => `mimoedu.tools.mathcanvas.${id}`;
export const newCanvasId = () => `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

function readIndex(): SavedCanvas[] {
  try {
    const list = JSON.parse(localStorage.getItem(INDEX_KEY) ?? '[]') as SavedCanvas[];
    return Array.isArray(list) ? list.filter((x) => x && typeof x.id === 'string') : [];
  } catch {
    return [];
  }
}

export function listCanvases(): SavedCanvas[] {
  return readIndex().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function loadCanvas(id: string): CanvasDoc | null {
  try {
    const raw = localStorage.getItem(DOC_KEY(id));
    const doc = raw ? parseCanvas(JSON.parse(raw)) : null;
    return doc && typeof doc !== 'string' ? doc : null;
  } catch {
    return null;
  }
}

export function saveCanvas(id: string, doc: CanvasDoc): StoreResult {
  const json = JSON.stringify(doc);
  try {
    localStorage.setItem(DOC_KEY(id), json);
    const entry: SavedCanvas = { id, title: doc.title || 'Bản vẽ không tên', updatedAt: new Date().toISOString(), count: doc.objects.length + doc.points.length };
    localStorage.setItem(INDEX_KEY, JSON.stringify([entry, ...readIndex().filter((x) => x.id !== id)]));
    return { ok: true };
  } catch (e) {
    const full = e instanceof DOMException && (e.name === 'QuotaExceededError' || e.code === 22);
    return {
      ok: false,
      message: full
        ? `Bộ nhớ trình duyệt đã đầy nên chưa lưu được bản vẽ (khoảng ${Math.ceil((json.length * 2) / 1024)} KB). Hãy xóa bớt bản vẽ cũ hoặc bấm "Xuất JSON" để lưu ra máy.`
        : 'Trình duyệt đang chặn lưu dữ liệu trên máy. Hãy bấm "Xuất JSON" để giữ lại bản vẽ.',
    };
  }
}

export function renameCanvas(id: string, title: string): StoreResult {
  const doc = loadCanvas(id);
  return doc ? saveCanvas(id, { ...doc, title: title.trim() || 'Bản vẽ không tên' }) : { ok: false, message: 'Không tìm thấy bản vẽ.' };
}

export function duplicateCanvas(id: string): StoreResult {
  const doc = loadCanvas(id);
  return doc ? saveCanvas(newCanvasId(), { ...doc, title: `${doc.title} (bản sao)` }) : { ok: false, message: 'Không tìm thấy bản vẽ.' };
}

export function deleteCanvas(id: string) {
  try {
    localStorage.removeItem(DOC_KEY(id));
    localStorage.setItem(INDEX_KEY, JSON.stringify(readIndex().filter((x) => x.id !== id)));
  } catch {
    // storage blocked
  }
}

// ------------------------------------------------------------------ export

export interface ExportOptions {
  /** Only these objects (with their points). */
  only?: Set<string>;
  grid?: boolean;
  transparent?: boolean;
}

/** Standalone SVG of the drawing (or the selection) with a small margin, plus its size. */
export function drawingSvg(doc: CanvasDoc, opts: ExportOptions = {}): { svg: string; w: number; h: number } | null {
  const pos = resolve(doc);
  const b = bounds(doc, pos, opts.only);
  if (!b) return null;
  const pad = 16;
  const area: Rect = { x: b.x - pad, y: b.y - pad, w: b.w + pad * 2, h: b.h + pad * 2 };
  const w = Math.ceil(area.w);
  const h = Math.ceil(area.h);
  const body = renderToStaticMarkup(
    <>
      {!opts.transparent && <rect x={area.x} y={area.y} width={area.w} height={area.h} fill="#FFFFFF" />}
      {opts.grid && <GridLayer area={area} size={doc.grid.size} zoom={1} />}
      <Scene doc={doc} pos={pos} area={area} only={opts.only} />
    </>
  );
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="${area.x} ${area.y} ${area.w} ${area.h}">${body}</svg>`;
  return { svg, w, h };
}

/** Draws an SVG into a canvas at `scale` (sharp lines and text). */
async function rasterize(svg: string, w: number, h: number, scale: number, background: string | null): Promise<HTMLCanvasElement> {
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
  try {
    const img = new Image();
    img.decoding = 'sync';
    await new Promise<void>((ok, fail) => {
      img.onload = () => ok();
      img.onerror = () => fail(new Error('svg'));
      img.src = url;
    });
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(w * scale);
    canvas.height = Math.round(h * scale);
    const ctx = canvas.getContext('2d')!;
    if (background) {
      ctx.fillStyle = background;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Scale that gives ~3000 px on the long side without making a huge image. */
const sharpScale = (w: number, h: number) => Math.max(1, Math.min(4, 3000 / Math.max(w, h), Math.sqrt(30_000_000 / (w * h))));

export async function drawingPng(doc: CanvasDoc, opts: ExportOptions = {}): Promise<Blob | null> {
  const s = drawingSvg(doc, opts);
  if (!s) return null;
  const canvas = await rasterize(s.svg, s.w, s.h, sharpScale(s.w, s.h), opts.transparent ? null : '#FFFFFF');
  return new Promise((ok) => canvas.toBlob((b) => ok(b), 'image/png'));
}

export async function drawingPdf(doc: CanvasDoc, orientation: 'landscape' | 'portrait', opts: ExportOptions = {}): Promise<Blob | null> {
  const s = drawingSvg(doc, { ...opts, transparent: false });
  if (!s) return null;
  const canvas = await rasterize(s.svg, s.w, s.h, sharpScale(s.w, s.h), '#FFFFFF');
  const jpeg = await new Promise<Blob | null>((ok) => canvas.toBlob((b) => ok(b), 'image/jpeg', 0.95));
  if (!jpeg) return null;
  const pdf = jpegToA4(new Uint8Array(await jpeg.arrayBuffer()), canvas.width, canvas.height, orientation, doc.title);
  return new Blob([pdf as BlobPart], { type: 'application/pdf' });
}

export function fileName(title: string, ext: string) {
  const slug = title
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();
  return `bang-ve-toan-${slug || 'mimo'}.${ext}`;
}

export function download(data: Blob, name: string) {
  const url = URL.createObjectURL(data);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 3000);
}
