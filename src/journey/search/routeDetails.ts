import type { ETA, ProviderId, RouteStopLink, Stop, TransitProvider } from '../providers/types';

export interface RouteDirectionStop {
  link: RouteStopLink;
  stop: Stop;
}

export async function loadRouteDirection(
  provider: Pick<TransitProvider, 'fetchStops' | 'fetchRouteStops'>,
  route: string,
  bound: 'O' | 'I'
): Promise<RouteDirectionStop[]> {
  const [stops, links] = await Promise.all([
    provider.fetchStops(),
    provider.fetchRouteStops(route, bound),
  ]);
  const stopsById = new Map(stops.map((stop) => [stop.stopId, stop]));

  return links
    .sort((left, right) => left.seq - right.seq)
    .flatMap((link) => {
      const stop = stopsById.get(link.stopId);
      return stop ? [{ link, stop }] : [];
    });
}

export async function loadStopEta(
  provider: Pick<TransitProvider, 'fetchETA'>,
  stopId: string,
  route: string
): Promise<ETA[]> {
  return provider.fetchETA(stopId, route);
}

export function filterStopEtaByBound(etas: ETA[], bound: 'O' | 'I'): ETA[] {
  return etas.filter((eta) => eta.bound === bound);
}

export function getRouteStopStateKey(
  provider: ProviderId,
  route: string,
  bound: 'O' | 'I',
  stopId: string
): string {
  return `${provider}:${route}:${bound}:${stopId}`;
}
