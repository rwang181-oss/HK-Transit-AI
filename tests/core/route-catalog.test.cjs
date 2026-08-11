const assert = require('node:assert/strict');
const catalog = require('../../.core-test-dist/journey/search/routeCatalog.js');

const routes = {
  KMB: [{ route: '1', bound: 'O', orig_en: 'A', orig_tc: '甲', dest_en: 'B', dest_tc: '乙', provider: 'KMB' }],
  CTB: [{ route: '1', bound: 'O', orig_en: 'Central', orig_tc: '中環', dest_en: 'Peak', dest_tc: '山頂', provider: 'CTB' }],
  GMB: [{ route: '1~2006408-O', bound: 'O', orig_en: 'Peak', orig_tc: '山頂', dest_en: 'Central', dest_tc: '中環', provider: 'GMB' }],
  MTR: [
    { route: 'EAL', bound: 'O', orig_en: 'Admiralty', orig_tc: '金鐘', dest_en: 'Lo Wu', dest_tc: '羅湖', provider: 'MTR' },
    { route: 'EAL', routeVariant: 'LMC-UT', bound: 'O', orig_en: 'Admiralty', orig_tc: '金鐘', dest_en: 'Lok Ma Chau', dest_tc: '落馬洲', provider: 'MTR' },
    { route: 'EAL', bound: 'I', orig_en: 'Lo Wu', orig_tc: '羅湖', dest_en: 'Admiralty', dest_tc: '金鐘', provider: 'MTR' },
    { route: 'EAL', routeVariant: 'LMC-DT', bound: 'I', orig_en: 'Lok Ma Chau', orig_tc: '落馬洲', dest_en: 'Admiralty', dest_tc: '金鐘', provider: 'MTR' },
  ],
};

const loadProvider = async (id) => ({ id, fetchRoutes: async () => routes[id] });

(async () => {
  const result = await catalog.loadRouteCatalog(loadProvider);
  assert.deepEqual(new Set(result.entries.map((entry) => entry.provider)), new Set(['KMB', 'CTB', 'GMB', 'MTR']));
  assert.equal(result.entries.find((entry) => entry.provider === 'GMB').publicRoute, '1');
  assert.equal(catalog.searchRouteCatalog(result.entries, '中環', 20).length, 2);
  assert.equal(catalog.searchRouteCatalog(result.entries, 'EAL', 20)[0].provider, 'MTR');
  const eal = catalog.searchRouteCatalog(result.entries, 'EAL', 20).filter((entry) => entry.provider === 'MTR');
  assert.equal(eal.length, 4);
  assert.deepEqual(new Set(eal.map((entry) => entry.key)), new Set([
    'MTR:EAL:O', 'MTR:EAL:O:LMC-UT', 'MTR:EAL:I', 'MTR:EAL:I:LMC-DT',
  ]));
  assert.deepEqual(new Set(eal.map((entry) => entry.publicRoute)), new Set(['EAL']));
  assert.equal(eal.find((entry) => entry.routeVariant === 'LMC-UT').dest_en, 'Lok Ma Chau');
  assert.equal(eal.find((entry) => entry.routeVariant === 'LMC-DT').orig_en, 'Lok Ma Chau');

  const ranked = catalog.searchRouteCatalog([
    {
      provider: 'CTB', route: '12', bound: 'O', publicRoute: '12', key: 'CTB:12:O',
      searchableText: '12 HARBOUR', orig_en: 'A', orig_tc: '甲', dest_en: 'B', dest_tc: '乙',
    },
    {
      provider: 'CTB', route: 'SERVICE-A', bound: 'O', publicRoute: 'A1A', key: 'CTB:SERVICE-A:O',
      searchableText: 'A1A SERVICE-A HARBOUR', orig_en: 'A', orig_tc: '甲', dest_en: 'B', dest_tc: '乙',
    },
    {
      provider: 'MTR', route: 'LINE-1', bound: 'O', publicRoute: 'EAL', key: 'MTR:LINE-1:O',
      searchableText: 'EAL LINE-1 ADMIRALTY', orig_en: 'A', orig_tc: '甲', dest_en: 'B', dest_tc: '乙',
    },
    {
      provider: 'GMB', route: '7', bound: 'O', publicRoute: '7', key: 'GMB:7:O',
      searchableText: '7 CENTRAL 1 TERMINUS', orig_en: 'Central 1', orig_tc: '甲', dest_en: 'B', dest_tc: '乙',
    },
    {
      provider: 'KMB', route: '1', bound: 'O', publicRoute: '1', key: 'KMB:1:O',
      searchableText: '1 KOWLOON', orig_en: 'A', orig_tc: '甲', dest_en: 'B', dest_tc: '乙',
    },
  ], '1', 20);
  assert.deepEqual(
    ranked.map((entry) => entry.key),
    ['KMB:1:O', 'CTB:12:O', 'CTB:SERVICE-A:O', 'MTR:LINE-1:O', 'GMB:7:O'],
    'exact public codes must precede public-code prefixes, public-code substrings, internal-code matches, and text matches'
  );

  const exactTies = catalog.searchRouteCatalog([
    { provider: 'MTR', route: '1', bound: 'O', publicRoute: '1', key: 'MTR:1:O', searchableText: '1', orig_en: 'A', orig_tc: '甲', dest_en: 'B', dest_tc: '乙' },
    { provider: 'GMB', route: '1', bound: 'O', publicRoute: '1', key: 'GMB:1:O', searchableText: '1', orig_en: 'A', orig_tc: '甲', dest_en: 'B', dest_tc: '乙' },
    { provider: 'CTB', route: '1', bound: 'O', publicRoute: '1', key: 'CTB:1:O', searchableText: '1', orig_en: 'A', orig_tc: '甲', dest_en: 'B', dest_tc: '乙' },
    { provider: 'KMB', route: '1', bound: 'O', publicRoute: '1', key: 'KMB:1:O', searchableText: '1', orig_en: 'A', orig_tc: '甲', dest_en: 'B', dest_tc: '乙' },
  ], '1', 20);
  assert.deepEqual(
    exactTies.map((entry) => entry.provider),
    ['KMB', 'CTB', 'GMB', 'MTR'],
    'identically ranked routes must use the documented provider order'
  );

  const partial = await catalog.loadRouteCatalog(async (id) => {
    if (id === 'CTB') throw new Error('offline');
    return loadProvider(id);
  });
  assert.equal(partial.errors.CTB, 'offline');
  assert.equal(partial.entries.some((entry) => entry.provider === 'KMB'), true);
  assert.equal(partial.entries.some((entry) => entry.provider === 'MTR'), true);
  console.log('route-catalog.test.cjs: PASS');
})().catch((error) => { console.error(error); process.exit(1); });
