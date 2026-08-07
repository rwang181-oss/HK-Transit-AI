import type {
  TransitProvider,
  Route,
  Stop,
  RouteStopLink,
  ETA,
} from './types';
import { fetchJson } from './http';
import ctbData from '@/src/data/ctb.json';

const API_BASE = 'https://rt.data.gov.hk/v2/transport/citybus';

interface CtbSnapshot {
  routes: Route[];
  stops: Stop[];
  routeStops: RouteStopLink[];
}

const data = ctbData as unknown as CtbSnapshot;
const routeStopIndex = new Map<string, RouteStopLink[]>();
for (const rs of data.routeStops) {
  const key = `${rs.route}:${rs.bound}`;
  if (!routeStopIndex.has(key)) routeStopIndex.set(key, []);
  routeStopIndex.get(key)!.push(rs);
}
for (const links of routeStopIndex.values()) links.sort((a, b) => a.seq - b.seq);

function completeRouteDirections(): Route[] {
  const routeMeta = new Map<string, Route>();
  for (const route of data.routes) routeMeta.set(route.route, route);
  const result: Route[] = [];
  const seen = new Set<string>();

  for (const key of routeStopIndex.keys()) {
    const [routeCode, boundValue] = key.split(':');
    const bound = boundValue as 'O' | 'I';
    const meta = routeMeta.get(routeCode);
    if (!meta) continue;
    const id = `${routeCode}:${bound}`;
    if (seen.has(id)) continue;
    seen.add(id);
    result.push({
      ...meta,
      route: routeCode,
      bound,
      orig_en: bound === 'O' ? meta.orig_en : meta.dest_en,
      orig_tc: bound === 'O' ? meta.orig_tc : meta.dest_tc,
      dest_en: bound === 'O' ? meta.dest_en : meta.orig_en,
      dest_tc: bound === 'O' ? meta.dest_tc : meta.orig_tc,
      provider: 'CTB',
    });
  }
  return result;
}

export const ctbProvider: TransitProvider = {
  id: 'CTB',

  async fetchRoutes(): Promise<Route[]> {
    return completeRouteDirections();
  },

  async fetchStops(): Promise<Stop[]> {
    return data.stops.map((s) => ({ ...s, provider: 'CTB' as const }));
  },

  async fetchRouteStops(route: string, bound: 'O' | 'I'): Promise<RouteStopLink[]> {
    return (routeStopIndex.get(`${route}:${bound}`) || []).map((rs) => ({
      ...rs,
      provider: 'CTB' as const,
    }));
  },

  async fetchTopology() {
    return {
      stops: data.stops.map((stop) => ({ ...stop, provider: 'CTB' as const })),
      links: data.routeStops.map((link) => ({ ...link, provider: 'CTB' as const })),
    };
  },

  async fetchETA(stopId: string, route: string): Promise<ETA[]> {
    const payload = await fetchJson<any>(
      `${API_BASE}/eta/ctb/${stopId}/${route}`,
      { timeoutMs: 7_000 }
    );
    return (payload?.data || [])
      .filter((entry: any) => entry?.eta)
      .map((entry: any) => ({
        route: entry.route,
        bound: entry.dir,
        stopId,
        eta: entry.eta,
        dest_en: entry.dest_en || '',
        dest_tc: entry.dest_tc || '',
        provider: 'CTB' as const,
        remark_en: entry.rmk_en || '',
        remark_tc: entry.rmk_tc || '',
      }));
  },
};
