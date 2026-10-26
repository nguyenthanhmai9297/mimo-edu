import type { HomeworkQuestion, RichTextContent, StoredImage } from '../types/domain';
import { apiUrl } from '../lib/apiUrl';

/**
 * Moves the images of a homework out of the Firestore document: each inline
 * `data:` image is uploaded to Cloudinary (signed by our API, stored as
 * `authenticated`) and the block keeps only the signed URL and its metadata.
 *
 * Off until VITE_MEDIA_STORE=cloudinary is set at build time (and the API has
 * its CLOUDINARY_* variables); until then images stay inline as before.
 */
export const mediaStoreEnabled = import.meta.env.VITE_MEDIA_STORE === 'cloudinary';

type ImageBlock = Extract<RichTextContent['blocks'][number], { type: 'image' }>;

/** Largest image sent: big enough to keep handwriting, fractions and geometry readable. */
const MAX_EDGE = 2000;
const REENCODE_ABOVE_BYTES = 1_500_000;

export interface MediaDeps {
  token: () => Promise<string | undefined>;
  fetchImpl: typeof fetch;
  /** SHA-256 of the image bytes (hex). */
  hash: (bytes: Uint8Array) => Promise<string>;
  /** Shrinks a large photo before upload; returns the input when already small. */
  shrink: (dataUrl: string) => Promise<string>;
}

const FORMAT_OF: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

function decodeDataUrl(dataUrl: string): { mime: string; bytes: Uint8Array } {
  const match = /^data:([^;,]+);base64,(.*)$/s.exec(dataUrl);
  if (!match) throw new Error('Ảnh không đọc được.');
  const bin = atob(match[2]);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return { mime: match[1].toLowerCase(), bytes };
}

const contents = (q: HomeworkQuestion): RichTextContent[] => [
  q.prompt,
  ...(q.options ?? []).map((o) => o.content),
  ...(q.statements ?? []).map((s) => s.statement),
  ...(q.sampleSolution ? [q.sampleSolution] : []),
];

/** Inline images still kept inside the questions. */
export function inlineImageUrls(questions: HomeworkQuestion[]): string[] {
  const urls = new Set<string>();
  for (const q of questions) for (const c of contents(q)) for (const b of c?.blocks ?? []) {
    if (b.type === 'image' && b.url.startsWith('data:')) urls.add(b.url);
  }
  return [...urls];
}

/** Cloudinary images a homework uses (to find ones a save no longer needs). */
export function storedImageIds(questions: HomeworkQuestion[]): Set<string> {
  const ids = new Set<string>();
  for (const q of questions) for (const c of contents(q)) for (const b of c?.blocks ?? []) {
    const media = b.type === 'image' ? (b as ImageBlock).media : undefined;
    if (media?.provider === 'cloudinary') ids.add(media.publicId);
  }
  return ids;
}

async function api<T>(deps: MediaDeps, path: string, body: unknown): Promise<T> {
  const token = await deps.token();
  if (!token) throw new Error('Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại.');
  const res = await deps.fetchImpl(apiUrl(`/api/media${path}`), {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!res.ok || !data) throw new Error(data?.error || `Kho ảnh không phản hồi (HTTP ${res.status}).`);
  return data;
}

interface SignReply {
  uploadUrl: string;
  apiKey: string;
  params: Record<string, string | number | boolean>;
  signature: string;
  deliveryUrl: string;
}

/**
 * Uploads every inline image and returns the questions pointing at the stored
 * copies. Throws (and changes nothing) if any image cannot be stored, so a save
 * never goes through half-converted.
 */
export async function storeInlineImages(
  homeworkId: string,
  questions: HomeworkQuestion[],
  deps: MediaDeps = browserDeps
): Promise<{ questions: HomeworkQuestion[]; replaced: Map<string, string> }> {
  const pending = inlineImageUrls(questions);
  if (pending.length === 0) return { questions, replaced: new Map() };
  const stored = new Map<string, { url: string; media: StoredImage }>();
  for (const original of pending) {
    const dataUrl = await deps.shrink(original);
    const { mime, bytes } = decodeDataUrl(dataUrl);
    const format = FORMAT_OF[mime];
    if (!format) throw new Error('Chỉ lưu được ảnh JPG, PNG hoặc WEBP.');
    if (bytes.length > 9_500_000) throw new Error('Ảnh lớn hơn 10 MB, hãy chụp hoặc cắt nhỏ lại.');
    const hash = await deps.hash(bytes);
    const sign = await api<SignReply>(deps, '/sign', { homeworkId, hash, format });
    const form = new FormData();
    form.append('file', dataUrl);
    form.append('api_key', sign.apiKey);
    form.append('signature', sign.signature);
    for (const [k, v] of Object.entries(sign.params)) form.append(k, String(v));
    const res = await deps.fetchImpl(sign.uploadUrl, { method: 'POST', body: form });
    const up = (await res.json().catch(() => null)) as
      | { public_id?: string; format?: string; bytes?: number; width?: number; height?: number; error?: { message?: string } }
      | null;
    if (!res.ok || up?.public_id !== sign.params.public_id) {
      throw new Error(`Chưa tải được ảnh lên kho ảnh${up?.error?.message ? `: ${up.error.message}` : ''}.`);
    }
    stored.set(original, {
      url: sign.deliveryUrl,
      media: {
        provider: 'cloudinary',
        publicId: up.public_id,
        format: up.format ?? format,
        bytes: up.bytes ?? bytes.length,
        ...(up.width ? { width: up.width } : {}),
        ...(up.height ? { height: up.height } : {}),
      },
    });
  }
  const swap = (c: RichTextContent): RichTextContent =>
    c && {
      ...c,
      blocks: c.blocks.map((b) => {
        const hit = b.type === 'image' ? stored.get(b.url) : undefined;
        return hit ? ({ ...b, url: hit.url, media: hit.media } as ImageBlock) : b;
      }),
    };
  return {
    questions: questions.map((q) => ({
      ...q,
      prompt: swap(q.prompt),
      ...(q.options ? { options: q.options.map((o) => ({ ...o, content: swap(o.content) })) } : {}),
      ...(q.statements ? { statements: q.statements.map((s) => ({ ...s, statement: swap(s.statement) })) } : {}),
      ...(q.sampleSolution ? { sampleSolution: swap(q.sampleSolution) } : {}),
    })),
    replaced: new Map([...stored].map(([from, to]) => [from, to.url])),
  };
}

/** Asks the API to delete images a homework stopped using; the API keeps any still used elsewhere. */
export async function releaseImages(publicIds: Iterable<string>, deps: MediaDeps = browserDeps): Promise<void> {
  for (const publicId of publicIds) {
    try {
      await api(deps, '/delete', { publicId });
    } catch {
      // Still used, or the store is unreachable: the image simply stays
    }
  }
}

async function shrinkInBrowser(dataUrl: string): Promise<string> {
  const approxBytes = (dataUrl.length * 3) / 4;
  const img = new Image();
  img.src = dataUrl;
  await img.decode();
  const scale = Math.min(1, MAX_EDGE / Math.max(img.naturalWidth, img.naturalHeight));
  if (scale === 1 && approxBytes <= REENCODE_ABOVE_BYTES) return dataUrl;
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(img.naturalWidth * scale);
  canvas.height = Math.round(img.naturalHeight * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) return dataUrl;
  ctx.fillStyle = '#fff'; // transparent PNG drawings stay on white, not black
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  // High quality keeps thin pen strokes, fraction bars and geometry lines sharp
  return canvas.toDataURL('image/jpeg', 0.9);
}

const browserDeps: MediaDeps = {
  token: async () => (await import('../lib/firebase/config')).auth.currentUser?.getIdToken(),
  fetchImpl: (...args) => fetch(...args),
  hash: async (bytes) => {
    const digest = await crypto.subtle.digest('SHA-256', bytes as BufferSource);
    return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
  },
  shrink: shrinkInBrowser,
};
