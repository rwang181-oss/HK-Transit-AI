import type {
  TransitProvider,
  Route,
  Stop,
  RouteStopLink,
  ETA,
} from './types';

// Static snapshot produced by scripts/fetch-transit-data.js
import ctbData from '@/src/data/ctb.json';

const API_BASE = 'https://rt.data.gov.hk/v2/transport/citybus';

interface CtbSnapshot {
  routes: Route[];
  stops: Stop[];
  routeStops: RouteStopLink[];
}

const data = ctbData as unknown as CtbSnapshot;

// Pre-build route+bound → links index for O(1) lookups
const routeStopIndex = new Map<string, RouteStopLink[]>();
for (const rs of data.routeStops) {
  const key = `${rs.route}:${rs.bound}`;
  if (!routeStopIndex.has(key)) routeStopIndex.set(key, []);
  routeStopIndex.get(key)!.push(rs);
}

async function etaJson(url: string): Promise<any> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`CTB ETA ${res.status} ${url}`);
  return res.json();
}

export const ctbProvider: TransitProvider = {
  id: 'CTB',

  async fetchRoutes(): Promise<Route[]> {
    return data.routes.map((r) => ({ ...r, provider: 'CTB' as const }));
  },

  async fetchStops(): Promise<Stop[]> {
    return data.stops.map((s) => ({ ...s, provider: 'CTB' as const }));
  },

  async fetchRouteStops(
    route: string,
    bound: 'O' | 'I'
  ): Promise<RouteStopLink[]> {
    return (routeStopIndex.get(`${route}:${bound}`) || []).map((rs) => ({
      ...rs,
      provider: 'CTB' as const,
    }));
  },

  async fetchETA(stopId: string, route: string): Promise<ETA[]> {
    const { data: raw } = await etaJson(
      `${API_BASE}/eta/ctb/${stopId}/${route}`
    );
    return (raw || []).map((e: any) => ({
      route: e.route,
      bound: e.dir,
      stopId,
      eta: e.eta,
      provider: 'CTB' as const,
    }));
  },
};
