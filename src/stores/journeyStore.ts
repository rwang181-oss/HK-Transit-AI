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

/** Strip whitespace/punctuation for fuzzy matching. */
function normalizeSearch(s: string): string {
  return String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9一-鿿]/g, '');
}

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
    const q = normalizeSearch(query);
    if (!q || q.length === 0) return [];
    const hubs = get().hubs;
    const results: { hub: StopHub; score: number }[] = [];
    for (const h of hubs) {
      const en = normalizeSearch(h.name_en);
      const tc = normalizeSearch(h.name_tc);
      if (!en && !tc) continue;
      // Bidirectional substring: station contains query (typing "旺角"),
      // or query contains station (typing "旺角道XX號" → 旺角).
      const inEn = en.includes(q);
      const inTc = tc.includes(q);
      const qInEn = q.includes(en);
      const qInTc = q.includes(tc);
      if (inEn || inTc || qInEn || qInTc) {
        // Score: prefer station-name prefix/short over long-address hit
        let score = 0;
        if (inEn || inTc) score += 2;
        if (en.startsWith(q) || tc.startsWith(q)) score += 3;
        if (qInEn || qInTc) score += 1;
        results.push({ hub: h, score });
      }
    }
    return results
      .sort((a, b) => b.score - a.score)
      .slice(0, 15)
      .map((r) => r.hub);
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
