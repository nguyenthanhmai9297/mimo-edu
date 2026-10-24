import { beforeEach, describe, expect, it } from 'vitest';
import { checkEmbeddable, clearEmbedCache, frameAllowed } from '../../api/gameEmbed';

const PORTAL = 'https://mimoedu-3b862.web.app';
const GAME = 'https://games.example.com';

describe('Trò chơi – trang có cho nhúng không', () => {
  it('allows sites that send no framing headers', () => {
    expect(frameAllowed({}, GAME, PORTAL)).toBe(true);
  });

  it('follows X-Frame-Options', () => {
    expect(frameAllowed({ xFrameOptions: 'DENY' }, GAME, PORTAL)).toBe(false);
    expect(frameAllowed({ xFrameOptions: 'sameorigin' }, GAME, PORTAL)).toBe(false);
    expect(frameAllowed({ xFrameOptions: 'SAMEORIGIN' }, PORTAL, PORTAL)).toBe(true);
    expect(frameAllowed({ xFrameOptions: 'ALLOW-FROM https://x.com' }, GAME, PORTAL)).toBe(true);
  });

  it('lets CSP frame-ancestors win over X-Frame-Options', () => {
    const allow = (csp: string, xfo?: string) => frameAllowed({ csp, xFrameOptions: xfo }, GAME, PORTAL);
    expect(allow("default-src 'self'; frame-ancestors *", 'DENY')).toBe(true);
    expect(allow("frame-ancestors 'none'")).toBe(false);
    expect(allow("frame-ancestors 'self'")).toBe(false);
    expect(allow('frame-ancestors https:')).toBe(true);
    expect(allow('frame-ancestors https://*.web.app')).toBe(true);
    expect(allow('frame-ancestors https://mimoedu-3b862.web.app')).toBe(true);
    expect(allow('frame-ancestors https://teacher.example.org')).toBe(false);
    expect(allow('frame-ancestors *, frame-ancestors https://teacher.example.org')).toBe(false);
    expect(allow("script-src 'self'")).toBe(true);
  });
});

describe('Trò chơi – hỏi trang trò chơi', () => {
  beforeEach(() => clearEmbedCache());
  const response = (headers: Record<string, string>, url = `${GAME}/play`) => async () => ({
    url,
    headers: { get: (n: string) => headers[n.toLowerCase()] ?? null },
  });

  it('reads the headers of the final page and caches the answer', async () => {
    let calls = 0;
    const fetcher = async () => {
      calls += 1;
      return response({ 'x-frame-options': 'DENY' })();
    };
    expect(await checkEmbeddable(`${GAME}/play`, PORTAL, fetcher as never, 1000)).toBe(false);
    expect(await checkEmbeddable(`${GAME}/play`, PORTAL, fetcher as never, 2000)).toBe(false);
    expect(calls).toBe(1);
  });

  it('returns null when the site cannot be reached', async () => {
    const fetcher = async () => {
      throw new Error('offline');
    };
    expect(await checkEmbeddable(`${GAME}/x`, PORTAL, fetcher as never)).toBeNull();
  });

  it('allows embeddable sites', async () => {
    expect(await checkEmbeddable(`${GAME}/ok`, PORTAL, response({}) as never)).toBe(true);
  });
});
