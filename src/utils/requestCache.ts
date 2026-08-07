export interface RequestCacheOptions {
  now?: () => number;
}

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

export interface RequestCache {
  get<T>(key: string, ttlMs: number, loader: () => Promise<T>): Promise<T>;
  clear(key?: string): void;
}

export function createRequestCache(options: RequestCacheOptions = {}): RequestCache {
  const now = options.now ?? Date.now;
  const values = new Map<string, CacheEntry<unknown>>();
  const inFlight = new Map<string, Promise<unknown>>();

  return {
    async get<T>(key: string, ttlMs: number, loader: () => Promise<T>): Promise<T> {
      const cached = values.get(key) as CacheEntry<T> | undefined;
      if (cached && cached.expiresAt > now()) return cached.value;

      const pending = inFlight.get(key) as Promise<T> | undefined;
      if (pending) return pending;

      const request = loader()
        .then((value) => {
          values.set(key, { value, expiresAt: now() + Math.max(0, ttlMs) });
          return value;
        })
        .finally(() => {
          inFlight.delete(key);
        });
      inFlight.set(key, request);
      return request;
    },

    clear(key?: string) {
      if (key) {
        values.delete(key);
        inFlight.delete(key);
        return;
      }
      values.clear();
      inFlight.clear();
    },
  };
}
