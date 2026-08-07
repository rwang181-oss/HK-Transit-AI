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

function toFiniteNumber(value: unknown): number {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

export function parseKmbTopology(value: unknown): KmbTopology | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as {
    stops?: unknown[];
    links?: unknown[];
    routeStops?: unknown[];
    cachedAt?: unknown;
    generatedAt?: unknown;
  };
  const rawStops = Array.isArray(candidate.stops) ? candidate.stops : [];
  const rawLinks = Array.isArray(candidate.links)
    ? candidate.links
    : Array.isArray(candidate.routeStops)
      ? candidate.routeStops
      : [];

  const stops: Stop[] = rawStops
    .map((raw) => {
      const stop = raw as Record<string, unknown>;
      return {
        stopId: String(stop.stopId || stop.stop || ''),
        name_en: String(stop.name_en || ''),
        name_tc: String(stop.name_tc || ''),
        name_sc: String(stop.name_sc || ''),
        lat: toFiniteNumber(stop.lat),
        lng: toFiniteNumber(stop.lng ?? stop.long),
        provider: 'KMB' as const,
      };
    })
    .filter((stop) => stop.stopId && stop.lat !== 0 && stop.lng !== 0);

  const links: RouteStopLink[] = rawLinks
    .map((raw) => {
      const link = raw as Record<string, unknown>;
      return {
        route: String(link.route || ''),
        bound: link.bound === 'I' ? 'I' as const : 'O' as const,
        seq: toFiniteNumber(link.seq),
        stopId: String(link.stopId || link.stop || ''),
        provider: 'KMB' as const,
      };
    })
    .filter((link) => link.route && link.stopId && link.seq > 0);

  if (!stops.length || !links.length) return null;
  const timestamp = candidate.cachedAt ?? candidate.generatedAt;
  return {
    stops,
    links,
    cachedAt: typeof timestamp === 'string' ? timestamp : '',
  };
}

function startBackgroundRefresh(options: KmbTopologyLoadOptions): void {
  void options.fetchFresh()
    .then(async (fresh) => {
      const topology = parseKmbTopology(fresh);
      if (topology) await options.persistFresh?.(topology);
    })
    .catch(() => undefined);
}

export async function resolveKmbTopology(
  options: KmbTopologyLoadOptions
): Promise<KmbTopologyLoadResult> {
  const cached = parseKmbTopology(options.cached);
  if (cached) {
    startBackgroundRefresh(options);
    return { topology: cached, source: 'cache' };
  }

  const bundled = parseKmbTopology(options.bundled);
  if (bundled) {
    startBackgroundRefresh(options);
    return {
      topology: bundled,
      source: 'bundled',
      warning: 'Using bundled KMB topology while a newer copy refreshes in the background.',
    };
  }

  try {
    const fresh = parseKmbTopology(await options.fetchFresh());
    if (!fresh) throw new Error('KMB topology response was empty or invalid.');
    await options.persistFresh?.(fresh);
    return { topology: fresh, source: 'network' };
  } catch {
    return {
      topology: { stops: [], links: [], cachedAt: '' },
      source: 'unavailable',
      warning: 'KMB topology is temporarily unavailable; other transport data remains usable.',
    };
  }
}
