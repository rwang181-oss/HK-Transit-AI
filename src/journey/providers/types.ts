export type ProviderId = 'KMB' | 'CTB' | 'GMB' | 'MTR';

export interface Route {
  route: string; // "1A" / "1" / "26" / "EAL"
  bound: 'O' | 'I';
  orig_en: string;
  orig_tc: string;
  dest_en: string;
  dest_tc: string;
  provider: ProviderId;
  sourceRouteId?: string;
  /** Distinguishes an internal service variant without changing the public route code. */
  routeVariant?: string;
  routeSeq?: number;
  region?: string;
}

export interface Stop {
  stopId: string; // provider-specific id
  name_en: string;
  name_tc: string;
  name_sc?: string; // simplified chinese, when available
  lat: number;
  lng: number;
  provider: ProviderId;
}

export interface RouteStopLink {
  route: string;
  bound: 'O' | 'I';
  seq: number;
  stopId: string;
  provider: ProviderId;
  sourceRouteId?: string;
  routeVariant?: string;
  routeSeq?: number;
  stopSeq?: number;
}

export interface ETA {
  route: string;
  bound: 'O' | 'I';
  stopId: string;
  eta: string; // ISO timestamp
  dest_en?: string;
  dest_tc?: string;
  provider: ProviderId;
  remark_en?: string;
  remark_tc?: string;
}

export interface ProviderTopology {
  stops: Stop[];
  links: RouteStopLink[];
}

/** Stable internal service identity; the fourth segment is present only for variants. */
export function getRouteServiceKey(
  provider: ProviderId | string,
  route: string,
  bound: 'O' | 'I',
  routeVariant?: string
): string {
  return routeVariant
    ? `${provider}:${route}:${bound}:${routeVariant}`
    : `${provider}:${route}:${bound}`;
}

export function parseRouteServiceKey(routeKey: string): {
  provider: ProviderId;
  route: string;
  bound: 'O' | 'I';
  routeVariant?: string;
} {
  const [provider, route, bound, routeVariant] = routeKey.split(':');
  return {
    provider: provider as ProviderId,
    route,
    bound: bound as 'O' | 'I',
    routeVariant: routeVariant || undefined,
  };
}

export interface TransitProvider {
  id: ProviderId;
  fetchRoutes(): Promise<Route[]>;
  fetchStops(): Promise<Stop[]>;
  fetchRouteStops(route: string, bound: 'O' | 'I', routeVariant?: string): Promise<RouteStopLink[]>;
  fetchETA(stopId: string, route: string, routeVariant?: string): Promise<ETA[]>;
  fetchTopology?(): Promise<ProviderTopology>;
}
