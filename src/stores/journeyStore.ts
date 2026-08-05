import { create } from 'zustand';
import type { Stop, RouteStopLink } from '@/src/journey/providers/types';
import { ALL_PROVIDERS } from '@/src/journey/providers';
import type { StopHub } from '@/src/journey/graph/stopMerger';
import { mergeStops } from '@/src/journey/graph/stopMerger';
import type { Graph } from '@/src/journey/graph/graphBuilder';
import { buildGraph } from '@/src/journey/graph/graphBuilder';
import type { Itinerary } from '@/src/journey/planner/planner';
import { planJourney } from '@/src/journey/planner/planner';
import * as kmbAPI from '@/src/services/kmbAPI';

interface JourneyState {
  status: 'idle' | 'loading' | 'ready' | 'error';
  error: string | null;
  hubs: StopHub[];
  graph: Graph | null;
  loadData: () => Promise<void>;
  searchStops: (query: string) => StopHub[];
  plan: (fromHubId: string, toHubId: string) => Itinerary[] | null;
  getHubById: (id: string) => StopHub | undefined;
}

async function loadKmbData(): Promise<{
  stops: Stop[];
  links: RouteStopLink[];
}> {
  const [stops, allRouteStops] = await Promise.all([
    kmbAPI.fetchAllStops(),
    kmbAPI.fetchAllRouteStops(),
  ]);
  const links: RouteStopLink[] = allRouteStops.map((rs) => ({
    route: rs.route,
    bound: rs.bound,
    seq: rs.seq,
    stopId: rs.stop,
    provider: 'KMB',
  }));
  return {
    stops: stops.map((s) => ({
      stopId: s.stop,
      name_en: s.name_en,
      name_tc: s.name_tc,
      lat: s.lat,
      lng: s.long,
      provider: 'KMB' as const,
    })),
    links,
  };
}

export const useJourneyStore = create<JourneyState>((set, get) => ({
  status: 'idle',
  error: null,
  hubs: [],
  graph: null,

  loadData: async () => {
    if (get().status === 'ready' || get().status === 'loading') return;
    set({ status: 'loading', error: null });
    try {
      const kmb = await loadKmbData();

      // Static providers: CTB, GMB, MTR
      const staticProviders = ALL_PROVIDERS.filter((p) => p.id !== 'KMB');

      async function loadProvider(idx: number): Promise<{
        stops: Stop[];
        links: RouteStopLink[];
      }> {
        const p = staticProviders[idx];
        const stops = await p.fetchStops();
        const routes = await p.fetchRoutes();
        const nested: RouteStopLink[][] = [];
        for (const r of routes) {
          nested.push(await p.fetchRouteStops(r.route, r.bound));
        }
        return { stops, links: nested.flat() };
      }

      const ctb = await loadProvider(0);
      const gmb = await loadProvider(1);
      const mtr = await loadProvider(2);

      const allStops = [...kmb.stops, ...ctb.stops, ...gmb.stops, ...mtr.stops];
      const allLinks = [...kmb.links, ...ctb.links, ...gmb.links, ...mtr.links];

      const hubs = mergeStops(allStops);
      const graph = buildGraph(allStops, allLinks);
      set({ status: 'ready', hubs, graph, error: null });
    } catch (err) {
      set({ status: 'error', error: String(err) });
    }
  },

  searchStops: (query) => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const hubs = get().hubs;
    return hubs
      .filter((h) => {
        const en = h.name_en.toLowerCase();
        const tc = h.name_tc.toLowerCase();
        // Match english name prefix or chinese contains
        return en.startsWith(q) || tc.includes(q) || en.includes(q);
      })
      .slice(0, 15);
  },

  plan: (fromHubId, toHubId) => {
    const graph = get().graph;
    if (!graph) return null;
    const best = planJourney(graph, fromHubId, toHubId);
    if (!best) return [];
    return [best];
  },

  getHubById: (id) => get().hubs.find((h) => h.id === id),
}));
