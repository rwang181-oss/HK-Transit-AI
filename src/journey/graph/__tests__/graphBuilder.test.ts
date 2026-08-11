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
  stopId: string,
  routeVariant?: string
): RouteStopLink {
  return { provider, route, bound, seq, stopId, routeVariant };
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

  it('keeps MTR ordinary and branch directions as separate services', () => {
    const stops: Stop[] = [
      stop('MTR', 'ADM', 'Admiralty', 22.279, 114.165),
      stop('MTR', 'SHS', 'Sheung Shui', 22.501, 114.127),
      stop('MTR', 'LOW', 'Lo Wu', 22.528, 114.114),
      stop('MTR', 'LMC', 'Lok Ma Chau', 22.526, 114.063),
    ];
    const links: RouteStopLink[] = [
      link('MTR', 'EAL', 'O', 1, 'ADM'),
      link('MTR', 'EAL', 'O', 2, 'SHS'),
      link('MTR', 'EAL', 'O', 3, 'LOW'),
      link('MTR', 'EAL', 'O', 1, 'ADM', 'LMC-UT'),
      link('MTR', 'EAL', 'O', 2, 'SHS', 'LMC-UT'),
      link('MTR', 'EAL', 'O', 3, 'LMC', 'LMC-UT'),
    ];

    const graph = buildGraph(stops, links);
    const hubId = (stopId: string) => graph.hubs.find((hub) =>
      hub.members.some((member) => member.provider === 'MTR' && member.stopId === stopId)
    )!.id;
    const rideEdges = graph.edges.filter((edge) => edge.kind === 'ride');
    expect(rideEdges).toEqual(expect.arrayContaining([
      expect.objectContaining({ route: 'EAL', bound: 'O', routeVariant: undefined }),
      expect.objectContaining({ route: 'EAL', bound: 'O', routeVariant: 'LMC-UT' }),
    ]));
    expect(rideEdges.filter((edge) => edge.routeVariant === undefined)).toHaveLength(2);
    expect(rideEdges.filter((edge) => edge.routeVariant === 'LMC-UT')).toHaveLength(2);

    expect(rideEdges
      .filter((edge) => edge.routeVariant === undefined)
      .map((edge) => `${edge.from}->${edge.to}`))
      .toEqual([`${hubId('ADM')}->${hubId('SHS')}`, `${hubId('SHS')}->${hubId('LOW')}`]);
    expect(rideEdges
      .filter((edge) => edge.routeVariant === 'LMC-UT')
      .map((edge) => `${edge.from}->${edge.to}`))
      .toEqual([`${hubId('ADM')}->${hubId('SHS')}`, `${hubId('SHS')}->${hubId('LMC')}`]);
  });
});
