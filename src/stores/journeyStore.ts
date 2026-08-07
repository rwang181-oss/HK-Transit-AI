import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import type { Stop, RouteStopLink, ProviderId } from '@/src/journey/providers/types';
import { getProvider, getStaticProviders } from '@/src/journey/providers';
import type { StopHub } from '@/src/journey/graph/stopMerger';
import { mergeStops } from '@/src/journey/graph/stopMerger';
import type { Edge, Graph } from '@/src/journey/graph/graphBuilder';
import { buildGraph } from '@/src/journey/graph/graphBuilder';
import type { Itinerary, ItineraryLeg } from '@/src/journey/planner/planner';
import { planJourney } from '@/src/journey/planner/planner';
import {
  haversineMeters,
  estimateWalkMinutes,
} from '@/src/journey/graph/travelTime';
import * as kmbAPI from '@/src/services/kmbAPI';
import type {
  ComfortMetrics,
  JourneyArrivalWindow,
  JourneyGeometryPoint,
  JourneyMode,
  WeatherSnapshot,
} from '@/src/journey/model/types';
import {
  calculateComfortMetrics,
  scoreComfortOption,
} from '@/src/journey/comfort/comfortEngine';
import { recalculateJourneyEta } from '@/src/journey/realtime/etaEstimator';
import { selectDepartureEstimate } from '@/src/journey/realtime/departureSelector';
import { waitAfterWalking } from '@/src/journey/realtime/navigationTiming';
import { mapWithConcurrency } from '@/src/utils/asyncPool';

const KMB_CACHE_KEY = '@hk-transit-ai/kmb-topology-v2';
const MAX_WALK_TO_STATION_M = 1_200;
const MAX_WALK_FROM_STATION_M = 1_200;
const MAX_CANDIDATES_FOR_ETA = 4;
const ETA_CONCURRENCY = 3;
const DEFAULT_WAIT_MINUTES: Record<ProviderId, number> = {
  KMB: 8,
  CTB: 8,
  GMB: 10,
  MTR: 4,
};

function normalizeSearch(value: string): string {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9一-鿿]/g, '');
}

function hasCoordinates(value: { lat: number; lng: number }): boolean {
  return Number.isFinite(value.lat) && Number.isFinite(value.lng) && value.lat !== 0 && value.lng !== 0;
}

function nearestHubs(
  hubs: StopHub[],
  lat: number,
  lng: number,
  limit: number,
  maxDistance = Infinity
): StopHub[] {
  return hubs
    .filter(hasCoordinates)
    .map((hub) => ({ hub, distance: haversineMeters(lat, lng, hub.lat, hub.lng) }))
    .filter((item) => item.distance <= maxDistance)
    .sort((a, b) => a.distance - b.distance)
    .slice(0, limit)
    .map((item) => item.hub);
}

export type EtaStatus = 'live' | 'estimated' | 'unavailable';

export interface JourneyOption {
  id: string;
  totalMinutes: number;
  walkingMinutes: number;
  walkingMeters: number;
  rideMinutes: number;
  transferMinutes: number;
  transferWaitMinutes: number;
  walkToStationMin: number;
  walkToStationMeters: number;
  walkFromStationMin: number;
  walkFromStationMeters: number;
  waitMin: number;
  waitStatus: EtaStatus;
  catchable: boolean;
  nextBusMin: number;
  departureAtMs: number;
  fallbackHeadwayMinutes: number;
  itinerary: Itinerary;
  boardStopId: string;
  boardRoute: string;
  boardBound: 'O' | 'I';
  boardProvider: ProviderId;
  boardHub: StopHub;
  alightHub: StopHub;
  geometry: JourneyGeometryPoint[];
  comfortMetrics: ComfortMetrics;
  comfortScores: Record<JourneyMode, number>;
  arrivalWindow: JourneyArrivalWindow;
  notes: Array<'approximateWalkingGeometry' | 'estimatedComfort' | 'estimatedWait'>;
}

export interface TripPoint {
  lat: number;
  lng: number;
  name: string;
}

export interface PlaceSuggestion extends TripPoint {
  id: string;
  kind: 'hub' | 'place';
  hubId?: string;
  providers?: ProviderId[];
  secondary?: string;
}

interface JourneyState {
  status: 'idle' | 'loading' | 'ready' | 'error';
  error: string | null;
  hubs: StopHub[];
  graph: Graph | null;
  dataWarnings: string[];
  loadData: () => Promise<void>;
  searchStops: (query: string) => StopHub[];
  searchAny: (query: string) => Promise<PlaceSuggestion[]>;
  plan: (from: TripPoint, to: TripPoint, weather?: WeatherSnapshot) => Promise<JourneyOption[]>;
  getHubById: (id: string) => StopHub | undefined;
}

interface CachedTopology {
  stops: Stop[];
  links: RouteStopLink[];
  cachedAt: string;
}

let kmbRefreshPromise: Promise<CachedTopology> | null = null;
let journeyDataLoad: Promise<void> | null = null;

async function fetchFreshKmbTopology(): Promise<CachedTopology> {
  if (kmbRefreshPromise) return kmbRefreshPromise;
  kmbRefreshPromise = (async () => {
    const [stops, routeStops] = await Promise.all([
      kmbAPI.fetchAllStops(),
      kmbAPI.fetchAllRouteStops(),
    ]);
    const topology: CachedTopology = {
      stops: stops.map((stop) => ({
        stopId: stop.stop,
        name_en: stop.name_en,
        name_tc: stop.name_tc,
        name_sc: (stop as any).name_sc || '',
        lat: Number(stop.lat),
        lng: Number(stop.long),
        provider: 'KMB',
      })),
      links: routeStops.map((link) => ({
        route: link.route,
        bound: link.bound,
        seq: Number(link.seq),
        stopId: link.stop,
        provider: 'KMB',
      })),
      cachedAt: new Date().toISOString(),
    };
    await AsyncStorage.setItem(KMB_CACHE_KEY, JSON.stringify(topology));
    return topology;
  })().finally(() => {
    kmbRefreshPromise = null;
  });
  return kmbRefreshPromise;
}

async function loadKmbData(): Promise<{ stops: Stop[]; links: RouteStopLink[]; warning?: string }> {
  const cachedValue = await AsyncStorage.getItem(KMB_CACHE_KEY);
  if (cachedValue) {
    try {
      const topology = JSON.parse(cachedValue) as CachedTopology;
      void fetchFreshKmbTopology().catch(() => undefined);
      return topology;
    } catch {
      await AsyncStorage.removeItem(KMB_CACHE_KEY).catch(() => undefined);
    }
  }

  try {
    return await fetchFreshKmbTopology();
  } catch (networkError) {
    throw networkError;
  }
}

async function loadStaticProvider(provider: Awaited<ReturnType<typeof getStaticProviders>>[number]) {
  if (provider.fetchTopology) return provider.fetchTopology();
  const [stops, routes] = await Promise.all([provider.fetchStops(), provider.fetchRoutes()]);
  const nested = await Promise.all(
    routes.map((route) => provider.fetchRouteStops(route.route, route.bound))
  );
  return { stops, links: nested.flat() };
}

interface RawCandidate {
  boardHub: StopHub;
  alightHub: StopHub;
  rideMinutes: number;
  routeKey: string;
  walkToMinutes: number;
  walkFromMinutes: number;
  walkToMeters: number;
  walkFromMeters: number;
  isDirect: boolean;
  itinerary?: Itinerary;
}

function buildRouteIndexes(graph: Graph) {
  const hubRoutes = new Map<string, string[]>();
  const routeEdges = new Map<string, Map<string, Edge>>();
  for (const edge of graph.edges) {
    if (edge.kind !== 'ride') continue;
    const key = `${edge.provider}:${edge.route}:${edge.bound}`;
    const routes = hubRoutes.get(edge.from) || [];
    if (!routes.includes(key)) routes.push(key);
    hubRoutes.set(edge.from, routes);
    if (!routeEdges.has(key)) routeEdges.set(key, new Map());
    if (!routeEdges.get(key)!.has(edge.from)) routeEdges.get(key)!.set(edge.from, edge);
  }
  return { hubRoutes, routeEdges };
}

function buildDirectCandidates(
  graph: Graph,
  boardHubs: StopHub[],
  to: TripPoint,
  from: TripPoint,
  hubRoutes: Map<string, string[]>,
  routeEdges: Map<string, Map<string, Edge>>
): RawCandidate[] {
  const candidates: RawCandidate[] = [];
  const seen = new Set<string>();
  for (const boardHub of boardHubs) {
    for (const routeKey of hubRoutes.get(boardHub.id) || []) {
      const edges = routeEdges.get(routeKey)!;
      let current = boardHub.id;
      let rideMinutes = 0;
      const visited = new Set<string>();
      while (edges.has(current) && !visited.has(current)) {
        visited.add(current);
        const edge = edges.get(current)!;
        rideMinutes += edge.weight;
        current = edge.to;
        const alightHub = graph.hubById.get(current);
        if (!alightHub || !hasCoordinates(alightHub)) continue;
        const walkFromMeters = haversineMeters(alightHub.lat, alightHub.lng, to.lat, to.lng);
        if (walkFromMeters > MAX_WALK_FROM_STATION_M) continue;
        const key = `${boardHub.id}|${alightHub.id}|${routeKey}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const walkToMeters = haversineMeters(from.lat, from.lng, boardHub.lat, boardHub.lng);
        candidates.push({
          boardHub,
          alightHub,
          rideMinutes,
          routeKey,
          walkToMinutes: estimateWalkMinutes(walkToMeters),
          walkFromMinutes: estimateWalkMinutes(walkFromMeters),
          walkToMeters,
          walkFromMeters,
          isDirect: true,
        });
      }
    }
  }
  return candidates;
}

function buildTransferCandidates(
  graph: Graph,
  boardHubs: StopHub[],
  alightHubs: StopHub[],
  from: TripPoint,
  to: TripPoint,
  existing: RawCandidate[]
): RawCandidate[] {
  const directPairs = new Set(existing.map((item) => `${item.boardHub.id}|${item.alightHub.id}`));
  const candidates: RawCandidate[] = [];
  for (const boardHub of boardHubs) {
    for (const alightHub of alightHubs) {
      if (boardHub.id === alightHub.id) continue;
      if (directPairs.has(`${boardHub.id}|${alightHub.id}`)) continue;
      const itinerary = planJourney(graph, boardHub.id, alightHub.id);
      if (!itinerary || itinerary.legs.length === 0) continue;
      const firstRide = itinerary.legs.find((leg) => leg.kind === 'ride');
      if (!firstRide) continue;
      const walkToMeters = haversineMeters(from.lat, from.lng, boardHub.lat, boardHub.lng);
      const walkFromMeters = haversineMeters(alightHub.lat, alightHub.lng, to.lat, to.lng);
      candidates.push({
        boardHub,
        alightHub,
        rideMinutes: itinerary.totalMinutes,
        routeKey: `${firstRide.provider}:${firstRide.route}:${firstRide.bound}`,
        walkToMinutes: estimateWalkMinutes(walkToMeters),
        walkFromMinutes: estimateWalkMinutes(walkFromMeters),
        walkToMeters,
        walkFromMeters,
        isDirect: false,
        itinerary,
      });
    }
  }
  return candidates;
}

function roughCandidateMinutes(candidate: RawCandidate): number {
  return candidate.walkToMinutes + candidate.rideMinutes + candidate.walkFromMinutes;
}

function deduplicateCandidates(candidates: RawCandidate[]): RawCandidate[] {
  const best = new Map<string, RawCandidate>();
  for (const candidate of candidates) {
    const [provider, route, bound] = candidate.routeKey.split(':');
    const signature = candidate.isDirect
      ? `${provider}:${route}:${bound}:${candidate.boardHub.id}:${candidate.alightHub.id}`
      : candidate.itinerary?.legs
          .map((leg) => `${leg.provider}:${leg.route}:${leg.fromHubId}:${leg.toHubId}`)
          .join('|') || '';
    const previous = best.get(signature);
    if (!previous || roughCandidateMinutes(candidate) < roughCandidateMinutes(previous)) {
      best.set(signature, candidate);
    }
  }
  return [...best.values()]
    .sort((a, b) => roughCandidateMinutes(a) - roughCandidateMinutes(b))
    .slice(0, MAX_CANDIDATES_FOR_ETA);
}

interface DepartureEstimate {
  minutes: number;
  departureAtMs: number;
  status: EtaStatus;
  catchable: boolean;
}

async function fetchDepartureEstimate(
  providerId: ProviderId,
  route: string,
  bound: 'O' | 'I',
  hub: StopHub,
  walkToMinutes: number
): Promise<DepartureEstimate> {
  const fallback = DEFAULT_WAIT_MINUTES[providerId];
  const member = hub.members.find((item) => item.provider === providerId);
  const requestedAtMs = Date.now();
  if (!member) {
    const estimated = selectDepartureEstimate([], walkToMinutes, fallback);
    return {
      ...estimated,
      departureAtMs: requestedAtMs + estimated.minutes * 60_000,
      status: 'unavailable',
    };
  }

  try {
    const provider = await getProvider(providerId);
    const etaRows = await provider.fetchETA(member.stopId, route);
    const times = etaRows
      .filter((row) => !row.bound || row.bound === bound)
      .map((row) => Math.ceil((new Date(row.eta).getTime() - requestedAtMs) / 60_000))
      .filter((minutes) => Number.isFinite(minutes) && minutes >= 0)
      .sort((a, b) => a - b);
    const selected = selectDepartureEstimate(times, walkToMinutes, fallback);
    return {
      ...selected,
      departureAtMs: requestedAtMs + selected.minutes * 60_000,
    };
  } catch {
    const estimated = selectDepartureEstimate([], walkToMinutes, fallback);
    return {
      ...estimated,
      departureAtMs: requestedAtMs + estimated.minutes * 60_000,
    };
  }
}

function itineraryForCandidate(candidate: RawCandidate): Itinerary {
  if (!candidate.isDirect) return candidate.itinerary!;
  const [provider, route, bound] = candidate.routeKey.split(':');
  return {
    totalMinutes: Math.round(candidate.rideMinutes),
    transfers: 0,
    isDirect: true,
    legs: [
      {
        provider,
        route,
        bound: bound as 'O' | 'I',
        fromHubId: candidate.boardHub.id,
        toHubId: candidate.alightHub.id,
        fromName: candidate.boardHub.name_en,
        toName: candidate.alightHub.name_en,
        minutes: candidate.rideMinutes,
        kind: 'ride',
      },
    ],
  };
}

function buildGeometry(
  from: TripPoint,
  to: TripPoint,
  itinerary: Itinerary,
  graph: Graph,
  boardHub: StopHub,
  alightHub: StopHub
): JourneyGeometryPoint[] {
  const points: JourneyGeometryPoint[] = [
    { lat: from.lat, lng: from.lng, kind: 'start', label: from.name },
    { lat: boardHub.lat, lng: boardHub.lng, kind: 'stop', label: boardHub.name_en },
  ];
  for (const leg of itinerary.legs) {
    const hub = graph.hubById.get(leg.toHubId);
    if (hub && hasCoordinates(hub)) {
      const last = points[points.length - 1];
      if (last.lat !== hub.lat || last.lng !== hub.lng) {
        points.push({ lat: hub.lat, lng: hub.lng, kind: 'stop', label: hub.name_en });
      }
    }
  }
  if (points[points.length - 1].lat !== alightHub.lat || points[points.length - 1].lng !== alightHub.lng) {
    points.push({ lat: alightHub.lat, lng: alightHub.lng, kind: 'stop', label: alightHub.name_en });
  }
  points.push({ lat: to.lat, lng: to.lng, kind: 'end', label: to.name });
  return points;
}

const DEFAULT_WEATHER: WeatherSnapshot = {
  rainIntensity: 'none',
  temperatureC: null,
  uvIndex: null,
  isDaylight: true,
  source: 'fallback',
};

function buildOption(
  candidate: RawCandidate,
  departure: DepartureEstimate,
  itinerary: Itinerary,
  graph: Graph,
  from: TripPoint,
  to: TripPoint,
  weather: WeatherSnapshot,
  index: number
): JourneyOption {
  const rideMinutes = itinerary.legs
    .filter((leg) => leg.kind === 'ride')
    .reduce((sum, leg) => sum + leg.minutes, 0);
  const transferMinutes = itinerary.legs
    .filter((leg) => leg.kind === 'transfer')
    .reduce((sum, leg) => sum + leg.minutes, 0);
  const walkingMinutes = candidate.walkToMinutes + candidate.walkFromMinutes + transferMinutes;
  const transferWaitMinutes = itinerary.transfers * 4;
  const waitAtStationMinutes = waitAfterWalking(
    departure.minutes,
    candidate.walkToMinutes
  );
  const walkingMeters = Math.round(
    candidate.walkToMeters + candidate.walkFromMeters + transferMinutes * 80
  );
  const totalMinutes = Math.round(
    walkingMinutes + waitAtStationMinutes + rideMinutes + transferWaitMinutes
  );
  const [providerValue, route, boundValue] = candidate.routeKey.split(':');
  const provider = providerValue as ProviderId;
  const bound = boundValue as 'O' | 'I';
  const member = candidate.boardHub.members.find((item) => item.provider === provider);
  const rideMinutesByProvider: Partial<Record<ProviderId, number>> = {};
  for (const leg of itinerary.legs) {
    if (leg.kind !== 'ride') continue;
    const key = leg.provider as ProviderId;
    rideMinutesByProvider[key] = (rideMinutesByProvider[key] || 0) + leg.minutes;
  }
  const comfortInput = {
    id: `option-${index}`,
    totalMinutes,
    walkingMinutes,
    walkingMeters,
    waitMinutes: waitAtStationMinutes + transferWaitMinutes,
    transfers: itinerary.transfers,
    rideMinutesByProvider,
  };
  const modes: JourneyMode[] = ['recommended', 'fastest', 'shade', 'rain', 'indoor'];
  const comfortScores = Object.fromEntries(
    modes.map((mode) => [mode, scoreComfortOption(comfortInput, mode, weather)])
  ) as Record<JourneyMode, number>;
  const comfortMetrics = calculateComfortMetrics(comfortInput, weather);
  comfortMetrics.score = comfortScores.recommended;
  const arrivalWindow = recalculateJourneyEta({
    nowMs: Date.now(),
    remainingWalkMeters: walkingMeters,
    walkingSpeedMps: 1.25,
    remainingWaitMinutes: waitAtStationMinutes,
    remainingRideMinutes: rideMinutes,
    transferBufferMinutes: transferWaitMinutes,
    hasLiveSpeed: false,
  });

  return {
    id: comfortInput.id,
    totalMinutes,
    walkingMinutes,
    walkingMeters,
    rideMinutes,
    transferMinutes,
    transferWaitMinutes,
    walkToStationMin: candidate.walkToMinutes,
    walkToStationMeters: Math.round(candidate.walkToMeters),
    walkFromStationMin: candidate.walkFromMinutes,
    walkFromStationMeters: Math.round(candidate.walkFromMeters),
    waitMin: Math.round(waitAtStationMinutes),
    waitStatus: departure.status,
    catchable: departure.catchable,
    nextBusMin: departure.minutes,
    departureAtMs: departure.departureAtMs,
    fallbackHeadwayMinutes: DEFAULT_WAIT_MINUTES[provider],
    itinerary,
    boardStopId: member?.stopId || '',
    boardRoute: route,
    boardBound: bound,
    boardProvider: provider,
    boardHub: candidate.boardHub,
    alightHub: candidate.alightHub,
    geometry: buildGeometry(from, to, itinerary, graph, candidate.boardHub, candidate.alightHub),
    comfortMetrics,
    comfortScores,
    arrivalWindow,
    notes: [
      'approximateWalkingGeometry',
      'estimatedComfort',
      ...(departure.status === 'live' ? [] : (['estimatedWait'] as const)),
    ],
  };
}

export function sortJourneyOptions(
  options: JourneyOption[],
  mode: JourneyMode
): JourneyOption[] {
  return [...options].sort(
    (a, b) => a.comfortScores[mode] - b.comfortScores[mode] || a.totalMinutes - b.totalMinutes
  );
}

export const useJourneyStore = create<JourneyState>((set, get) => ({
  status: 'idle',
  error: null,
  hubs: [],
  graph: null,
  dataWarnings: [],

  loadData: async () => {
    if (get().status === 'ready') return;
    if (journeyDataLoad) return journeyDataLoad;

    set({ status: 'loading', error: null });
    journeyDataLoad = (async () => {
      try {
        const [kmb, staticProviders] = await Promise.all([
          loadKmbData(),
          getStaticProviders(),
        ]);
        const loaded = await Promise.all(staticProviders.map(loadStaticProvider));
        const allStops = [kmb.stops, ...loaded.map((item) => item.stops)].flat();
        const allLinks = [kmb.links, ...loaded.map((item) => item.links)].flat();
        const graph = buildGraph(allStops, allLinks);
        set({
          status: 'ready',
          hubs: graph.hubs,
          graph,
          error: null,
          dataWarnings: kmb.warning ? [kmb.warning] : [],
        });
      } catch (error) {
        set({ status: 'error', error: String(error) });
      }
    })().finally(() => {
      journeyDataLoad = null;
    });
    return journeyDataLoad;
  },

  searchStops: (query) => {
    const normalized = normalizeSearch(query);
    if (!normalized) return [];
    return get()
      .hubs.map((hub) => {
        const names = [hub.name_en, hub.name_tc, hub.name_sc].map(normalizeSearch);
        let score = 0;
        for (const name of names) {
          if (!name) continue;
          if (name === normalized) score = Math.max(score, 8);
          else if (name.startsWith(normalized)) score = Math.max(score, 6);
          else if (name.includes(normalized)) score = Math.max(score, 4);
          else if (normalized.includes(name)) score = Math.max(score, 2);
        }
        return { hub, score };
      })
      .filter((item) => item.score > 0 && hasCoordinates(item.hub))
      .sort((a, b) => b.score - a.score)
      .slice(0, 15)
      .map((item) => item.hub);
  },

  searchAny: async (query) => {
    const trimmed = query.trim();
    if (!trimmed) return [];
    const stationHits = get().searchStops(trimmed).slice(0, 8).map((hub) => ({
      id: `hub:${hub.id}`,
      kind: 'hub' as const,
      hubId: hub.id,
      lat: hub.lat,
      lng: hub.lng,
      name: hub.name_en || hub.name_tc || hub.name_sc,
      secondary: hub.name_tc || hub.name_sc,
      providers: [...new Set(hub.members.map((member) => member.provider))],
    }));
    if (stationHits.length >= 5) return stationHits;
    const { geocodeAddress } = await import('@/src/journey/geo/geocode');
    const points = await geocodeAddress(trimmed);
    const placeHits = points.map((point, index) => ({
      id: `place:${index}:${point.lat.toFixed(5)}:${point.lng.toFixed(5)}`,
      kind: 'place' as const,
      lat: point.lat,
      lng: point.lng,
      name: point.name,
      secondary: point.detail,
    }));
    return [...stationHits, ...placeHits].slice(0, 10);
  },

  plan: async (from, to, weather = DEFAULT_WEATHER) => {
    const graph = get().graph;
    if (!graph || !hasCoordinates(from) || !hasCoordinates(to)) return [];
    const boardHubs = nearestHubs(get().hubs, from.lat, from.lng, 5, MAX_WALK_TO_STATION_M);
    const alightHubs = nearestHubs(get().hubs, to.lat, to.lng, 5, MAX_WALK_FROM_STATION_M);
    const { hubRoutes, routeEdges } = buildRouteIndexes(graph);
    const direct = buildDirectCandidates(graph, boardHubs, to, from, hubRoutes, routeEdges);
    const transfer = buildTransferCandidates(graph, boardHubs, alightHubs, from, to, direct);
    const candidates = deduplicateCandidates([...direct, ...transfer]);

    const options = await mapWithConcurrency(
      candidates,
      ETA_CONCURRENCY,
      async (candidate, index) => {
        const [provider, route, bound] = candidate.routeKey.split(':') as [ProviderId, string, 'O' | 'I'];
        const departure = await fetchDepartureEstimate(
          provider,
          route,
          bound,
          candidate.boardHub,
          candidate.walkToMinutes
        );
        const itinerary = itineraryForCandidate(candidate);
        return buildOption(candidate, departure, itinerary, graph, from, to, weather, index);
      }
    );

    return sortJourneyOptions(options, 'recommended');
  },

  getHubById: (id) => get().graph?.hubById.get(id),
}));
