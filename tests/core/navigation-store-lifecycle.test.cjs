const assert = require('node:assert/strict');
const path = require('node:path');
const Module = require('node:module');

const permissionRequests = [];
const watchRequests = [];
let watchStarted = 0;
let removed = 0;
const originalLoad = Module._load;

Module._load = function loadForNavigationStore(request, parent, isMain) {
  if (request === 'expo-location') {
    return {
      Accuracy: { Balanced: 1 },
      requestForegroundPermissionsAsync: () => new Promise((resolve) => {
        permissionRequests.push(resolve);
      }),
      watchPositionAsync: (_options, callback) => {
        watchStarted += 1;
        return new Promise((resolve) => watchRequests.push({ callback, resolve }));
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
    return originalLoad(
      path.resolve(__dirname, '../../.core-test-dist', request.slice('@/src/'.length)),
      parent,
      isMain
    );
  }
  return originalLoad(request, parent, isMain);
};

const { useNavigationStore } = require('../../.core-test-dist/stores/navigationStore.js');
const option = {
  itinerary: {
    legs: [{
      provider: 'KMB', route: '1', bound: 'O', kind: 'ride', minutes: 10,
      fromHubId: 'A', toHubId: 'B', fromName: 'A', toName: 'B',
      fromLat: 22.3, fromLng: 114.1, toLat: 22.31, toLng: 114.11,
    }],
  },
  rideMinutes: 10,
  transferMinutes: 0,
  transferWaitMinutes: 0,
  walkToStationMeters: 500,
  walkFromStationMeters: 400,
  departureAtMs: 1_600_000,
  fallbackHeadwayMinutes: 8,
  waitStatus: 'live',
  geometry: [{ lat: 22.3, lng: 114.1 }, { lat: 22.31, lng: 114.11 }],
};
const destination = { lat: 22.32, lng: 114.12, name: 'End' };
const subscription = () => ({ remove: () => { removed += 1; } });
const tick = () => new Promise((resolve) => setImmediate(resolve));

const failures = [];
async function check(name, behavior) {
  try {
    await behavior();
    console.log(`✓ ${name}`);
  } catch (error) {
    failures.push({ name, error });
    console.error(`✗ ${name}`);
    console.error(error);
  } finally {
    useNavigationStore.getState().stop();
    permissionRequests.length = 0;
    while (watchRequests.length) watchRequests.shift().resolve(subscription());
    await tick();
  }
}

(async () => {
  try {
    await check('late permission denial cannot restore an error after stop', async () => {
      const starting = useNavigationStore.getState().start(option, destination);
      useNavigationStore.getState().stop();
      permissionRequests.shift()({ status: 'denied' });
      await starting;
      assert.equal(useNavigationStore.getState().phase, 'idle');
      assert.equal(useNavigationStore.getState().error, null);
    });

    await check('permission granted after stop cannot start a watcher', async () => {
      const startedBefore = watchStarted;
      const starting = useNavigationStore.getState().start(option, destination);
      useNavigationStore.getState().stop();
      permissionRequests.shift()({ status: 'granted' });
      await tick();
      if (watchRequests.length) watchRequests.shift().resolve(subscription());
      await starting;
      assert.equal(useNavigationStore.getState().phase, 'idle');
      assert.equal(watchStarted, startedBefore);
    });

    await check('watcher resolved after stop is removed immediately', async () => {
      const removedBefore = removed;
      const starting = useNavigationStore.getState().start(option, destination);
      permissionRequests.shift()({ status: 'granted' });
      await tick();
      assert.equal(watchRequests.length, 1, 'watch request must be in flight');
      useNavigationStore.getState().stop();
      watchRequests.shift().resolve(subscription());
      await starting;
      assert.equal(useNavigationStore.getState().phase, 'idle');
      assert.equal(removed, removedBefore + 1);
    });

    if (failures.length) throw new Error(`${failures.length} lifecycle behavior(s) failed`);
    console.log('navigation-store-lifecycle.test.cjs: PASS');
  } finally {
    Module._load = originalLoad;
    useNavigationStore.getState().stop();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
