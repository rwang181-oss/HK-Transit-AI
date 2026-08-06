export interface FetchJsonOptions {
  timeoutMs?: number;
  cache?: RequestCache;
}

export async function fetchJson<T = any>(
  url: string,
  options: FetchJsonOptions = {}
): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 8_000);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      cache: options.cache ?? 'no-store',
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
}
