const assert = require('node:assert/strict');
const { loadJourneyDataSources } = require('../../.core-test-dist/journey/data/journeyDataLoader.js');

function topology(provider, suffix = provider) {
  return {
    stops: [{
      stopId: `${suffix}-stop`,
      name_en: `${provider} stop`,
      name_tc: `${provider} 站`,
      name_sc: `${provider} 站`,
      lat: 22.3,
      lng: 114.17,
      provider,
    }],
    links: [{
      route: `${suffix}-route`,
      bound: 'O',
      seq: 1,
      stopId: `${suffix}-stop`,
      provider,
    }],
  };
}

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

test('bundled KMB data remains usable when background network refresh is unavailable', async () => {
  const result = await loadJourneyDataSources({
    loadKmb: async () => ({
      ...topology('KMB'),
      source: 'bundled',
      warning: 'bundled fallback',
    }),
    staticLoaders: [],
  });
  assert.equal(result.ok, true);
  assert.equal(result.stops.length, 1);
  assert.equal(result.links.length, 1);
  assert.ok(result.warnings.some((item) => item.includes('bundled')));
});

test('one static provider failure does not block other providers', async () => {
  const result = await loadJourneyDataSources({
    loadKmb: async () => ({ ...topology('KMB'), source: 'cache' }),
    staticLoaders: [
      { provider: 'CTB', load: async () => { throw new Error('CTB failed'); } },
      { provider: 'GMB', load: async () => topology('GMB') },
      { provider: 'MTR', load: async () => topology('MTR') },
    ],
  });
  assert.equal(result.ok, true);
  assert.ok(result.stops.some((stop) => stop.provider === 'KMB'));
  assert.ok(result.stops.some((stop) => stop.provider === 'GMB'));
  assert.ok(result.stops.some((stop) => stop.provider === 'MTR'));
  assert.ok(result.warnings.some((item) => item.includes('CTB')));
});

test('KMB unavailable still allows another provider to build journey data', async () => {
  const result = await loadJourneyDataSources({
    loadKmb: async () => ({
      stops: [],
      links: [],
      source: 'unavailable',
      warning: 'KMB unavailable',
    }),
    staticLoaders: [
      { provider: 'CTB', load: async () => topology('CTB') },
    ],
  });
  assert.equal(result.ok, true);
  assert.equal(result.stops[0].provider, 'CTB');
});

test('all providers failing or empty returns an explicit unusable result', async () => {
  const result = await loadJourneyDataSources({
    loadKmb: async () => ({
      stops: [],
      links: [],
      source: 'unavailable',
      warning: 'KMB unavailable',
    }),
    staticLoaders: [
      { provider: 'CTB', load: async () => { throw new Error('CTB failed'); } },
      { provider: 'GMB', load: async () => ({ stops: [], links: [] }) },
    ],
  });
  assert.equal(result.ok, false);
  assert.equal(result.stops.length, 0);
  assert.equal(result.links.length, 0);
});

(async () => {
  for (const { name, fn } of tests) {
    await fn();
    console.log(`✓ ${name}`);
  }
  console.log(`\n${tests.length} journey data loader tests passed.`);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
