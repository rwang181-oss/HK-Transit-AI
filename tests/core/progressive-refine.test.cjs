const assert = require('node:assert/strict');
const fast = require('../../.core-test-dist/journey/index/fastPlanner.js');
const refine = require('../../.core-test-dist/journey/index/refinePlanner.js');

function hub(id, lat, lng, services, stopId = id) {
  return {
    id,
    name_en: id,
    name_tc: id,
    name_sc: '',
    lat,
    lng,
    members: [{ provider: 'KMB', stopId }],
    services,
  };
}

function makeIndex() {
  const eye = hub('eye', 22.32470, 114.18483, [
    { routeKey: 'KMB:203E:I', seq: 0 },
    { routeKey: 'KMB:C:I', seq: 0 },
  ], 'eye-stop');
  const middle = hub('middle', 22.3350, 114.1950, [{ routeKey: 'KMB:203E:I', seq: 1 }]);
  const school = hub('school', 22.34526, 114.20479, [
    { routeKey: 'KMB:203E:I', seq: 2 },
    { routeKey: 'KMB:E:I', seq: 1 },
  ], 'school-stop');
  const t1 = hub('t1', 22.3300, 114.1900, [
    { routeKey: 'KMB:C:I', seq: 1 },
    { routeKey: 'KMB:D:I', seq: 0 },
  ]);
  const t2 = hub('t2', 22.3390, 114.1990, [
    { routeKey: 'KMB:D:I', seq: 1 },
    { routeKey: 'KMB:E:I', seq: 0 },
  ]);

  const hubs = [eye, middle, school, t1, t2];
  return {
    meta: { schemaVersion: 1, generatedAt: '', hubCount: hubs.length, routeCount: 4, cellCount: 4 },
    hubs,
    hubById: new Map(hubs.map((item) => [item.id, item])),
    cells: {
      '11418:2232': ['eye'],
      '11419:2233': ['middle', 't1', 't2'],
      '11420:2234': ['school'],
    },
    routes: {
      'KMB:203E:I': { routeKey: 'KMB:203E:I', provider: 'KMB', route: '203E', bound: 'I', hubs: ['eye', 'middle', 'school'], cumulativeMinutes: [0, 10, 20] },
      'KMB:C:I': { routeKey: 'KMB:C:I', provider: 'KMB', route: 'C', bound: 'I', hubs: ['eye', 't1'], cumulativeMinutes: [0, 4] },
      'KMB:D:I': { routeKey: 'KMB:D:I', provider: 'KMB', route: 'D', bound: 'I', hubs: ['t1', 't2'], cumulativeMinutes: [0, 4] },
      'KMB:E:I': { routeKey: 'KMB:E:I', provider: 'KMB', route: 'E', bound: 'I', hubs: ['t2', 'school'], cumulativeMinutes: [0, 4] },
    },
    routeNeighbors: {
      'KMB:203E:I': [],
      'KMB:C:I': [{ hubId: 't1', seq: 1 }],
      'KMB:D:I': [{ hubId: 't1', seq: 0 }, { hubId: 't2', seq: 1 }],
      'KMB:E:I': [{ hubId: 't2', seq: 0 }],
    },
  };
}

const from = { lat: 22.32470, lng: 114.18483, name: 'Eye Hospital' };
const to = { lat: 22.34526, lng: 114.20479, name: 'School Village' };

(async () => {
  const index = makeIndex();
  // Add enough dead-end services at t1 so the bounded route expansion crosses
  // the 100-expansion yield threshold without creating hundreds of results.
  for (let n = 0; n < 120; n += 1) {
    const routeKey = `KMB:Z${n}:I`;
    index.routes[routeKey] = { routeKey, provider: 'KMB', route: `Z${n}`, bound: 'I', hubs: ['t1', 't2'], cumulativeMinutes: [0, 20] };
    index.routeNeighbors[routeKey] = [];
    index.hubById.get('t1').services.push({ routeKey, seq: 0 });
  }

  const initial = fast.planFastJourney(index, from, to, 'recommended');
  const initialSnapshot = JSON.stringify(initial);
  let yields = 0;
  const refined = await refine.refineJourneyOptions(index, initial, from, to, 'recommended', {
    routeWalking: async () => { throw new Error('walking offline'); },
    fetchDeparture: async () => { throw new Error('ETA offline'); },
    yieldToBrowser: async () => { yields += 1; },
  });

  assert.ok(refined.some((option) => option.itinerary.transfers === 2), 'Stage 2 should be able to discover a two-transfer route');
  assert.ok(refined.every((option) => option.itinerary.transfers <= 2), 'Stage 2 must never return more than two transfers');
  assert.ok(yields >= 1, 'route expansion must yield after bounded chunks');
  assert.equal(JSON.stringify(initial), initialSnapshot, 'refinement must not mutate the Stage 1 array');
  assert.ok(refined.length > 0, 'dependency failures must leave usable routes');
  assert.ok(refined.some((option) => option.walkingSource === 'estimated'), 'walking failure must keep estimated walking values');
  assert.ok(refined.some((option) => option.waitStatus === 'estimated'), 'ETA failure must keep fallback wait values');

  console.log('progressive-refine.test.cjs: PASS');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
