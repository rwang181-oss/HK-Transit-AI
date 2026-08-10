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
        key: `${provider}:${route.route}:${route.bound}`,
        searchableText: [publicRoute, route.route, route.orig_en, route.orig_tc, route.dest_en, route.dest_tc]
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
  return entries.filter((entry) => entry.searchableText.includes(normalized)).slice(0, limit);
}
