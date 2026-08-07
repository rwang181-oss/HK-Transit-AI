const assert = require('node:assert/strict');
const pools = require('../../.core-test-dist/journey/planner/candidatePools.js');

function candidate(id, transfers, roughMinutes, route = id) {
  const isDirect = transfers === 0;
  return {
    id,
    routeKey: `KMB:${route}:O`,
    isDirect,
    boardHub: { id: `board-${id}` },
    alightHub: { id: `alight-${id}` },
    roughMinutes,
    itinerary: isDirect ? undefined : {
      transfers,
      legs: Array.from({ length: transfers + 1 }, (_, index) => ({
        provider: 'KMB',
        route: `${route}-${index}`,
        bound: 'O',
        fromHubId: `h-${index}`,
        toHubId: `h-${index + 1}`,
        kind: 'ride',
      })),
    },
  };
}

function hub(id, name, lat, lng) {
  return {
    id,
    name_en: name,
    name_tc: name,
    name_sc: name,
    lat,
    lng,
    members: [{ stopId: id, provider: 'KMB', name_en: name, name_tc: name, name_sc: name, lat, lng }],
  };
}

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

test('203E is discovered as a direct route from Eye Hospital to the school-village area', () => {
  const eyeHospital = hub('eye', 'Hong Kong Eye Hospital', 22.3150, 114.1810);
  const middle = hub('middle', 'Kowloon East intermediate stop', 22.3260, 114.1900);
  const schoolVillage = hub('school', 'Po Kong Village Road School Village', 22.3420, 114.1980);
  const hubs = [eyeHospital, middle, schoolVillage];
  const edges = [
    { from: 'eye', to: 'middle', weight: 10, provider: 'KMB', route: '203E', bound: 'O', kind: 'ride' },
    { from: 'middle', to: 'school', weight: 10, provider: 'KMB', route: '203E', bound: 'O', kind: 'ride' },
  ];
  const graph = {
    hubs,
    edges,
    adjacency: new Map(),
    hubById: new Map(hubs.map((item) => [item.id, item])),
  };
  const discovered = pools.discoverDirectRouteCandidates(
    graph,
    [eyeHospital],
    { lat: 22.3422, lng: 114.1981 },
    1_200
  );
  assert.ok(discovered.some((item) =>
    item.routeKey === 'KMB:203E:O' && item.alightHub.id === 'school'
  ));
});

test('203E direct candidate survives faster transfer alternatives', () => {
  const values = [candidate('203E', 0, 48, '203E')];
  for (let index = 0; index < 12; index += 1) {
    values.push(candidate(`transfer-${index}`, 1, 20 + index));
  }
  const retained = pools.retainCandidatePools(values);
  assert.ok(retained.some((item) => item.routeKey === 'KMB:203E:O'));
  assert.equal(retained.filter((item) => item.isDirect).length, 1);
});

test('candidate pools keep separate 8 8 4 limits', () => {
  const values = [];
  for (let index = 0; index < 12; index += 1) values.push(candidate(`d-${index}`, 0, index));
  for (let index = 0; index < 12; index += 1) values.push(candidate(`o-${index}`, 1, index));
  for (let index = 0; index < 12; index += 1) values.push(candidate(`t-${index}`, 2, index));
  const retained = pools.retainCandidatePools(values);
  assert.equal(retained.filter((item) => item.isDirect).length, 8);
  assert.equal(retained.filter((item) => item.itinerary?.transfers === 1).length, 8);
  assert.equal(retained.filter((item) => item.itinerary?.transfers === 2).length, 4);
});

test('routes with three transfers are rejected', () => {
  const retained = pools.retainCandidatePools([
    candidate('direct', 0, 30),
    candidate('too-many', 3, 10),
  ]);
  assert.deepEqual(retained.map((item) => item.id), ['direct']);
});

test('duplicate route sequences retain the quickest boarding pair variant', () => {
  const slow = candidate('same', 1, 50, 'A');
  const fast = { ...candidate('same', 1, 30, 'A'), boardHub: slow.boardHub, alightHub: slow.alightHub };
  const retained = pools.retainCandidatePools([slow, fast]);
  assert.equal(retained.length, 1);
  assert.equal(retained[0].roughMinutes, 30);
});

(async () => {
  for (const { name, fn } of tests) {
    await fn();
    console.log(`✓ ${name}`);
  }
  console.log(`\n${tests.length} candidate pool tests passed.`);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
