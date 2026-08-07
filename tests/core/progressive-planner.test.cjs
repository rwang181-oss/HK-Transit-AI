const assert = require('node:assert/strict');
const loader = require('../../.core-test-dist/journey/index/loader.js');
const fast = require('../../.core-test-dist/journey/index/fastPlanner.js');

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

function jsonResponse(value) {
  return {
    ok: true,
    async json() { return value; },
  };
}

function fixtureShards() {
  return {
    'meta.json': { schemaVersion: 1, generatedAt: '2026-08-07T00:00:00.000Z', hubCount: 2, routeCount: 1, cellCount: 1, transferPointCount: 0 },
    'hubs.json': [
      { id: 'h1', name_en: 'A', name_tc: '甲', name_sc: '', lat: 22.3, lng: 114.1, members: [{ provider: 'KMB', stopId: 's1' }], services: [{ routeKey: 'KMB:1:O', seq: 0 }] },
      { id: 'h2', name_en: 'B', name_tc: '乙', name_sc: '', lat: 22.31, lng: 114.11, members: [{ provider: 'KMB', stopId: 's2' }], services: [{ routeKey: 'KMB:1:O', seq: 1 }] },
    ],
    'cells.json': { '11410:2230': ['h1', 'h2'] },
    'routes.json': { 'KMB:1:O': { routeKey: 'KMB:1:O', provider: 'KMB', route: '1', bound: 'O', hubs: ['h1', 'h2'], cumulativeMinutes: [0, 5] } },
    'route-neighbors.json': { 'KMB:1:O': [] },
  };
}

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

function makeFastIndex() {
  const start = hub('eye', 22.32470, 114.18483, [
    { routeKey: 'KMB:203E:I', seq: 0 },
    { routeKey: 'KMB:A:I', seq: 0 },
  ], 'eye-stop');
  const transfer = hub('transfer', 22.3350, 114.1950, [
    { routeKey: 'KMB:A:I', seq: 1 },
    { routeKey: 'KMB:B:I', seq: 0 },
  ]);
  const end = hub('school', 22.34526, 114.20479, [
    { routeKey: 'KMB:203E:I', seq: 2 },
    { routeKey: 'KMB:B:I', seq: 2 },
  ], 'school-stop');
  const middle = hub('middle', 22.3355, 114.1955, [{ routeKey: 'KMB:203E:I', seq: 1 }]);
  const hubs = [start, transfer, end, middle];
  return {
    meta: { schemaVersion: 1, generatedAt: '', hubCount: hubs.length, routeCount: 3, cellCount: 3 },
    hubs,
    hubById: new Map(hubs.map((item) => [item.id, item])),
    cells: {
      '11418:2232': ['eye'],
      '11419:2233': ['transfer', 'middle'],
      '11420:2234': ['school'],
    },
    routes: {
      'KMB:203E:I': { routeKey: 'KMB:203E:I', provider: 'KMB', route: '203E', bound: 'I', hubs: ['eye', 'middle', 'school'], cumulativeMinutes: [0, 10, 20] },
      'KMB:A:I': { routeKey: 'KMB:A:I', provider: 'KMB', route: 'A', bound: 'I', hubs: ['eye', 'transfer'], cumulativeMinutes: [0, 8] },
      'KMB:B:I': { routeKey: 'KMB:B:I', provider: 'KMB', route: 'B', bound: 'I', hubs: ['transfer', 'middle', 'school'], cumulativeMinutes: [0, 5, 12] },
    },
    routeNeighbors: {
      'KMB:203E:I': [],
      'KMB:A:I': [{ hubId: 'transfer', seq: 1 }],
      'KMB:B:I': [{ hubId: 'transfer', seq: 0 }],
    },
  };
}

test('journey index loader fetches each shard once and reuses the in-flight/cache promise', async () => {
  loader.resetJourneyIndexCache();
  const shards = fixtureShards();
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(String(url));
    const name = String(url).split('/').pop();
    return jsonResponse(shards[name]);
  };

  const firstPromise = loader.loadJourneyIndex({ fetchImpl });
  const secondPromise = loader.loadJourneyIndex({ fetchImpl });
  const [first, second] = await Promise.all([firstPromise, secondPromise]);

  assert.strictEqual(first, second);
  assert.equal(first.meta.schemaVersion, 1);
  assert.equal(first.hubById.get('h2').name_en, 'B');
  assert.deepEqual(calls.sort(), [
    '/HK-Transit-AI/data/journey/cells.json',
    '/HK-Transit-AI/data/journey/hubs.json',
    '/HK-Transit-AI/data/journey/meta.json',
    '/HK-Transit-AI/data/journey/route-neighbors.json',
    '/HK-Transit-AI/data/journey/routes.json',
  ]);

  await loader.loadJourneyIndex({ fetchImpl });
  assert.equal(calls.length, 5);
});

test('journey index loader rejects malformed schema with a concise error', async () => {
  loader.resetJourneyIndexCache();
  const shards = fixtureShards();
  shards['meta.json'] = { schemaVersion: 99 };
  const fetchImpl = async (url) => jsonResponse(shards[String(url).split('/').pop()]);
  await assert.rejects(
    () => loader.loadJourneyIndex({ fetchImpl }),
    /Journey index unavailable/
  );
});

test('fast planner discovers 203E directly without full graph search or network dependencies', () => {
  const index = makeFastIndex();
  let stats;
  const results = fast.planFastJourney(
    index,
    { lat: 22.32470, lng: 114.18483, name: 'Hong Kong Eye Hospital' },
    { lat: 22.34526, lng: 114.20479, name: 'Po Kong Village Road School Village' },
    'recommended',
    { onStats: (value) => { stats = value; } }
  );
  assert.ok(results.some((option) => option.boardRoute === '203E' && option.itinerary.isDirect));
  assert.ok(results.length <= 5);
  assert.ok(stats.nearbyHubChecks <= 100);
  assert.ok(stats.transferExpansions <= 300);
});

test('fast planner finds a bounded one-transfer alternative from transfer-point services', () => {
  const index = makeFastIndex();
  const results = fast.planFastJourney(
    index,
    { lat: 22.32470, lng: 114.18483, name: 'Eye Hospital' },
    { lat: 22.34526, lng: 114.20479, name: 'School Village' },
    'fastest'
  );
  const transfer = results.find((option) => option.itinerary.transfers === 1);
  assert.ok(transfer, 'one-transfer candidate should be discovered');
  assert.deepEqual(
    transfer.itinerary.legs.filter((leg) => leg.kind === 'ride').map((leg) => leg.route),
    ['A', 'B']
  );
});

test('fast planner caps first-stage options at five and preserves direct-first recommendation threshold', () => {
  const index = makeFastIndex();
  for (let n = 0; n < 8; n += 1) {
    const routeKey = `KMB:D${n}:I`;
    index.routes[routeKey] = { routeKey, provider: 'KMB', route: `D${n}`, bound: 'I', hubs: ['eye', 'school'], cumulativeMinutes: [0, 18 + n] };
    index.routeNeighbors[routeKey] = [];
    index.hubById.get('eye').services.push({ routeKey, seq: 0 });
    index.hubById.get('school').services.push({ routeKey, seq: 1 });
  }
  const results = fast.planFastJourney(
    index,
    { lat: 22.32470, lng: 114.18483, name: 'Eye Hospital' },
    { lat: 22.34526, lng: 114.20479, name: 'School Village' },
    'recommended'
  );
  assert.equal(results.length, 5);
  assert.equal(results[0].itinerary.isDirect, true);
});

(async () => {
  for (const { name, fn } of tests) {
    await fn();
    console.log(`✓ ${name}`);
  }
  console.log(`\n${tests.length} progressive planner tests passed.`);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
