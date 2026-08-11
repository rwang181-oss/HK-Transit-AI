import type { ProviderId, Route, TransitProvider } from '../providers/types';
import { formatPublicRouteCode } from '../providers/routeDisplay';

export interface RouteCatalogEntry extends Route {
  key: string;
  publicRoute: string;
  searchableText: string;
}

export interface RouteCatalogResult {
  entries: RouteCatalogEntry[];
  errors: Partial<Record<ProviderId, string>>;
}

export type ProviderLoader = (id: ProviderId) => Promise<Pick<TransitProvider, 'fetchRoutes'>>;

const PROVIDERS: ProviderId[] = ['KMB', 'CTB', 'GMB', 'MTR'];

const providerRank = new Map(PROVIDERS.map((provider, index) => [provider, index]));

function catalogKey(provider: ProviderId, route: Route): string {
  return route.routeVariant
    ? `${provider}:${route.route}:${route.bound}:${route.routeVariant}`
    : `${provider}:${route.route}:${route.bound}`;
}

export async function loadRouteCatalog(loadProvider: ProviderLoader): Promise<RouteCatalogResult> {
  const settled = await Promise.all(PROVIDERS.map(async (provider) => {
    try {
      const rows = await (await loadProvider(provider)).fetchRoutes();
      return { provider, rows, error: '' };
    } catch (error) {
      return { provider, rows: [] as Route[], error: error instanceof Error ? error.message : String(error) };
    }
  }));
  const errors: Partial<Record<ProviderId, string>> = {};
  const entries = settled.flatMap(({ provider, rows, error }) => {
    if (error) errors[provider] = error;
    return rows.map((route) => {
      const publicRoute = formatPublicRouteCode(provider, route.route);
      return {
        ...route,
        provider,
        publicRoute,
        key: catalogKey(provider, route),
        searchableText: [publicRoute, route.route, route.routeVariant, route.orig_en, route.orig_tc, route.dest_en, route.dest_tc]
          .join(' ')
          .toLocaleUpperCase(),
      };
    });
  });
  return { entries, errors };
}

export function searchRouteCatalog(entries: RouteCatalogEntry[], query: string, limit = 30): RouteCatalogEntry[] {
  const normalized = query.trim().toLocaleUpperCase();
  if (!normalized) return [];
  return entries
    .flatMap((entry) => {
      const publicRoute = entry.publicRoute.toLocaleUpperCase();
      const internalCodes = [entry.route, entry.routeVariant]
        .filter((value): value is string => Boolean(value))
        .map((value) => value.toLocaleUpperCase());
      const routeText = [entry.orig_en, entry.orig_tc, entry.dest_en, entry.dest_tc]
        .join(' ')
        .toLocaleUpperCase();
      const score = publicRoute === normalized ? 0
        : publicRoute.startsWith(normalized) ? 1
        : publicRoute.includes(normalized) ? 2
        : internalCodes.some((code) => code.includes(normalized)) ? 3
        : routeText.includes(normalized) ? 4
        : Number.POSITIVE_INFINITY;
      return Number.isFinite(score) ? [{ entry, score }] : [];
    })
    .sort((left, right) =>
      left.score - right.score ||
      (providerRank.get(left.entry.provider) ?? PROVIDERS.length) - (providerRank.get(right.entry.provider) ?? PROVIDERS.length) ||
      left.entry.key.localeCompare(right.entry.key)
    )
    .slice(0, limit)
    .map(({ entry }) => entry);
}
