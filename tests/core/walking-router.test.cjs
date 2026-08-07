const assert = require('node:assert/strict');
const walking = require('../../.core-test-dist/journey/walking/walkingRouter.js');

const from = { lat: 22.315, lng: 114.175 };
const to = { lat: 22.32, lng: 114.18 };
const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

test('pedestrian response supplies routed distance and time', async () => {
  const router = walking.createWalkingRouter({
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      json: async () => ({ trip: { summary: { length: 0.84, time: 630 }, legs: [] } }),
    }),
  });
  const result = await router.route(from, to);
  assert.equal(result.source, 'routed');
  assert.equal(result.meters, 840);
  assert.equal(result.minutes, 10.5);
  assert.deepEqual(result.geometry, [from, to]);
});

test('router reuses a successful route within the cache lifetime', async () => {
  let calls = 0;
  let now = 1_000;
  const router = walking.createWalkingRouter({
    now: () => now,
    fetchImpl: async () => {
      calls += 1;
      return {
        ok: true,
        status: 200,
        json: async () => ({ trip: { summary: { length: 0.5, time: 300 }, legs: [] } }),
      };
    },
  });
  await router.route(from, to);
  now += 60_000;
  await router.route(from, to);
  assert.equal(calls, 1);
});

test('timeout falls back to a conservative estimate', async () => {
  const router = walking.createWalkingRouter({
    timeoutMs: 5,
    fetchImpl: async () => new Promise(() => undefined),
  });
  const result = await router.route(from, to);
  assert.equal(result.source, 'estimated');
  assert.ok(result.meters > walking.conservativeWalkingRoute(from, to).meters - 1);
  assert.ok(result.minutes >= 2);
});

test('fallback is longer than straight-line distance and uses seventy metres per minute', () => {
  const result = walking.conservativeWalkingRoute(from, to);
  assert.equal(result.source, 'estimated');
  assert.ok(result.meters > 700);
  assert.equal(result.minutes, Math.max(2, result.meters / 70));
});

(async () => {
  for (const { name, fn } of tests) {
    await fn();
    console.log(`✓ ${name}`);
  }
  console.log(`\n${tests.length} walking router tests passed.`);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
