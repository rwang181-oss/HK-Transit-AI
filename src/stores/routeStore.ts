import { create } from 'zustand';
import {
  fetchAllRoutes,
  fetchAllStops,
  fetchAllRouteStops,
  fetchRouteStops,
} from '@/src/services/kmbAPI';
import { storage } from '@/src/database';
import type { Route, Stop, RouteStop } from '@/src/services/kmbAPI';

interface RouteInfo {
  route: string;
  bound: 'O' | 'I';
  serviceType: number;
  seq: number;
  dest_en: string;
  dest_tc: string;
}

interface RouteData {
  routes: Route[];
  stops: Stop[];
}

const CACHE_KEY = 'hk-transit-route-data';

interface RouteState {
  routes: Route[];
  stops: Stop[];
  routeStopsCache: Record<string, RouteStop[]>;
  stopToRoutes: Record<string, RouteInfo[]>; // reverse index: stopId → routes
  loading: boolean;
  error: string | null;
  loaded: boolean;
  loadRouteData: () => Promise<void>;
  loadAllRouteStops: () => Promise<void>;
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

  // Fast path: routes + stops only (used by search & ETA pages).
  // The heavy all-route-stops payload is loaded separately in loadAllRouteStops.
  loadRouteData: async () => {
    if (get().loaded) return;

    // Instant display from cache if available
    const cached = await storage.getItem<RouteData>(CACHE_KEY);
    if (cached) {
      set({
        routes: cached.routes,
        stops: cached.stops,
        loaded: true,
        loading: false,
      });
    }

    // Refresh from network in the background
    set({ loading: true, error: null });
    try {
      const [routes, stops] = await Promise.all([
        fetchAllRoutes(),
        fetchAllStops(),
      ]);
      set({ routes, stops, loaded: true, loading: false });
      await storage.setItem(CACHE_KEY, { routes, stops });
    } catch (err) {
      // Keep cached data if refresh failed
      if (!get().loaded) {
        set({ error: String(err), loading: false });
      } else {
        set({ loading: false });
      }
    }
  },

  // Heavy payload: full route-stop list → builds stop→routes reverse index.
  // Only needed by the Nearby screen.
  loadAllRouteStops: async () => {
    if (Object.keys(get().stopToRoutes).length > 0) return;
    set({ loading: true, error: null });
    try {
      const [allRouteStops, routes] = await Promise.all([
        fetchAllRouteStops(),
        Promise.resolve(get().routes.length ? get().routes : fetchAllRoutes()),
      ]);

      const stopToRoutes: Record<string, RouteInfo[]> = {};
      const routeMap = new Map<string, Route>();
      for (const r of routes) {
        routeMap.set(r.route, r);
      }

      for (const rs of allRouteStops) {
        const key = rs.stop;
        if (!stopToRoutes[key]) stopToRoutes[key] = [];
        const route = routeMap.get(rs.route);
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

      set({ stopToRoutes, loading: false });
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
