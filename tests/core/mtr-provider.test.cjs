const assert = require('node:assert/strict');
const Module = require('node:module');
const path = require('node:path');

const resolveFilename = Module._resolveFilename;
Module._resolveFilename = function resolveMtrSnapshot(request, parent, isMain, options) {
  if (request === '@/src/data/mtr_stations.json') {
    return path.join(process.cwd(), 'src', 'data', 'mtr_stations.json');
  }
  if (request.startsWith('@/src/')) {
    return resolveFilename.call(this, path.join(process.cwd(), '.core-test-dist', request.slice('@/src/'.length)), parent, isMain, options);
  }
  return resolveFilename.call(this, request, parent, isMain, options);
};
const { mtrProvider, mtrApiLine } = require('../../.core-test-dist/journey/providers/mtr.js');
const { loadRouteDirection } = require('../../.core-test-dist/journey/search/routeDetails.js');

function routeByIdentity(routes, route, bound, routeVariant) {
  const result = routes.find((candidate) => candidate.route === route && candidate.bound === bound && candidate.routeVariant === routeVariant);
  assert.ok(result, `expected ${route}:${bound}:${routeVariant || 'ordinary'}`);
  return result;
}

(async () => {
  const routes = await mtrProvider.fetchRoutes();
  const expected = [
    ['EAL', 'O', undefined, 'Admiralty', 'Lo Wu'],
    ['EAL', 'O', 'LMC-UT', 'Admiralty', 'Lok Ma Chau'],
    ['EAL', 'I', undefined, 'Lo Wu', 'Admiralty'],
    ['EAL', 'I', 'LMC-DT', 'Lok Ma Chau', 'Admiralty'],
    ['TKL', 'O', undefined, 'North Point', 'Po Lam'],
    ['TKL', 'O', 'TKS-UT', 'Tiu Keng Leng', 'LOHAS Park'],
    ['TKL', 'I', undefined, 'Po Lam', 'North Point'],
    ['TKL', 'I', 'TKS-DT', 'LOHAS Park', 'Tiu Keng Leng'],
  ];
  for (const [route, bound, routeVariant, origin, destination] of expected) {
    const candidate = routeByIdentity(routes, route, bound, routeVariant);
    assert.equal(candidate.orig_en, origin);
    assert.equal(candidate.dest_en, destination);
    const detail = await loadRouteDirection(mtrProvider, route, bound, routeVariant);
    assert.equal(detail[0].stop.name_en, origin);
    assert.equal(detail.at(-1).stop.name_en, destination);
  }

  assert.deepEqual(
    (await mtrProvider.fetchRouteStops('EAL', 'O', 'LMC-UT')).map((link) => link.stopId),
    ['ADM', 'EXC', 'HUH', 'MKK', 'KOT', 'TAW', 'SHT', 'FOT', 'UNI', 'TAP', 'TWO', 'FAN', 'SHS', 'LMC']
  );
  assert.deepEqual(
    (await mtrProvider.fetchRouteStops('EAL', 'I', 'LMC-DT')).map((link) => link.stopId),
    ['LMC', 'SHS', 'FAN', 'TWO', 'TAP', 'UNI', 'FOT', 'SHT', 'TAW', 'KOT', 'MKK', 'HUH', 'EXC', 'ADM']
  );
  assert.deepEqual(
    (await mtrProvider.fetchRouteStops('TKL', 'O', 'TKS-UT')).map((link) => link.stopId),
    ['TIK', 'TKO', 'LHP']
  );
  assert.deepEqual(
    (await mtrProvider.fetchRouteStops('TKL', 'I', 'TKS-DT')).map((link) => link.stopId),
    ['LHP', 'TKO', 'TIK']
  );
  assert.deepEqual(
    (await mtrProvider.fetchRouteStops('EAL', 'O')).map((link) => link.stopId).slice(-2),
    ['SHS', 'LOW'],
    'legacy canonical line and O bound must still resolve to its ordinary direction'
  );
  assert.deepEqual(
    (await mtrProvider.fetchRouteStops('EAL', 'I')).map((link) => link.stopId).slice(0, 2),
    ['LOW', 'SHS'],
    'legacy canonical line and I bound must still resolve to its ordinary direction'
  );
  assert.equal(mtrApiLine('EAL~LMC-UT'), 'EAL');
  assert.equal(mtrApiLine('TKL~TKS-DT'), 'TKL');
  console.log('mtr-provider.test.cjs: PASS');
})().catch((error) => { console.error(error); process.exit(1); });
