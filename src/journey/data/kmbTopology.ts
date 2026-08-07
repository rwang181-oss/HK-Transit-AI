import type { RouteStopLink, Stop } from '@/src/journey/providers/types';

export interface KmbTopology {
  stops: Stop[];
  links: RouteStopLink[];
  cachedAt: string;
}

export interface KmbTopologyLoadResult {
  topology: KmbTopology;
  source: 'cache' | 'bundled' | 'network' | 'unavailable';
  warning?: string;
}

export interface KmbTopologyLoadOptions {
  cached?: unknown;
  bundled?: unknown;
  fetchFresh: () => Promise<KmbTopology>;
  persistFresh?: (topology: KmbTopology) => Promise<void> | void;
}

export function parseKmbTopology(value: unknown): KmbTopology | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Partial<KmbTopology>;
  if (!Array.isArray(candidate.stops) || !Array.isArray(candidate.links)) return null;
  if (!candidate.stops.length || !candidate.links.length) return null;
  return {
    stops: candidate.stops,
    links: candidate.links,
    cachedAt: typeof candidate.cachedAt === 'string' ? candidate.cachedAt : '',
  };
}

// This initially mirrors the current network-first behaviour. The regression
// tests added alongside it define the desired local-first contract.
export async function resolveKmbTopology(
  options: KmbTopologyLoadOptions
): Promise<KmbTopologyLoadResult> {
  const topology = await options.fetchFresh();
  await options.persistFresh?.(topology);
  return { topology, source: 'network' };
}
