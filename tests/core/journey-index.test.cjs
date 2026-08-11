const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  buildJourneyIndex,
  writeJourneyIndex,
  cellKey,
} = require('../../scripts/build-journey-index.cjs');

function makeTopology() {
  return {
    KMB: {
      stops: [
        { stopId: 'eye', name_en: 'Hong Kong Eye Hospital', name_tc: '香港眼科醫院', name_sc: '', lat: 22.3211, lng: 114.1870, provider: 'KMB' },
        { stopId: 'junction', name_en: 'Transfer Junction', name_tc: '轉車站', name_sc: '', lat: 22.3290, lng: 114.1950, provider: 'KMB' },
        { stopId: 'school', name_en: 'Po Kong Village Road School Village', name_tc: '蒲崗村道學校村', name_sc: '', lat: 22.3467, lng: 114.1996, provider: 'KMB' },
        { stopId: 'other', name_en: 'Other Stop', name_tc: '其他站', name_sc: '', lat: 22.3370, lng: 114.2020, provider: 'KMB' },
      ],
      links: [
        { route: '203E', bound: 'O', seq: 1, stopId: 'eye', provider: 'KMB' },
        { route: '203E', bound: 'O', seq: 2, stopId: 'junction', provider: 'KMB' },
        { route: '203E', bound: 'O', seq: 3, stopId: 'school', provider: 'KMB' },
        { route: 'X1', bound: 'O', seq: 1, stopId: 'other', provider: 'KMB' },
        { route: 'X1', bound: 'O', seq: 2, stopId: 'junction', provider: 'KMB' },
      ],
    },
  };
}

const index = buildJourneyIndex(makeTopology(), {
  idByMember: {
    'KMB:eye': 'hub-eye',
    'KMB:junction': 'hub-junction',
    'KMB:school': 'hub-school',
    'KMB:other': 'hub-other',
  },
});

assert.equal(index.meta.schemaVersion, 1);
assert.equal(cellKey(22.3211, 114.1870), '11418:2232');
assert.equal(index.routes['KMB:203E:O'].hubs[0], 'hub-eye');
assert.ok(index.routes['KMB:203E:O'].cumulativeMinutes.at(-1) > 0);
assert.ok(index.routeNeighbors['KMB:203E:O'].some((x) => x.hubId === 'hub-junction' && x.seq === 1));
assert.ok(Object.values(index.cells).some((ids) => ids.includes('hub-eye')));
assert.deepEqual(
  index.routes['KMB:203E:O'].hubs,
  ['hub-eye', 'hub-junction', 'hub-school']
);
assert.equal(
  index.routes['KMB:203E:O'].cumulativeMinutes.length,
  index.routes['KMB:203E:O'].hubs.length
);

const mtrIndex = buildJourneyIndex({
  MTR: {
    stops: [
      { stopId: 'LOW', name_en: 'Lo Wu', name_tc: '', lat: 22.528, lng: 114.113 },
      { stopId: 'LMC', name_en: 'Lok Ma Chau', name_tc: '', lat: 22.52, lng: 114.06 },
      { stopId: 'SHS', name_en: 'Sheung Shui', name_tc: '', lat: 22.50, lng: 114.12 },
      { stopId: 'ADM', name_en: 'Admiralty', name_tc: '', lat: 22.279, lng: 114.165 },
    ],
    links: [
      { route: 'EAL', dir: 'DT', seq: 1, stopId: 'LOW' },
      { route: 'EAL', dir: 'DT', seq: 2, stopId: 'SHS' },
      { route: 'EAL', dir: 'DT', seq: 3, stopId: 'ADM' },
      { route: 'EAL', dir: 'LMC-DT', seq: 1, stopId: 'LMC' },
      { route: 'EAL', dir: 'LMC-DT', seq: 2, stopId: 'SHS' },
      { route: 'EAL', dir: 'LMC-DT', seq: 3, stopId: 'ADM' },
      { route: 'EAL', dir: 'UT', seq: 1, stopId: 'ADM' },
      { route: 'EAL', dir: 'UT', seq: 2, stopId: 'SHS' },
      { route: 'EAL', dir: 'UT', seq: 3, stopId: 'LOW' },
      { route: 'EAL', dir: 'LMC-UT', seq: 1, stopId: 'ADM' },
      { route: 'EAL', dir: 'LMC-UT', seq: 2, stopId: 'SHS' },
      { route: 'EAL', dir: 'LMC-UT', seq: 3, stopId: 'LMC' },
    ],
  },
}, {
  idByMember: {
    'MTR:LOW': 'hub-low',
    'MTR:LMC': 'hub-lmc',
    'MTR:SHS': 'hub-shs',
    'MTR:ADM': 'hub-adm',
  },
});
assert.deepEqual(Object.keys(mtrIndex.routes).sort(), [
  'MTR:EAL:I',
  'MTR:EAL:I:LMC-DT',
  'MTR:EAL:O',
  'MTR:EAL:O:LMC-UT',
]);
assert.deepEqual(mtrIndex.routes['MTR:EAL:I'].hubs, ['hub-low', 'hub-shs', 'hub-adm']);
assert.deepEqual(mtrIndex.routes['MTR:EAL:I:LMC-DT'].hubs, ['hub-lmc', 'hub-shs', 'hub-adm']);
assert.deepEqual(mtrIndex.routes['MTR:EAL:O'].hubs, ['hub-adm', 'hub-shs', 'hub-low']);
assert.deepEqual(mtrIndex.routes['MTR:EAL:O:LMC-UT'].hubs, ['hub-adm', 'hub-shs', 'hub-lmc']);
assert.equal(mtrIndex.routes['MTR:EAL:I:LMC-DT'].routeVariant, 'LMC-DT');
assert.equal(mtrIndex.routes['MTR:EAL:O:LMC-UT'].routeVariant, 'LMC-UT');
for (const [routeKey, bound] of [
  ['MTR:EAL:I', 'I'],
  ['MTR:EAL:I:LMC-DT', 'I'],
  ['MTR:EAL:O', 'O'],
  ['MTR:EAL:O:LMC-UT', 'O'],
]) {
  assert.deepEqual(
    { provider: mtrIndex.routes[routeKey].provider, route: mtrIndex.routes[routeKey].route, bound: mtrIndex.routes[routeKey].bound },
    { provider: 'MTR', route: 'EAL', bound },
  );
}

const eyeHub = index.hubs.find((hub) => hub.id === 'hub-eye');
const junctionHub = index.hubs.find((hub) => hub.id === 'hub-junction');
assert.ok(eyeHub);
assert.ok(junctionHub);
assert.ok(eyeHub.services.some((service) => service.routeKey === 'KMB:203E:O' && service.seq === 0));
assert.ok(junctionHub.services.some((service) => service.routeKey === 'KMB:X1:O'));

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'hk-transit-index-'));
try {
  writeJourneyIndex(index, temp);
  for (const name of ['meta.json', 'hubs.json', 'cells.json', 'routes.json', 'route-neighbors.json']) {
    const file = path.join(temp, name);
    assert.ok(fs.existsSync(file), `${name} should be written`);
    assert.ok(fs.statSync(file).size > 2, `${name} should not be empty`);
  }
  assert.ok(fs.statSync(path.join(temp, 'route-neighbors.json')).size < 1_000, 'synthetic transfer-point index must stay compact');
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
}

console.log('journey-index.test.cjs: PASS');
