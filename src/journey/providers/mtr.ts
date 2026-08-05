import type {
  TransitProvider,
  Route,
  Stop,
  RouteStopLink,
  ETA,
} from './types';

// Static snapshot produced by scripts/fetch-transit-data.js
import mtrRowsJson from '@/src/data/mtr_stations.json';

const API = 'https://rt.data.gov.hk/v1/transport/mtr/getSchedule.php';

interface MtrRow {
  line: string;
  direction: string; // DT | UT
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

function directionRows(line: string, direction: string) {
  return rows
    .filter((r) => r.line === line && r.direction === direction)
    .sort((a, b) => a.seq - b.seq);
}

async function scheduleJson(line: string, sta: string): Promise<any> {
  const res = await fetch(`${API}?line=${line}&sta=${sta}`);
  if (!res.ok) throw new Error(`MTR ETA ${res.status}`);
  return res.json();
}

export const mtrProvider: TransitProvider = {
  id: 'MTR',

  async fetchRoutes(): Promise<Route[]> {
    const routes: Route[] = [];
    for (const line of lines) {
      const ut = directionRows(line, 'UT');
      const dt = directionRows(line, 'DT');
      if (ut.length) {
        routes.push({
          route: line,
          bound: 'O',
          orig_en: ut[0].nameEn,
          orig_tc: ut[0].nameTc,
          dest_en: ut[ut.length - 1].nameEn,
          dest_tc: ut[ut.length - 1].nameTc,
          provider: 'MTR',
        });
      }
      if (dt.length && dt[0].stationCode !== ut[0]?.stationCode) {
        routes.push({
          route: line,
          bound: 'I',
          orig_en: dt[0].nameEn,
          orig_tc: dt[0].nameTc,
          dest_en: dt[dt.length - 1].nameEn,
          dest_tc: dt[dt.length - 1].nameTc,
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
    bound: 'O' | 'I'
  ): Promise<RouteStopLink[]> {
    const dir = bound === 'O' ? 'UT' : 'DT';
    return directionRows(route, dir).map((r, i) => ({
      route,
      bound,
      seq: i + 1,
      stopId: r.stationCode,
      provider: 'MTR',
    }));
  },

  async fetchETA(stopId: string, route: string): Promise<ETA[]> {
    const json = await scheduleJson(route, stopId);
    const block = json?.data?.[`${route}-${stopId}`];
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
