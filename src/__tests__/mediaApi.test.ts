import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import express from 'express';
import type { AddressInfo } from 'net';
import type { Server } from 'http';
import {
  CloudinaryConfig,
  cloudinaryConfigFromEnv,
  createMediaRouter,
  signApiParams,
  signedImageUrl,
} from '../../api/mediaRoutes';
import { createRequireTeacher, OWNER_EMAIL } from '../../api/teacherAuth';

/**
 * Homework image API (Cloudinary). Fake token verifier and a fake Cloudinary:
 * no real account, nothing leaves the machine.
 */

// Expected values produced by the official `cloudinary` SDK 2.10.0 with the same test secret
const TEST: CloudinaryConfig = { cloudName: 'demo-cloud', apiKey: '123456', apiSecret: 'TEST_SECRET_abc' };
const HASH = 'a'.repeat(64);

describe('chữ ký Cloudinary khớp với SDK chính thức', () => {
  it('chữ ký tải ảnh lên', () => {
    expect(
      signApiParams(
        { timestamp: 1761460000, folder: 'mimoedu/homework/hw_1', public_id: 'ab12', type: 'authenticated', overwrite: false, allowed_formats: 'jpg,png,webp' },
        TEST.apiSecret
      )
    ).toBe('5e04190997ab82b4b0a5821217341961235e105f');
  });
  it('đường dẫn ảnh có chữ ký (kiểu authenticated)', () => {
    expect(signedImageUrl(TEST, 'mimoedu/homework/hw_1/ab12', 'jpg')).toBe(
      'https://res.cloudinary.com/demo-cloud/image/authenticated/s--LsF0Zlvk--/v1/mimoedu/homework/hw_1/ab12.jpg'
    );
    expect(signedImageUrl(TEST, 'mimoedu/homework/hw_1/ab12', 'png', 1761460001)).toBe(
      'https://res.cloudinary.com/demo-cloud/image/authenticated/s--iuT1NckN--/v1761460001/mimoedu/homework/hw_1/ab12.png'
    );
  });
  it('chỉ bật khi có đủ 3 biến cấu hình', () => {
    expect(cloudinaryConfigFromEnv({})).toBeNull();
    expect(cloudinaryConfigFromEnv({ CLOUDINARY_CLOUD_NAME: 'x', CLOUDINARY_API_KEY: 'y' })).toBeNull();
    expect(cloudinaryConfigFromEnv({ CLOUDINARY_CLOUD_NAME: 'x', CLOUDINARY_API_KEY: 'y', CLOUDINARY_API_SECRET: 'z' })).toEqual({
      cloudName: 'x', apiKey: 'y', apiSecret: 'z',
    });
  });
});

const TOKENS: Record<string, { uid?: string; email?: string; email_verified?: boolean }> = {
  owner: { uid: 'u-owner', email: OWNER_EMAIL, email_verified: true },
  allowlisted: { uid: 'u-allow', email: 'giaovien@truong.edu.vn', email_verified: true },
  unverified: { uid: 'u-unv', email: 'giaovien@truong.edu.vn', email_verified: false },
  outsider: { uid: 'u-out', email: 'nguoila@gmail.com', email_verified: true },
};
/** Homework owners, as the server reads them (missing: not saved yet). */
const HOMEWORK_OWNERS: Record<string, string> = { hw_cua_gv_khac: 'u-other' };

let config: CloudinaryConfig | null = TEST;
let inUse = new Set<string>();
const destroyed: URLSearchParams[] = [];

async function start(): Promise<{ url: string; server: Server }> {
  const app = express();
  app.use(express.json());
  const requireTeacher = createRequireTeacher(() => ({
    verifyIdToken: async (token) => {
      const claims = TOKENS[token];
      if (!claims) throw new Error('invalid token');
      return claims;
    },
    isAllowlisted: async (email) => email === 'giaovien@truong.edu.vn',
  }));
  app.use(
    '/api/media',
    createMediaRouter({
      requireTeacher,
      getConfig: () => config,
      canUseHomework: async (homeworkId, req) => {
        const owner = HOMEWORK_OWNERS[homeworkId];
        const r = req as typeof req & { teacherUid?: string; isAdmin?: boolean };
        return !owner || owner === r.teacherUid || Boolean(r.isAdmin);
      },
      isImageInUse: async (id) => inUse.has(id),
      now: () => 1761460000_000,
      fetchImpl: (async (_url: string, init: { body: URLSearchParams }) => {
        destroyed.push(init.body);
        return new Response(JSON.stringify({ result: 'ok' }), { status: 200 });
      }) as unknown as typeof fetch,
    })
  );
  return new Promise((resolve) => {
    const server = app.listen(0, () => resolve({ url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, server }));
  });
}

describe('API kho ảnh /api/media', () => {
  let base = '';
  let server: Server;
  beforeAll(async () => ({ url: base, server } = await start()));
  afterAll(() => new Promise<void>((r) => server.close(() => r())));
  beforeEach(() => {
    config = TEST;
    inUse = new Set();
    destroyed.length = 0;
  });

  const post = (path: string, body: unknown, token?: string) =>
    fetch(`${base}/api/media${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(body),
    });
  const goodSign = { homeworkId: 'hw_1', hash: HASH, format: 'jpg' };

  it('học sinh (không có token Firebase), email chưa xác minh: không xin được chữ ký, không xóa được ảnh', async () => {
    expect((await post('/sign', goodSign)).status).toBe(401);
    expect((await post('/sign', goodSign, 'student-code-token')).status).toBe(401);
    expect((await post('/sign', goodSign, 'unverified')).status).toBe(403);
    expect((await post('/delete', { publicId: `mimoedu/homework/hw_1/${HASH}` }, 'unverified')).status).toBe(403);
    expect(destroyed).toHaveLength(0);
  });

  it('giáo viên được cấp quyền nhận chữ ký: thư mục, tên ảnh, kiểu riêng tư do máy chủ quyết định; không trả API Secret', async () => {
    for (const who of ['owner', 'allowlisted', 'outsider']) {
      const res = await post('/sign', goodSign, who);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.params).toEqual({
        allowed_formats: 'jpg,png,webp',
        overwrite: false,
        public_id: `mimoedu/homework/hw_1/${HASH}`,
        timestamp: 1761460000,
        type: 'authenticated',
      });
      expect(data.signature).toBe(signApiParams(data.params, TEST.apiSecret));
      expect(data.uploadUrl).toBe('https://api.cloudinary.com/v1_1/demo-cloud/image/upload');
      expect(data.deliveryUrl).toBe(signedImageUrl(TEST, `mimoedu/homework/hw_1/${HASH}`, 'jpg'));
      expect(JSON.stringify(data)).not.toContain(TEST.apiSecret);
    }
  });

  it('từ chối dữ liệu lạ: mã bài sai, mã ảnh sai, định dạng không phải ảnh', async () => {
    expect((await post('/sign', { ...goodSign, homeworkId: '../khac' }, 'owner')).status).toBe(400);
    expect((await post('/sign', { ...goodSign, hash: 'abc' }, 'owner')).status).toBe(400);
    expect((await post('/sign', { ...goodSign, format: 'svg' }, 'owner')).status).toBe(400);
    expect((await post('/sign', { ...goodSign, format: 'pdf' }, 'owner')).status).toBe(400);
  });

  it('chưa cấu hình Cloudinary: trả 503, không ký gì', async () => {
    config = null;
    const res = await post('/sign', goodSign, 'owner');
    expect(res.status).toBe(503);
    expect((await res.json()).code).toBe('MEDIA_NOT_CONFIGURED');
    const status = await fetch(`${base}/api/media/status`, { headers: { Authorization: 'Bearer owner' } });
    expect(await status.json()).toEqual({ enabled: false });
  });

  it('xóa ảnh: không xóa ảnh đang được bài tập hoặc bài đã giao dùng; xóa được ảnh không còn dùng', async () => {
    const id = `mimoedu/homework/hw_1/${HASH}`;
    inUse.add(id);
    expect((await post('/delete', { publicId: id }, 'owner')).status).toBe(409);
    expect(destroyed).toHaveLength(0);
    inUse.clear();
    const res = await post('/delete', { publicId: id }, 'allowlisted');
    expect(res.status).toBe(200);
    expect(destroyed).toHaveLength(1);
    const sent = Object.fromEntries(destroyed[0]);
    expect(sent.public_id).toBe(id);
    expect(sent.type).toBe('authenticated');
    expect(sent.signature).toBe(signApiParams({ invalidate: true, public_id: id, timestamp: 1761460000, type: 'authenticated' }, TEST.apiSecret));
    expect(sent.api_secret).toBeUndefined();
  });

  it('giáo viên khác không xin chữ ký, không xóa ảnh trong bài tập của người khác; Admin thì được', async () => {
    const id = `mimoedu/homework/hw_cua_gv_khac/${HASH}`;
    expect((await post('/sign', { ...goodSign, homeworkId: 'hw_cua_gv_khac' }, 'outsider')).status).toBe(403);
    expect((await post('/delete', { publicId: id }, 'outsider')).status).toBe(403);
    expect(destroyed).toHaveLength(0);
    expect((await post('/sign', { ...goodSign, homeworkId: 'hw_cua_gv_khac' }, 'owner')).status).toBe(200);
    expect((await post('/delete', { publicId: id }, 'allowlisted')).status).toBe(200);
  });

  it('không xóa được ảnh ngoài kho bài tập', async () => {
    expect((await post('/delete', { publicId: 'avatars/hoc-sinh-1' }, 'owner')).status).toBe(400);
    expect((await post('/delete', { publicId: 'mimoedu/homework/../x' }, 'owner')).status).toBe(400);
    expect(destroyed).toHaveLength(0);
  });
});
