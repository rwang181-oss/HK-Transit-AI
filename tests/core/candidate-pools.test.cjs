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

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

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
