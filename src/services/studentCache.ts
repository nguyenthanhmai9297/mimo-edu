/**
 * Short-lived in-memory cache for student API reads, so switching portal tabs
 * doesn't refetch what was just loaded. Entries are keyed by the session token
 * (one student never sees another's data), live only in this tab's memory and
 * are wiped on sign-out. Identical requests in flight are shared.
 */
interface Entry {
  at: number;
  value?: unknown;
  pending?: Promise<unknown>;
}

const store = new Map<string, Entry>();

const keyOf = (token: string, name: string) => `${token}::${name}`;

/** Value still fresh enough to show right away, if any. */
export function peekCached<T>(token: string | null, name: string, ttlMs: number): T | undefined {
  if (!token) return undefined;
  const e = store.get(keyOf(token, name));
  return e && 'value' in e && Date.now() - e.at < ttlMs ? (e.value as T) : undefined;
}

export function cachedRequest<T>(token: string, name: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
  const key = keyOf(token, name);
  const e = store.get(key);
  if (e?.pending) return e.pending as Promise<T>;
  if (e && 'value' in e && Date.now() - e.at < ttlMs) return Promise.resolve(e.value as T);
  const pending = load().then(
    (value) => {
      store.set(key, { at: Date.now(), value });
      return value;
    },
    (error) => {
      store.delete(key);
      throw error;
    }
  );
  store.set(key, { ...(e ?? { at: 0 }), pending });
  return pending;
}

/** Forgets one kind of data (e.g. practice history after a new attempt). */
export function invalidateCached(name: string): void {
  for (const key of store.keys()) if (key.endsWith(`::${name}`)) store.delete(key);
}

export function clearStudentCache(): void {
  store.clear();
}
