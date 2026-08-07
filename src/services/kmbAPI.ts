import { API_BASE_URL } from '@/src/utils/constants';
import { createRequestCache } from '@/src/utils/requestCache';
import {
  resolveKmbTopology,
  type KmbTopology,
} from '@/src/journey/data/kmbTopology';

export interface Route {
  route: string;
  bound: 'O' | 'I';
  orig_en: string;
  orig_tc: string;
  dest_en: string;
  dest_tc: string;
}

export interface Stop {
  stop: string;
  name_en: string;
  name_tc: string;
  lat: number;
  long: number;
}

export interface RouteStop {
  route: string;
  bound: 'O' | 'I';
  service_type: string;
  seq: number;
  stop: string;
}

export interface ETA {
  co: string;
  route: string;
  dir: 'O' | 'I';
  service_type: number;
  seq: number;
  dest_en: string;
  dest_tc: string;
  eta: string;
  eta_seq: number;
  rmk_en: string;
  rmk_tc: string;
  data_timestamp: string;
}

const requestCache = createRequestCache();
const TOPOLOGY_TTL_MS = 5 * 60_000;
const ROUTE_TTL_MS = 2 * 60_000;
const ETA_TTL_MS = 10_000;

async function apiGet<T>(path: string, ttlMs: number): Promise<T> {
  const url = `${API_BASE_URL}${path}`;
  return requestCache.get(url, ttlMs, async () => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8_000);
    try {
      const response = await fetch(url, {
        signal: controller.signal,
        cache: 'default',
        headers: { Accept: 'application/json' },
      });
      if (!response.ok) {
        throw new Error(`API error: ${response.status} ${response.statusText} for ${url}`);
      }
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

async function fetchLiveTopology(): Promise<KmbTopology> {
  const [stopPayload, routeStopPayload] = await Promise.all([
    apiGet<{ data: Stop[] }>('/stop/', TOPOLOGY_TTL_MS),
    apiGet<{ data: RouteStop[] }>('/route-stop/', TOPOLOGY_TTL_MS),
  ]);

  return {
    stops: (stopPayload.data || []).map((stop) => ({
      stopId: stop.stop,
      name_en: stop.name_en,
      name_tc: stop.name_tc,
      name_sc: '',
      lat: Number(stop.lat),
      lng: Number(stop.long),
      provider: 'KMB' as const,
    })),
    links: (routeStopPayload.data || []).map((link) => ({
      route: link.route,
      bound: link.bound,
      seq: Number(link.seq),
      stopId: link.stop,
      provider: 'KMB' as const,
    })),
    cachedAt: new Date().toISOString(),
  };
}

let topologyPromise: Promise<KmbTopology> | null = null;

async function loadTopology(): Promise<KmbTopology> {
  if (topologyPromise) return topologyPromise;

  topologyPromise = (async () => {
    const bundledModule = await import('@/src/journey/providers/kmbSnapshot');
    const result = await resolveKmbTopology({
      bundled: bundledModule.default,
      fetchFresh: fetchLiveTopology,
      persistFresh: (fresh) => {
        topologyPromise = Promise.resolve(fresh);
      },
    });
    if (result.source === 'unavailable') topologyPromise = null;
    return result.topology;
  })();

  try {
    return await topologyPromise;
  } catch (error) {
    topologyPromise = null;
    throw error;
  }
}

export async function fetchAllRoutes(): Promise<Route[]> {
  const data = await apiGet<{ data: Route[] }>('/route/', ROUTE_TTL_MS);
  return data.data;
}

export async function fetchAllStops(): Promise<Stop[]> {
  const topology = await loadTopology();
  return topology.stops.map((stop) => ({
    stop: stop.stopId,
    name_en: stop.name_en,
    name_tc: stop.name_tc,
    lat: stop.lat,
    long: stop.lng,
  }));
}

export async function fetchAllRouteStops(): Promise<RouteStop[]> {
  const topology = await loadTopology();
  return topology.links.map((link) => ({
    route: link.route,
    bound: link.bound,
    service_type: '1',
    seq: link.seq,
    stop: link.stopId,
  }));
}

export async function fetchRouteStops(
  route: string,
  bound: 'O' | 'I',
  serviceType: number = 1
): Promise<RouteStop[]> {
  const dir = bound === 'O' ? 'outbound' : 'inbound';
  const data = await apiGet<{ data: RouteStop[] }>(
    `/route-stop/${route}/${dir}/${serviceType}`,
    ROUTE_TTL_MS
  );
  return data.data;
}

export async function fetchStopETA(stopId: string): Promise<ETA[]> {
  const data = await apiGet<{ data: ETA[] }>(
    `/stop-eta/${stopId}`,
    ETA_TTL_MS
  );
  return data.data;
}

export async function fetchETA(
  stopId: string,
  route: string,
  serviceType: number = 1
): Promise<ETA[]> {
  const data = await apiGet<{ data: ETA[] }>(
    `/eta/${stopId}/${route}/${serviceType}`,
    ETA_TTL_MS
  );
  return data.data;
}
