import type { Graph, Edge } from '@/src/journey/graph/graphBuilder';

export interface ItineraryLeg {
  provider: string;
  route: string;
  bound: 'O' | 'I';
  fromHubId: string;
  toHubId: string;
  fromName: string;
  toName: string;
  fromLat: number;
  fromLng: number;
  toLat: number;
  toLng: number;
  minutes: number;
  kind: 'ride' | 'transfer';
}

export interface Itinerary {
  legs: ItineraryLeg[];
  totalMinutes: number;
  transfers: number;
  isDirect: boolean;
}

export interface JourneySearchOptions {
  transferPenaltyMinutes?: number;
  transferWalkBufferMinutes?: number;
  maxTransfers?: number;
}

interface QueueNode {
  stateKey: string;
  hubId: string;
  serviceKey: string;
  transfers: number;
  cost: number;
}

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
  prevStateKey: string;
}

function serviceKeyFor(edge: Edge): string {
  return edge.kind === 'ride' ? `${edge.provider}:${edge.route}:${edge.bound}` : '';
}

function stateKey(hubId: string, serviceKey: string, transfers: number): string {
  return `${hubId}|${serviceKey || 'none'}|${transfers}`;
}

export function planJourney(
  graph: Graph,
  fromHubId: string,
  toHubId: string,
  options: JourneySearchOptions = {}
): Itinerary | null {
  if (fromHubId === toHubId) return null;
  if (!graph.hubById.has(fromHubId) || !graph.hubById.has(toHubId)) return null;

  const transferPenaltyMinutes = options.transferPenaltyMinutes ?? 10;
  const transferWalkBufferMinutes = options.transferWalkBufferMinutes ?? 2;
  const maxTransfers = options.maxTransfers ?? 2;
  const startKey = stateKey(fromHubId, '', 0);
  const dist = new Map<string, number>([[startKey, 0]]);
  const prev = new Map<string, PrevEntry>();
  const heap = new MinHeap();
  heap.push({ stateKey: startKey, hubId: fromHubId, serviceKey: '', transfers: 0, cost: 0 });
  let destinationKey: string | null = null;

  while (heap.size() > 0) {
    const node = heap.pop()!;
    if (node.cost > (dist.get(node.stateKey) ?? Infinity)) continue;
    if (node.hubId === toHubId) {
      destinationKey = node.stateKey;
      break;
    }

    for (const edge of graph.adjacency.get(node.hubId) || []) {
      const nextServiceKey = edge.kind === 'ride' ? serviceKeyFor(edge) : node.serviceKey;
      const changesService =
        edge.kind === 'ride' && Boolean(node.serviceKey) && nextServiceKey !== node.serviceKey;
      const nextTransfers = node.transfers + (changesService ? 1 : 0);
      if (nextTransfers > maxTransfers) continue;

      const generalizedExtra =
        (changesService ? transferPenaltyMinutes : 0) +
        (edge.kind === 'transfer' ? transferWalkBufferMinutes : 0);
      const nextCost = node.cost + edge.weight + generalizedExtra;
      const nextKey = stateKey(edge.to, nextServiceKey, nextTransfers);
      if (nextCost >= (dist.get(nextKey) ?? Infinity)) continue;

      dist.set(nextKey, nextCost);
      prev.set(nextKey, { edge, prevStateKey: node.stateKey });
      heap.push({
        stateKey: nextKey,
        hubId: edge.to,
        serviceKey: nextServiceKey,
        transfers: nextTransfers,
        cost: nextCost,
      });
    }
  }

  if (!destinationKey) return null;

  const legs: ItineraryLeg[] = [];
  let currentKey = destinationKey;
  while (currentKey !== startKey) {
    const entry = prev.get(currentKey);
    if (!entry) return null;
    const fromHubIdForLeg = entry.prevStateKey.split('|')[0];
    const fromHub = graph.hubById.get(fromHubIdForLeg);
    const toHub = graph.hubById.get(entry.edge.to);
    if (!fromHub || !toHub) return null;
    legs.unshift({
      provider: entry.edge.provider,
      route: entry.edge.route,
      bound: entry.edge.bound,
      fromHubId: fromHubIdForLeg,
      toHubId: entry.edge.to,
      fromName: fromHub.name_en,
      toName: toHub.name_en,
      fromLat: fromHub.lat,
      fromLng: fromHub.lng,
      toLat: toHub.lat,
      toLng: toHub.lng,
      minutes: entry.edge.weight,
      kind: entry.edge.kind,
    });
    currentKey = entry.prevStateKey;
  }

  const merged: ItineraryLeg[] = [];
  for (const leg of legs) {
    const last = merged[merged.length - 1];
    if (
      leg.kind === 'ride' &&
      last?.kind === 'ride' &&
      last.route === leg.route &&
      last.provider === leg.provider &&
      last.bound === leg.bound
    ) {
      last.toHubId = leg.toHubId;
      last.toName = leg.toName;
      last.toLat = leg.toLat;
      last.toLng = leg.toLng;
      last.minutes += leg.minutes;
    } else {
      merged.push({ ...leg });
    }
  }

  const totalMinutes = merged.reduce((sum, leg) => sum + leg.minutes, 0);
  const transfers = Math.max(0, merged.filter((leg) => leg.kind === 'ride').length - 1);
  return {
    legs: merged,
    totalMinutes: Math.round(totalMinutes),
    transfers,
    isDirect: transfers === 0,
  };
}
