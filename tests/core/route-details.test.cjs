const assert = require('node:assert/strict');
const details = require('../../.core-test-dist/journey/search/routeDetails.js');

const provider = {
  id: 'CTB',
  fetchStops: async () => [
    { stopId: 'b', name_en: 'Beta', name_tc: '乙', lat: 1, lng: 2, provider: 'CTB' },
    { stopId: 'a', name_en: 'Alpha', name_tc: '甲', lat: 1, lng: 2, provider: 'CTB' },
  ],
  fetchRouteStops: async () => [
    { route: '1', bound: 'O', seq: 2, stopId: 'b', provider: 'CTB' },
    { route: '1', bound: 'O', seq: 1, stopId: 'a', provider: 'CTB' },
  ],
  fetchETA: async () => [],
};

(async () => {
  const rows = await details.loadRouteDirection(provider, '1', 'O');
  assert.deepEqual(rows.map((row) => row.stop.stopId), ['a', 'b']);
  assert.deepEqual(await details.loadStopEta(provider, 'a', '1'), []);
  const departures = [
    { route: '1', bound: 'O', stopId: 'a', eta: '2026-08-10T09:00:00.000Z', provider: 'CTB' },
    { route: '1', bound: 'I', stopId: 'a', eta: '2026-08-10T09:05:00.000Z', provider: 'CTB' },
  ];
  assert.deepEqual(
    details.filterStopEtaByBound(departures, 'O').map((eta) => eta.eta),
    ['2026-08-10T09:00:00.000Z']
  );
  assert.notEqual(
    details.getRouteStopStateKey('CTB', '1', 'O', 'a'),
    details.getRouteStopStateKey('MTR', '1', 'I', 'a')
  );
  console.log('route-details.test.cjs: PASS');
})().catch((error) => { console.error(error); process.exit(1); });
