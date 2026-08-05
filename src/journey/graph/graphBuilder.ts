import type {
  RouteStopLink,
  Stop,
  ProviderId,
} from '@/src/journey/providers/types';
import type { StopHub } from './stopMerger';
import { mergeStops, buildLookups } from './stopMerger';
import { estimateLegMinutes, estimateWalkMinutes, haversineMeters } from './travelTime';

export interface Edge {
  from: string; // hub id
  to: string; // hub id
  weight: number; // minutes
  provider: ProviderId;
  route: string;
  bound: 'O' | 'I';
  kind: 'ride' | 'transfer';
}

export interface Graph {
  hubs: StopHub[];
  edges: Edge[];
  adjacency: Map<string, Edge[]>;
  hubById: Map<string, StopHub>;
}

const TRANSFER_DISTANCE_M = 500;

/**
 * Build the journey graph from all providers' stops and route-stop links.
 * - Nodes are hubs (merged stops).
 * - Ride edges connect consecutive stops on a route.
 * - Transfer edges connect hubs that are within walking distance but are
 *   NOT the same hub (same location, different platform/entrance).
 */
export function buildGraph(
  providerStops: Stop[],
  routeLinks: RouteStopLink[]
): Graph {
  const hubs = mergeStops(providerStops);
  const memberToHub = buildLookups(hubs);
  const hubById = new Map(hubs.map((h) => [h.id, h]));
  const edges: Edge[] = [];
  const adjacency = new Map<string, Edge[]>();

  const addEdge = (e: Edge) => {
    edges.push(e);
    if (!adjacency.has(e.from)) adjacency.set(e.from, []);
    adjacency.get(e.from)!.push(e);
  };

  const hubOf = (provider: ProviderId, stopId: string): StopHub | null => {
    return memberToHub.get(`${provider}:${stopId}`) || null;
  };

  // 1. Ride edges from route-stop sequences
  const byRoute = new Map<string, RouteStopLink[]>();
  for (const rs of routeLinks) {
    const key = `${rs.provider}:${rs.route}:${rs.bound}`;
    if (!byRoute.has(key)) byRoute.set(key, []);
    byRoute.get(key)!.push(rs);
  }

  for (const links of byRoute.values()) {
    const sorted = links.slice().sort((a, b) => a.seq - b.seq);
    for (let i = 0; i < sorted.length - 1; i++) {
      const a = sorted[i];
      const b = sorted[i + 1];
      const hubA = hubOf(a.provider, a.stopId);
      const hubB = hubOf(b.provider, b.stopId);
      if (!hubA || !hubB || hubA.id === hubB.id) continue;
      // weight from coordinates when available, else nominal
      let weight: number;
      if (hubA.lat && hubB.lat) {
        weight = estimateLegMinutes(hubA, hubB, a.provider);
      } else {
        weight = 3; // nominal leg when coords missing
      }
      addEdge({
        from: hubA.id,
        to: hubB.id,
        weight,
        provider: a.provider,
        route: a.route,
        bound: a.bound,
        kind: 'ride',
      });
    }
  }

  // 2. Transfer edges between hubs within walking distance
  const hubList = [...hubs];
  for (let i = 0; i < hubList.length; i++) {
    for (let j = i + 1; j < hubList.length; j++) {
      const a = hubList[i];
      const b = hubList[j];
      if (!a.lat || !b.lat) continue;
      const meters = haversineMeters(a.lat, a.lng, b.lat, b.lng);
      if (meters > 0 && meters <= TRANSFER_DISTANCE_M) {
        const w = estimateWalkMinutes(meters);
        addEdge({ from: a.id, to: b.id, weight: w, provider: 'KMB' as ProviderId, route: '', bound: 'O', kind: 'transfer' });
        addEdge({ from: b.id, to: a.id, weight: w, provider: 'KMB' as ProviderId, route: '', bound: 'O', kind: 'transfer' });
      }
    }
  }

  return { hubs, edges, adjacency, hubById };
}
