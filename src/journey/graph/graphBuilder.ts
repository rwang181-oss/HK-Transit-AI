import { getRouteServiceKey } from '../providers/types';
import type {
  RouteStopLink,
  Stop,
  ProviderId,
} from '../providers/types';
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
  routeVariant?: string;
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
    const key = getRouteServiceKey(rs.provider, rs.route, rs.bound, rs.routeVariant);
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
        routeVariant: a.routeVariant,
        kind: 'ride',
      });
    }
  }

  // 2. Transfer edges between hubs within walking distance.
  //    Spatial grid index: compare only hubs in the same or adjacent
  //    cells (~0.005° ≈ 550m) instead of O(n²) over all hubs.
  const GRID = 0.005;
  const grid = new Map<string, StopHub[]>();
  for (const h of hubs) {
    if (!h.lat) continue;
    const key = `${Math.floor(h.lng / GRID)},${Math.floor(h.lat / GRID)}`;
    if (!grid.has(key)) grid.set(key, []);
    grid.get(key)!.push(h);
  }
  const processedPairs = new Set<string>();
  for (const h of hubs) {
    if (!h.lat) continue;
    const gx = Math.floor(h.lng / GRID);
    const gy = Math.floor(h.lat / GRID);
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const cell = grid.get(`${gx + dx},${gy + dy}`);
        if (!cell) continue;
        for (const other of cell) {
          if (other === h) continue;
          const pairKey =
            h.id < other.id ? `${h.id}|${other.id}` : `${other.id}|${h.id}`;
          if (processedPairs.has(pairKey)) continue;
          processedPairs.add(pairKey);
          const meters = haversineMeters(h.lat, h.lng, other.lat, other.lng);
          if (meters > 0 && meters <= TRANSFER_DISTANCE_M) {
            const w = estimateWalkMinutes(meters);
            addEdge({ from: h.id, to: other.id, weight: w, provider: 'KMB' as ProviderId, route: '', bound: 'O', kind: 'transfer' });
            addEdge({ from: other.id, to: h.id, weight: w, provider: 'KMB' as ProviderId, route: '', bound: 'O', kind: 'transfer' });
          }
        }
      }
    }
  }

  return { hubs, edges, adjacency, hubById };
}
