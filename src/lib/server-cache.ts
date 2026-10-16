/**
 * Server-side in-memory cache for read-heavy master data
 * (curriculum_db, learning_materials metadata, test_materials metadata).
 * Dramatically reduces Firestore read latency on page loads and /api/user/bootstrap.
 */

type CacheEntry<T> = {
  data: T;
  expiresAt: number;
};

const globalForCache = globalThis as unknown as {
  __studyAppServerCache?: Map<string, CacheEntry<any>>;
};

const cacheStore =
  globalForCache.__studyAppServerCache ||
  (globalForCache.__studyAppServerCache = new Map<string, CacheEntry<any>>());

const DEFAULT_TTL_MS = 10 * 60 * 1000; // 10 minutes

export function getServerCache<T>(key: string): T | null {
  const entry = cacheStore.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    cacheStore.delete(key);
    return null;
  }
  return entry.data as T;
}

export function setServerCache<T>(key: string, data: T, ttlMs: number = DEFAULT_TTL_MS): void {
  cacheStore.set(key, {
    data,
    expiresAt: Date.now() + ttlMs,
  });
}

export function invalidateServerCache(prefixOrKey?: string): void {
  if (!prefixOrKey) {
    cacheStore.clear();
    return;
  }
  for (const k of cacheStore.keys()) {
    if (k === prefixOrKey || k.startsWith(prefixOrKey)) {
      cacheStore.delete(k);
    }
  }
}
