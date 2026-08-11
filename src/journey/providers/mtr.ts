import type {
  TransitProvider,
  Route,
  Stop,
  RouteStopLink,
  ETA,
} from './types';

// Static snapshot produced by scripts/fetch-transit-data.js
import mtrRowsJson from '@/src/data/mtr_stations.json';
import { fetchJson } from './http';

const API = 'https://rt.data.gov.hk/v1/transport/mtr/getSchedule.php';

interface MtrRow {
  line: string;
  direction: string; // DT | UT | branch-DT | branch-UT
  stationCode: string;
  nameTc: string;
  nameEn: string;
  seq: number;
}

const rows: MtrRow[] = (mtrRowsJson as unknown as any[]).map((r) => ({
  line: String(r.line || '').trim(),
  direction: String(r.dir || '').trim(),
  stationCode: String(r.code || '').trim(),
  nameTc: String(r.tc || '').trim(),
  nameEn: String(r.en || '').trim(),
  seq: Number(r.seq) || 0,
}));

const lines = [...new Set(rows.map((r) => r.line))];

function boundForDirection(direction: string): 'O' | 'I' | undefined {
  if (direction.endsWith('UT')) return 'O';
  if (direction.endsWith('DT')) return 'I';
  return undefined;
}

function routeDirection(route: string, bound: 'O' | 'I', routeVariant?: string): { line: string; direction: string } | undefined {
  if (!route) return undefined;
  if (routeVariant) {
    return boundForDirection(routeVariant) === bound
      ? { line: route, direction: routeVariant }
      : undefined;
  }
  return { line: route, direction: bound === 'O' ? 'UT' : 'DT' };
}

/** The schedule endpoint accepts a base MTR line, never an internal route variant. */
export function mtrApiLine(route: string): string {
  return route.split('~', 1)[0] || route;
}

function directionRows(line: string, direction: string) {
  return rows
    .filter((r) => r.line === line && r.direction === direction)
    .sort((a, b) => a.seq - b.seq);
}

async function scheduleJson(line: string, sta: string): Promise<any> {
  return fetchJson(`${API}?line=${line}&sta=${sta}`, { timeoutMs: 7_000 });
}

export const mtrProvider: TransitProvider = {
  id: 'MTR',

  async fetchRoutes(): Promise<Route[]> {
    const routes: Route[] = [];
    for (const line of lines) {
      const directions = [...new Set(rows.filter((row) => row.line === line).map((row) => row.direction))];
      for (const direction of directions) {
        const bound = boundForDirection(direction);
        const directionRoute = directionRows(line, direction);
        if (!bound || !directionRoute.length) continue;
        routes.push({
          route: line,
          routeVariant: direction === 'UT' || direction === 'DT' ? undefined : direction,
          bound,
          orig_en: directionRoute[0].nameEn,
          orig_tc: directionRoute[0].nameTc,
          dest_en: directionRoute[directionRoute.length - 1].nameEn,
          dest_tc: directionRoute[directionRoute.length - 1].nameTc,
          provider: 'MTR',
        });
      }
    }
    return routes;
  },

  async fetchStops(): Promise<Stop[]> {
    const seen = new Map<string, Stop>();
    for (const r of rows) {
      if (!seen.has(r.stationCode)) {
        seen.set(r.stationCode, {
          stopId: r.stationCode,
          name_en: r.nameEn,
          name_tc: r.nameTc,
          lat: 0,
          lng: 0,
          provider: 'MTR',
        });
      }
    }
    return [...seen.values()];
  },

  async fetchRouteStops(
    route: string,
    bound: 'O' | 'I',
    routeVariant?: string
  ): Promise<RouteStopLink[]> {
    const identity = routeDirection(route, bound, routeVariant);
    if (!identity) return [];
    return directionRows(identity.line, identity.direction).map((r, i) => ({
      route,
      routeVariant,
      bound,
      seq: i + 1,
      stopId: r.stationCode,
      provider: 'MTR',
    }));
  },

  async fetchTopology() {
    const stops = await this.fetchStops();
    const links: RouteStopLink[] = [];
    for (const route of await this.fetchRoutes()) {
      links.push(...(await this.fetchRouteStops(route.route, route.bound, route.routeVariant)));
    }
    return { stops, links };
  },

  async fetchETA(stopId: string, route: string): Promise<ETA[]> {
    const line = mtrApiLine(route);
    const json = await scheduleJson(line, stopId);
    const block = json?.data?.[`${line}-${stopId}`];
    const out: ETA[] = [];
    for (const direction of ['UP', 'DOWN'] as const) {
      const bound = direction === 'UP' ? 'O' : 'I';
      for (const t of block?.[direction] || []) {
        out.push({
          route,
          bound,
          stopId,
          eta: t.time || '',
          provider: 'MTR',
        });
      }
    }
    return out;
  },
};
