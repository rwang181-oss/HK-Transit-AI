const assert = require('node:assert/strict');
const { assertProviderCoverage } = require('../../scripts/verify-journey-index.cjs');

const completeRoutes = {
  'KMB:1:O': { provider: 'KMB' },
  'CTB:1:O': { provider: 'CTB' },
  'GMB:1:O': { provider: 'GMB' },
  'MTR:ABC:O': { provider: 'MTR' },
};

assert.deepEqual(assertProviderCoverage(completeRoutes), {
  KMB: 1,
  CTB: 1,
  GMB: 1,
  MTR: 1,
});

assert.throws(
  () => assertProviderCoverage({
    'KMB:1:O': { provider: 'KMB' },
    'CTB:1:O': { provider: 'CTB' },
    'MTR:ABC:O': { provider: 'MTR' },
  }),
  /GMB routes are missing from journey index/,
);

console.log('journey-index-provider-coverage.test.cjs: PASS');
