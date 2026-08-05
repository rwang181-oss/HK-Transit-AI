import { create } from 'zustand';
import type { Stop, RouteStopLink } from '@/src/journey/providers/types';
import { ALL_PROVIDERS } from '@/src/journey/providers';
import type { StopHub } from '@/src/journey/graph/stopMerger';
import { mergeStops } from '@/src/journey/graph/stopMerger';
import type { Graph } from '@/src/journey/graph/graphBuilder';
import { buildGraph } from '@/src/journey/graph/graphBuilder';
import type { Itinerary, ItineraryLeg } from '@/src/journey/planner/planner';
import { planJourney } from '@/src/journey/planner/planner';
import {
  haversineMeters,
  estimateWalkMinutes,
} from '@/src/journey/graph/travelTime';
import * as kmbAPI from '@/src/services/kmbAPI';

/** Strip whitespace/punctuation for fuzzy matching. */
function normalizeSearch(s: string): string {
  return String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9一-鿿]/g, '');
}

function nearestHubs(
  hubs: StopHub[],
  lat: number,
  lng: number,
  limit: number
): StopHub[] {
  return hubs
    .filter((h) => h.lat && h.lng)
    .map((h) => ({ h, d: haversineMeters(lat, lng, h.lat, h.lng) }))
    .sort((a, b) => a.d - b.d)
    .slice(0, limit)
    .map((x) => x.h);
}

export interface JourneyOption {
  id: string;
  totalMinutes: number;
  walkToStationMin: number;
  walkToStationMeters: number;
  walkFromStationMin: number;
  walkFromStationMeters: number;
  waitMin: number;
  catchable: boolean;
  nextBusMin: number;
  itinerary: Itinerary;
  boardStopId: string;
  boardRoute: string;
  boardBound: 'O' | 'I';
  boardProvider: string;
  boardHub: StopHub;
  alightHub: StopHub;
}

export interface TripPoint {
  lat: number;
  lng: number;
  name: string;
}

interface JourneyState {
  status: 'idle' | 'loading' | 'ready' | 'error';
  error: string | null;
  hubs: StopHub[];
  graph: Graph | null;
  loadData: () => Promise<void>;
  searchStops: (query: string) => StopHub[];
  searchAny: (query: string) => Promise<StopHub[]>;
  plan: (from: TripPoint, to: TripPoint) => Promise<JourneyOption[]>;
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
      name_sc: (s as any).name_sc || '',
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
      const sc = normalizeSearch(h.name_sc);
      if (!en && !tc && !sc) continue;
      const inEn = en.includes(q);
      const inTc = tc.includes(q);
      const inSc = sc.includes(q);
      const qInEn = q.includes(en);
      const qInTc = q.includes(tc);
      const qInSc = q.includes(sc);
      if (inEn || inTc || inSc || qInEn || qInTc || qInSc) {
        let score = 0;
        if (inEn || inTc || inSc) score += 2;
        if (en.startsWith(q) || tc.startsWith(q) || sc.startsWith(q)) score += 3;
        if (qInEn || qInTc || qInSc) score += 1;
        results.push({ hub: h, score });
      }
    }
    return results
      .sort((a, b) => b.score - a.score)
      .slice(0, 15)
      .map((r) => r.hub);
  },

  searchAny: async (query) => {
    const q = query.trim();
    if (!q) return [];
    // 1. Fuzzy station match first
    const stationHits = get().searchStops(q);
    if (stationHits.length > 0) return stationHits;
    // 2. Geocode as an address/place
    const { geocodeAddress } = await import('@/src/journey/geo/geocode');
    const points = await geocodeAddress(q);
    if (points.length === 0) return [];
    // 3. Nearest stations to the geocoded point
    const hubs = get().hubs;
    return nearestHubs(hubs, points[0].lat, points[0].lng, 3);
  },

  plan: async (from, to) => {
    const graph = get().graph;
    if (!graph) return [];
    const boardHubs = nearestHubs(get().hubs, from.lat, from.lng, 3);
    const alightHubs = nearestHubs(get().hubs, to.lat, to.lng, 3);
    const options: JourneyOption[] = [];

    for (const bh of boardHubs) {
      for (const ah of alightHubs) {
        if (bh.id === ah.id) continue;
        const itin = planJourney(graph, bh.id, ah.id);
        if (!itin || itin.legs.length === 0) continue;

        const walkToM = haversineMeters(from.lat, from.lng, bh.lat, bh.lng);
        const walkFromM = haversineMeters(ah.lat, ah.lng, to.lat, to.lng);
        const walkToStationMin = estimateWalkMinutes(walkToM);
        const walkFromStationMin = estimateWalkMinutes(walkFromM);

        const firstRide = itin.legs.find((l) => l.kind === 'ride');
        let nextBusMin = 0;
        let boardStopId = '';
        let boardRoute = '';
        let boardBound: 'O' | 'I' = 'O';
        let boardProvider = '';
        if (firstRide) {
          boardRoute = firstRide.route;
          boardBound = firstRide.bound;
          boardProvider = firstRide.provider;
          const member = bh.members.find((m) => m.provider === firstRide.provider);
          if (member) boardStopId = member.stopId;
          nextBusMin = await fetchNextBusMin(firstRide, bh);
        }

        const catchable = walkToStationMin <= nextBusMin;
        const totalMinutes = Math.round(
          walkToStationMin + nextBusMin + itin.totalMinutes + walkFromStationMin
        );

        options.push({
          id: `opt-${options.length}`,
          totalMinutes,
          walkToStationMin,
          walkToStationMeters: Math.round(walkToM),
          walkFromStationMin,
          walkFromStationMeters: Math.round(walkFromM),
          waitMin: nextBusMin,
          catchable,
          nextBusMin,
          itinerary: itin,
          boardStopId,
          boardRoute,
          boardBound,
          boardProvider,
          boardHub: bh,
          alightHub: ah,
        });
      }
    }

    options.sort((a, b) => a.totalMinutes - b.totalMinutes);
    return options.slice(0, 10);
  },

  getHubById: (id) => get().hubs.find((h) => h.id === id),
}));

async function fetchNextBusMin(leg: ItineraryLeg, hub: StopHub): Promise<number> {
  const member = hub.members.find((m) => m.provider === leg.provider);
  if (!member) return 0;
  try {
    const provider = ALL_PROVIDERS.find((p) => p.id === leg.provider);
    if (!provider) return 0;
    const etas = await provider.fetchETA(member.stopId, leg.route);
    const times = etas
      .map((e) => {
        const t = e.eta ? (new Date(e.eta).getTime() - Date.now()) / 60000 : -1;
        return Math.round(t);
      })
      .filter((t) => t >= 0)
      .sort((a, b) => a - b);
    return times[0] ?? 0;
  } catch {
    return 0;
  }
}
