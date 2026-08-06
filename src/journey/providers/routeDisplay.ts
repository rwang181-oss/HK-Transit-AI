import type { ProviderId } from './types';

/** Hide provider-internal variation/direction suffixes from passenger-facing copy. */
export function formatPublicRouteCode(provider: ProviderId | string, route: string): string {
  const value = String(route || '').trim();
  if (provider !== 'GMB') return value;
  const withoutInternalId = value.split('~')[0];
  return withoutInternalId.replace(/-(?:O|I)$/i, '');
}
