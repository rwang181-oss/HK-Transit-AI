const assert = require('node:assert/strict');
const path = require('node:path');
const Module = require('node:module');

let sampleListener = null;
let trackingStarts = 0;
let trackingStops = 0;
const originalLoad = Module._load;

const locationStore = {
  getState: () => ({
    startTracking: async () => { trackingStarts += 1; },
    stopTracking: () => { trackingStops += 1; },
    retryTracking: async () => undefined,
    subscribeSamples: (listener) => {
      sampleListener = listener;
      return () => { sampleListener = null; };
    },
    status: 'idle',
  }),
};

Module._load = function loadForNavigationStore(request, parent, isMain) {
  if (request === './locationStore') return { useLocationStore: locationStore };
  if (request === 'expo-location') {
    throw new Error('navigationStore must not import expo-location directly');
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
    return originalLoad(path.resolve(__dirname, '../../.core-test-dist', request.slice('@/src/'.length)), parent, isMain);
  }
  return originalLoad(request, parent, isMain);
};

const { useNavigationStore } = require('../../.core-test-dist/stores/navigationStore.js');
const option = {
  itinerary: { legs: [{
    provider: 'KMB', route: '1', bound: 'O', kind: 'ride', minutes: 10,
    fromHubId: 'A', toHubId: 'B', fromName: 'A', toName: 'B',
    fromLat: 22.3, fromLng: 114.1, toLat: 22.31, toLng: 114.11,
  }] },
  rideMinutes: 10, transferMinutes: 0, transferWaitMinutes: 0,
  walkToStationMeters: 500, walkFromStationMeters: 400,
  departureAtMs: 1_600_000, fallbackHeadwayMinutes: 8, waitStatus: 'live',
};
const destination = { lat: 22.32, lng: 114.12, name: 'End' };

(async () => {
  try {
    await useNavigationStore.getState().start(option, destination);
    assert.equal(trackingStarts, 1, 'navigation must ask the shared location lifecycle to start tracking');
    assert.ok(sampleListener, 'navigation must subscribe to shared samples');

    sampleListener({
      position: { lat: 22.3, lng: 114.1 },
      accuracyMeters: 5,
      speedMps: 1.8,
      timestampMs: 1_000_000,
    });
    assert.deepEqual(useNavigationStore.getState().currentPosition, { lat: 22.3, lng: 114.1 },
      'a shared location sample must update live journey timing and position');
    assert.ok(useNavigationStore.getState().speed.speedMps > 1.25,
      'navigation must feed shared GPS speed into walking-speed recalibration');

    const stopsBefore = trackingStops;
    useNavigationStore.getState().stop();
    assert.equal(trackingStops, stopsBefore + 1, 'stopping navigation must stop shared tracking');
    assert.equal(sampleListener, null, 'stopping navigation must unsubscribe from shared samples');
    console.log('navigation-shared-location.test.cjs: PASS');
  } finally {
    Module._load = originalLoad;
    useNavigationStore.getState().stop();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
