import type { ETA, RouteStopLink, Stop, TransitProvider } from '../providers/types';

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
