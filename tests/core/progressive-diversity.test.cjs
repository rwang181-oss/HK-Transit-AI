const assert = require('node:assert/strict');
const fast = require('../../.core-test-dist/journey/index/fastPlanner.js');

function hub(id, lat, lng, services) {
  return {
    id,
    name_en: id,
    name_tc: id,
    name_sc: '',
    lat,
    lng,
    members: [{ provider: 'KMB', stopId: id }],
    services,
  };
}

const a1 = hub('a1', 22.3000, 114.1000, [
  { routeKey: 'KMB:A:O', seq: 0 },
  { routeKey: 'KMB:B:O', seq: 0 },
]);
const a2 = hub('a2', 22.3005, 114.1004, [{ routeKey: 'KMB:A:O', seq: 1 }]);
const a3 = hub('a3', 22.3010, 114.1008, [{ routeKey: 'KMB:A:O', seq: 2 }]);
const endA = hub('endA', 22.3100, 114.1100, [{ routeKey: 'KMB:A:O', seq: 3 }]);
const endB = hub('endB', 22.3102, 114.1102, [{ routeKey: 'KMB:B:O', seq: 1 }]);
const hubs = [a1, a2, a3, endA, endB];
const index = {
  meta: { schemaVersion: 1, generatedAt: '', hubCount: hubs.length, routeCount: 2, cellCount: 2 },
  hubs,
  hubById: new Map(hubs.map((item) => [item.id, item])),
  cells: {
    '11410:2230': ['a1', 'a2', 'a3'],
    '11411:2231': ['endA', 'endB'],
  },
  routes: {
    'KMB:A:O': { routeKey: 'KMB:A:O', provider: 'KMB', route: 'A', bound: 'O', hubs: ['a1', 'a2', 'a3', 'endA'], cumulativeMinutes: [0, 1, 2, 5] },
    'KMB:B:O': { routeKey: 'KMB:B:O', provider: 'KMB', route: 'B', bound: 'O', hubs: ['a1', 'endB'], cumulativeMinutes: [0, 20] },
  },
  routeNeighbors: { 'KMB:A:O': [], 'KMB:B:O': [] },
};

const results = fast.planFastJourney(
  index,
  { lat: 22.3000, lng: 114.1000, name: 'Start' },
  { lat: 22.3100, lng: 114.1100, name: 'End' },
  'fastest',
  { maxResults: 3 }
);

assert.equal(results.length, 3);
const sequences = results.map((option) => option.itinerary.legs.map((leg) => leg.route).join('>'));
assert.equal(sequences[0], 'A');
assert.equal(sequences[1], 'B', 'a different service must receive a first-pass slot before another A variant');
assert.equal(sequences[2], 'A');
console.log('progressive-diversity.test.cjs: PASS');
