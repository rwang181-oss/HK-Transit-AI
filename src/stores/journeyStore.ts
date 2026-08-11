import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import {
  getRouteServiceKey,
  parseRouteServiceKey,
  type Stop,
  type RouteStopLink,
  type ProviderId,
} from '../journey/providers/types';
import { getProvider, getStaticProviders } from '@/src/journey/providers';
import type { StopHub } from '@/src/journey/graph/stopMerger';
import type { Edge, Graph } from '@/src/journey/graph/graphBuilder';
import { buildGraph } from '@/src/journey/graph/graphBuilder';
import type { Itinerary } from '@/src/journey/planner/planner';
import { planJourney } from '@/src/journey/planner/planner';
import { haversineMeters, estimateWalkMinutes } from '@/src/journey/graph/travelTime';
import {
  retainCandidatePools,
  selectRouteAwareHubs,
  type CandidatePoolItem,
} from '@/src/journey/planner/candidatePools';
import { applyJourneyPolicy } from '@/src/journey/planner/routePolicies';
import {
  walkingRouter,
  type WalkingRoute,
} from '@/src/journey/walking/walkingRouter';
import * as kmbAPI from '@/src/services/kmbAPI';
import type {
  ComfortMetrics,
  JourneyArrivalWindow,
  JourneyGeometryPoint,
  JourneyMode,
  JourneyPolicy,
  WeatherSnapshot,
} from '@/src/journey/model/types';
import { calculateComfortMetrics, scoreComfortOption } from '@/src/journey/comfort/comfortEngine';
import { recalculateJourneyEta } from '@/src/journey/realtime/etaEstimator';
import { selectDepartureEstimate } from '@/src/journey/realtime/departureSelector';
import { waitAfterWalking } from '@/src/journey/realtime/navigationTiming';
import { mapWithConcurrency } from '@/src/utils/asyncPool';

const KMB_CACHE_KEY = '@hk-transit-ai/kmb-topology-v2';
const MAX_WALK_TO_STATION_M = 1_200;
const MAX_WALK_FROM_STATION_M = 1_200;
const MAX_ROUTE_AWARE_HUBS = 20;
const MAX_TRANSFER_HUBS = 10;
const ETA_CONCURRENCY = 4;
const DEFAULT_WAIT_MINUTES: Record<ProviderId, number> = {
  KMB: 8,
  CTB: 8,
  GMB: 10,
  MTR: 4,
};

function normalizeSearch(value: string): string {
  return String(value || '').toLowerCase().replace(/[^a-z0-9一-鿿]/g, '');
}

function hasCoordinates(value: { lat: number; lng: number }): boolean {
  return Number.isFinite(value.lat) && Number.isFinite(value.lng) && value.lat !== 0 && value.lng !== 0;
}

export type EtaStatus = 'live' | 'estimated' | 'unavailable';

export interface JourneyOption {
  id: string;
  totalMinutes: number;
  walkingMinutes: number;
  walkingMeters: number;
  walkingSource: 'routed' | 'estimated';
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
  boardRouteVariant?: string;
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
  plan: (
    from: TripPoint,
    to: TripPoint,
    weather?: WeatherSnapshot,
    policy?: JourneyPolicy
  ) => Promise<JourneyOption[]>;
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
  return fetchFreshKmbTopology();
}

async function loadStaticProvider(provider: Awaited<ReturnType<typeof getStaticProviders>>[number]) {
  if (provider.fetchTopology) return provider.fetchTopology();
  const [stops, routes] = await Promise.all([provider.fetchStops(), provider.fetchRoutes()]);
  const nested = await Promise.all(routes.map((route) => provider.fetchRouteStops(route.route, route.bound, route.routeVariant)));
  return { stops, links: nested.flat() };
}

interface RawCandidate extends CandidatePoolItem {
  boardHub: StopHub;
  alightHub: StopHub;
  rideMinutes: number;
  walkToMinutes: number;
  walkFromMinutes: number;
  walkToMeters: number;
  walkFromMeters: number;
  itinerary?: Itinerary;
}

function buildRouteIndexes(graph: Graph) {
  const hubRoutes = new Map<string, string[]>();
  const routeEdges = new Map<string, Map<string, Edge>>();
  for (const edge of graph.edges) {
    if (edge.kind !== 'ride') continue;
    const key = getRouteServiceKey(edge.provider, edge.route, edge.bound, edge.routeVariant);
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
      const edges = routeEdges.get(routeKey);
      if (!edges) continue;
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
        const walkToMinutes = estimateWalkMinutes(walkToMeters * 1.35);
        const walkFromMinutes = estimateWalkMinutes(walkFromMeters * 1.35);
        candidates.push({
          boardHub,
          alightHub,
          rideMinutes,
          routeKey,
          walkToMinutes,
          walkFromMinutes,
          walkToMeters: walkToMeters * 1.35,
          walkFromMeters: walkFromMeters * 1.35,
          isDirect: true,
          roughMinutes: walkToMinutes + rideMinutes + walkFromMinutes,
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
  for (const boardHub of boardHubs.slice(0, MAX_TRANSFER_HUBS)) {
    for (const alightHub of alightHubs.slice(0, MAX_TRANSFER_HUBS)) {
      if (boardHub.id === alightHub.id) continue;
      if (directPairs.has(`${boardHub.id}|${alightHub.id}`)) continue;
      const itinerary = planJourney(graph, boardHub.id, alightHub.id, {
        transferPenaltyMinutes: 10,
        transferWalkBufferMinutes: 2,
        maxTransfers: 2,
      });
      if (!itinerary || itinerary.legs.length === 0 || itinerary.transfers > 2) continue;
      const firstRide = itinerary.legs.find((leg) => leg.kind === 'ride');
      if (!firstRide) continue;
      const straightTo = haversineMeters(from.lat, from.lng, boardHub.lat, boardHub.lng);
      const straightFrom = haversineMeters(alightHub.lat, alightHub.lng, to.lat, to.lng);
      const walkToMeters = straightTo * 1.35;
      const walkFromMeters = straightFrom * 1.35;
      const walkToMinutes = Math.max(2, walkToMeters / 70);
      const walkFromMinutes = Math.max(2, walkFromMeters / 70);
      candidates.push({
        boardHub,
        alightHub,
        rideMinutes: itinerary.totalMinutes,
        routeKey: getRouteServiceKey(firstRide.provider, firstRide.route, firstRide.bound, firstRide.routeVariant),
        walkToMinutes,
        walkFromMinutes,
        walkToMeters,
        walkFromMeters,
        isDirect: false,
        itinerary,
        roughMinutes: walkToMinutes + itinerary.totalMinutes + walkFromMinutes,
      });
    }
  }
  return candidates;
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
    return { ...estimated, departureAtMs: requestedAtMs + estimated.minutes * 60_000, status: 'unavailable' };
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
    return { ...selected, departureAtMs: requestedAtMs + selected.minutes * 60_000 };
  } catch {
    const estimated = selectDepartureEstimate([], walkToMinutes, fallback);
    return { ...estimated, departureAtMs: requestedAtMs + estimated.minutes * 60_000 };
  }
}

function itineraryForCandidate(candidate: RawCandidate): Itinerary {
  if (!candidate.isDirect) return candidate.itinerary!;
  const { provider, route, bound, routeVariant } = parseRouteServiceKey(candidate.routeKey);
  return {
    totalMinutes: Math.round(candidate.rideMinutes),
    transfers: 0,
    isDirect: true,
    legs: [{
      provider,
      route,
      bound: bound as 'O' | 'I',
      routeVariant,
      fromHubId: candidate.boardHub.id,
      toHubId: candidate.alightHub.id,
      fromName: candidate.boardHub.name_en,
      toName: candidate.alightHub.name_en,
      fromLat: candidate.boardHub.lat,
      fromLng: candidate.boardHub.lng,
      toLat: candidate.alightHub.lat,
      toLng: candidate.alightHub.lng,
      minutes: candidate.rideMinutes,
      kind: 'ride',
    }],
  };
}

function appendGeometry(
  output: JourneyGeometryPoint[],
  geometry: Array<{ lat: number; lng: number }>,
  finalKind: JourneyGeometryPoint['kind'],
  finalLabel?: string
) {
  geometry.forEach((point, index) => {
    const previous = output[output.length - 1];
    if (previous && previous.lat === point.lat && previous.lng === point.lng) return;
    output.push({
      lat: point.lat,
      lng: point.lng,
      kind: index === geometry.length - 1 ? finalKind : 'walk',
      label: index === geometry.length - 1 ? finalLabel : undefined,
    });
  });
}

function buildGeometry(
  from: TripPoint,
  to: TripPoint,
  itinerary: Itinerary,
  graph: Graph,
  boardHub: StopHub,
  alightHub: StopHub,
  walkTo: WalkingRoute,
  walkFrom: WalkingRoute
): JourneyGeometryPoint[] {
  const points: JourneyGeometryPoint[] = [];
  appendGeometry(points, walkTo.geometry, 'stop', boardHub.name_en);
  if (!points.length) points.push({ ...from, kind: 'start' });
  points[0] = { ...points[0], kind: 'start', label: from.name };
  for (const leg of itinerary.legs) {
    const hub = graph.hubById.get(leg.toHubId);
    if (!hub || !hasCoordinates(hub)) continue;
    const last = points[points.length - 1];
    if (last?.lat === hub.lat && last?.lng === hub.lng) continue;
    points.push({ lat: hub.lat, lng: hub.lng, kind: 'stop', label: hub.name_en });
  }
  const last = points[points.length - 1];
  if (last?.lat !== alightHub.lat || last?.lng !== alightHub.lng) {
    points.push({ lat: alightHub.lat, lng: alightHub.lng, kind: 'stop', label: alightHub.name_en });
  }
  appendGeometry(points, walkFrom.geometry.slice(1), 'end', to.name);
  if (!points.some((point) => point.kind === 'end')) points.push({ ...to, kind: 'end' });
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
  index: number,
  walkTo: WalkingRoute,
  walkFrom: WalkingRoute
): JourneyOption {
  const rideMinutes = itinerary.legs.filter((leg) => leg.kind === 'ride').reduce((sum, leg) => sum + leg.minutes, 0);
  const transferMinutes = itinerary.legs.filter((leg) => leg.kind === 'transfer').reduce((sum, leg) => sum + leg.minutes, 0);
  const walkingMinutes = walkTo.minutes + walkFrom.minutes + transferMinutes;
  const transferWaitMinutes = itinerary.transfers * 4;
  const waitAtStationMinutes = waitAfterWalking(departure.minutes, walkTo.minutes);
  const walkingMeters = Math.round(walkTo.meters + walkFrom.meters + transferMinutes * 70);
  const totalMinutes = Math.round(walkingMinutes + waitAtStationMinutes + rideMinutes + transferWaitMinutes);
  const { provider, route, bound, routeVariant } = parseRouteServiceKey(candidate.routeKey);
  const member = candidate.boardHub.members.find((item) => item.provider === provider);
  const rideMinutesByProvider: Partial<Record<ProviderId, number>> = {};
  for (const leg of itinerary.legs) {
    if (leg.kind !== 'ride') continue;
    const key = leg.provider as ProviderId;
    rideMinutesByProvider[key] = (rideMinutesByProvider[key] || 0) + leg.minutes;
  }
  const id = `option-${provider}-${route}-${routeVariant || 'ordinary'}-${candidate.boardHub.id}-${candidate.alightHub.id}-${index}`;
  const comfortInput = {
    id,
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
  const walkingSource = walkTo.source === 'routed' && walkFrom.source === 'routed' ? 'routed' : 'estimated';

  return {
    id,
    totalMinutes,
    walkingMinutes,
    walkingMeters,
    walkingSource,
    rideMinutes,
    transferMinutes,
    transferWaitMinutes,
    walkToStationMin: walkTo.minutes,
    walkToStationMeters: walkTo.meters,
    walkFromStationMin: walkFrom.minutes,
    walkFromStationMeters: walkFrom.meters,
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
    boardRouteVariant: routeVariant,
    boardProvider: provider,
    boardHub: candidate.boardHub,
    alightHub: candidate.alightHub,
    geometry: buildGeometry(from, to, itinerary, graph, candidate.boardHub, candidate.alightHub, walkTo, walkFrom),
    comfortMetrics,
    comfortScores,
    arrivalWindow,
    notes: [
      ...(walkingSource === 'estimated' ? (['approximateWalkingGeometry'] as const) : []),
      'estimatedComfort',
      ...(departure.status === 'live' ? [] : (['estimatedWait'] as const)),
    ],
  };
}

export function sortJourneyOptions(
  options: JourneyOption[],
  policy: JourneyPolicy
): JourneyOption[] {
  return applyJourneyPolicy(options, policy);
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
        const [kmb, staticProviders] = await Promise.all([loadKmbData(), getStaticProviders()]);
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
    return get().hubs
      .map((hub) => {
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

  plan: async (from, to, weather = DEFAULT_WEATHER, policy: JourneyPolicy = 'recommended') => {
    const graph = get().graph;
    if (!graph || !hasCoordinates(from) || !hasCoordinates(to)) return [];
    const boardHubs = selectRouteAwareHubs(get().hubs, from, graph, MAX_WALK_TO_STATION_M, MAX_ROUTE_AWARE_HUBS);
    const alightHubs = selectRouteAwareHubs(get().hubs, to, graph, MAX_WALK_FROM_STATION_M, MAX_ROUTE_AWARE_HUBS);
    const { hubRoutes, routeEdges } = buildRouteIndexes(graph);
    const direct = buildDirectCandidates(graph, boardHubs, to, from, hubRoutes, routeEdges);
    const transfer = buildTransferCandidates(graph, boardHubs, alightHubs, from, to, direct);
    const candidates = retainCandidatePools([...direct, ...transfer]);

    const options = await mapWithConcurrency(candidates, ETA_CONCURRENCY, async (candidate, index) => {
      const { provider, route, bound } = parseRouteServiceKey(candidate.routeKey);
      const [walkTo, walkFrom] = await Promise.all([
        walkingRouter.route(from, candidate.boardHub),
        walkingRouter.route(candidate.alightHub, to),
      ]);
      const departure = await fetchDepartureEstimate(provider, route, bound, candidate.boardHub, walkTo.minutes);
      const itinerary = itineraryForCandidate(candidate);
      return buildOption(candidate, departure, itinerary, graph, from, to, weather, index, walkTo, walkFrom);
    });

    return sortJourneyOptions(options, policy);
  },

  getHubById: (id) => get().graph?.hubById.get(id),
}));
