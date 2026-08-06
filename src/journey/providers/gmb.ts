import type {
  TransitProvider,
  Route,
  Stop,
  RouteStopLink,
  ETA,
} from './types';
import { fetchJson } from './http';
import { parseGmbEtaResponse } from './gmbParser';
import gmbData from '@/src/data/gmb.json';

interface GmbSnapshot {
  routes: Route[];
  stops: Stop[];
  routeStops: RouteStopLink[];
  generatedAt?: string;
  schemaVersion?: number;
}

const data = gmbData as unknown as GmbSnapshot;

const routeStopIndex = new Map<string, RouteStopLink[]>();
const routeStopMetaIndex = new Map<string, RouteStopLink>();
for (const rs of data.routeStops) {
  const key = `${rs.route}:${rs.bound}`;
  if (!routeStopIndex.has(key)) routeStopIndex.set(key, []);
  routeStopIndex.get(key)!.push(rs);
  routeStopMetaIndex.set(`${rs.route}:${rs.bound}:${rs.stopId}`, rs);
}
for (const links of routeStopIndex.values()) links.sort((a, b) => a.seq - b.seq);

export function hasCurrentGmbMetadata(): boolean {
  return data.routeStops.some(
    (link) => link.sourceRouteId && link.routeSeq != null && link.stopSeq != null
  );
}

export const gmbProvider: TransitProvider = {
  id: 'GMB',

  async fetchRoutes(): Promise<Route[]> {
    return data.routes.map((r) => ({ ...r, provider: 'GMB' as const }));
  },

  async fetchStops(): Promise<Stop[]> {
    return data.stops.map((s) => ({ ...s, provider: 'GMB' as const }));
  },

  async fetchRouteStops(route: string, bound: 'O' | 'I'): Promise<RouteStopLink[]> {
    return (routeStopIndex.get(`${route}:${bound}`) || []).map((rs) => ({
      ...rs,
      provider: 'GMB' as const,
    }));
  },

  async fetchETA(stopId: string, route: string): Promise<ETA[]> {
    const bound = route.endsWith('-I') ? 'I' : 'O';
    const meta = routeStopMetaIndex.get(`${route}:${bound}:${stopId}`);
    if (!meta?.sourceRouteId || meta.routeSeq == null || meta.stopSeq == null) {
      // The legacy snapshot did not retain the official numeric route ID.
      // Returning no ETA is safer than showing another route's arrivals.
      return [];
    }

    const payload = await fetchJson<any>(
      `https://data.etagmb.gov.hk/eta/route-stop/${meta.sourceRouteId}/${meta.routeSeq}/${meta.stopSeq}`,
      { timeoutMs: 7_000 }
    );
    return parseGmbEtaResponse(payload, {
      routeId: meta.sourceRouteId,
      routeSeq: meta.routeSeq,
      stopSeq: meta.stopSeq,
    }).map((row) => ({
      route,
      bound,
      stopId,
      eta: row.eta,
      provider: 'GMB' as const,
      remark_en: row.remarks_en,
      remark_tc: row.remarks_tc,
    }));
  },
};
