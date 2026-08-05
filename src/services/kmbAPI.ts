import { API_BASE_URL } from '@/src/utils/constants';

// ---- Types ----

export interface Route {
  route: string;
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
  co: string;
  route: string;
  dir: 'O' | 'I';
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

// ---- Internal fetch helper ----

async function apiGet<T>(path: string): Promise<T> {
  const url = `${API_BASE_URL}${path}`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(
      `API error: ${response.status} ${response.statusText} for ${url}`
    );
  }
  return response.json() as Promise<T>;
}

// ---- Public API functions ----

export async function fetchAllRoutes(): Promise<Route[]> {
  const data = await apiGet<{ data: Route[] }>('/route/');
  return data.data;
}

export async function fetchAllStops(): Promise<Stop[]> {
  const data = await apiGet<{ data: Stop[] }>('/stop/');
  return data.data;
}

export async function fetchRouteStops(
  route: string,
  bound: 'O' | 'I',
  serviceType: number = 1
): Promise<RouteStop[]> {
  const data = await apiGet<{ data: RouteStop[] }>(
    `/route-stop/${route}/${bound}/${serviceType}`
  );
  return data.data;
}

export async function fetchETA(
  stopId: string,
  route: string,
  serviceType: number = 1
): Promise<ETA[]> {
  const data = await apiGet<{ data: ETA[] }>(
    `/eta/${stopId}/${route}/${serviceType}`
  );
  return data.data;
}
