import { parseMindMap, type MindMapDoc } from './mindMap';

/**
 * Local library of "Sơ đồ tư duy Mimo": every map is kept in this browser's
 * localStorage (an index plus one entry per map). Nothing goes to Firebase.
 */
export interface SavedMindMap {
  id: string;
  title: string;
  updatedAt: string;
  nodeCount: number;
}

export type StoreResult = { ok: true } | { ok: false; message: string };

const INDEX_KEY = 'mimoedu.tools.mindmaps.v1';
const MAP_KEY = (id: string) => `mimoedu.tools.mindmap.${id}`;
/** Single draft kept by the first version of the tool; moved into the library once. */
const LEGACY_KEY = 'mimoedu.tools.mindmap.current';

export const newMapId = () => `m${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

function isQuotaError(e: unknown): boolean {
  return e instanceof DOMException && (e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED' || e.code === 22);
}

const kb = (s: string) => Math.ceil((s.length * 2) / 1024);

function readIndex(storage: Storage): SavedMindMap[] {
  try {
    const raw = storage.getItem(INDEX_KEY);
    const list = raw ? (JSON.parse(raw) as SavedMindMap[]) : [];
    return Array.isArray(list) ? list.filter((x) => x && typeof x.id === 'string') : [];
  } catch {
    return [];
  }
}

function writeIndex(storage: Storage, list: SavedMindMap[]) {
  storage.setItem(INDEX_KEY, JSON.stringify(list));
}

/** All saved maps, most recently changed first. Moves the old single draft into the library. */
export function listMaps(storage: Storage = localStorage): SavedMindMap[] {
  try {
    const legacy = storage.getItem(LEGACY_KEY);
    if (legacy) {
      const doc = parseMindMap(JSON.parse(legacy));
      if (typeof doc !== 'string' && saveMap(newMapId(), doc, storage).ok) storage.removeItem(LEGACY_KEY);
    }
  } catch {
    // unreadable old draft: leave it alone
  }
  return readIndex(storage).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function loadMap(id: string, storage: Storage = localStorage): MindMapDoc | null {
  try {
    const raw = storage.getItem(MAP_KEY(id));
    if (!raw) return null;
    const doc = parseMindMap(JSON.parse(raw));
    return typeof doc === 'string' ? null : doc;
  } catch {
    return null;
  }
}

/** Saves (or overwrites) one map. A full browser storage gives a clear message instead of failing silently. */
export function saveMap(id: string, doc: MindMapDoc, storage: Storage = localStorage): StoreResult {
  const json = JSON.stringify(doc);
  try {
    storage.setItem(MAP_KEY(id), json);
    const entry: SavedMindMap = { id, title: doc.title || 'Sơ đồ không tên', updatedAt: new Date().toISOString(), nodeCount: doc.nodes.length };
    writeIndex(storage, [entry, ...readIndex(storage).filter((x) => x.id !== id)]);
    return { ok: true };
  } catch (e) {
    if (isQuotaError(e)) {
      const images = doc.nodes.filter((n) => n.image).length;
      return {
        ok: false,
        message:
          `Bộ nhớ trình duyệt đã đầy nên chưa lưu được sơ đồ (khoảng ${kb(json)} KB${images ? `, có ${images} ảnh` : ''}). ` +
          'Hãy xóa bớt sơ đồ cũ hoặc bớt ảnh, hoặc bấm "Xuất JSON" để lưu sơ đồ ra máy.',
      };
    }
    return { ok: false, message: 'Trình duyệt đang chặn lưu dữ liệu trên máy. Hãy bấm "Xuất JSON" để giữ lại sơ đồ.' };
  }
}

export function renameMap(id: string, title: string, storage: Storage = localStorage): StoreResult {
  const doc = loadMap(id, storage);
  if (!doc) return { ok: false, message: 'Không tìm thấy sơ đồ.' };
  const name = title.trim() || 'Sơ đồ không tên';
  return saveMap(id, { ...doc, title: name }, storage);
}

/** Copies a saved map under a new id; returns the new id. */
export function duplicateMap(id: string, storage: Storage = localStorage): { ok: true; id: string } | { ok: false; message: string } {
  const doc = loadMap(id, storage);
  if (!doc) return { ok: false, message: 'Không tìm thấy sơ đồ.' };
  const copyId = newMapId();
  const r = saveMap(copyId, { ...doc, title: `${doc.title} (bản sao)` }, storage);
  return r.ok ? { ok: true, id: copyId } : r;
}

export function deleteMap(id: string, storage: Storage = localStorage) {
  try {
    storage.removeItem(MAP_KEY(id));
    writeIndex(storage, readIndex(storage).filter((x) => x.id !== id));
  } catch {
    // storage blocked: nothing to delete
  }
}

/** Largest data URL accepted for one picture after shrinking. */
export const MAX_IMAGE_CHARS = 400_000;

/**
 * Shrinks a picture from the computer so it fits in a node (max 480 px) and in
 * browser storage. Returns a data URL or a Vietnamese message.
 */
export async function shrinkImage(file: File, maxSide = 480): Promise<{ ok: true; url: string } | { ok: false; message: string }> {
  if (!file.type.startsWith('image/')) return { ok: false, message: 'Tệp đã chọn không phải là ảnh.' };
  if (file.size > 15 * 1024 * 1024) return { ok: false, message: 'Ảnh quá lớn (trên 15 MB). Hãy chọn ảnh nhỏ hơn.' };
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close?.();
    let url = canvas.toDataURL('image/jpeg', 0.85);
    if (url.length > MAX_IMAGE_CHARS) url = canvas.toDataURL('image/jpeg', 0.6);
    if (url.length > MAX_IMAGE_CHARS) return { ok: false, message: 'Ảnh vẫn quá lớn sau khi thu nhỏ. Hãy chọn ảnh khác.' };
    return { ok: true, url };
  } catch {
    return { ok: false, message: 'Không đọc được ảnh này. Hãy thử ảnh PNG hoặc JPG khác.' };
  }
}

/**
 * Builds a one-page A4 landscape PDF with a JPEG picture fitted inside the
 * margins. Tiny hand-written PDF so no extra library is needed.
 */
export function jpegToA4Pdf(jpeg: Uint8Array, imgW: number, imgH: number, title = 'Sơ đồ tư duy Mimo'): Uint8Array {
  const pageW = 842;
  const pageH = 595;
  const margin = 24;
  const scale = Math.min((pageW - margin * 2) / imgW, (pageH - margin * 2) / imgH);
  const w = +(imgW * scale).toFixed(2);
  const h = +(imgH * scale).toFixed(2);
  const x = +((pageW - w) / 2).toFixed(2);
  const y = +((pageH - h) / 2).toFixed(2);
  const content = `q ${w} 0 0 ${h} ${x} ${y} cm /Im0 Do Q`;
  // PDF strings are Latin-1: keep the title readable without breaking the file
  const safeTitle = title.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[đĐ]/g, (c) => (c === 'đ' ? 'd' : 'D')).replace(/[^\x20-\x7E]/g, '').replace(/[()\\]/g, '');

  const enc = new TextEncoder();
  const parts: Uint8Array[] = [];
  const offsets: number[] = [];
  let length = 0;
  const push = (chunk: string | Uint8Array) => {
    const bytes = typeof chunk === 'string' ? enc.encode(chunk) : chunk;
    parts.push(bytes);
    length += bytes.length;
  };
  const obj = (n: number, body: string | (() => void)) => {
    offsets[n] = length;
    push(`${n} 0 obj\n`);
    if (typeof body === 'string') push(body);
    else body();
    push('\nendobj\n');
  };

  push('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');
  obj(1, '<< /Type /Catalog /Pages 2 0 R >>');
  obj(2, '<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
  obj(3, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageW} ${pageH}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`);
  obj(4, () => {
    push(`<< /Type /XObject /Subtype /Image /Width ${imgW} /Height ${imgH} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`);
    push(jpeg);
    push('\nendstream');
  });
  obj(5, `<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
  obj(6, `<< /Title (${safeTitle}) /Producer (MimoEDU) >>`);
  const xref = length;
  push(`xref\n0 7\n0000000000 65535 f \n${offsets.slice(1).map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`);
  push(`trailer\n<< /Size 7 /Root 1 0 R /Info 6 0 R >>\nstartxref\n${xref}\n%%EOF\n`);

  const out = new Uint8Array(length);
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}
