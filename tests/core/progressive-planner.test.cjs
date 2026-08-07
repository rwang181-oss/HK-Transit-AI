const assert = require('node:assert/strict');
const loader = require('../../.core-test-dist/journey/index/loader.js');

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
