const assert = require('node:assert/strict');
const path = require('node:path');
const Module = require('node:module');

let locationCallback = null;
let grantPermission = null;
const originalLoad = Module._load;
Module._load = function loadForNavigationStore(request, parent, isMain) {
  if (request === 'expo-location') {
    return {
      Accuracy: { Balanced: 1 },
      requestForegroundPermissionsAsync: () => new Promise((resolve) => {
        grantPermission = () => resolve({ status: 'granted' });
      }),
      watchPositionAsync: async (_options, callback) => {
        locationCallback = callback;
        return { remove() {} };
      },
    };
  }
  if (request === 'zustand') {
    return {
      create: (initializer) => {
        let state;
        const get = () => state;
        const set = (update) => {
          const value = typeof update === 'function' ? update(state) : update;
          state = { ...state, ...value };
        };
        state = initializer(set, get);
        const store = (selector = (value) => value) => selector(state);
        store.getState = get;
        return store;
      },
    };
  }
  if (request.startsWith('@/src/')) {
    const compiledPath = path.resolve(
      __dirname,
      '../../.core-test-dist',
      request.slice('@/src/'.length)
    );
    return originalLoad(compiledPath, parent, isMain);
  }
  return originalLoad(request, parent, isMain);
};

const { useNavigationStore } = require('../../.core-test-dist/stores/navigationStore.js');

const startMs = 1_000_000;
let nowMs = startMs;
const originalNow = Date.now;
Date.now = () => nowMs;

const option = {
  itinerary: {
    legs: [
      {
        provider: 'KMB', route: '1', bound: 'O', kind: 'ride', minutes: 10,
        fromHubId: 'A', toHubId: 'X', fromName: 'A', toName: 'X',
        fromLat: 22.3, fromLng: 114.1, toLat: 22.31, toLng: 114.11,
      },
      {
        provider: 'CTB', route: '2', bound: 'O', kind: 'ride', minutes: 20,
        fromHubId: 'X', toHubId: 'B', fromName: 'X', toName: 'B',
        fromLat: 22.31, fromLng: 114.11, toLat: 22.32, toLng: 114.12,
      },
    ],
  },
  rideMinutes: 30,
  transferMinutes: 0,
  transferWaitMinutes: 4,
  walkToStationMeters: 500,
  walkFromStationMeters: 400,
  departureAtMs: startMs + 10 * 60_000,
  fallbackHeadwayMinutes: 8,
  waitStatus: 'live',
};
const destination = { lat: 22.33, lng: 114.13, name: 'End' };

function gps(lat, lng, timestamp) {
  assert.ok(locationCallback, 'location subscription should be active');
  locationCallback({
    timestamp,
    coords: { latitude: lat, longitude: lng, speed: 1.2, accuracy: 5 },
  });
}

(async () => {
  try {
    const starting = useNavigationStore.getState().start(option, destination);
    assert.equal(useNavigationStore.getState().option, option,
      'the selected option must be visible while location permission is pending');
    assert.equal(useNavigationStore.getState().phase, 'walkingToTransit',
      'the planned walking stage must be visible while location permission is pending');
    assert.ok(grantPermission, 'location permission should have been requested');
    grantPermission();
    await starting;
    assert.equal(useNavigationStore.getState().phaseStartedAtMs, startMs);

    gps(22.3, 114.1, startMs + 60_000);
    assert.equal(useNavigationStore.getState().phase, 'waiting');
    assert.equal(useNavigationStore.getState().phaseStartedAtMs, startMs);

    nowMs = startMs + 2 * 60_000;
    useNavigationStore.getState().advancePhase();
    assert.equal(useNavigationStore.getState().phase, 'riding');
    assert.equal(useNavigationStore.getState().phaseStartedAtMs, nowMs);

    nowMs = startMs + 12 * 60_000;
    useNavigationStore.getState().advancePhase();
    const transferStartedAtMs = nowMs;
    assert.equal(useNavigationStore.getState().phase, 'walkingTransfer');
    assert.equal(useNavigationStore.getState().phaseStartedAtMs, transferStartedAtMs);

    gps(22.31, 114.11, transferStartedAtMs + 3 * 60_000);
    const waiting = useNavigationStore.getState();
    assert.equal(waiting.phase, 'waiting');
    assert.equal(waiting.activeLegIndex, 1);
    assert.equal(waiting.phaseStartedAtMs, transferStartedAtMs);
    assert.equal(waiting.liveWaitMinutes, 5);

    console.log('navigation-store-progress.test.cjs: PASS');
  } finally {
    Date.now = originalNow;
    Module._load = originalLoad;
    useNavigationStore.getState().stop();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
