/**
 * Lightweight Hong Kong place search via Nominatim (OpenStreetMap).
 * Results are used as raw destination points rather than being snapped to a transit stop.
 * The in-memory cache and one-request-per-second queue reduce unnecessary public API calls.
 */

export interface GeoPoint {
  lat: number;
  lng: number;
  name: string;
  detail?: string;
}

interface NominatimResult {
  lat: string;
  lon: string;
  display_name: string;
  name?: string;
}

const cache = new Map<string, GeoPoint[]>();
let nextAllowedAt = 0;
let queue: Promise<void> = Promise.resolve();

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function respectRateLimit(): Promise<void> {
  queue = queue.then(async () => {
    const delay = Math.max(0, nextAllowedAt - Date.now());
    if (delay) await wait(delay);
    nextAllowedAt = Date.now() + 1_100;
  });
  return queue;
}

function normalizeKey(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

export async function geocodeAddress(query: string): Promise<GeoPoint[]> {
  const q = query.trim();
  if (!q) return [];
  const key = normalizeKey(q);
  const cached = cache.get(key);
  if (cached) return cached;

  await respectRateLimit();
  const params = new URLSearchParams({
    q,
    format: 'jsonv2',
    limit: '4',
    bounded: '1',
    viewbox: '113.80,22.60,114.50,22.15',
    'accept-language': 'zh-HK,en',
  });

  try {
    const response = await fetch(`https://nominatim.openstreetmap.org/search?${params.toString()}`, {
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) return [];
    const data = (await response.json()) as NominatimResult[];
    const results = data
      .map((item) => {
        const lat = Number(item.lat);
        const lng = Number(item.lon);
        const parts = String(item.display_name || '').split(',').map((part) => part.trim());
        return {
          lat,
          lng,
          name: item.name || parts[0] || q,
          detail: parts.slice(1, 4).join(' · '),
        };
      })
      .filter((item) => Number.isFinite(item.lat) && Number.isFinite(item.lng));
    cache.set(key, results);
    return results;
  } catch {
    return [];
  }
}
