/**
 * Whether a game page may be shown inside MimoEDU (iframe) or has to be opened
 * in a new tab. Decided from the headers the game site itself sends:
 * Content-Security-Policy frame-ancestors (wins when present) or X-Frame-Options.
 * We never try to get around them.
 */

/** true: may be framed by `parentOrigin` · false: the site refuses. */
export function frameAllowed(
  headers: { xFrameOptions?: string | null; csp?: string | null },
  gameOrigin: string,
  parentOrigin: string
): boolean {
  const ancestors = (headers.csp ?? '')
    .split(',')
    .flatMap((policy) => policy.split(';'))
    .map((d) => d.trim().split(/\s+/))
    .filter((parts) => parts[0]?.toLowerCase() === 'frame-ancestors')
    .map((parts) => parts.slice(1));
  if (ancestors.length > 0) {
    // Several policies: every one of them has to allow the parent
    return ancestors.every((sources) => sources.some((src) => sourceMatches(src, gameOrigin, parentOrigin)));
  }
  const xfo = headers.xFrameOptions?.trim().toUpperCase();
  if (!xfo) return true;
  if (xfo === 'DENY') return false;
  if (xfo === 'SAMEORIGIN') return gameOrigin === parentOrigin;
  // ALLOW-FROM is obsolete and, like any other value, ignored by browsers
  return true;
}

function sourceMatches(raw: string, gameOrigin: string, parentOrigin: string): boolean {
  const src = raw.replace(/^'|'$/g, '').toLowerCase();
  const parent = new URL(parentOrigin);
  if (src === 'none') return false;
  if (src === '*') return true;
  if (src === 'self') return gameOrigin === parentOrigin;
  if (/^[a-z][a-z0-9+.-]*:$/.test(src)) return parent.protocol === src;
  const m = src.match(/^(?:([a-z][a-z0-9+.-]*):\/\/)?(\*\.)?([^/:]+)(?::(\d+|\*))?/);
  if (!m) return false;
  const [, scheme, wildcard, host, port] = m;
  if (scheme && `${scheme}:` !== parent.protocol) return false;
  if (port && port !== '*' && port !== (parent.port || (parent.protocol === 'https:' ? '443' : '80'))) return false;
  return wildcard ? parent.hostname.endsWith(`.${host}`) : parent.hostname === host;
}

type Fetcher = (url: string, init: { method: string; redirect: 'follow'; signal: AbortSignal }) => Promise<{
  url: string;
  headers: { get(name: string): string | null };
  body?: { cancel?: () => Promise<void> } | null;
}>;

const cache = new Map<string, { at: number; value: boolean | null }>();
const KNOWN_TTL = 6 * 60 * 60 * 1000;
const UNKNOWN_TTL = 10 * 60 * 1000;

/**
 * Asks the game site once (cached), following redirects. null when the site
 * can't be reached: the portal then shows the game but keeps the
 * "Chơi trên trang trò chơi" button in sight.
 */
export async function checkEmbeddable(
  url: string,
  parentOrigin: string,
  fetcher: Fetcher = fetch as unknown as Fetcher,
  now = Date.now()
): Promise<boolean | null> {
  const key = `${parentOrigin} ${url}`;
  const hit = cache.get(key);
  if (hit && now - hit.at < (hit.value === null ? UNKNOWN_TTL : KNOWN_TTL)) return hit.value;
  let value: boolean | null;
  try {
    const res = await fetcher(url, { method: 'GET', redirect: 'follow', signal: AbortSignal.timeout(4000) });
    value = frameAllowed(
      { xFrameOptions: res.headers.get('x-frame-options'), csp: res.headers.get('content-security-policy') },
      new URL(res.url || url).origin,
      parentOrigin
    );
    void res.body?.cancel?.().catch(() => undefined);
  } catch {
    value = null;
  }
  cache.set(key, { at: now, value });
  return value;
}

export function clearEmbedCache(): void {
  cache.clear();
}
