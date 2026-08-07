import { createRequestCache } from '@/src/utils/requestCache';

export interface FetchJsonOptions {
  timeoutMs?: number;
  cache?: RequestCache;
  ttlMs?: number;
}

const jsonRequestCache = createRequestCache();

export async function fetchJson<T = any>(
  url: string,
  options: FetchJsonOptions = {}
): Promise<T> {
  const ttlMs = options.ttlMs ?? 8_000;
  const cacheKey = `${url}|${options.cache ?? 'default'}`;
  return jsonRequestCache.get(cacheKey, ttlMs, async () => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 8_000);
    try {
      const response = await fetch(url, {
        signal: controller.signal,
        cache: options.cache ?? 'default',
        headers: { Accept: 'application/json' },
      });
      if (!response.ok) throw new Error(`${response.status} ${url}`);
      return (await response.json()) as T;
    } catch (error) {
      if ((error as Error)?.name === 'AbortError') {
        throw new Error(`Request timed out: ${url}`);
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  });
}
