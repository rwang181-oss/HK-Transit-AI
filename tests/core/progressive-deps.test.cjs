const assert = require('node:assert/strict');
const progressive = require('../../.core-test-dist/journey/index/progressivePlanner.js');

function makeMinimalIndex() {
  const board = {
    id: 'board', name_en: 'Board', name_tc: '上車', name_sc: '', lat: 22.3, lng: 114.1,
    members: [{ provider: 'KMB', stopId: 's1' }],
    services: [{ routeKey: 'KMB:1:O', seq: 0 }],
  };
  const alight = {
    id: 'alight', name_en: 'Alight', name_tc: '下車', name_sc: '', lat: 22.31, lng: 114.11,
    members: [{ provider: 'KMB', stopId: 's2' }],
    services: [{ routeKey: 'KMB:1:O', seq: 1 }],
  };
  return {
    meta: { schemaVersion: 1, generatedAt: '', hubCount: 2, routeCount: 1, cellCount: 2 },
    hubs: [board, alight],
    hubById: new Map([['board', board], ['alight', alight]]),
    cells: { '11410:2230': ['board'], '11411:2231': ['alight'] },
    routes: {
      'KMB:1:O': { routeKey: 'KMB:1:O', provider: 'KMB', route: '1', bound: 'O', hubs: ['board', 'alight'], cumulativeMinutes: [0, 5] },
    },
    routeNeighbors: { 'KMB:1:O': [] },
  };
}

(async () => {
  let walkingCalls = 0;
  let providerCalls = 0;
  const deps = progressive.createProductionRefinementDeps({
    routeWalking: async () => {
      walkingCalls += 1;
      throw new Error('walking offline');
    },
    getProvider: async () => {
      providerCalls += 1;
      throw new Error('eta offline');
    },
    now: () => 1_000_000,
  });

  const fallback = await deps.fetchDeparture('KMB', '1', 'O', 's1', 5);
  assert.equal(fallback.status, 'unavailable');
  assert.equal(fallback.minutes, 13);
  assert.equal(fallback.catchable, true);
  assert.equal(fallback.departureAtMs, 1_000_000 + 13 * 60_000);
  assert.equal(providerCalls, 1);

  const index = makeMinimalIndex();
  walkingCalls = 0;
  providerCalls = 0;
  const session = progressive.createProgressiveJourneySession(
    { lat: 22.3, lng: 114.1, name: 'A' },
    { lat: 22.31, lng: 114.11, name: 'B' },
    'recommended',
    {
      loadIndex: async () => index,
      refinementDeps: deps,
    }
  );

  const initial = await session.initial;
  assert.ok(initial.length > 0, 'Stage 1 should return a route');
  assert.equal(walkingCalls, 0, 'Stage 1 must not touch walking dependencies');
  assert.equal(providerCalls, 0, 'Stage 1 must not touch ETA dependencies');

  const refined = await session.refined;
  assert.ok(refined.length > 0, 'Stage 2 dependency failures must not reject the refined promise');
  assert.ok(walkingCalls > 0, 'Stage 2 should attempt walking enrichment');
  assert.ok(providerCalls > 0, 'Stage 2 should attempt ETA enrichment');
  assert.ok(refined.some((option) => option.walkingSource === 'estimated'));
  assert.ok(refined.some((option) => option.waitStatus === 'unavailable' || option.waitStatus === 'estimated'));

  console.log('progressive-deps.test.cjs: PASS');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
