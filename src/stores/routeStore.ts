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
const STOP_ROUTES_CACHE_KEY = 'hk-transit-stop-routes-v2';
let routeDataLoad: Promise<void> | null = null;
let allRouteStopsLoad: Promise<void> | null = null;

function indexStops(stops: Stop[]): Record<string, Stop> {
  return Object.fromEntries(stops.map((stop) => [stop.stop, stop]));
}

interface RouteState {
  routes: Route[];
  stops: Stop[];
  stopIndex: Record<string, Stop>;
  routeStopsCache: Record<string, RouteStop[]>;
  stopToRoutes: Record<string, RouteInfo[]>;
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
  stopIndex: {},
  routeStopsCache: {},
  stopToRoutes: {},
  loading: false,
  error: null,
  loaded: false,

  loadRouteData: async () => {
    if (get().loaded) return;
    if (routeDataLoad) return routeDataLoad;

    routeDataLoad = (async () => {
      const cached = await storage.getItem<RouteData>(CACHE_KEY);
      if (cached) {
        set({
          routes: cached.routes,
          stops: cached.stops,
          stopIndex: indexStops(cached.stops),
          loaded: true,
          loading: false,
          error: null,
        });
      } else {
        set({ loading: true, error: null });
      }

      try {
        const [routes, stops] = await Promise.all([fetchAllRoutes(), fetchAllStops()]);
        set({
          routes,
          stops,
          stopIndex: indexStops(stops),
          loaded: true,
          loading: false,
          error: null,
        });
        void storage.setItem(CACHE_KEY, { routes, stops });
      } catch (error) {
        if (!get().loaded) set({ error: String(error), loading: false });
      }
    })().finally(() => {
      routeDataLoad = null;
    });
    return routeDataLoad;
  },

  loadAllRouteStops: async () => {
    if (Object.keys(get().stopToRoutes).length > 0) return;
    if (allRouteStopsLoad) return allRouteStopsLoad;

    allRouteStopsLoad = (async () => {
      const cached = await storage.getItem<Record<string, RouteInfo[]>>(STOP_ROUTES_CACHE_KEY);
      if (cached && Object.keys(cached).length > 0) {
        set({ stopToRoutes: cached, loading: false, error: null });
      } else {
        set({ loading: true, error: null });
      }

      try {
        const routes = get().routes.length ? get().routes : await fetchAllRoutes();
        const allRouteStops = await fetchAllRouteStops();
        const routeMap = new Map<string, Route>();
        for (const route of routes) routeMap.set(`${route.route}:${route.bound}`, route);

        const stopToRoutes: Record<string, RouteInfo[]> = {};
        for (const item of allRouteStops) {
          const list = stopToRoutes[item.stop] || (stopToRoutes[item.stop] = []);
          const route = routeMap.get(`${item.route}:${item.bound}`);
          if (list.some((entry) => entry.route === item.route && entry.bound === item.bound)) continue;
          list.push({
            route: item.route,
            bound: item.bound,
            serviceType: parseInt(item.service_type, 10) || 1,
            seq: item.seq,
            dest_en: route?.dest_en || '',
            dest_tc: route?.dest_tc || '',
          });
        }

        set({ stopToRoutes, loading: false, error: null });
        void storage.setItem(STOP_ROUTES_CACHE_KEY, stopToRoutes);
      } catch (error) {
        if (Object.keys(get().stopToRoutes).length === 0) {
          set({ error: String(error), loading: false });
        }
      }
    })().finally(() => {
      allRouteStopsLoad = null;
    });
    return allRouteStopsLoad;
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

  getStopById: (stopId) => get().stopIndex[stopId],
  getRoutesForStop: (stopId) => get().stopToRoutes[stopId] || [],
  searchQuery: '',
  setSearchQuery: (query) => set({ searchQuery: query }),
}));
