import { create } from 'zustand';
import {
  fetchAllRoutes,
  fetchAllStops,
  fetchAllRouteStops,
  fetchRouteStops,
} from '@/src/services/kmbAPI';
import type { Route, Stop, RouteStop } from '@/src/services/kmbAPI';

interface RouteInfo {
  route: string;
  bound: 'O' | 'I';
  serviceType: number;
  seq: number;
  dest_en: string;
  dest_tc: string;
}

interface RouteState {
  routes: Route[];
  stops: Stop[];
  routeStopsCache: Record<string, RouteStop[]>;
  stopToRoutes: Record<string, RouteInfo[]>; // reverse index: stopId → routes
  loading: boolean;
  error: string | null;
  loaded: boolean;
  loadRouteData: () => Promise<void>;
  getStopsForRoute: (
    route: string,
    bound: 'O' | 'I',
    serviceType?: number
  ) => Promise<RouteStop[]>;
  getStopById: (stopId: string) => Stop | undefined;
  getRoutesForStop: (stopId: string) => RouteInfo[];
  searchQuery: string;
  setSearchQuery: (q: string) => void;
}

export const useRouteStore = create<RouteState>((set, get) => ({
  routes: [],
  stops: [],
  routeStopsCache: {},
  stopToRoutes: {},
  loading: false,
  error: null,
  loaded: false,

  loadRouteData: async () => {
    if (get().loaded) return;
    set({ loading: true, error: null });
    try {
      const [routes, stops, allRouteStops] = await Promise.all([
        fetchAllRoutes(),
        fetchAllStops(),
        fetchAllRouteStops(),
      ]);

      // Build stop → routes reverse index
      const stopToRoutes: Record<string, RouteInfo[]> = {};
      const routeMap = new Map<string, Route>();
      for (const r of routes) {
        routeMap.set(r.route, r);
      }

      for (const rs of allRouteStops) {
        const key = rs.stop;
        if (!stopToRoutes[key]) stopToRoutes[key] = [];
        const route = routeMap.get(rs.route);
        // deduplicate: same route+bound combo already seen for this stop
        const exists = stopToRoutes[key].some(
          (r) => r.route === rs.route && r.bound === rs.bound
        );
        if (!exists) {
          stopToRoutes[key].push({
            route: rs.route,
            bound: rs.bound,
            serviceType: parseInt(rs.service_type, 10) || 1,
            seq: rs.seq,
            dest_en: route?.dest_en || '',
            dest_tc: route?.dest_tc || '',
          });
        }
      }

      set({ routes, stops, stopToRoutes, loaded: true, loading: false });
    } catch (err) {
      set({ error: String(err), loading: false });
    }
  },

  getStopsForRoute: async (route, bound, serviceType = 1) => {
    const key = `${route}_${bound}_${serviceType}`;
    const cached = get().routeStopsCache[key];
    if (cached) return cached;
    const routeStops = await fetchRouteStops(route, bound, serviceType);
    set((state) => ({
      routeStopsCache: { ...state.routeStopsCache, [key]: routeStops },
    }));
    return routeStops;
  },

  getStopById: (stopId) => {
    return get().stops.find((s) => s.stop === stopId);
  },

  getRoutesForStop: (stopId) => {
    return get().stopToRoutes[stopId] || [];
  },

  searchQuery: '',
  setSearchQuery: (q) => set({ searchQuery: q }),
}));
