import { create } from 'zustand';
import {
  fetchAllRoutes,
  fetchAllStops,
  fetchRouteStops,
} from '@/src/services/kmbAPI';
import type { Route, Stop, RouteStop } from '@/src/services/kmbAPI';

interface RouteState {
  routes: Route[];
  stops: Stop[];
  routeStopsCache: Record<string, RouteStop[]>;
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
}

export const useRouteStore = create<RouteState>((set, get) => ({
  routes: [],
  stops: [],
  routeStopsCache: {},
  loading: false,
  error: null,
  loaded: false,

  loadRouteData: async () => {
    if (get().loaded) return;
    set({ loading: true, error: null });
    try {
      const [routes, stops] = await Promise.all([
        fetchAllRoutes(),
        fetchAllStops(),
      ]);
      set({ routes, stops, loaded: true, loading: false });
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
}));
