const assert = require('node:assert/strict');

const comfort = require('../../.core-test-dist/journey/comfort/comfortEngine.js');
const realtime = require('../../.core-test-dist/journey/realtime/etaEstimator.js');
const merger = require('../../.core-test-dist/journey/graph/stopMerger.js');
const gmbParser = require('../../.core-test-dist/journey/providers/gmbParser.js');
const departureSelector = require('../../.core-test-dist/journey/realtime/departureSelector.js');
const navigationTiming = require('../../.core-test-dist/journey/realtime/navigationTiming.js');
const routeDisplay = require('../../.core-test-dist/journey/providers/routeDisplay.js');
const requestCache = require('../../.core-test-dist/utils/requestCache.js');
const asyncPool = require('../../.core-test-dist/utils/asyncPool.js');

const registeredTests = [];
function test(name, fn) {
  registeredTests.push({ name, fn });
}

const dry = { rainIntensity: 'none', temperatureC: 27, uvIndex: 3, isDaylight: true };
const hot = { rainIntensity: 'none', temperatureC: 33, uvIndex: 10, isDaylight: true };
const wet = { rainIntensity: 'heavy', temperatureC: 27, uvIndex: 1, isDaylight: true };
const shortOutdoor = {
  id: 'short', totalMinutes: 30, walkingMinutes: 5, walkingMeters: 380,
  waitMinutes: 4, transfers: 0, rideMinutesByProvider: { KMB: 21 }
};
const longerIndoor = {
  id: 'indoor', totalMinutes: 34, walkingMinutes: 2, walkingMeters: 140,
  waitMinutes: 2, transfers: 1, rideMinutesByProvider: { MTR: 27, KMB: 3 }
};


test('smart mode follows severe weather before general comfort', () => {
  assert.equal(comfort.smartModeForWeather(wet), 'rain');
  assert.equal(comfort.smartModeForWeather(hot), 'shade');
  assert.equal(comfort.smartModeForWeather({ rainIntensity: 'none', temperatureC: 32, uvIndex: 2, isDaylight: true }), 'indoor');
  assert.equal(comfort.smartModeForWeather(dry), 'recommended');
});

test('fastest mode prefers the shortest total journey', () => {
  const ranked = comfort.rankComfortOptions([longerIndoor, shortOutdoor], 'fastest', dry);
  assert.equal(ranked[0].id, 'short');
});

test('sun mode can prefer less outdoor walking in strong UV', () => {
  const ranked = comfort.rankComfortOptions([shortOutdoor, longerIndoor], 'shade', hot);
  assert.equal(ranked[0].id, 'indoor');
});

test('rain mode can prefer less outdoor walking in heavy rain', () => {
  const ranked = comfort.rankComfortOptions([shortOutdoor, longerIndoor], 'rain', wet);
  assert.equal(ranked[0].id, 'indoor');
});

test('comfort metrics remain transparent estimates', () => {
  const metrics = comfort.calculateComfortMetrics(shortOutdoor, hot);
  assert.equal(metrics.confidence, 'estimated');
  assert.ok(metrics.outdoorExposureMinutes >= shortOutdoor.walkingMinutes);
  assert.ok(metrics.reasons.length > 0);
});

test('walking speed rejects implausible GPS spikes', () => {
  const initial = realtime.createWalkingSpeedState(1.25);
  const next = realtime.updateWalkingSpeed(initial, {
    speedMps: 12,
    accuracyMeters: 8,
    timestampMs: 1000,
  });
  assert.equal(next.speedMps, initial.speedMps);
  assert.equal(next.acceptedSamples, 0);
});

test('walking speed smoothly adapts to valid movement', () => {
  let state = realtime.createWalkingSpeedState(1.25);
  state = realtime.updateWalkingSpeed(state, { speedMps: 1.6, accuracyMeters: 10, timestampMs: 1000 });
  state = realtime.updateWalkingSpeed(state, { speedMps: 1.7, accuracyMeters: 9, timestampMs: 2000 });
  assert.ok(state.speedMps > 1.25 && state.speedMps < 1.7);
  assert.equal(state.acceptedSamples, 2);
});

test('journey ETA uses observed speed for remaining walking distance', () => {
  const slow = realtime.recalculateJourneyEta({
    nowMs: 0, remainingWalkMeters: 600, walkingSpeedMps: 1,
    remainingWaitMinutes: 3, remainingRideMinutes: 10, transferBufferMinutes: 2,
  });
  const fast = realtime.recalculateJourneyEta({
    nowMs: 0, remainingWalkMeters: 600, walkingSpeedMps: 2,
    remainingWaitMinutes: 3, remainingRideMinutes: 10, transferBufferMinutes: 2,
  });
  assert.ok(fast.remainingMinutes < slow.remainingMinutes);
  assert.ok(slow.latestArrivalMs > slow.earliestArrivalMs);
});

test('same-name distant stops are not merged', () => {
  const hubs = merger.mergeStops([
    { stopId: 'a', provider: 'KMB', name_en: 'Central Station', name_tc: '中環站', lat: 22.281, lng: 114.158 },
    { stopId: 'b', provider: 'CTB', name_en: 'Central Station', name_tc: '中環站', lat: 22.35, lng: 114.2 },
  ]);
  assert.equal(hubs.length, 2);
});

test('nearby equivalent stops merge and receive a stable id', () => {
  const input = [
    { stopId: '001', provider: 'KMB', name_en: 'Hung Hom Station', name_tc: '紅磡站', lat: 22.303, lng: 114.181 },
    { stopId: 'HUH', provider: 'MTR', name_en: 'Hung Hom', name_tc: '紅磡', lat: 22.3031, lng: 114.1811 },
  ];
  const a = merger.mergeStops(input);
  const b = merger.mergeStops([...input].reverse());
  assert.equal(a.length, 1);
  assert.equal(b.length, 1);
  assert.equal(a[0].id, b[0].id);
});






test('missing live departures preserve a non-zero wait after the access walk', () => {
  const result = departureSelector.selectDepartureEstimate([], 6, 8);
  assert.deepEqual(result, { minutes: 14, status: 'estimated', catchable: true });
  assert.equal(navigationTiming.waitAfterWalking(result.minutes, 6), 8);
});

test('departure selector uses the first reachable live service', () => {
  const result = departureSelector.selectDepartureEstimate([2, 9, 16], 6, 8);
  assert.deepEqual(result, { minutes: 9, status: 'live', catchable: true });
});

test('departure selector avoids ranking an already missed service as fastest', () => {
  const result = departureSelector.selectDepartureEstimate([1, 3], 6, 8);
  assert.deepEqual(result, { minutes: 14, status: 'estimated', catchable: false });
});





test('time-to-departure is not double counted on top of the walk to the stop', () => {
  assert.equal(navigationTiming.waitAfterWalking(9, 6), 3);
  assert.equal(navigationTiming.waitAfterWalking(4, 6), 0);
});

test('live wait decreases as the clock advances', () => {
  const first = navigationTiming.estimateDynamicDeparture({
    nowMs: 1_000_000,
    departureAtMs: 1_600_000,
    walkMinutes: 2,
    fallbackHeadwayMinutes: 8,
  });
  const later = navigationTiming.estimateDynamicDeparture({
    nowMs: 1_120_000,
    departureAtMs: 1_600_000,
    walkMinutes: 2,
    fallbackHeadwayMinutes: 8,
  });
  assert.ok(later.waitMinutes < first.waitMinutes);
  assert.equal(first.catchable, true);
});

test('slow walking rolls a missed departure to an estimated next service', () => {
  const result = navigationTiming.estimateDynamicDeparture({
    nowMs: 0,
    departureAtMs: 3 * 60_000,
    walkMinutes: 6,
    fallbackHeadwayMinutes: 8,
  });
  assert.equal(result.catchable, false);
  assert.equal(result.status, 'estimated');
  assert.equal(result.waitMinutes, 5);
  assert.equal(result.departureAtMs, 11 * 60_000);
});

test('ride time counts down from the phase start', () => {
  assert.equal(navigationTiming.remainingRideMinutes(18, 0, 5 * 60_000), 13);
  assert.equal(navigationTiming.remainingRideMinutes(18, 0, 30 * 60_000), 0);
});



test('provider internal route keys are presented as public route codes', () => {
  assert.equal(routeDisplay.formatPublicRouteCode('GMB', '10~2000012-I'), '10');
  assert.equal(routeDisplay.formatPublicRouteCode('GMB', '10P-O'), '10P');
  assert.equal(routeDisplay.formatPublicRouteCode('MTR', 'EAL~LMC-UT'), 'EAL');
  assert.equal(routeDisplay.formatPublicRouteCode('KMB', '960'), '960');
});

test('GMB parser flattens enabled route-stop ETA records', () => {
  const rows = gmbParser.parseGmbEtaResponse({
    data: [
      {
        route_id: 2000001,
        route_seq: 1,
        stop_seq: 4,
        enabled: true,
        eta: [
          { timestamp: '2026-08-06T12:00:00+08:00', remarks_en: '', remarks_tc: '' },
          { timestamp: '2026-08-06T12:08:00+08:00', remarks_en: '', remarks_tc: '' },
        ],
      },
    ],
  }, { routeId: '2000001', routeSeq: 1, stopSeq: 4 });
  assert.equal(rows.length, 2);
  assert.equal(rows[0].eta, '2026-08-06T12:00:00+08:00');
});

test('GMB parser filters another direction or stop sequence', () => {
  const rows = gmbParser.parseGmbEtaResponse({
    data: [
      { route_id: 9, route_seq: 2, stop_seq: 3, enabled: true, eta: [{ timestamp: 'x' }] },
      { route_id: 9, route_seq: 1, stop_seq: 3, enabled: true, eta: [{ timestamp: 'y' }] },
    ],
  }, { routeId: '9', routeSeq: 1, stopSeq: 3 });
  assert.deepEqual(rows.map((row) => row.eta), ['y']);
});



test('GMB parser accepts the precise single route-stop response shape', () => {
  const rows = gmbParser.parseGmbEtaResponse({
    data: {
      enabled: true,
      stop_id: 20003337,
      eta: [{ timestamp: '2026-08-06T12:20:00+08:00' }],
    },
  });
  assert.deepEqual(rows.map((row) => row.eta), ['2026-08-06T12:20:00+08:00']);
});



test('GMB parser keeps precise response when route metadata is supplied externally', () => {
  const rows = gmbParser.parseGmbEtaResponse({
    data: { enabled: true, stop_id: 1, eta: [{ timestamp: 'z' }] },
  }, { routeId: '99', routeSeq: 2, stopSeq: 5 });
  assert.deepEqual(rows.map((row) => row.eta), ['z']);
});


test('request cache reuses a fresh value within the ttl', async () => {
  let calls = 0;
  const cache = requestCache.createRequestCache({ now: () => 1_000 });
  const loader = async () => {
    calls += 1;
    return `value-${calls}`;
  };
  assert.equal(await cache.get('key', 5_000, loader), 'value-1');
  assert.equal(await cache.get('key', 5_000, loader), 'value-1');
  assert.equal(calls, 1);
});

test('request cache deduplicates an in-flight request', async () => {
  let release;
  let calls = 0;
  const cache = requestCache.createRequestCache();
  const loader = () => {
    calls += 1;
    return new Promise((resolve) => { release = resolve; });
  };
  const first = cache.get('shared', 1_000, loader);
  const second = cache.get('shared', 1_000, loader);
  assert.equal(calls, 1);
  release('done');
  assert.equal(await first, 'done');
  assert.equal(await second, 'done');
});

test('async pool never exceeds the requested concurrency', async () => {
  let active = 0;
  let peak = 0;
  const values = await asyncPool.mapWithConcurrency([1, 2, 3, 4, 5], 2, async (value) => {
    active += 1;
    peak = Math.max(peak, active);
    await new Promise((resolve) => setTimeout(resolve, 5));
    active -= 1;
    return value * 2;
  });
  assert.deepEqual(values, [2, 4, 6, 8, 10]);
  assert.equal(peak, 2);
});

(async () => {
  let passed = 0;
  for (const { name, fn } of registeredTests) {
    try {
      await fn();
      passed += 1;
      console.log(`✓ ${name}`);
    } catch (error) {
      console.error(`✗ ${name}`);
      throw error;
    }
  }
  console.log(`\n${passed} core tests passed.`);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
