import { API_BASE_URL } from '@/src/utils/constants';
import { createRequestCache } from '@/src/utils/requestCache';

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

export async function fetchAllRoutes(): Promise<Route[]> {
  const data = await apiGet<{ data: Route[] }>('/route/', ROUTE_TTL_MS);
  return data.data;
}

export async function fetchAllStops(): Promise<Stop[]> {
  const data = await apiGet<{ data: Stop[] }>('/stop/', TOPOLOGY_TTL_MS);
  return data.data;
}

export async function fetchAllRouteStops(): Promise<RouteStop[]> {
  const data = await apiGet<{ data: RouteStop[] }>('/route-stop/', TOPOLOGY_TTL_MS);
  return data.data;
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
