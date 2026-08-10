import { buildGraph } from '@/src/journey/graph/graphBuilder';
import { planJourney } from '../planner';
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

// Build a small two-route network:
// Route 8 (KMB): A → B → C
// Route 203E (KMB): C → D → E
// So A→E requires one transfer at C.
function makeNetwork() {
  const stops: Stop[] = [
    stop('KMB', 'A', 'Alpha', 22.31, 114.16),
    stop('KMB', 'B', 'Beta', 22.30, 114.15),
    stop('KMB', 'C', 'Gamma', 22.29, 114.14),
    stop('KMB', 'D', 'Delta', 22.28, 114.13),
    stop('KMB', 'E', 'Epsilon', 22.27, 114.12),
  ];
  const links: RouteStopLink[] = [
    link('KMB', '8', 'O', 1, 'A'),
    link('KMB', '8', 'O', 2, 'B'),
    link('KMB', '8', 'O', 3, 'C'),
    link('KMB', '203E', 'O', 1, 'C'),
    link('KMB', '203E', 'O', 2, 'D'),
    link('KMB', '203E', 'O', 3, 'E'),
  ];
  return buildGraph(stops, links);
}

function hubIdForStop(graph: ReturnType<typeof makeNetwork>, stopId: string): string {
  const hub = graph.hubs.find((candidate) =>
    candidate.members.some((member) => member.provider === 'KMB' && member.stopId === stopId)
  );
  if (!hub) throw new Error(`Missing fixture hub for stop ${stopId}`);
  return hub.id;
}

describe('planJourney', () => {
  it('returns null when destination unreachable', () => {
    const g = makeNetwork();
    const a = hubIdForStop(g, 'A');
    const r = planJourney(g, a, a); // same hub
    expect(r).toBeNull();
  });

  it('finds a direct route', () => {
    const g = makeNetwork();
    const r = planJourney(g, hubIdForStop(g, 'A'), hubIdForStop(g, 'C')); // A → C on route 8
    expect(r).not.toBeNull();
    expect(r!.isDirect).toBe(true);
    expect(r!.totalMinutes).toBeGreaterThan(0);
  });

  it('finds a transfer route A → E via C', () => {
    const g = makeNetwork();
    const r = planJourney(g, hubIdForStop(g, 'A'), hubIdForStop(g, 'E'));
    expect(r).not.toBeNull();
    expect(r!.transfers).toBe(1);
    expect(r!.isDirect).toBe(false);
    // two ride legs: 8 and 203E
    const rides = r!.legs.filter((l) => l.kind === 'ride');
    expect(rides).toHaveLength(2);
    expect(rides[0].route).toBe('8');
    expect(rides[1].route).toBe('203E');
  });

  it('merges consecutive legs on the same route', () => {
    const g = makeNetwork();
    const r = planJourney(g, hubIdForStop(g, 'A'), hubIdForStop(g, 'C')); // A→C is B + C on route 8
    const rides = r!.legs.filter((l) => l.kind === 'ride');
    expect(rides).toHaveLength(1); // merged, not two legs
  });
});
