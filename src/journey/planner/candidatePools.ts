import type { Graph } from '@/src/journey/graph/graphBuilder';
import type { StopHub } from '@/src/journey/graph/stopMerger';
import { haversineMeters } from '@/src/journey/graph/travelTime';

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
