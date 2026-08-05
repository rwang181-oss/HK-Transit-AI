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
  limit: number,
  maxDist = Infinity
): StopHub[] {
  return hubs
    .filter((h) => h.lat && h.lng)
    .map((h) => ({ h, d: haversineMeters(lat, lng, h.lat, h.lng) }))
    .filter((x) => x.d <= maxDist)
    .sort((a, b) => a.d - b.d)
    .slice(0, limit)
    .map((x) => x.h);
}

const MAX_WALK_TO_STATION_M = 1200;
const MAX_WALK_FROM_STATION_M = 1200;

/** Follow a single route's ride edges from boardHub to alightHub. */
function traceRoute(
  edges: import('@/src/journey/graph/graphBuilder').Edge[],
  routeKey: string,
  boardHubId: string,
  alightHubId: string
): number | null {
  const [provider, route, bound] = routeKey.split(':');
  const edgeOf = new Map<string, import('@/src/journey/graph/graphBuilder').Edge>();
  for (const e of edges) {
    if (
      e.kind === 'ride' &&
      e.provider === provider &&
      e.route === route &&
      e.bound === bound &&
      !edgeOf.has(e.from)
    ) {
      edgeOf.set(e.from, e);
    }
  }
  let cur = boardHubId;
  let total = 0;
  const seen = new Set<string>();
  while (cur !== alightHubId) {
    if (seen.has(cur)) return null;
    seen.add(cur);
    const next = edgeOf.get(cur);
    if (!next) return null;
    total += next.weight;
    cur = next.to;
  }
  return total;
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
    const boardHubs = nearestHubs(
      get().hubs,
      from.lat,
      from.lng,
      6,
      MAX_WALK_TO_STATION_M
    );
    const alightHubs = nearestHubs(
      get().hubs,
      to.lat,
      to.lng,
      6,
      MAX_WALK_FROM_STATION_M
    );
    const options: JourneyOption[] = [];

    // Index: which routes serve each hub (from ride edges)
    const hubRoutes = new Map<string, string[]>();
    for (const e of graph.edges) {
      if (e.kind !== 'ride') continue;
      const key = `${e.provider}:${e.route}:${e.bound}`;
      if (!hubRoutes.has(e.from)) hubRoutes.set(e.from, []);
      if (!hubRoutes.get(e.from)!.includes(key)) hubRoutes.get(e.from)!.push(key);
    }

    const seen = new Set<string>(); // dedupe identical combos

    async function addOption(
      bh: StopHub,
      ah: StopHub,
      rideMinutes: number,
      routeKey: string
    ) {
      const [provider, route, bound] = routeKey.split(':');
      const comboKey = `${bh.id}|${ah.id}|${routeKey}`;
      if (seen.has(comboKey)) return;
      seen.add(comboKey);

      const walkToM = haversineMeters(from.lat, from.lng, bh.lat, bh.lng);
      const walkFromM = haversineMeters(ah.lat, ah.lng, to.lat, to.lng);
      const walkToStationMin = estimateWalkMinutes(walkToM);
      const walkFromStationMin = estimateWalkMinutes(walkFromM);

      const member = bh.members.find((m) => m.provider === provider);
      const boardStopId = member?.stopId || '';
      const nextBusMin = await fetchNextBusMin(
        { provider: provider as any, route, bound: bound as any } as any,
        bh
      );
      const catchable = walkToStationMin <= nextBusMin;
      const totalMinutes = Math.round(
        walkToStationMin + nextBusMin + rideMinutes + walkFromStationMin
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
        itinerary: {
          totalMinutes: Math.round(rideMinutes),
          transfers: 0,
          isDirect: true,
          legs: [
            {
              provider: provider as any,
              route,
              bound: bound as any,
              fromHubId: bh.id,
              toHubId: ah.id,
              fromName: bh.name_en,
              toName: ah.name_en,
              minutes: rideMinutes,
              kind: 'ride',
            },
          ],
        },
        boardStopId,
        boardRoute: route,
        boardBound: bound as 'O' | 'I',
        boardProvider: provider,
        boardHub: bh,
        alightHub: ah,
      });
    }

    // 1. DIRECT routes first — any route serving a board stop AND an
    //    alight stop in the correct direction is a real direct option.
    const boardRouteKeys = new Set<string>();
    for (const bh of boardHubs) {
      for (const k of hubRoutes.get(bh.id) || []) boardRouteKeys.add(k);
    }
    for (const ah of alightHubs) {
      const alightKeys = new Set(hubRoutes.get(ah.id) || []);
      for (const key of boardRouteKeys) {
        if (!alightKeys.has(key)) continue;
        for (const bh of boardHubs) {
          if (!(hubRoutes.get(bh.id) || []).includes(key)) continue;
          const rideMin = traceRoute(graph.edges, key, bh.id, ah.id);
          if (rideMin !== null) {
            await addOption(bh, ah, rideMin, key);
          }
        }
      }
    }

    // 2. TRANSFER fallback — Dijkstra for combos not already covered
    for (const bh of boardHubs) {
      for (const ah of alightHubs) {
        if (bh.id === ah.id) continue;
        const comboKey = `${bh.id}|${ah.id}`;
        // Skip if a direct option already exists for this pair
        if ([...seen].some((s) => s.startsWith(comboKey))) continue;
        const itin = planJourney(graph, bh.id, ah.id);
        if (!itin || itin.legs.length === 0) continue;
        const firstRide = itin.legs.find((l) => l.kind === 'ride');
        if (!firstRide) continue;

        const walkToM = haversineMeters(from.lat, from.lng, bh.lat, bh.lng);
        const walkFromM = haversineMeters(ah.lat, ah.lng, to.lat, to.lng);
        const walkToStationMin = estimateWalkMinutes(walkToM);
        const walkFromStationMin = estimateWalkMinutes(walkFromM);
        const nextBusMin = await fetchNextBusMin(firstRide, bh);
        const catchable = walkToStationMin <= nextBusMin;
        const totalMinutes = Math.round(
          walkToStationMin + nextBusMin + itin.totalMinutes + walkFromStationMin
        );
        const member = bh.members.find(
          (m) => m.provider === firstRide.provider
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
          boardStopId: member?.stopId || '',
          boardRoute: firstRide.route,
          boardBound: firstRide.bound,
          boardProvider: firstRide.provider,
          boardHub: bh,
          alightHub: ah,
        });
        seen.add(`${comboKey}|x`);
      }
    }

    options.sort((a, b) => a.totalMinutes - b.totalMinutes);
    return options.slice(0, 12);
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
