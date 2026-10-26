import { describe, expect, it } from 'vitest';
import type { HomeworkQuestion, RichTextContent } from '../types/domain';
import { inlineImageUrls, MediaDeps, storedImageIds, storeInlineImages } from '../services/mediaService';

/** Moving inline images to the image store on save, with a fake API and a fake Cloudinary. */

const PNG = 'data:image/png;base64,iVBORw0KGgo=';
const JPG = 'data:image/jpeg;base64,/9j/4AAQ';
const img = (url: string): RichTextContent => ({ version: 1, blocks: [{ type: 'image', url, alt: 'hình' }] } as RichTextContent);

const questions: HomeworkQuestion[] = [
  {
    id: 'q1', order: 1, type: 'single_choice', points: 1,
    prompt: { version: 1, blocks: [{ type: 'paragraph', align: 'left', text: 'Đếm hình' }, { type: 'image', url: PNG, alt: 'hình' }] } as RichTextContent,
    options: [{ id: 'a', label: 'A', content: img(JPG) }, { id: 'b', label: 'B', content: img(PNG) }],
    correctOptionId: 'a',
  },
  { id: 'q2', order: 2, type: 'essay', points: 1, prompt: img('https://example.com/da-co.png'), sampleSolution: img(JPG) },
];

function fakeDeps(opts: { failUpload?: boolean } = {}) {
  const calls: string[] = [];
  const deps: MediaDeps = {
    token: async () => 'teacher-token',
    hash: async (bytes) => (bytes.length === 8 ? 'b' : 'c').repeat(64),
    shrink: async (u) => u,
    fetchImpl: (async (url: string, init: RequestInit) => {
      calls.push(String(url));
      if (String(url).endsWith('/api/media/sign')) {
        const { homeworkId, hash, format } = JSON.parse(String(init.body));
        const publicId = `mimoedu/homework/${homeworkId}/${hash}`;
        return new Response(JSON.stringify({
          uploadUrl: 'https://api.cloudinary.test/upload',
          apiKey: 'k',
          params: { public_id: publicId, type: 'authenticated' },
          signature: 'sig',
          deliveryUrl: `https://res.cloudinary.test/authenticated/s--x--/v1/${publicId}.${format}`,
        }));
      }
      const form = init.body as FormData;
      if (opts.failUpload) return new Response(JSON.stringify({ error: { message: 'Invalid Signature' } }), { status: 401 });
      return new Response(JSON.stringify({ public_id: form.get('public_id'), format: 'png', bytes: 1234, width: 40, height: 30 }));
    }) as unknown as typeof fetch,
  };
  return { deps, calls };
}

describe('storeInlineImages', () => {
  it('tìm đủ ảnh nhúng trong đề, phương án, lời giải; bỏ qua ảnh đã có đường dẫn', () => {
    expect(inlineImageUrls(questions).sort()).toEqual([JPG, PNG].sort());
  });

  it('tải mỗi ảnh một lần, thay bằng đường dẫn có chữ ký và metadata; không còn Base64', async () => {
    const { deps, calls } = fakeDeps();
    const { questions: out, replaced } = await storeInlineImages('hw_1', questions, deps);
    expect(calls.filter((c) => c.endsWith('/sign'))).toHaveLength(2);
    expect(calls.filter((c) => c.includes('cloudinary.test/upload'))).toHaveLength(2);
    expect(JSON.stringify(out)).not.toContain('data:image');
    const block = out[0].prompt.blocks[1] as unknown as { url: string; media: { publicId: string; bytes: number; width: number } };
    expect(block.url).toMatch(/^https:\/\/res\.cloudinary\.test\/authenticated\/s--x--\/v1\/mimoedu\/homework\/hw_1\//);
    expect(block.media).toMatchObject({ provider: 'cloudinary', bytes: 1234, width: 40 });
    expect(out[1].prompt).toEqual(questions[1].prompt);
    expect(replaced.size).toBe(2);
    expect(storedImageIds(out).size).toBe(2);
    expect(out[0].prompt.blocks[0]).toEqual(questions[0].prompt.blocks[0]);
  });

  it('tải ảnh thất bại: báo lỗi, không đổi câu hỏi nào (không lưu nửa vời)', async () => {
    const { deps } = fakeDeps({ failUpload: true });
    const before = JSON.stringify(questions);
    await expect(storeInlineImages('hw_1', questions, deps)).rejects.toThrow('Chưa tải được ảnh');
    expect(JSON.stringify(questions)).toBe(before);
  });

  it('không có ảnh nhúng: không gọi mạng', async () => {
    const { deps, calls } = fakeDeps();
    const plain = [questions[1]].map((q) => ({ ...q, sampleSolution: undefined }));
    const res = await storeInlineImages('hw_1', plain, deps);
    expect(res.questions).toBe(plain);
    expect(calls).toHaveLength(0);
  });

  it('hết phiên đăng nhập: không tải gì', async () => {
    const { deps, calls } = fakeDeps();
    await expect(storeInlineImages('hw_1', questions, { ...deps, token: async () => undefined })).rejects.toThrow('hết hạn');
    expect(calls).toHaveLength(0);
  });
});
