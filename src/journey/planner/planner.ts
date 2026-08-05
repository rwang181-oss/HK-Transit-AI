import type { Graph, Edge } from '@/src/journey/graph/graphBuilder';

export interface ItineraryLeg {
  provider: string;
  route: string;
  bound: 'O' | 'I';
  fromHubId: string;
  toHubId: string;
  fromName: string;
  toName: string;
  minutes: number;
  kind: 'ride' | 'transfer';
}

export interface Itinerary {
  legs: ItineraryLeg[];
  totalMinutes: number;
  transfers: number;
  isDirect: boolean;
}

interface QueueNode {
  hubId: string;
  cost: number;
}

/** Minimal binary min-heap for Dijkstra. */
class MinHeap {
  private items: QueueNode[] = [];
  size() {
    return this.items.length;
  }
  push(n: QueueNode) {
    this.items.push(n);
    let i = this.items.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.items[p].cost <= this.items[i].cost) break;
      [this.items[p], this.items[i]] = [this.items[i], this.items[p]];
      i = p;
    }
  }
  pop(): QueueNode | undefined {
    const top = this.items[0];
    const last = this.items.pop();
    if (this.items.length > 0 && last) {
      this.items[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = 2 * i + 2;
        let m = i;
        if (l < this.items.length && this.items[l].cost < this.items[m].cost) m = l;
        if (r < this.items.length && this.items[r].cost < this.items[m].cost) m = r;
        if (m === i) break;
        [this.items[m], this.items[i]] = [this.items[i], this.items[m]];
        i = m;
      }
    }
    return top;
  }
}

interface PrevEntry {
  edge: Edge;
  prevHubId: string;
}

/**
 * Dijkstra shortest-time search. Returns the single best itinerary.
 */
export function planJourney(
  graph: Graph,
  fromHubId: string,
  toHubId: string
): Itinerary | null {
  if (fromHubId === toHubId) return null;
  if (!graph.hubById.has(fromHubId) || !graph.hubById.has(toHubId)) {
    return null;
  }

  const dist = new Map<string, number>();
  const prev = new Map<string, PrevEntry>();
  const heap = new MinHeap();
  dist.set(fromHubId, 0);
  heap.push({ hubId: fromHubId, cost: 0 });

  while (heap.size() > 0) {
    const node = heap.pop()!;
    if (node.cost > (dist.get(node.hubId) ?? Infinity)) continue;
    if (node.hubId === toHubId) break;

    const edges = graph.adjacency.get(node.hubId) || [];
    for (const edge of edges) {
      const nd = node.cost + edge.weight;
      const cur = dist.get(edge.to) ?? Infinity;
      if (nd < cur) {
        dist.set(edge.to, nd);
        prev.set(edge.to, { edge, prevHubId: node.hubId });
        heap.push({ hubId: edge.to, cost: nd });
      }
    }
  }

  if (!prev.has(toHubId)) return null;

  // Reconstruct path
  const legs: ItineraryLeg[] = [];
  let cur = toHubId;
  while (cur !== fromHubId) {
    const entry = prev.get(cur)!;
    const fromHub = graph.hubById.get(entry.prevHubId)!;
    const toHub = graph.hubById.get(cur)!;
    legs.unshift({
      provider: entry.edge.provider,
      route: entry.edge.route,
      bound: entry.edge.bound,
      fromHubId: entry.prevHubId,
      toHubId: cur,
      fromName: fromHub.name_en,
      toName: toHub.name_en,
      minutes: entry.edge.weight,
      kind: entry.edge.kind,
    });
    cur = entry.prevHubId;
  }

  // Merge consecutive ride legs on the same route into single legs
  const merged: ItineraryLeg[] = [];
  for (const leg of legs) {
    const last = merged[merged.length - 1];
    if (
      leg.kind === 'ride' &&
      last &&
      last.kind === 'ride' &&
      last.route === leg.route &&
      last.provider === leg.provider
    ) {
      last.toHubId = leg.toHubId;
      last.toName = leg.toName;
      last.minutes += leg.minutes;
    } else {
      merged.push({ ...leg });
    }
  }

  const totalMinutes = merged.reduce((s, l) => s + l.minutes, 0);
  const transfers = merged.filter((l) => l.kind === 'ride').length - 1;

  return {
    legs: merged,
    totalMinutes: Math.round(totalMinutes),
    transfers: Math.max(0, transfers),
    isDirect: merged.filter((l) => l.kind === 'ride').length === 1,
  };
}
