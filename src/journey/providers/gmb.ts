import type {
  TransitProvider,
  Route,
  Stop,
  RouteStopLink,
  ETA,
} from './types';

// Static snapshot produced by scripts/fetch-transit-data.js
import gmbData from '@/src/data/gmb.json';

interface GmbSnapshot {
  routes: Route[];
  stops: Stop[];
  routeStops: RouteStopLink[];
}

const data = gmbData as unknown as GmbSnapshot;

async function etaJson(url: string): Promise<any> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`GMB ETA ${res.status} ${url}`);
  return res.json();
}

export const gmbProvider: TransitProvider = {
  id: 'GMB',

  async fetchRoutes(): Promise<Route[]> {
    return data.routes.map((r) => ({ ...r, provider: 'GMB' as const }));
  },

  async fetchStops(): Promise<Stop[]> {
    return data.stops.map((s) => ({ ...s, provider: 'GMB' as const }));
  },

  async fetchRouteStops(
    route: string,
    bound: 'O' | 'I'
  ): Promise<RouteStopLink[]> {
    return data.routeStops
      .filter((rs) => rs.route === route && rs.bound === bound)
      .map((rs) => ({ ...rs, provider: 'GMB' as const }));
  },

  async fetchETA(stopId: string, route: string): Promise<ETA[]> {
    // GMB ETA uses numeric route_id; our snapshot uses "code-bound".
    // Parse the route code; ETA endpoint needs route_id from a lookup.
    const code = route.split('-')[0];
    const { data: raw } = await etaJson(
      `https://data.etagmb.gov.hk/eta/route-stop/${code}/${stopId}`
    );
    return (raw || []).map((e: any) => ({
      route,
      bound: (e.route_seq === 2 ? 'I' : 'O') as 'O' | 'I',
      stopId,
      eta: e.eta || e.eta_timestamp || '',
      provider: 'GMB' as const,
    }));
  },
};
