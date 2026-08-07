const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const better = require('../../.core-test-dist/journey/index/betterResults.js');
const progressive = require('../../.core-test-dist/journey/index/progressivePlanner.js');

function routeOption({ id, total, walk = 500, transfers = 0, routes = ['1'] }) {
  return {
    id,
    totalMinutes: total,
    walkingMeters: walk,
    itinerary: {
      transfers,
      isDirect: transfers === 0,
      legs: routes.map((route) => ({ provider: 'KMB', route, bound: 'O', kind: 'ride' })),
    },
  };
}

assert.equal(
  better.hasMeaningfullyBetterResults(
    [routeOption({ id: 'a', total: 25, transfers: 1, routes: ['A', 'B'] })],
    [routeOption({ id: 'b', total: 30, transfers: 0, routes: ['D'] })],
    'recommended'
  ),
  true,
  'new direct route must trigger the update action'
);

assert.equal(
  better.hasMeaningfullyBetterResults(
    [routeOption({ id: 'a', total: 30, transfers: 2, routes: ['A', 'B', 'C'] })],
    [routeOption({ id: 'b', total: 31, transfers: 1, routes: ['D', 'E'] })],
    'recommended'
  ),
  true,
  'lower transfer count must trigger the update action'
);

assert.equal(
  better.hasMeaningfullyBetterResults(
    [routeOption({ id: 'a', total: 30, transfers: 1, routes: ['A', 'B'] })],
    [routeOption({ id: 'b', total: 25, transfers: 1, routes: ['C', 'D'] })],
    'fastest'
  ),
  true,
  'five-minute improvement at the same transfer level is meaningful'
);

assert.equal(
  better.hasMeaningfullyBetterResults(
    [routeOption({ id: 'a', total: 30, transfers: 1, routes: ['A', 'B'] })],
    [routeOption({ id: 'changed-id', total: 27, transfers: 1, routes: ['A', 'B'] })],
    'fastest'
  ),
  false,
  'tiny ETA drift on the same services must not trigger an update'
);

assert.equal(
  better.hasMeaningfullyBetterResults(
    [routeOption({ id: 'a', total: 30, walk: 900, transfers: 1, routes: ['A', 'B'] })],
    [routeOption({ id: 'b', total: 31, walk: 600, transfers: 1, routes: ['C', 'D'] })],
    'lessWalking'
  ),
  true,
  '300m less walking without extra transfers is meaningful in lessWalking mode'
);

assert.equal(
  better.hasMeaningfullyBetterResults(
    [routeOption({ id: 'a', total: 30, walk: 899, transfers: 1, routes: ['A', 'B'] })],
    [routeOption({ id: 'b', total: 31, walk: 600, transfers: 1, routes: ['C', 'D'] })],
    'lessWalking'
  ),
  false,
  '299m walking improvement must stay below the banner threshold'
);

(async () => {
  const events = [];
  const fakeIndex = { marker: 'index' };
  const initialRoutes = [routeOption({ id: 'initial', total: 30, transfers: 0, routes: ['203E'] })];
  const refinedRoutes = [routeOption({ id: 'refined', total: 24, transfers: 0, routes: ['203E'] })];
  const session = progressive.createProgressiveJourneySession(
    { lat: 22.32, lng: 114.18, name: 'A' },
    { lat: 22.34, lng: 114.20, name: 'B' },
    'recommended',
    {
      loadIndex: async () => { events.push('load'); return fakeIndex; },
      planFast: (index) => { assert.strictEqual(index, fakeIndex); events.push('fast'); return initialRoutes; },
      refine: async (index, initial) => {
        assert.strictEqual(index, fakeIndex);
        assert.strictEqual(initial, initialRoutes);
        events.push('refine');
        return refinedRoutes;
      },
    }
  );

  const initial = await session.initial;
  assert.strictEqual(initial, initialRoutes);
  assert.deepEqual(events, ['load', 'fast'], 'Stage 2 must not run before Stage 1 settles');
  const refined = await session.refined;
  assert.strictEqual(refined, refinedRoutes);
  assert.deepEqual(events, ['load', 'fast', 'refine']);

  const root = path.join(__dirname, '..', '..');
  for (const relative of ['src/journey/index/fastPlanner.ts', 'src/journey/index/progressivePlanner.ts']) {
    const source = fs.readFileSync(path.join(root, relative), 'utf8');
    assert.equal(source.includes('buildGraph'), false, `${relative} must not call buildGraph`);
    assert.equal(source.includes('graphBuilder'), false, `${relative} must not import graphBuilder`);
  }

  console.log('progressive-session.test.cjs: PASS');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
