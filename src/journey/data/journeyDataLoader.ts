import type { ProviderId, RouteStopLink, Stop } from '@/src/journey/providers/types';

export interface JourneyTopologyChunk {
  stops: Stop[];
  links: RouteStopLink[];
  source?: 'cache' | 'bundled' | 'network' | 'unavailable';
  warning?: string;
}

export interface JourneyStaticLoader {
  provider: ProviderId;
  load: () => Promise<{ stops: Stop[]; links: RouteStopLink[] }>;
}

export interface JourneyDataSourcesResult {
  ok: boolean;
  stops: Stop[];
  links: RouteStopLink[];
  warnings: string[];
}

export interface JourneyDataLoaderOptions {
  loadKmb: () => Promise<JourneyTopologyChunk>;
  staticLoaders: JourneyStaticLoader[];
}

export async function loadJourneyDataSources(
  options: JourneyDataLoaderOptions
): Promise<JourneyDataSourcesResult> {
  const stops: Stop[] = [];
  const links: RouteStopLink[] = [];
  const warnings: string[] = [];

  try {
    const kmb = await options.loadKmb();
    stops.push(...kmb.stops);
    links.push(...kmb.links);
    if (kmb.warning) warnings.push(kmb.warning);
    if (kmb.source === 'unavailable' && !kmb.warning) warnings.push('KMB unavailable');
  } catch (error) {
    warnings.push(`KMB: ${String(error)}`);
  }

  const settled = await Promise.allSettled(
    options.staticLoaders.map(async (loader) => ({
      provider: loader.provider,
      topology: await loader.load(),
    }))
  );

  settled.forEach((result, index) => {
    const provider = options.staticLoaders[index]?.provider || 'unknown';
    if (result.status === 'rejected') {
      warnings.push(`${provider}: ${String(result.reason)}`);
      return;
    }
    stops.push(...result.value.topology.stops);
    links.push(...result.value.topology.links);
  });

  return {
    ok: stops.length > 0 && links.length > 0,
    stops,
    links,
    warnings,
  };
}
