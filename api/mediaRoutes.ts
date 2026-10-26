import { createHash } from 'crypto';
import express, { type RequestHandler } from 'express';

/**
 * Homework images on Cloudinary (Free plan). The API Secret stays on the
 * server: teachers get a one-off upload signature here, and images are stored
 * as `authenticated`, so only a URL signed by this server can show them (the
 * same people who can read the homework: teachers, and students given it).
 *
 * Off until CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET
 * are set; until then every route answers 503 and the app keeps images inline.
 *
 * Signing follows Cloudinary's documented algorithm (checked against the
 * official SDK in mediaApi.test.ts), so no extra package is needed.
 */

export interface CloudinaryConfig {
  cloudName: string;
  apiKey: string;
  apiSecret: string;
}

export function cloudinaryConfigFromEnv(env: NodeJS.ProcessEnv = process.env): CloudinaryConfig | null {
  const cloudName = env.CLOUDINARY_CLOUD_NAME?.trim();
  const apiKey = env.CLOUDINARY_API_KEY?.trim();
  const apiSecret = env.CLOUDINARY_API_SECRET?.trim();
  return cloudName && apiKey && apiSecret ? { cloudName, apiKey, apiSecret } : null;
}

export const MEDIA_ROOT = 'mimoedu/homework';
export const MEDIA_FORMATS = ['jpg', 'png', 'webp'] as const;
const HOMEWORK_ID = /^[A-Za-z0-9_-]{1,128}$/;
const CONTENT_HASH = /^[a-f0-9]{64}$/;

/** Signature of an Upload/Admin API call: sorted `key=value` pairs joined by `&`, then the secret, SHA-1. */
export function signApiParams(params: Record<string, string | number | boolean>, apiSecret: string): string {
  const toSign = Object.keys(params)
    .filter((k) => params[k] !== '' && params[k] !== undefined)
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join('&');
  return createHash('sha1').update(toSign + apiSecret).digest('hex');
}

/** Signed delivery URL of an authenticated image (the version is not part of the signature). */
export function signedImageUrl(config: CloudinaryConfig, publicId: string, format: string, version?: number): string {
  const path = `${publicId}.${format}`;
  const signature = createHash('sha1')
    .update(path + config.apiSecret)
    .digest('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .slice(0, 8);
  return `https://res.cloudinary.com/${config.cloudName}/image/authenticated/s--${signature}--/v${version ?? 1}/${path}`;
}

/** Folder/public id an image of a homework is kept under: named by its content, so a retried upload reuses it. */
export const mediaPublicId = (homeworkId: string, hash: string) => `${MEDIA_ROOT}/${homeworkId}/${hash}`;

interface MediaDeps {
  requireTeacher: RequestHandler;
  getConfig: () => CloudinaryConfig | null;
  /**
   * Whether this teacher may add or remove images of this homework: it is theirs,
   * or not saved yet (a new homework). Left out (tests), every teacher may.
   */
  canUseHomework?: (homeworkId: string, req: express.Request) => Promise<boolean>;
  /** Whether any homework or assignment still shows this image (checked before deleting it). */
  isImageInUse: (publicId: string) => Promise<boolean>;
  /** Server-side calls to Cloudinary (replaced in tests). */
  fetchImpl?: typeof fetch;
  now?: () => number;
}

export function createMediaRouter(deps: MediaDeps) {
  const router = express.Router();
  const now = deps.now ?? (() => Date.now());
  router.use(deps.requireTeacher);

  // Another teacher's homework folder is refused (an unknown failure too: nothing is signed)
  const mayUse = async (homeworkId: string, req: express.Request, res: express.Response) => {
    try {
      if (!deps.canUseHomework || (await deps.canUseHomework(homeworkId, req))) return true;
      res.status(403).json({ error: 'Bài tập này không thuộc tài khoản của thầy cô.' });
    } catch {
      res.status(503).json({ error: 'Chưa kiểm tra được quyền với bài tập, vui lòng thử lại.' });
    }
    return false;
  };

  const config = (res: express.Response) => {
    const c = deps.getConfig();
    if (!c) res.status(503).json({ error: 'Chưa cấu hình kho ảnh Cloudinary.', code: 'MEDIA_NOT_CONFIGURED' });
    return c;
  };

  router.get('/status', (_req, res) => {
    res.json({ enabled: deps.getConfig() !== null });
  });

  // One signature per image: the folder, name, storage type and formats are fixed here, not by the browser
  router.post('/sign', async (req, res) => {
    const c = config(res);
    if (!c) return;
    const { homeworkId, hash, format } = (req.body ?? {}) as { homeworkId?: unknown; hash?: unknown; format?: unknown };
    if (typeof homeworkId !== 'string' || !HOMEWORK_ID.test(homeworkId)) {
      res.status(400).json({ error: 'Mã bài tập không hợp lệ.' });
      return;
    }
    if (typeof hash !== 'string' || !CONTENT_HASH.test(hash)) {
      res.status(400).json({ error: 'Mã ảnh không hợp lệ.' });
      return;
    }
    if (typeof format !== 'string' || !(MEDIA_FORMATS as readonly string[]).includes(format)) {
      res.status(400).json({ error: 'Chỉ nhận ảnh JPG, PNG hoặc WEBP.' });
      return;
    }
    if (!(await mayUse(homeworkId, req, res))) return;
    const params = {
      allowed_formats: MEDIA_FORMATS.join(','),
      overwrite: false,
      public_id: mediaPublicId(homeworkId, hash),
      timestamp: Math.floor(now() / 1000),
      type: 'authenticated',
    };
    res.json({
      uploadUrl: `https://api.cloudinary.com/v1_1/${c.cloudName}/image/upload`,
      apiKey: c.apiKey,
      params,
      signature: signApiParams(params, c.apiSecret),
      // What the homework stores once the upload succeeds; Cloudinary refuses it without this signature
      deliveryUrl: signedImageUrl(c, params.public_id, format),
    });
  });

  // Deleting an image no homework or assignment uses any more (a published one keeps its images)
  router.post('/delete', async (req, res) => {
    const c = config(res);
    if (!c) return;
    const { publicId } = (req.body ?? {}) as { publicId?: unknown };
    if (typeof publicId !== 'string' || !publicId.startsWith(`${MEDIA_ROOT}/`) || publicId.includes('..')) {
      res.status(400).json({ error: 'Ảnh không thuộc kho bài tập.' });
      return;
    }
    const homeworkId = publicId.slice(MEDIA_ROOT.length + 1).split('/')[0];
    if (!HOMEWORK_ID.test(homeworkId)) {
      res.status(400).json({ error: 'Ảnh không thuộc kho bài tập.' });
      return;
    }
    if (!(await mayUse(homeworkId, req, res))) return;
    try {
      if (await deps.isImageInUse(publicId)) {
        res.status(409).json({ error: 'Ảnh vẫn đang được dùng trong một bài tập hoặc bài đã giao.', code: 'IN_USE' });
        return;
      }
    } catch {
      res.status(503).json({ error: 'Chưa kiểm tra được ảnh có đang được dùng không, chưa xóa.' });
      return;
    }
    const params = { invalidate: true, public_id: publicId, timestamp: Math.floor(now() / 1000), type: 'authenticated' };
    const body = new URLSearchParams({
      ...Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])),
      api_key: c.apiKey,
      signature: signApiParams(params, c.apiSecret),
    });
    try {
      const reply = await (deps.fetchImpl ?? fetch)(`https://api.cloudinary.com/v1_1/${c.cloudName}/image/destroy`, {
        method: 'POST',
        body,
      });
      const data = (await reply.json().catch(() => ({}))) as { result?: string };
      if (!reply.ok || (data.result !== 'ok' && data.result !== 'not found')) {
        res.status(502).json({ error: 'Kho ảnh chưa xóa được ảnh, vui lòng thử lại.' });
        return;
      }
      res.json({ deleted: data.result === 'ok' });
    } catch {
      res.status(502).json({ error: 'Không kết nối được kho ảnh.' });
    }
  });

  return router;
}
