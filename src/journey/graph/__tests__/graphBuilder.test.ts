import { buildGraph } from '../graphBuilder';
import type { Stop, RouteStopLink } from '@/src/journey/providers/types';

function stop(
  provider: Stop['provider'],
  stopId: string,
  name: string,
  lat = 0,
  lng = 0
): Stop {
  return { stopId, name_en: name, name_tc: name, lat, lng, provider };
}

function link(
  provider: RouteStopLink['provider'],
  route: string,
  bound: 'O' | 'I',
  seq: number,
  stopId: string
): RouteStopLink {
  return { provider, route, bound, seq, stopId };
}

describe('buildGraph', () => {
  it('creates ride edges for consecutive stops on a route', () => {
    const stops: Stop[] = [
      stop('KMB', 'S1', 'Alpha', 22.31, 114.16),
      stop('KMB', 'S2', 'Beta', 22.30, 114.15),
      stop('KMB', 'S3', 'Gamma', 22.29, 114.14),
    ];
    const links: RouteStopLink[] = [
      link('KMB', '8', 'O', 1, 'S1'),
      link('KMB', '8', 'O', 2, 'S2'),
      link('KMB', '8', 'O', 3, 'S3'),
    ];
    const g = buildGraph(stops, links);
    const rideEdges = g.edges.filter((e) => e.kind === 'ride');
    expect(rideEdges).toHaveLength(2);
    expect(rideEdges[0]).toMatchObject({ route: '8', provider: 'KMB' });
    // Alpha → Beta → Gamma chain
    expect(rideEdges[0].from).not.toBe(rideEdges[0].to);
    expect(rideEdges[1].from).toBe(rideEdges[0].to);
  });

  it('adds transfer edges between hubs within 500m', () => {
    const stops: Stop[] = [
      stop('KMB', 'K1', 'Hung Hom Station', 22.3027, 114.1817),
      stop('MTR', 'HUH', 'Hung Hom Station', 22.3027, 114.1817),
      stop('GMB', 'G1', 'Hung Hom Station', 22.3027, 114.1817),
    ];
    // All same name → merged into ONE hub, so no transfer edge needed
    const g = buildGraph(stops, []);
    expect(g.hubs).toHaveLength(1);
    expect(g.edges.filter((e) => e.kind === 'transfer')).toHaveLength(0);
  });

  it('creates transfer edges between distinct nearby hubs', () => {
    // Two hubs ~200m apart (different names) → transfer edge both ways
    const stops: Stop[] = [
      stop('KMB', 'K1', 'Bus Terminal', 22.3027, 114.1817),
      stop('MTR', 'HUH', 'Hung Hom Station', 22.3035, 114.1830),
    ];
    const g = buildGraph(stops, []);
    const transfers = g.edges.filter((e) => e.kind === 'transfer');
    expect(transfers.length).toBe(2); // both directions
    expect(transfers[0].weight).toBeGreaterThan(0);
  });

  it('skips consecutive stops that merged into the same hub', () => {
    const stops: Stop[] = [
      stop('KMB', 'S1', 'Same Place', 22.31, 114.16),
      stop('KMB', 'S2', 'Same Place', 22.31, 114.16),
    ];
    const links: RouteStopLink[] = [
      link('KMB', '8', 'O', 1, 'S1'),
      link('KMB', '8', 'O', 2, 'S2'),
    ];
    const g = buildGraph(stops, links);
    expect(g.edges.filter((e) => e.kind === 'ride')).toHaveLength(0);
  });
});
