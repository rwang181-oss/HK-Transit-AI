const assert = require('node:assert/strict');
const policies = require('../../.core-test-dist/journey/planner/routePolicies.js');
const planner = require('../../.core-test-dist/journey/planner/planner.js');

function option(id, totalMinutes, transfers, walkingMeters = 300, waitMin = 5) {
  return {
    id,
    totalMinutes,
    walkingMeters,
    waitMin,
    itinerary: { transfers, isDirect: transfers === 0 },
  };
}

function hub(id) {
  return { id, name_en: id, name_tc: id, name_sc: id, lat: 22.3, lng: 114.18, members: [] };
}

function graph(edges) {
  const ids = [...new Set(edges.flatMap((edge) => [edge.from, edge.to]))];
  const hubs = ids.map(hub);
  const adjacency = new Map();
  for (const edge of edges) {
    if (!adjacency.has(edge.from)) adjacency.set(edge.from, []);
    adjacency.get(edge.from).push(edge);
  }
  return { hubs, edges, adjacency, hubById: new Map(hubs.map((item) => [item.id, item])) };
}

function ride(from, to, weight, route) {
  return { from, to, weight, provider: 'KMB', route, bound: 'O', kind: 'ride' };
}

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

test('recommended keeps a direct route first within fifteen minutes', () => {
  const ranked = policies.applyJourneyPolicy([
    option('transfer', 30, 1),
    option('direct', 44, 0),
  ], 'recommended');
  assert.equal(ranked[0].id, 'direct');
});

test('recommended allows a much faster transfer route to overtake direct', () => {
  const ranked = policies.applyJourneyPolicy([
    option('direct', 50, 0),
    option('transfer', 30, 1),
  ], 'recommended');
  assert.equal(ranked[0].id, 'transfer');
});

test('direct policy groups all direct routes before transfers', () => {
  const ranked = policies.applyJourneyPolicy([
    option('transfer', 20, 1),
    option('direct', 45, 0),
  ], 'direct');
  assert.equal(ranked[0].id, 'direct');
});

test('one-transfer policy removes routes with two or more transfers', () => {
  const ranked = policies.applyJourneyPolicy([
    option('two', 20, 2),
    option('one', 30, 1),
    option('direct', 35, 0),
  ], 'oneTransfer');
  assert.deepEqual(ranked.map((item) => item.id).sort(), ['direct', 'one']);
});

test('fastest and less-walking policies use materially different priorities', () => {
  const values = [option('fast', 20, 1, 900), option('walk', 30, 0, 100)];
  assert.equal(policies.applyJourneyPolicy(values, 'fastest')[0].id, 'fast');
  assert.equal(policies.applyJourneyPolicy(values, 'lessWalking')[0].id, 'walk');
});

test('transfer-aware search prefers a practical direct route', () => {
  const g = graph([
    ride('A', 'D', 20, 'DIRECT'),
    ride('A', 'B', 2, 'R1'),
    ride('B', 'C', 2, 'R2'),
    ride('C', 'D', 2, 'R3'),
  ]);
  const result = planner.planJourney(g, 'A', 'D', {
    transferPenaltyMinutes: 10,
    transferWalkBufferMinutes: 2,
    maxTransfers: 2,
  });
  assert.equal(result.isDirect, true);
  assert.equal(result.legs[0].route, 'DIRECT');
});

test('search rejects paths above the maximum transfer count', () => {
  const g = graph([
    ride('A', 'B', 1, 'R1'),
    ride('B', 'C', 1, 'R2'),
    ride('C', 'D', 1, 'R3'),
    ride('D', 'E', 1, 'R4'),
  ]);
  assert.equal(planner.planJourney(g, 'A', 'E', { maxTransfers: 2 }), null);
  assert.equal(planner.planJourney(g, 'A', 'E', { maxTransfers: 3 }).transfers, 3);
});

(async () => {
  for (const { name, fn } of tests) {
    await fn();
    console.log(`✓ ${name}`);
  }
  console.log(`\n${tests.length} journey policy tests passed.`);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
