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

describe('planJourney', () => {
  it('returns null when destination unreachable (same hub)', () => {
    const g = makeNetwork();
    // Find the hub for stop A
    const hubA = g.hubs.find((h) => h.members.some((m) => m.stopId === 'A'));
    expect(hubA).toBeDefined();
    const r = planJourney(g, hubA!.id, hubA!.id);
    expect(r).toBeNull();
  });

  it('finds a direct route A → C on route 8', () => {
    const g = makeNetwork();
    const hubA = g.hubs.find((h) => h.members.some((m) => m.stopId === 'A'))!;
    const hubC = g.hubs.find((h) => h.members.some((m) => m.stopId === 'C'))!;
    const r = planJourney(g, hubA.id, hubC.id);
    expect(r).not.toBeNull();
    expect(r!.isDirect).toBe(true);
    expect(r!.totalMinutes).toBeGreaterThan(0);
  });

  it('finds a transfer route A → E via C', () => {
    const g = makeNetwork();
    const hubA = g.hubs.find((h) => h.members.some((m) => m.stopId === 'A'))!;
    const hubE = g.hubs.find((h) => h.members.some((m) => m.stopId === 'E'))!;
    const r = planJourney(g, hubA.id, hubE.id);
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
    const hubA = g.hubs.find((h) => h.members.some((m) => m.stopId === 'A'))!;
    const hubC = g.hubs.find((h) => h.members.some((m) => m.stopId === 'C'))!;
    const r = planJourney(g, hubA.id, hubC.id);
    const rides = r!.legs.filter((l) => l.kind === 'ride');
    expect(rides).toHaveLength(1); // merged, not two legs
  });

  // 203E regression: 香港眼科医院 → 慈正邨 must be found as direct candidate
  it('203E regression: real-world direct route is discoverable', () => {
    // Simulate two stops near each other on route 203E
    const stops: Stop[] = [
      stop('KMB', 'EYE_HOSP', 'Hong Kong Eye Hospital', 22.338, 114.187),
      stop('KMB', 'SCHOOL', 'Po Kong Village Road School', 22.345, 114.201),
      stop('KMB', 'TSZ_CHING', 'Tsz Ching Estate', 22.349, 114.205),
    ];
    const links: RouteStopLink[] = [
      link('KMB', '203E', 'O', 1, 'EYE_HOSP'),
      link('KMB', '203E', 'O', 2, 'SCHOOL'),
      link('KMB', '203E', 'O', 3, 'TSZ_CHING'),
    ];
    const graph = buildGraph(stops, links);

    // Find eye hospital hub
    const boardHub = graph.hubs.find((h) => h.members.some((m) => m.stopId === 'EYE_HOSP'));
    const alightHub = graph.hubs.find((h) => h.members.some((m) => m.stopId === 'SCHOOL'));
    expect(boardHub).toBeDefined();
    expect(alightHub).toBeDefined();

    // Verify there's a ride edge from eye hospital to school village
    const adjacency = graph.adjacency.get(boardHub!.id) || [];
    const rideEdges = adjacency.filter((e) => e.kind === 'ride' && e.route === '203E');
    expect(rideEdges.length).toBeGreaterThan(0);

    // Verify we can plan a direct route
    const itinerary = planJourney(graph, boardHub!.id, alightHub!.id);
    expect(itinerary).not.toBeNull();
    expect(itinerary!.isDirect).toBe(true);
  });
});
