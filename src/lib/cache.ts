type Entry<T> = { value: T; expiresAt: number };

const store = new Map<string, Entry<unknown>>();

const DEFAULT_TTL_MS = 60_000; // 60s: suficiente para "tiempo real" sin saturar Sheets API

export async function cached<T>(
  key: string,
  fn: () => Promise<T>,
  ttlMs: number = DEFAULT_TTL_MS
): Promise<T> {
  const now = Date.now();
  const hit = store.get(key) as Entry<T> | undefined;

  if (hit && hit.expiresAt > now) {
    return hit.value;
  }

  const value = await fn();
  store.set(key, { value, expiresAt: now + ttlMs });
  return value;
}

export function invalidate(key?: string) {
  if (key) {
    store.delete(key);
  } else {
    store.clear();
  }
}
