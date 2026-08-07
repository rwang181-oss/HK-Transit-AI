const assert = require('node:assert/strict');

const {
  parseKmbTopology,
  resolveKmbTopology,
} = require('../../.core-test-dist/journey/data/kmbTopology.js');

const bundled = {
  stops: [
    {
      stopId: 'KMB-1',
      provider: 'KMB',
      name_en: 'Bundled Stop',
      name_tc: '內置巴士站',
      name_sc: '内置巴士站',
      lat: 22.3,
      lng: 114.17,
    },
  ],
  links: [
    {
      route: '1A',
      bound: 'O',
      seq: 1,
      stopId: 'KMB-1',
      provider: 'KMB',
    },
  ],
  cachedAt: '2026-08-07T00:00:00.000Z',
};

async function main() {
  assert.equal(parseKmbTopology({ stops: [], links: [] }), null);
  assert.equal(parseKmbTopology(bundled)?.stops[0].stopId, 'KMB-1');

  let freshStarted = 0;
  const neverFinishes = new Promise(() => undefined);
  const localResult = await Promise.race([
    resolveKmbTopology({
      bundled,
      fetchFresh: () => {
        freshStarted += 1;
        return neverFinishes;
      },
    }),
    new Promise((resolve) => setTimeout(() => resolve('timeout'), 100)),
  ]);

  assert.notEqual(
    localResult,
    'timeout',
    'bundled topology must be returned without waiting for the live KMB download'
  );
  assert.equal(localResult.source, 'bundled');
  assert.equal(localResult.topology.stops[0].stopId, 'KMB-1');
  assert.equal(freshStarted, 1, 'live refresh should still start in the background');

  const unavailable = await resolveKmbTopology({
    fetchFresh: async () => {
      throw new Error('mobile network unavailable');
    },
  });
  assert.equal(unavailable.source, 'unavailable');
  assert.deepEqual(unavailable.topology.stops, []);
  assert.deepEqual(unavailable.topology.links, []);
  assert.match(unavailable.warning || '', /KMB/i);

  console.log('✓ bundled KMB topology avoids blocking first journey planning');
  console.log('✓ KMB network failure degrades without failing all journey data');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
