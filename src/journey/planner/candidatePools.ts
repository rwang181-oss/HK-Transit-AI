import type { Graph, Edge } from '../graph/graphBuilder';
import type { StopHub } from '../graph/stopMerger';
import { haversineMeters } from '../graph/travelTime';

export interface CandidatePoolItem {
  routeKey: string;
  isDirect: boolean;
  boardHub: { id: string };
  alightHub: { id: string };
  itinerary?: {
    transfers: number;
    legs: Array<{
      provider: string;
      route: string;
      bound: 'O' | 'I';
      fromHubId: string;
      toHubId: string;
      kind: 'ride' | 'transfer';
    }>;
  };
  roughMinutes: number;
}

export interface DirectRouteDiscovery {
  routeKey: string;
  boardHub: StopHub;
  alightHub: StopHub;
  rideMinutes: number;
  walkFromMeters: number;
}

export interface CandidatePoolLimits {
  direct: number;
  oneTransfer: number;
  twoTransfer: number;
}

export const DEFAULT_CANDIDATE_LIMITS: CandidatePoolLimits = {
  direct: 8,
  oneTransfer: 8,
  twoTransfer: 4,
};

function candidateTransfers(candidate: CandidatePoolItem): number {
  return candidate.isDirect ? 0 : candidate.itinerary?.transfers ?? 99;
}

function candidateSignature(candidate: CandidatePoolItem): string {
  const sequence = candidate.isDirect
    ? candidate.routeKey
    : candidate.itinerary?.legs
        .filter((leg) => leg.kind === 'ride')
        .map((leg) => `${leg.provider}:${leg.route}:${leg.bound}:${leg.fromHubId}:${leg.toHubId}`)
        .join('|') || candidate.routeKey;
  return `${sequence}|${candidate.boardHub.id}|${candidate.alightHub.id}`;
}

export function retainCandidatePools<T extends CandidatePoolItem>(
  candidates: T[],
  limits: CandidatePoolLimits = DEFAULT_CANDIDATE_LIMITS
): T[] {
  const bestBySignature = new Map<string, T>();
  for (const candidate of candidates) {
    const transfers = candidateTransfers(candidate);
    if (transfers > 2) continue;
    const signature = candidateSignature(candidate);
    const previous = bestBySignature.get(signature);
    if (!previous || candidate.roughMinutes < previous.roughMinutes) {
      bestBySignature.set(signature, candidate);
    }
  }

  const values = [...bestBySignature.values()].sort(
    (a, b) => a.roughMinutes - b.roughMinutes
  );
  const direct = values.filter((candidate) => candidateTransfers(candidate) === 0).slice(0, limits.direct);
  const oneTransfer = values
    .filter((candidate) => candidateTransfers(candidate) === 1)
    .slice(0, limits.oneTransfer);
  const twoTransfer = values
    .filter((candidate) => candidateTransfers(candidate) === 2)
    .slice(0, limits.twoTransfer);
  return [...direct, ...oneTransfer, ...twoTransfer];
}

function directRouteIndexes(graph: Graph) {
  const hubRoutes = new Map<string, string[]>();
  const routeEdges = new Map<string, Map<string, Edge>>();
  for (const edge of graph.edges) {
    if (edge.kind !== 'ride') continue;
    const routeKey = `${edge.provider}:${edge.route}:${edge.bound}`;
    const routes = hubRoutes.get(edge.from) || [];
    if (!routes.includes(routeKey)) routes.push(routeKey);
    hubRoutes.set(edge.from, routes);
    if (!routeEdges.has(routeKey)) routeEdges.set(routeKey, new Map());
    const edgesByOrigin = routeEdges.get(routeKey)!;
    if (!edgesByOrigin.has(edge.from)) edgesByOrigin.set(edge.from, edge);
  }
  return { hubRoutes, routeEdges };
}

export function discoverDirectRouteCandidates(
  graph: Graph,
  boardHubs: StopHub[],
  destination: { lat: number; lng: number },
  maxWalkFromMeters = 1_200
): DirectRouteDiscovery[] {
  const { hubRoutes, routeEdges } = directRouteIndexes(graph);
  const discovered: DirectRouteDiscovery[] = [];
  const seen = new Set<string>();

  for (const boardHub of boardHubs) {
    for (const routeKey of hubRoutes.get(boardHub.id) || []) {
      const edges = routeEdges.get(routeKey);
      if (!edges) continue;
      let currentHubId = boardHub.id;
      let rideMinutes = 0;
      const visited = new Set<string>();

      while (edges.has(currentHubId) && !visited.has(currentHubId)) {
        visited.add(currentHubId);
        const edge = edges.get(currentHubId)!;
        rideMinutes += edge.weight;
        currentHubId = edge.to;
        const alightHub = graph.hubById.get(currentHubId);
        if (!alightHub) continue;
        const walkFromMeters = haversineMeters(
          alightHub.lat,
          alightHub.lng,
          destination.lat,
          destination.lng
        );
        if (walkFromMeters > maxWalkFromMeters) continue;
        const signature = `${boardHub.id}|${alightHub.id}|${routeKey}`;
        if (seen.has(signature)) continue;
        seen.add(signature);
        discovered.push({
          routeKey,
          boardHub,
          alightHub,
          rideMinutes,
          walkFromMeters,
        });
      }
    }
  }

  return discovered;
}

export function selectRouteAwareHubs(
  hubs: StopHub[],
  origin: { lat: number; lng: number },
  graph: Graph,
  radiusMeters = 1_200,
  limit = 20
): StopHub[] {
  const routesByHub = new Map<string, Set<string>>();
  for (const edge of graph.edges) {
    if (edge.kind !== 'ride') continue;
    const key = `${edge.provider}:${edge.route}:${edge.bound}`;
    if (!routesByHub.has(edge.from)) routesByHub.set(edge.from, new Set());
    routesByHub.get(edge.from)!.add(key);
  }

  const nearby = hubs
    .filter((hub) => Number.isFinite(hub.lat) && Number.isFinite(hub.lng) && hub.lat !== 0 && hub.lng !== 0)
    .map((hub) => ({
      hub,
      distance: haversineMeters(origin.lat, origin.lng, hub.lat, hub.lng),
    }))
    .filter((item) => item.distance <= radiusMeters)
    .sort((a, b) => a.distance - b.distance);

  const selected: StopHub[] = [];
  const selectedIds = new Set<string>();
  const coveredRoutes = new Set<string>();

  for (const item of nearby) {
    if (selected.length >= limit) break;
    const routes = routesByHub.get(item.hub.id) || new Set<string>();
    if (![...routes].some((route) => !coveredRoutes.has(route))) continue;
    selected.push(item.hub);
    selectedIds.add(item.hub.id);
    for (const route of routes) coveredRoutes.add(route);
  }

  for (const item of nearby) {
    if (selected.length >= limit) break;
    if (selectedIds.has(item.hub.id)) continue;
    selected.push(item.hub);
    selectedIds.add(item.hub.id);
  }

  return selected;
}
