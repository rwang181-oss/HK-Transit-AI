import type {
  TransitProvider,
  Route,
  Stop,
  RouteStopLink,
  ETA,
} from './types';
import * as kmbAPI from '@/src/services/kmbAPI';
import { parseKmbServiceType } from './kmbServiceVariant';

export const kmbProvider: TransitProvider = {
  id: 'KMB',

  async fetchRoutes(): Promise<Route[]> {
    const raw = await kmbAPI.fetchAllRoutes();
    return raw.map((r) => ({
      route: r.route,
      bound: r.bound,
      orig_en: r.orig_en,
      orig_tc: r.orig_tc,
      dest_en: r.dest_en,
      dest_tc: r.dest_tc,
      provider: 'KMB',
    }));
  },

  async fetchStops(): Promise<Stop[]> {
    const raw = await kmbAPI.fetchAllStops();
    return raw.map((s) => ({
      stopId: s.stop,
      name_en: s.name_en,
      name_tc: s.name_tc,
      name_sc: (s as any).name_sc || '',
      lat: s.lat,
      lng: s.long,
      provider: 'KMB',
    }));
  },

  async fetchRouteStops(
    route: string,
    bound: 'O' | 'I',
    routeVariant?: string
  ): Promise<RouteStopLink[]> {
    const raw = await kmbAPI.fetchRouteStops(route, bound, parseKmbServiceType(routeVariant));
    return raw.map((rs) => ({
      route: rs.route,
      bound: rs.bound,
      seq: rs.seq,
      stopId: rs.stop,
      provider: 'KMB',
    }));
  },

  async fetchETA(stopId: string, route: string, routeVariant?: string): Promise<ETA[]> {
    const raw = await kmbAPI.fetchETA(stopId, route, parseKmbServiceType(routeVariant));
    return raw.map((e) => ({
      route: e.route,
      bound: e.dir,
      stopId,
      eta: e.eta,
      provider: 'KMB',
    }));
  },
};
