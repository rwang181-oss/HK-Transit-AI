import type { ProviderId } from '@/src/journey/providers/types';
import type { JourneyMode, JourneyPolicy } from '@/src/journey/model/types';
import { haversineMeters } from '../graph/travelTime';
import { applyJourneyPolicy } from '../planner/routePolicies';
import { mapWithConcurrency } from '../../utils/asyncPool';
import type {
  IndexedHub,
  IndexedJourneyLeg,
  IndexedJourneyOption,
  IndexedRoute,
  JourneyIndexBundle,
  JourneyPoint,
} from './types';

const CELL_DEGREES = 0.01;
const MAX_WALK_METERS = 1_200;
const MAX_NEARBY_HUBS = 20;
const MAX_ROUTE_EXPANSIONS = 1_000;
const YIELD_EVERY = 100;
const WALK_FACTOR = 1.35;
const WALK_METERS_PER_MINUTE = 70;
const TRANSFER_WAIT_MINUTES = 4;
const ENRICH_CONCURRENCY = 4;
const POOL_LIMITS = { direct: 8, one: 8, two: 4 };
const DEFAULT_WAIT_MINUTES: Record<ProviderId, number> = {
  KMB: 8,
  CTB: 8,
  GMB: 10,
  MTR: 4,
};

export interface RefinementWalkingRoute {
  meters: number;
  minutes: number;
  source: 'routed' | 'estimated';
  geometry?: Array<{ lat: number; lng: number }>;
}

export interface RefinementDepartureEstimate {
  minutes: number;
  departureAtMs: number;
  status: 'live' | 'estimated' | 'unavailable';
  catchable: boolean;
}

export interface RefineJourneyDependencies {
  routeWalking: (from: JourneyPoint, to: JourneyPoint) => Promise<RefinementWalkingRoute>;
  fetchDeparture: (
    provider: ProviderId,
    route: string,
    bound: 'O' | 'I',
    stopId: string,
    walkMinutes: number
  ) => Promise<RefinementDepartureEstimate>;
  yieldToBrowser?: () => Promise<void>;
}

interface NearbyHub {
  hub: IndexedHub;
  straightMeters: number;
}

interface DestinationService {
  hub: IndexedHub;
  seq: number;
  straightMeters: number;
}

interface RouteState {
  routeKey: string;
  currentSeq: number;
  boardHub: IndexedHub;
  walkToMeters: number;
  routeKeys: string[];
  legs: IndexedJourneyLeg[];
  rideMinutes: number;
}

function validCoordinates(value: { lat: number; lng: number }): boolean {
  return Number.isFinite(value.lat) && Number.isFinite(value.lng) && value.lat !== 0 && value.lng !== 0;
}

function nearby(index: JourneyIndexBundle, point: JourneyPoint): NearbyHub[] {
  const gx = Math.floor(point.lng / CELL_DEGREES);
  const gy = Math.floor(point.lat / CELL_DEGREES);
  const ids = new Set<string>();
  for (let dx = -1; dx <= 1; dx += 1) {
    for (let dy = -1; dy <= 1; dy += 1) {
      for (const id of index.cells[`${gx + dx}:${gy + dy}`] || []) ids.add(id);
    }
  }
  return [...ids]
    .map((id) => index.hubById.get(id))
    .filter((hub): hub is IndexedHub => Boolean(hub && validCoordinates(hub)))
    .map((hub) => ({
      hub,
      straightMeters: haversineMeters(point.lat, point.lng, hub.lat, hub.lng),
    }))
    .filter((item) => item.straightMeters <= MAX_WALK_METERS)
    .sort((a, b) => a.straightMeters - b.straightMeters)
    .slice(0, MAX_NEARBY_HUBS);
}

function destinationServices(items: NearbyHub[]): Map<string, DestinationService[]> {
  const output = new Map<string, DestinationService[]>();
  for (const item of items) {
    for (const service of item.hub.services) {
      const list = output.get(service.routeKey) || [];
      list.push({ hub: item.hub, seq: service.seq, straightMeters: item.straightMeters });
      output.set(service.routeKey, list);
    }
  }
  for (const list of output.values()) list.sort((a, b) => a.straightMeters - b.straightMeters || a.seq - b.seq);
  return output;
}

function destinationAfter(values: DestinationService[] | undefined, seq: number): DestinationService | null {
  if (!values) return null;
  let best: DestinationService | null = null;
  for (const value of values) {
    if (value.seq <= seq) continue;
    if (!best || value.straightMeters < best.straightMeters) best = value;
  }
  return best;
}

function routeMinutes(route: IndexedRoute, fromSeq: number, toSeq: number): number {
  if (toSeq <= fromSeq) return Infinity;
  const from = Number(route.cumulativeMinutes[fromSeq]);
  const to = Number(route.cumulativeMinutes[toSeq]);
  return Number.isFinite(from) && Number.isFinite(to) && to >= from ? Math.max(1, to - from) : Infinity;
}

function arrivalWindow(totalMinutes: number, nowMs: number) {
  const estimatedArrivalMs = nowMs + totalMinutes * 60_000;
  return {
    estimatedArrivalMs,
    earliestArrivalMs: Math.max(nowMs, estimatedArrivalMs - 2 * 60_000),
    latestArrivalMs: estimatedArrivalMs + 5 * 60_000,
    remainingMinutes: totalMinutes,
    confidence: 'estimated' as const,
  };
}

function estimatedComfort(walkingMinutes: number, waitMin: number) {
  return {
    outdoorExposureMinutes: Math.round(walkingMinutes + waitMin),
    indoorTransitMinutes: 0,
    walkingBurden: walkingMinutes <= 8 ? 'low' as const : walkingMinutes <= 18 ? 'medium' as const : 'high' as const,
    weatherPenalty: 0,
    score: 0,
    confidence: 'estimated' as const,
    reasons: ['estimatedComfort'],
  };
}

function comfortScores(): Record<JourneyMode, number> {
  return Object.fromEntries(
    (['recommended', 'fastest', 'shade', 'rain', 'indoor'] as JourneyMode[]).map((mode) => [mode, 0])
  ) as Record<JourneyMode, number>;
}

function rideLeg(route: IndexedRoute, fromHub: IndexedHub, toHub: IndexedHub, minutes: number): IndexedJourneyLeg {
  return {
    provider: route.provider,
    route: route.route,
    bound: route.bound,
    fromHubId: fromHub.id,
    toHubId: toHub.id,
    fromName: fromHub.name_en,
    toName: toHub.name_en,
    minutes,
    kind: 'ride',
  };
}

function buildEstimatedOption(
  index: JourneyIndexBundle,
  from: JourneyPoint,
  to: JourneyPoint,
  state: RouteState,
  destination: DestinationService,
  finalLeg: IndexedJourneyLeg,
  ordinal: number
): IndexedJourneyOption {
  const legs = [...state.legs, finalLeg];
  const rideMinutesValue = state.rideMinutes + finalLeg.minutes;
  const transfers = Math.max(0, legs.length - 1);
  const firstLeg = legs[0];
  const waitMin = DEFAULT_WAIT_MINUTES[firstLeg.provider];
  const transferWaitMinutes = transfers * TRANSFER_WAIT_MINUTES;
  const walkToStationMeters = Math.round(state.walkToMeters * WALK_FACTOR);
  const walkFromStationMeters = Math.round(destination.straightMeters * WALK_FACTOR);
  const walkToStationMin = Math.max(2, walkToStationMeters / WALK_METERS_PER_MINUTE);
  const walkFromStationMin = Math.max(2, walkFromStationMeters / WALK_METERS_PER_MINUTE);
  const walkingMeters = walkToStationMeters + walkFromStationMeters;
  const walkingMinutes = walkToStationMin + walkFromStationMin;
  const totalMinutes = Math.round(walkingMinutes + rideMinutesValue + waitMin + transferWaitMinutes);
  const nowMs = Date.now();
  const firstRoute = index.routes[state.routeKeys[0]];
  const boardStopId = state.boardHub.members.find((member) => member.provider === firstLeg.provider)?.stopId || '';
  const geometry = [
    { lat: from.lat, lng: from.lng, kind: 'start' as const, label: from.name },
    { lat: state.boardHub.lat, lng: state.boardHub.lng, kind: 'stop' as const, label: state.boardHub.name_en },
    ...legs.slice(0, -1).flatMap((leg) => {
      const hub = index.hubById.get(leg.toHubId);
      return hub ? [{ lat: hub.lat, lng: hub.lng, kind: 'stop' as const, label: hub.name_en }] : [];
    }),
    { lat: destination.hub.lat, lng: destination.hub.lng, kind: 'stop' as const, label: destination.hub.name_en },
    { lat: to.lat, lng: to.lng, kind: 'end' as const, label: to.name },
  ];

  return {
    id: `refined-${state.routeKeys.join('-')}-${destination.hub.id}-${ordinal}`,
    totalMinutes,
    walkingMinutes,
    walkingMeters,
    walkingSource: 'estimated',
    rideMinutes: rideMinutesValue,
    transferMinutes: 0,
    transferWaitMinutes,
    walkToStationMin,
    walkToStationMeters,
    walkFromStationMin,
    walkFromStationMeters,
    waitMin,
    waitStatus: 'estimated',
    catchable: true,
    nextBusMin: waitMin,
    departureAtMs: nowMs + waitMin * 60_000,
    fallbackHeadwayMinutes: waitMin,
    itinerary: {
      totalMinutes: Math.round(rideMinutesValue),
      transfers,
      isDirect: transfers === 0,
      legs,
    },
    boardStopId,
    boardProvider: firstRoute.provider,
    boardRoute: firstRoute.route,
    boardBound: firstRoute.bound,
    boardHub: state.boardHub,
    alightHub: destination.hub,
    geometry,
    comfortMetrics: estimatedComfort(walkingMinutes, waitMin),
    comfortScores: comfortScores(),
    arrivalWindow: arrivalWindow(totalMinutes, nowMs),
    notes: ['approximateWalkingGeometry', 'estimatedComfort', 'estimatedWait'],
  };
}

function serviceSignature(option: IndexedJourneyOption): string {
  return option.itinerary.legs
    .filter((leg) => leg.kind === 'ride')
    .map((leg) => `${leg.provider}:${leg.route}:${leg.bound}`)
    .join('>');
}

function optionSignature(option: IndexedJourneyOption): string {
  return `${serviceSignature(option)}|${option.boardHub.id}|${option.alightHub.id}`;
}

function retainPools(options: IndexedJourneyOption[]): IndexedJourneyOption[] {
  const best = new Map<string, IndexedJourneyOption>();
  for (const option of options) {
    if (option.itinerary.transfers > 2) continue;
    const signature = optionSignature(option);
    const previous = best.get(signature);
    if (!previous || option.totalMinutes < previous.totalMinutes) best.set(signature, option);
  }
  const values = [...best.values()].sort((a, b) => a.totalMinutes - b.totalMinutes);
  const take = (transfers: number, limit: number) => {
    const selected: IndexedJourneyOption[] = [];
    const sequences = new Set<string>();
    for (const option of values) {
      if (selected.length >= limit) break;
      if (option.itinerary.transfers !== transfers) continue;
      const sequence = serviceSignature(option);
      if (sequences.has(sequence)) continue;
      selected.push(option);
      sequences.add(sequence);
    }
    for (const option of values) {
      if (selected.length >= limit) break;
      if (option.itinerary.transfers !== transfers || selected.includes(option)) continue;
      selected.push(option);
    }
    return selected;
  };
  return [
    ...take(0, POOL_LIMITS.direct),
    ...take(1, POOL_LIMITS.one),
    ...take(2, POOL_LIMITS.two),
  ];
}

async function discoverIndexedCandidates(
  index: JourneyIndexBundle,
  from: JourneyPoint,
  to: JourneyPoint,
  yieldToBrowser: () => Promise<void>
): Promise<IndexedJourneyOption[]> {
  const boardHubs = nearby(index, from);
  const destinations = destinationServices(nearby(index, to));
  const queue: RouteState[] = [];
  for (const board of boardHubs) {
    for (const service of board.hub.services) {
      if (!index.routes[service.routeKey]) continue;
      queue.push({
        routeKey: service.routeKey,
        currentSeq: service.seq,
        boardHub: board.hub,
        walkToMeters: board.straightMeters,
        routeKeys: [service.routeKey],
        legs: [],
        rideMinutes: 0,
      });
    }
  }

  const output: IndexedJourneyOption[] = [];
  const visited = new Set<string>();
  let expansions = 0;
  let ordinal = 0;

  while (queue.length > 0 && expansions < MAX_ROUTE_EXPANSIONS) {
    const state = queue.shift()!;
    const stateKey = `${state.boardHub.id}|${state.routeKeys.join('>')}|${state.currentSeq}`;
    if (visited.has(stateKey)) continue;
    visited.add(stateKey);
    const route = index.routes[state.routeKey];
    if (!route) continue;

    const destination = destinationAfter(destinations.get(state.routeKey), state.currentSeq);
    if (destination) {
      const minutes = routeMinutes(route, state.currentSeq, destination.seq);
      if (Number.isFinite(minutes)) {
        const fromHub = index.hubById.get(route.hubs[state.currentSeq]);
        if (fromHub) {
          output.push(buildEstimatedOption(
            index,
            from,
            to,
            state,
            destination,
            rideLeg(route, fromHub, destination.hub, minutes),
            ordinal++
          ));
        }
      }
    }

    if (state.routeKeys.length - 1 >= 2) continue;

    for (const point of index.routeNeighbors[state.routeKey] || []) {
      if (point.seq <= state.currentSeq) continue;
      const segmentMinutes = routeMinutes(route, state.currentSeq, point.seq);
      if (!Number.isFinite(segmentMinutes)) continue;
      const transferHub = index.hubById.get(point.hubId);
      const fromHub = index.hubById.get(route.hubs[state.currentSeq]);
      if (!transferHub || !fromHub) continue;

      for (const nextService of transferHub.services) {
        if (expansions >= MAX_ROUTE_EXPANSIONS) break;
        expansions += 1;
        if (expansions % YIELD_EVERY === 0) await yieldToBrowser();
        if (nextService.routeKey === state.routeKey || state.routeKeys.includes(nextService.routeKey)) continue;
        if (!index.routes[nextService.routeKey]) continue;
        queue.push({
          routeKey: nextService.routeKey,
          currentSeq: nextService.seq,
          boardHub: state.boardHub,
          walkToMeters: state.walkToMeters,
          routeKeys: [...state.routeKeys, nextService.routeKey],
          legs: [...state.legs, rideLeg(route, fromHub, transferHub, segmentMinutes)],
          rideMinutes: state.rideMinutes + segmentMinutes,
        });
      }
      if (expansions >= MAX_ROUTE_EXPANSIONS) break;
    }
  }
  return output;
}

async function refineOne(
  option: IndexedJourneyOption,
  from: JourneyPoint,
  to: JourneyPoint,
  deps: RefineJourneyDependencies
): Promise<IndexedJourneyOption> {
  let walkTo: RefinementWalkingRoute | null = null;
  let walkFrom: RefinementWalkingRoute | null = null;
  try {
    [walkTo, walkFrom] = await Promise.all([
      deps.routeWalking(from, { lat: option.boardHub.lat, lng: option.boardHub.lng, name: option.boardHub.name_en }),
      deps.routeWalking({ lat: option.alightHub.lat, lng: option.alightHub.lng, name: option.alightHub.name_en }, to),
    ]);
  } catch {
    walkTo = null;
    walkFrom = null;
  }

  const refined: IndexedJourneyOption = {
    ...option,
    itinerary: { ...option.itinerary, legs: option.itinerary.legs.map((leg) => ({ ...leg })) },
    geometry: option.geometry.map((point) => ({ ...point })),
    comfortMetrics: { ...option.comfortMetrics, reasons: [...option.comfortMetrics.reasons] },
    comfortScores: { ...option.comfortScores },
    notes: [...option.notes],
  };

  if (walkTo && walkFrom) {
    refined.walkToStationMeters = Math.round(walkTo.meters);
    refined.walkFromStationMeters = Math.round(walkFrom.meters);
    refined.walkToStationMin = walkTo.minutes;
    refined.walkFromStationMin = walkFrom.minutes;
    refined.walkingMeters = Math.round(walkTo.meters + walkFrom.meters);
    refined.walkingMinutes = walkTo.minutes + walkFrom.minutes;
    refined.walkingSource = walkTo.source === 'routed' && walkFrom.source === 'routed' ? 'routed' : 'estimated';
    if (refined.walkingSource === 'routed') {
      refined.notes = refined.notes.filter((note) => note !== 'approximateWalkingGeometry');
    }
  }

  try {
    const departure = await deps.fetchDeparture(
      refined.boardProvider,
      refined.boardRoute,
      refined.boardBound,
      refined.boardStopId,
      refined.walkToStationMin
    );
    refined.waitMin = Math.max(0, departure.minutes);
    refined.waitStatus = departure.status;
    refined.catchable = departure.catchable;
    refined.nextBusMin = departure.minutes;
    refined.departureAtMs = departure.departureAtMs;
    if (departure.status === 'live') refined.notes = refined.notes.filter((note) => note !== 'estimatedWait');
  } catch {
    // Keep Stage-1/provider fallback values.
  }

  refined.totalMinutes = Math.round(
    refined.walkingMinutes + refined.rideMinutes + refined.waitMin + refined.transferMinutes + refined.transferWaitMinutes
  );
  refined.arrivalWindow = arrivalWindow(refined.totalMinutes, Date.now());
  refined.comfortMetrics = estimatedComfort(refined.walkingMinutes, refined.waitMin);
  return refined;
}

export async function refineJourneyOptions(
  index: JourneyIndexBundle,
  initial: IndexedJourneyOption[],
  from: JourneyPoint,
  to: JourneyPoint,
  policy: JourneyPolicy,
  deps: RefineJourneyDependencies
): Promise<IndexedJourneyOption[]> {
  const yieldToBrowser = deps.yieldToBrowser || (() => new Promise<void>((resolve) => setTimeout(resolve, 0)));
  const discovered = await discoverIndexedCandidates(index, from, to, yieldToBrowser);
  const retained = retainPools([
    ...initial.map((option) => ({ ...option, itinerary: { ...option.itinerary, legs: option.itinerary.legs.map((leg) => ({ ...leg })) } })),
    ...discovered,
  ]);
  const enriched = await mapWithConcurrency(retained, ENRICH_CONCURRENCY, (option) =>
    refineOne(option, from, to, deps)
  );
  return applyJourneyPolicy(enriched, policy);
}
