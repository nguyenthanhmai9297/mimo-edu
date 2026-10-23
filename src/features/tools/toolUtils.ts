/** Pure helpers for the classroom tools (no React, no Firestore). */

export type Random = () => number;

/** Unbiased random index; uses crypto when available so picks feel fair. */
export function randomIndex(length: number, random?: Random): number {
  if (length <= 0) return -1;
  if (random) return Math.floor(random() * length);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const limit = Math.floor(0x100000000 / length) * length;
    const buf = new Uint32Array(1);
    do crypto.getRandomValues(buf);
    while (buf[0] >= limit);
    return buf[0] % length;
  }
  return Math.floor(Math.random() * length);
}

export function shuffleList<T>(items: readonly T[], random?: Random): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = randomIndex(i + 1, random);
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/**
 * Picks one name. With `avoidRepeats`, names already called are skipped until
 * everyone has been called once; then the round starts over.
 */
export function pickName(
  names: readonly string[],
  called: readonly string[],
  avoidRepeats: boolean,
  random?: Random
): { name: string; called: string[]; roundReset: boolean } | null {
  if (names.length === 0) return null;
  let pool = avoidRepeats ? names.filter((n) => !called.includes(n)) : [...names];
  let roundReset = false;
  if (pool.length === 0) {
    pool = [...names];
    roundReset = true;
  }
  const name = pool[randomIndex(pool.length, random)];
  const base = roundReset ? [] : [...called];
  return { name, called: [...base, name], roundReset };
}

/** Splits names into `groupCount` groups whose sizes differ by at most one. */
export function splitIntoGroups<T>(items: readonly T[], groupCount: number, random?: Random): T[][] {
  const count = Math.max(1, Math.min(Math.floor(groupCount), items.length || 1));
  const groups: T[][] = Array.from({ length: count }, () => []);
  shuffleList(items, random).forEach((item, i) => groups[i % count].push(item));
  return groups;
}

/** Number of groups needed so that each group has about `size` members. */
export function groupCountForSize(total: number, size: number): number {
  if (total <= 0) return 1;
  return Math.max(1, Math.ceil(total / Math.max(1, Math.floor(size))));
}

/** Parses a pasted list: one name per line (or separated by commas), trimmed, unique. */
export function parseNameList(text: string): string[] {
  const seen = new Set<string>();
  const names: string[] = [];
  for (const raw of text.split(/[\n,;]+/)) {
    const name = raw.trim().replace(/\s+/g, ' ');
    if (name && !seen.has(name.toLowerCase())) {
      seen.add(name.toLowerCase());
      names.push(name);
    }
  }
  return names;
}

export function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.ceil(totalSeconds));
  const m = Math.floor(s / 60);
  return `${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}
