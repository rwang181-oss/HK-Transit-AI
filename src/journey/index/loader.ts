import type {
  IndexedHub,
  IndexedRoute,
  IndexedTransferPoint,
  JourneyIndexBundle,
  JourneyIndexMeta,
} from './types';

const DEFAULT_BASE_PATH = '/HK-Transit-AI/data/journey';
const SHARDS = [
  'meta.json',
  'hubs.json',
  'cells.json',
  'routes.json',
  'route-neighbors.json',
] as const;

let cachedPromise: Promise<JourneyIndexBundle> | null = null;

function normalizedBasePath(value: string): string {
  const trimmed = value.trim().replace(/\/+$/, '');
  return trimmed || DEFAULT_BASE_PATH;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function parseBundle(values: unknown[]): JourneyIndexBundle {
  const [metaValue, hubsValue, cellsValue, routesValue, neighborsValue] = values;
  if (!isRecord(metaValue) || metaValue.schemaVersion !== 1) {
    throw new Error('Journey index unavailable');
  }
  if (!Array.isArray(hubsValue) || !isRecord(cellsValue) || !isRecord(routesValue) || !isRecord(neighborsValue)) {
    throw new Error('Journey index unavailable');
  }

  const hubs = hubsValue as IndexedHub[];
  const routes = routesValue as Record<string, IndexedRoute>;
  const cells = cellsValue as Record<string, string[]>;
  const routeNeighbors = neighborsValue as Record<string, IndexedTransferPoint[]>;

  if (
    hubs.some((hub) => !hub || typeof hub.id !== 'string' || !Array.isArray(hub.services) || !Array.isArray(hub.members)) ||
    Object.values(routes).some((route) => !route || !Array.isArray(route.hubs) || !Array.isArray(route.cumulativeMinutes)) ||
    Object.values(cells).some((ids) => !Array.isArray(ids)) ||
    Object.values(routeNeighbors).some((points) => !Array.isArray(points))
  ) {
    throw new Error('Journey index unavailable');
  }

  return {
    meta: metaValue as unknown as JourneyIndexMeta,
    hubs,
    hubById: new Map(hubs.map((hub) => [hub.id, hub])),
    cells,
    routes,
    routeNeighbors,
  };
}

export function resetJourneyIndexCache(): void {
  cachedPromise = null;
}

export function loadJourneyIndex(options: {
  basePath?: string;
  fetchImpl?: typeof fetch;
} = {}): Promise<JourneyIndexBundle> {
  if (cachedPromise) return cachedPromise;

  const basePath = normalizedBasePath(options.basePath || DEFAULT_BASE_PATH);
  const fetchImpl = options.fetchImpl || fetch;
  cachedPromise = Promise.all(
    SHARDS.map(async (name) => {
      const response = await fetchImpl(`${basePath}/${name}`, {
        cache: 'force-cache',
        headers: { Accept: 'application/json' },
      });
      if (!response.ok) throw new Error('Journey index unavailable');
      return response.json() as Promise<unknown>;
    })
  )
    .then(parseBundle)
    .catch((error) => {
      cachedPromise = null;
      if (error instanceof Error && error.message === 'Journey index unavailable') throw error;
      throw new Error('Journey index unavailable');
    });

  return cachedPromise;
}
