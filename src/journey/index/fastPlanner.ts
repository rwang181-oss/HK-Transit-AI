import type { ProviderId } from '@/src/journey/providers/types';
import type { JourneyPolicy } from '@/src/journey/model/types';
import { haversineMeters } from '@/src/journey/graph/travelTime';
import { applyJourneyPolicy } from '@/src/journey/planner/routePolicies';
import type {
  FastPlannerOptions,
  FastPlannerStats,
  IndexedHub,
  IndexedJourneyLeg,
  IndexedJourneyOption,
  IndexedRoute,
  JourneyIndexBundle,
  JourneyPoint,
} from './types';

const CELL_DEGREES = 0.01;
const MAX_WALK_METERS = 1_200;
const WALK_ROUTE_FACTOR = 1.35;
const WALK_METERS_PER_MINUTE = 70;
const DEFAULT_MAX_RESULTS = 5;
const DEFAULT_MAX_HUB_CANDIDATES = 12;
const DEFAULT_MAX_TRANSFER_EXPANSIONS = 300;
const TRANSFER_WAIT_MINUTES = 4;
const DEFAULT_WAIT_MINUTES: Record<ProviderId, number> = {
  KMB: 8,
  CTB: 8,
  GMB: 10,
  MTR: 4,
};

interface NearbyHub {
  hub: IndexedHub;
  straightMeters: number;
}

interface DestinationService {
  hub: IndexedHub;
  seq: number;
  straightMeters: number;
}

interface Candidate {
  boardHub: IndexedHub;
  alightHub: IndexedHub;
  legs: IndexedJourneyLeg[];
  routeKeys: string[];
  rideMinutes: number;
  walkToMeters: number;
  walkFromMeters: number;
}

function validCoordinate(value: { lat: number; lng: number }): boolean {
  return Number.isFinite(value.lat) && Number.isFinite(value.lng) && value.lat !== 0 && value.lng !== 0;
}

function cellCoordinates(point: { lat: number; lng: number }): { x: number; y: number } {
  return {
    x: Math.floor(point.lng / CELL_DEGREES),
    y: Math.floor(point.lat / CELL_DEGREES),
  };
}

function nearbyHubs(
  index: JourneyIndexBundle,
  point: JourneyPoint,
  limit: number,
  stats: FastPlannerStats
): NearbyHub[] {
  const { x, y } = cellCoordinates(point);
  const ids = new Set<string>();
  for (let dx = -1; dx <= 1; dx += 1) {
    for (let dy = -1; dy <= 1; dy += 1) {
      for (const hubId of index.cells[`${x + dx}:${y + dy}`] || []) ids.add(hubId);
    }
  }

  const nearby: NearbyHub[] = [];
  for (const hubId of ids) {
    stats.nearbyHubChecks += 1;
    const hub = index.hubById.get(hubId);
    if (!hub || !validCoordinate(hub)) continue;
    const straightMeters = haversineMeters(point.lat, point.lng, hub.lat, hub.lng);
    if (straightMeters <= MAX_WALK_METERS) nearby.push({ hub, straightMeters });
  }
  nearby.sort((a, b) => a.straightMeters - b.straightMeters);

  // Cover distinct services first so a cluster of nearby platforms for one
  // route cannot push another useful route outside the small Stage-1 cap.
  const selected: NearbyHub[] = [];
  const selectedIds = new Set<string>();
  const coveredRoutes = new Set<string>();
  for (const item of nearby) {
    if (selected.length >= limit) break;
    if (!item.hub.services.some((service) => !coveredRoutes.has(service.routeKey))) continue;
    selected.push(item);
    selectedIds.add(item.hub.id);
    item.hub.services.forEach((service) => coveredRoutes.add(service.routeKey));
  }
  for (const item of nearby) {
    if (selected.length >= limit) break;
    if (selectedIds.has(item.hub.id)) continue;
    selected.push(item);
    selectedIds.add(item.hub.id);
  }
  return selected;
}

function rideMinutes(route: IndexedRoute, fromSeq: number, toSeq: number): number {
  if (toSeq <= fromSeq) return Infinity;
  const from = Number(route.cumulativeMinutes[fromSeq]);
  const to = Number(route.cumulativeMinutes[toSeq]);
  if (!Number.isFinite(from) || !Number.isFinite(to) || to < from) return Infinity;
  return Math.max(1, to - from);
}

function destinationServices(items: NearbyHub[]): Map<string, DestinationService[]> {
  const byRoute = new Map<string, DestinationService[]>();
  for (const item of items) {
    for (const service of item.hub.services) {
      const values = byRoute.get(service.routeKey) || [];
      values.push({ hub: item.hub, seq: service.seq, straightMeters: item.straightMeters });
      byRoute.set(service.routeKey, values);
    }
  }
  for (const values of byRoute.values()) {
    values.sort((a, b) => a.straightMeters - b.straightMeters || a.seq - b.seq);
  }
  return byRoute;
}

function findDestinationAfter(
  values: DestinationService[] | undefined,
  afterSeq: number
): DestinationService | null {
  if (!values) return null;
  let best: DestinationService | null = null;
  for (const value of values) {
    if (value.seq <= afterSeq) continue;
    if (!best || value.straightMeters < best.straightMeters) best = value;
  }
  return best;
}

function candidateSignature(candidate: Candidate): string {
  return `${candidate.routeKeys.join('>')}|${candidate.boardHub.id}|${candidate.alightHub.id}`;
}

function pushCandidate(output: Map<string, Candidate>, candidate: Candidate): void {
  const key = candidateSignature(candidate);
  const previous = output.get(key);
  const rough = candidate.rideMinutes + candidate.walkToMeters / WALK_METERS_PER_MINUTE + candidate.walkFromMeters / WALK_METERS_PER_MINUTE;
  const previousRough = previous
    ? previous.rideMinutes + previous.walkToMeters / WALK_METERS_PER_MINUTE + previous.walkFromMeters / WALK_METERS_PER_MINUTE
    : Infinity;
  if (!previous || rough < previousRough) output.set(key, candidate);
}

function buildDirectCandidates(
  index: JourneyIndexBundle,
  boardHubs: NearbyHub[],
  destinationByRoute: Map<string, DestinationService[]>,
  output: Map<string, Candidate>
): void {
  for (const board of boardHubs) {
    for (const service of board.hub.services) {
      const route = index.routes[service.routeKey];
      if (!route) continue;
      const destination = findDestinationAfter(destinationByRoute.get(service.routeKey), service.seq);
      if (!destination) continue;
      const minutes = rideMinutes(route, service.seq, destination.seq);
      if (!Number.isFinite(minutes)) continue;
      pushCandidate(output, {
        boardHub: board.hub,
        alightHub: destination.hub,
        routeKeys: [service.routeKey],
        rideMinutes: minutes,
        walkToMeters: board.straightMeters * WALK_ROUTE_FACTOR,
        walkFromMeters: destination.straightMeters * WALK_ROUTE_FACTOR,
        legs: [{
          provider: route.provider,
          route: route.route,
          bound: route.bound,
          fromHubId: board.hub.id,
          toHubId: destination.hub.id,
          minutes,
          kind: 'ride',
        }],
      });
    }
  }
}

function buildOneTransferCandidates(
  index: JourneyIndexBundle,
  boardHubs: NearbyHub[],
  destinationByRoute: Map<string, DestinationService[]>,
  output: Map<string, Candidate>,
  stats: FastPlannerStats,
  maxTransferExpansions: number
): void {
  outer: for (const board of boardHubs) {
    for (const firstService of board.hub.services) {
      const firstRoute = index.routes[firstService.routeKey];
      if (!firstRoute) continue;
      for (const transferPoint of index.routeNeighbors[firstService.routeKey] || []) {
        if (transferPoint.seq <= firstService.seq) continue;
        const firstRideMinutes = rideMinutes(firstRoute, firstService.seq, transferPoint.seq);
        if (!Number.isFinite(firstRideMinutes)) continue;
        const transferHub = index.hubById.get(transferPoint.hubId);
        if (!transferHub) continue;

        for (const secondService of transferHub.services) {
          if (stats.transferExpansions >= maxTransferExpansions) break outer;
          stats.transferExpansions += 1;
          if (secondService.routeKey === firstService.routeKey) continue;
          const secondRoute = index.routes[secondService.routeKey];
          if (!secondRoute) continue;
          const destination = findDestinationAfter(destinationByRoute.get(secondService.routeKey), secondService.seq);
          if (!destination) continue;
          const secondRideMinutes = rideMinutes(secondRoute, secondService.seq, destination.seq);
          if (!Number.isFinite(secondRideMinutes)) continue;

          pushCandidate(output, {
            boardHub: board.hub,
            alightHub: destination.hub,
            routeKeys: [firstService.routeKey, secondService.routeKey],
            rideMinutes: firstRideMinutes + secondRideMinutes,
            walkToMeters: board.straightMeters * WALK_ROUTE_FACTOR,
            walkFromMeters: destination.straightMeters * WALK_ROUTE_FACTOR,
            legs: [
              {
                provider: firstRoute.provider,
                route: firstRoute.route,
                bound: firstRoute.bound,
                fromHubId: board.hub.id,
                toHubId: transferHub.id,
                minutes: firstRideMinutes,
                kind: 'ride',
              },
              {
                provider: secondRoute.provider,
                route: secondRoute.route,
                bound: secondRoute.bound,
                fromHubId: transferHub.id,
                toHubId: destination.hub.id,
                minutes: secondRideMinutes,
                kind: 'ride',
              },
            ],
          });
        }
      }
    }
  }
}

function buildArrivalWindow(totalMinutes: number, nowMs: number) {
  const estimatedArrivalMs = nowMs + totalMinutes * 60_000;
  return {
    estimatedArrivalMs,
    earliestArrivalMs: Math.max(nowMs, estimatedArrivalMs - 2 * 60_000),
    latestArrivalMs: estimatedArrivalMs + 5 * 60_000,
    remainingMinutes: totalMinutes,
    confidence: 'estimated' as const,
  };
}

function candidateToOption(candidate: Candidate, from: JourneyPoint, to: JourneyPoint, index: number): IndexedJourneyOption {
  const firstLeg = candidate.legs[0];
  const transfers = Math.max(0, candidate.legs.filter((leg) => leg.kind === 'ride').length - 1);
  const waitMin = DEFAULT_WAIT_MINUTES[firstLeg.provider];
  const transferWaitMinutes = transfers * TRANSFER_WAIT_MINUTES;
  const walkToStationMeters = Math.round(candidate.walkToMeters);
  const walkFromStationMeters = Math.round(candidate.walkFromMeters);
  const walkToStationMin = Math.max(2, candidate.walkToMeters / WALK_METERS_PER_MINUTE);
  const walkFromStationMin = Math.max(2, candidate.walkFromMeters / WALK_METERS_PER_MINUTE);
  const walkingMeters = walkToStationMeters + walkFromStationMeters;
  const walkingMinutes = walkToStationMin + walkFromStationMin;
  const rideMinutesValue = candidate.rideMinutes;
  const totalMinutes = Math.round(walkingMinutes + rideMinutesValue + waitMin + transferWaitMinutes);
  const nowMs = Date.now();
  const firstRoute = candidate.routeKeys[0];
  const routeParts = firstRoute.split(':') as [ProviderId, string, 'O' | 'I'];
  const boardStopId = candidate.boardHub.members.find((member) => member.provider === firstLeg.provider)?.stopId || '';
  const geometry = [
    { lat: from.lat, lng: from.lng, kind: 'start' as const, label: from.name },
    { lat: candidate.boardHub.lat, lng: candidate.boardHub.lng, kind: 'stop' as const, label: candidate.boardHub.name_en },
    ...candidate.legs.slice(0, -1).map((leg) => {
      const hub = leg.toHubId ? candidate.legs.length > 1 ? leg.toHubId : '' : '';
      return hub;
    }).filter(Boolean).map((hubId) => ({
      lat: 0,
      lng: 0,
      kind: 'stop' as const,
      label: hubId,
    })),
    { lat: candidate.alightHub.lat, lng: candidate.alightHub.lng, kind: 'stop' as const, label: candidate.alightHub.name_en },
    { lat: to.lat, lng: to.lng, kind: 'end' as const, label: to.name },
  ].filter((point) => point.lat !== 0 || point.lng !== 0);

  return {
    id: `indexed-${candidate.routeKeys.join('-')}-${candidate.boardHub.id}-${candidate.alightHub.id}-${index}`,
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
      transfers,
      isDirect: transfers === 0,
      legs: candidate.legs,
    },
    boardStopId,
    boardProvider: routeParts[0],
    boardRoute: routeParts[1],
    boardBound: routeParts[2],
    boardHub: candidate.boardHub,
    alightHub: candidate.alightHub,
    geometry,
    arrivalWindow: buildArrivalWindow(totalMinutes, nowMs),
  };
}

export function planFastJourney(
  index: JourneyIndexBundle,
  from: JourneyPoint,
  to: JourneyPoint,
  policy: JourneyPolicy,
  options: FastPlannerOptions = {}
): IndexedJourneyOption[] {
  if (!validCoordinate(from) || !validCoordinate(to)) return [];
  const maxResults = Math.max(1, options.maxResults ?? DEFAULT_MAX_RESULTS);
  const maxHubCandidates = Math.max(1, options.maxHubCandidates ?? DEFAULT_MAX_HUB_CANDIDATES);
  const maxTransferExpansions = Math.max(0, options.maxTransferExpansions ?? DEFAULT_MAX_TRANSFER_EXPANSIONS);
  const stats: FastPlannerStats = { nearbyHubChecks: 0, transferExpansions: 0 };

  const boardHubs = nearbyHubs(index, from, maxHubCandidates, stats);
  const alightHubs = nearbyHubs(index, to, maxHubCandidates, stats);
  const destinationByRoute = destinationServices(alightHubs);
  const candidates = new Map<string, Candidate>();

  buildDirectCandidates(index, boardHubs, destinationByRoute, candidates);
  buildOneTransferCandidates(
    index,
    boardHubs,
    destinationByRoute,
    candidates,
    stats,
    maxTransferExpansions
  );

  const converted = [...candidates.values()].map((candidate, candidateIndex) =>
    candidateToOption(candidate, from, to, candidateIndex)
  );
  options.onStats?.({ ...stats });
  return applyJourneyPolicy(converted, policy).slice(0, maxResults);
}
