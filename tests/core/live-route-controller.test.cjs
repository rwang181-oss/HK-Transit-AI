const assert = require('node:assert/strict');
const live = require('../../.core-test-dist/journey/realtime/liveRouteController.js');

const walkingPhases = [
  'walkingToTransit',
  'walkingTransfer',
  'walkingToDestination',
];
const targetA = { id: 'A', lat: 22.3, lng: 114.2, name: 'A', kind: 'stop' };
const targetB = { id: 'B', lat: 22.301, lng: 114.201, name: 'B', kind: 'stop' };
const origin = { lat: 22.29, lng: 114.19 };

function routedRoute(meters = 100) {
  return { meters, minutes: 2, geometry: [origin, targetA], source: 'routed' };
}

function deferredRoute() {
  const calls = [];
  const resolvers = [];
  const route = (from, to) => new Promise((resolve) => {
    calls.push({ from, to });
    resolvers.push(resolve);
  });
  return { calls, resolvers, route };
}

function flushPromises() {
  return new Promise((resolve) => setImmediate(resolve));
}

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

test('requests routes only during walking phases', async () => {
  const calls = [];
  const controller = live.createLiveRouteController(
    async (from, to) => {
      calls.push({ from, to });
      return routedRoute();
    },
    () => undefined
  );

  for (const phase of ['idle', 'waiting', 'riding', 'arrived']) {
    controller.update({ phase, position: origin, target: targetA });
  }
  assert.equal(calls.length, 0);

  for (const phase of walkingPhases) {
    controller.reset();
    controller.update({ phase, position: origin, target: targetA });
    await flushPromises();
  }
  assert.equal(calls.length, 3);
});

test('uses the default twenty-five-metre reroute threshold', async () => {
  const calls = [];
  const controller = live.createLiveRouteController(
    async (from, to) => {
      calls.push({ from, to });
      return routedRoute();
    },
    () => undefined
  );

  controller.update({ phase: 'walkingToTransit', position: origin, target: targetA });
  await flushPromises();
  controller.update({
    phase: 'walkingToTransit',
    position: { lat: 22.29005, lng: 114.19005 },
    target: targetA,
  });
  assert.equal(calls.length, 1, 'sub-threshold movement must not reroute');

  controller.update({
    phase: 'walkingToTransit',
    position: { lat: 22.2903, lng: 114.1903 },
    target: targetA,
  });
  await flushPromises();
  assert.equal(calls.length, 2, 'movement beyond the threshold must reroute');
});

test('phase and target changes bypass the movement threshold', async () => {
  const calls = [];
  const controller = live.createLiveRouteController(
    async (from, to) => {
      calls.push({ from, to });
      return routedRoute();
    },
    () => undefined,
    { thresholdMeters: 25 }
  );

  controller.update({ phase: 'walkingToTransit', position: origin, target: targetA });
  await flushPromises();
  controller.update({ phase: 'walkingTransfer', position: origin, target: targetA });
  await flushPromises();
  controller.update({ phase: 'walkingTransfer', position: origin, target: targetB });
  await flushPromises();

  assert.equal(calls.length, 3);
  assert.deepEqual(calls[2].to, { lat: targetB.lat, lng: targetB.lng });
});

test('keeps one request active, queues the latest position and ignores stale output', async () => {
  const pending = deferredRoute();
  const results = [];
  const controller = live.createLiveRouteController(
    pending.route,
    (result) => results.push(result),
    { thresholdMeters: 25 }
  );

  controller.update({ phase: 'walkingToTransit', position: origin, target: targetA });
  controller.update({
    phase: 'walkingToTransit',
    position: { lat: 22.291, lng: 114.191 },
    target: targetA,
  });
  const latest = { lat: 22.292, lng: 114.192 };
  controller.update({ phase: 'walkingToTransit', position: latest, target: targetA });

  assert.equal(pending.calls.length, 1, 'new requests must queue while one is active');
  pending.resolvers.shift()({
    meters: 110,
    minutes: 3,
    geometry: [origin, targetA],
    source: 'estimated',
  });
  await flushPromises();

  assert.equal(pending.calls.length, 2, 'the queued request must start after the active one');
  assert.deepEqual(pending.calls[1].from, latest, 'only the latest queued position must route');
  assert.equal(results.length, 0, 'the superseded result must not be emitted');

  pending.resolvers.shift()(routedRoute(80));
  await flushPromises();
  assert.deepEqual(results, [routedRoute(80)]);
});

test('preserves estimated route source and reset invalidates active work', async () => {
  const pending = deferredRoute();
  const results = [];
  const controller = live.createLiveRouteController(pending.route, (result) => results.push(result));

  controller.update({ phase: 'walkingToDestination', position: origin, target: targetA });
  controller.reset();
  pending.resolvers.shift()({
    meters: 120,
    minutes: 4,
    geometry: [origin, targetA],
    source: 'estimated',
  });
  await flushPromises();
  assert.equal(results.length, 0, 'reset work must stay stale when it resolves');

  controller.update({ phase: 'walkingToDestination', position: origin, target: targetA });
  pending.resolvers.shift()({
    meters: 120,
    minutes: 4,
    geometry: [origin, targetA],
    source: 'estimated',
  });
  await flushPromises();
  assert.equal(results.length, 1);
  assert.equal(results[0].source, 'estimated');
});

test('rejects invalid points and invalidates output after leaving a walking phase', async () => {
  const pending = deferredRoute();
  const results = [];
  const controller = live.createLiveRouteController(pending.route, (result) => results.push(result));

  controller.update({
    phase: 'walkingToTransit',
    position: { lat: Number.NaN, lng: 114.19 },
    target: targetA,
  });
  assert.equal(pending.calls.length, 0);

  controller.update({ phase: 'walkingToTransit', position: origin, target: targetA });
  controller.update({ phase: 'riding', position: origin, target: targetA });
  pending.resolvers.shift()(routedRoute());
  await flushPromises();
  assert.equal(results.length, 0, 'a walking result must not emit after the phase changes');
});

(async () => {
  for (const { name, fn } of tests) {
    await fn();
    console.log(`✓ ${name}`);
  }
  console.log('live-route-controller.test.cjs: PASS');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
