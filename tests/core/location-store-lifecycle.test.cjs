const assert = require('node:assert/strict');
const path = require('node:path');
const Module = require('node:module');

const permissionRequests = [];
const currentResponses = [];
const watches = [];
let permissionCalls = 0;
let lastKnown = null;
let removed = 0;
let activeWatchCallback = null;
const originalLoad = Module._load;

Module._load = function loadForLocationStore(request, parent, isMain) {
  if (request === 'expo-location') {
    return {
      Accuracy: { Balanced: 1 },
      requestForegroundPermissionsAsync: () => {
        permissionCalls += 1;
        return new Promise((resolve, reject) => permissionRequests.push({ resolve, reject }));
      },
      getLastKnownPositionAsync: async () => lastKnown,
      getCurrentPositionAsync: () => new Promise((resolve, reject) => currentResponses.push({ resolve, reject })),
      watchPositionAsync: (_options, callback) => {
        activeWatchCallback = callback;
        return new Promise((resolve) => watches.push({ callback, resolve }));
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

const { useLocationStore, isUsableLocationSample } = require('../../.core-test-dist/stores/locationStore.js');
const tick = () => new Promise((resolve) => setImmediate(resolve));
const sample = (latitude, longitude, timestamp, accuracy = 12, speed = null) => ({
  timestamp,
  coords: { latitude, longitude, accuracy, speed },
});

async function grant() {
  assert.ok(permissionRequests.length, 'an explicit action must request permission');
  permissionRequests.shift().resolve({ status: 'granted' });
  await tick();
}

async function rejectPermission(error) {
  assert.ok(permissionRequests.length, 'an explicit action must request permission');
  permissionRequests.shift().reject(error);
  await tick();
}

(async () => {
  const originalSetTimeout = global.setTimeout;
  try {
    assert.equal(permissionCalls, 0, 'importing the shared store must not request location permission');
    assert.equal(isUsableLocationSample({
      position: { lat: 22.28, lng: 114.15 }, accuracyMeters: 100, speedMps: null,
      timestampMs: 1_000,
    }, 61_000), true, 'the 60-second and 100-metre usability boundaries are inclusive');
    assert.equal(isUsableLocationSample({
      position: { lat: 22.28, lng: 114.15 }, accuracyMeters: 101, speedMps: null,
      timestampMs: 1_000,
    }, 61_000), false, 'Nearby must reject an inaccurate retained sample');

    const received = [];
    const unsubscribe = useLocationStore.getState().subscribeSamples((next) => received.push(next));
    lastKnown = sample(22.2819, 114.1588, Date.now() - 5_000, 20);
    const locating = useLocationStore.getState().locateOnce();
    await grant();
    assert.equal(useLocationStore.getState().status, 'locating');
    assert.equal(useLocationStore.getState().position.lat, 22.2819,
      'a recent sufficiently accurate last-known sample should be visible while a fresh fix is acquired');
    assert.equal(received.length, 1, 'last-known samples should propagate to subscribers');
    currentResponses.shift().resolve(sample(22.282, 114.159, Date.now(), 8));
    await locating;
    assert.equal(useLocationStore.getState().position.lng, 114.159);
    assert.equal(received.length, 2, 'fresh samples should propagate after the cached sample');
    unsubscribe();

    const scheduled = [];
    global.setTimeout = (callback, delay) => {
      scheduled.push({ callback, delay });
      return scheduled.length;
    };
    lastKnown = null;
    const timedOut = useLocationStore.getState().locateOnce();
    await grant();
    assert.equal(scheduled[0].delay, 12_000, 'first fixes must time out after exactly 12 seconds');
    scheduled[0].callback();
    await timedOut;
    assert.equal(useLocationStore.getState().status, 'timedOut');
    global.setTimeout = originalSetTimeout;

    const retry = useLocationStore.getState().retryLocate();
    await grant();
    currentResponses.pop().resolve(sample(22.283, 114.16, Date.now(), 6));
    await retry;
    assert.equal(useLocationStore.getState().status, 'idle', 'retry should recover from a timed-out first fix');

    const tracking = useLocationStore.getState().startTracking();
    await grant();
    assert.equal(watches.length, 0, 'tracking must wait for the initial current position');
    currentResponses.pop().resolve(sample(22.284, 114.161, Date.now(), 5, 1.8));
    await tick();
    assert.equal(watches.length, 1, 'tracking starts only after the initial current position is available');
    watches.shift().resolve({ remove: () => { removed += 1; } });
    await tracking;
    assert.equal(useLocationStore.getState().status, 'tracking');
    assert.equal(useLocationStore.getState().latestSample.speedMps, 1.8);

    const permissionCallsBeforeReuse = permissionCalls;
    const trackingSample = useLocationStore.getState().latestSample;
    assert.equal((await useLocationStore.getState().locateOnce()), trackingSample,
      'a usable active tracking sample can satisfy My Location without replacing the watcher');
    assert.equal(permissionCalls, permissionCallsBeforeReuse);
    assert.equal(removed, 0, 'one-shot acquisition must not remove active tracking');

    const retainedTrackingSample = useLocationStore.getState().latestSample;
    const currentPermissionCalls = permissionCalls;
    const originalNow = Date.now;
    Date.now = () => retainedTrackingSample.timestampMs + 60_001;
    const failedOneShot = useLocationStore.getState().locateOnce();
    await grant();
    currentResponses.pop().reject(new Error('one-shot failed'));
    assert.equal(await failedOneShot, null);
    Date.now = originalNow;
    assert.equal(permissionCalls, currentPermissionCalls + 1);
    assert.equal(removed, 0, 'a failed one-shot must preserve active navigation tracking');
    assert.equal(useLocationStore.getState().latestSample, retainedTrackingSample,
      'a failed one-shot must preserve the active navigation sample');
    assert.equal(useLocationStore.getState().status, 'tracking');
    assert.equal(useLocationStore.getState().requestError, 'failed',
      'an isolated one-shot failure must remain recoverable while global tracking continues');
    activeWatchCallback(sample(22.285, 114.162, Date.now(), 4, 1.4));
    assert.equal(useLocationStore.getState().latestSample.position.lat, 22.285,
      'the navigation watcher must keep publishing after a separate one-shot fails');

    Date.now = () => useLocationStore.getState().latestSample.timestampMs + 60_001;
    const rejectedPermissionOneShot = useLocationStore.getState().locateOnce();
    await rejectPermission(new Error('permission service failed'));
    assert.equal(await rejectedPermissionOneShot, null);
    assert.equal(useLocationStore.getState().requestError, 'failed');
    assert.equal(useLocationStore.getState().status, 'tracking',
      'a rejected permission API must not downgrade established tracking');
    assert.equal(removed, 0);
    activeWatchCallback(sample(22.2855, 114.1625, Date.now(), 4, 1.3));
    assert.equal(useLocationStore.getState().latestSample.position.lat, 22.2855,
      'the watcher must keep publishing after a permission API rejection');

    const deniedOneShot = useLocationStore.getState().locateOnce();
    assert.equal(useLocationStore.getState().requestError, null,
      'a new user request clears the previous request error');
    permissionRequests.shift().resolve({ status: 'denied' });
    assert.equal(await deniedOneShot, null);
    assert.equal(useLocationStore.getState().status, 'tracking');
    assert.equal(useLocationStore.getState().requestError, 'denied');
    assert.equal(removed, 0);

    const activeTimeouts = [];
    global.setTimeout = (callback, delay) => {
      activeTimeouts.push({ callback, delay });
      return activeTimeouts.length + 50;
    };
    const timedOutOneShot = useLocationStore.getState().locateOnce();
    await grant();
    assert.equal(activeTimeouts[0].delay, 12_000);
    activeTimeouts[0].callback();
    assert.equal(await timedOutOneShot, null);
    assert.equal(useLocationStore.getState().status, 'tracking');
    assert.equal(useLocationStore.getState().requestError, 'timedOut');
    assert.equal(removed, 0, 'a timed-out isolated one-shot must not stop navigation tracking');
    Date.now = originalNow;
    global.setTimeout = originalSetTimeout;

    useLocationStore.getState().stopTracking();
    assert.equal(removed, 1, 'stopping shared tracking removes its foreground subscription');

    const permissionCallsBeforePendingTrack = permissionCalls;
    const pendingTrack = useLocationStore.getState().startTracking();
    await grant();
    const locateDuringTrack = useLocationStore.getState().locateOnce();
    assert.equal(permissionCalls, permissionCallsBeforePendingTrack + 1,
      'a one-shot consumer must queue behind a pending tracking acquisition instead of cancelling it');
    const pendingTrackFix = sample(22.286, 114.163, Date.now(), 7);
    currentResponses.pop().resolve(pendingTrackFix);
    await tick();
    watches.shift().resolve({ remove: () => { removed += 1; } });
    assert.deepEqual(await pendingTrack, useLocationStore.getState().latestSample);
    assert.deepEqual(await locateDuringTrack, useLocationStore.getState().latestSample,
      'the queued one-shot may reuse the tracking fix once tracking owns the watcher');
    assert.equal(useLocationStore.getState().status, 'tracking');
    useLocationStore.getState().stopTracking();

    const failedTrack = useLocationStore.getState().startTracking();
    await grant();
    currentResponses.pop().reject(new Error('tracking acquisition failed'));
    assert.equal(await failedTrack, null);
    assert.equal(useLocationStore.getState().status, 'failed');

    const unrelatedLocate = useLocationStore.getState().locateOnce();
    await grant();
    currentResponses.pop().resolve(sample(22.287, 114.164, Date.now(), 6));
    assert.ok(await unrelatedLocate);
    assert.equal(useLocationStore.getState().status, 'idle');

    const explicitTrackingRetry = useLocationStore.getState().retryTracking();
    await grant();
    currentResponses.pop().resolve(sample(22.288, 114.165, Date.now(), 5));
    await tick();
    watches.shift().resolve({ remove: () => { removed += 1; } });
    assert.ok(await explicitTrackingRetry);
    assert.equal(useLocationStore.getState().status, 'tracking',
      'navigation retry intent must remain tracking after another consumer locates once');
    useLocationStore.getState().stopTracking();

    const clearedTimeouts = [];
    const originalClearTimeout = global.clearTimeout;
    global.setTimeout = (callback, delay) => {
      scheduled.push({ callback, delay });
      return scheduled.length + 100;
    };
    global.clearTimeout = (handle) => { clearedTimeouts.push(handle); };
    const pending = useLocationStore.getState().locateOnce();
    await grant();
    useLocationStore.getState().stopTracking();
    assert.equal(await pending, null, 'stopTracking must settle a pending first fix');
    assert.ok(clearedTimeouts.length > 0, 'stopTracking must clear the pending 12-second timeout');

    const permissionCallsBeforeDedupe = permissionCalls;
    const firstPending = useLocationStore.getState().locateOnce();
    await grant();
    const retryPending = useLocationStore.getState().retryLocate();
    assert.equal(permissionCalls, permissionCallsBeforeDedupe + 1,
      'a repeated locate intent must dedupe the pending acquisition');
    currentResponses.pop().resolve(sample(22.287, 114.164, Date.now(), 7));
    assert.ok(await firstPending);
    assert.ok(await retryPending, 'an explicit locate retry should share the pending current fix');
    global.setTimeout = originalSetTimeout;
    global.clearTimeout = originalClearTimeout;

    console.log('location-store-lifecycle.test.cjs: PASS');
  } finally {
    global.setTimeout = originalSetTimeout;
    useLocationStore.getState().stopTracking?.();
    Module._load = originalLoad;
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
