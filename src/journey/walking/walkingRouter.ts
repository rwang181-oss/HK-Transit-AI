import type { Coordinate } from '../model/types';
import { haversineMeters } from '../graph/travelTime';

export interface WalkingRoute {
  meters: number;
  minutes: number;
  geometry: Coordinate[];
  source: 'routed' | 'estimated';
}

interface FetchResponse {
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}

type FetchLike = (
  input: string,
  init?: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
    signal?: AbortSignal;
    cache?: 'no-store';
  }
) => Promise<FetchResponse>;

export interface WalkingRouterOptions {
  fetchImpl?: FetchLike;
  endpoint?: string;
  now?: () => number;
  timeoutMs?: number;
  cacheTtlMs?: number;
  maxConcurrency?: number;
}

interface CacheEntry {
  expiresAt: number;
  value: WalkingRoute;
}

const DEFAULT_ENDPOINT = 'https://valhalla1.openstreetmap.de/route';
const DEFAULT_TIMEOUT_MS = 5_000;
const DEFAULT_CACHE_TTL_MS = 24 * 60 * 60_000;

export function conservativeWalkingRoute(from: Coordinate, to: Coordinate): WalkingRoute {
  const meters = Math.max(1, Math.round(haversineMeters(from.lat, from.lng, to.lat, to.lng) * 1.35));
  const minutes = Math.max(2, meters / 70);
  return {
    meters,
    minutes,
    geometry: [from, to],
    source: 'estimated',
  };
}

export function decodePolyline6(encoded: string): Coordinate[] {
  const coordinates: Coordinate[] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;
  while (index < encoded.length) {
    let shift = 0;
    let result = 0;
    let byte: number;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20 && index < encoded.length);
    lat += result & 1 ? ~(result >> 1) : result >> 1;

    shift = 0;
    result = 0;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20 && index < encoded.length);
    lng += result & 1 ? ~(result >> 1) : result >> 1;
    coordinates.push({ lat: lat / 1e6, lng: lng / 1e6 });
  }
  return coordinates;
}

function keyFor(from: Coordinate, to: Coordinate): string {
  return [from.lat, from.lng, to.lat, to.lng].map((value) => value.toFixed(5)).join(':');
}

function parseWalkingResponse(payload: unknown, from: Coordinate, to: Coordinate): WalkingRoute {
  const trip = (payload as any)?.trip;
  const lengthKm = Number(trip?.summary?.length);
  const seconds = Number(trip?.summary?.time);
  if (!Number.isFinite(lengthKm) || lengthKm <= 0 || !Number.isFinite(seconds) || seconds <= 0) {
    throw new Error('Invalid pedestrian route summary');
  }

  const geometry: Coordinate[] = [];
  for (const leg of Array.isArray(trip?.legs) ? trip.legs : []) {
    if (typeof leg?.shape !== 'string' || !leg.shape) continue;
    const decoded = decodePolyline6(leg.shape);
    if (geometry.length && decoded.length) decoded.shift();
    geometry.push(...decoded);
  }
  if (geometry.length < 2) geometry.push(from, to);
  return {
    meters: Math.round(lengthKm * 1_000),
    minutes: seconds / 60,
    geometry,
    source: 'routed',
  };
}

export function createWalkingRouter(options: WalkingRouterOptions = {}) {
  const fetchImpl = options.fetchImpl || (globalThis.fetch as unknown as FetchLike);
  const endpoint = options.endpoint || DEFAULT_ENDPOINT;
  const now = options.now || Date.now;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const cacheTtlMs = options.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS;
  const maxConcurrency = Math.max(1, options.maxConcurrency ?? 4);
  const cache = new Map<string, CacheEntry>();
  let active = 0;
  const waiting: Array<() => void> = [];

  const runLimited = async <T>(task: () => Promise<T>): Promise<T> => {
    if (active >= maxConcurrency) {
      await new Promise<void>((resolve) => waiting.push(resolve));
    }
    active += 1;
    try {
      return await task();
    } finally {
      active -= 1;
      waiting.shift()?.();
    }
  };

  const fetchRoute = async (from: Coordinate, to: Coordinate): Promise<WalkingRoute> => {
    if (!fetchImpl) return conservativeWalkingRoute(from, to);
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(new Error('Pedestrian route timed out'));
        }, timeoutMs);
      });
      const request = fetchImpl(endpoint, {
        method: 'POST',
        cache: 'no-store',
        signal: controller.signal,
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          'X-Client-Id': 'hk-transit-ai',
        },
        body: JSON.stringify({
          locations: [
            { lat: from.lat, lon: from.lng, type: 'break' },
            { lat: to.lat, lon: to.lng, type: 'break' },
          ],
          costing: 'pedestrian',
          units: 'kilometers',
        }),
      });
      const response = await Promise.race([request, timeout]);
      if (!response.ok) throw new Error(`Pedestrian route failed: ${response.status}`);
      return parseWalkingResponse(await response.json(), from, to);
    } catch {
      return conservativeWalkingRoute(from, to);
    } finally {
      if (timer) clearTimeout(timer);
    }
  };

  return {
    async route(from: Coordinate, to: Coordinate): Promise<WalkingRoute> {
      const key = keyFor(from, to);
      const cached = cache.get(key);
      if (cached && cached.expiresAt > now()) return cached.value;
      const value = await runLimited(() => fetchRoute(from, to));
      cache.set(key, { value, expiresAt: now() + cacheTtlMs });
      return value;
    },
    clear() {
      cache.clear();
    },
  };
}

export const walkingRouter = createWalkingRouter();
