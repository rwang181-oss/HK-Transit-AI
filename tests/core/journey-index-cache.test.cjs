const assert = require('node:assert/strict');
const loader = require('../../.core-test-dist/journey/index/loader.js');

const shards = {
  'meta.json': { schemaVersion: 1, generatedAt: '', hubCount: 1, routeCount: 0, cellCount: 1 },
  'hubs.json': [{ id: 'h1', name_en: 'A', name_tc: '甲', name_sc: '', lat: 22.3, lng: 114.1, members: [], services: [] }],
  'cells.json': { '11410:2230': ['h1'] },
  'routes.json': {},
  'route-neighbors.json': {},
};

(async () => {
  loader.resetJourneyIndexCache();
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url: String(url), init });
    const parsed = new URL(String(url), 'https://example.test');
    const name = parsed.pathname.split('/').pop();
    return { ok: true, async json() { return shards[name]; } };
  };

  await loader.loadJourneyIndex({ fetchImpl, buildId: 'build-new' });
  assert.equal(calls.length, 5);
  for (const call of calls) {
    const parsed = new URL(call.url, 'https://example.test');
    assert.equal(parsed.searchParams.get('build'), 'build-new');
    assert.equal(call.init.cache, 'default');
  }

  console.log('journey-index-cache.test.cjs: PASS');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
