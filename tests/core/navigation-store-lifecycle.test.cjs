const assert = require('node:assert/strict');
const path = require('node:path');
const Module = require('node:module');

const startResolvers = [];
const retryResolvers = [];
let activeListener = null;
let trackingStops = 0;
const originalLoad = Module._load;

Module._load = function loadForNavigationStore(request, parent, isMain) {
  if (request === './locationStore') {
    return {
      useLocationStore: {
        getState: () => ({
          startTracking: () => new Promise((resolve) => startResolvers.push(resolve)),
          stopTracking: () => { trackingStops += 1; },
          retryTracking: () => new Promise((resolve) => retryResolvers.push(resolve)),
          status: 'tracking',
          subscribeSamples: (listener) => {
            activeListener = listener;
            return () => {
              if (activeListener === listener) activeListener = null;
            };
          },
        }),
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
    const starting = useNavigationStore.getState().start(option, destination);
    const staleListener = activeListener;
    useNavigationStore.getState().stop();
    startResolvers.shift()();
    await starting;
    assert.equal(useNavigationStore.getState().phase, 'idle',
      'a late shared-location start must not restore navigation after stop');
    assert.equal(useNavigationStore.getState().error, null);
    assert.equal(activeListener, null, 'stop must remove the shared sample subscription');

    staleListener({
      position: { lat: 22.3, lng: 114.1 },
      accuracyMeters: 5,
      timestampMs: 1_000_000,
    });
    assert.equal(useNavigationStore.getState().currentPosition, null,
      'a stale shared sample cannot update a stopped journey');
    assert.ok(trackingStops >= 1, 'stop delegates foreground watcher cleanup to the shared store');

    const restarted = useNavigationStore.getState().start(option, destination);
    startResolvers.shift()();
    await restarted;
    const retrying = useNavigationStore.getState().retryLocation();
    useNavigationStore.getState().stop();
    retryResolvers.shift()();
    await retrying;
    assert.equal(useNavigationStore.getState().phase, 'idle');
    assert.equal(useNavigationStore.getState().error, null,
      'a late location retry must not alter a stopped journey');
    console.log('navigation-store-lifecycle.test.cjs: PASS');
  } finally {
    Module._load = originalLoad;
    useNavigationStore.getState().stop();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
