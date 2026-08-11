const assert = require('node:assert/strict');
const progress = require('../../.core-test-dist/journey/realtime/navigationProgress.js');

const direct = [
  {
    kind: 'ride',
    fromHubId: 'A',
    toHubId: 'B',
    fromName: 'A',
    toName: 'B',
    fromLat: 1,
    fromLng: 2,
    toLat: 3,
    toLng: 4,
    minutes: 30,
  },
];
const transfer = [
  {
    kind: 'ride',
    fromHubId: 'A',
    toHubId: 'X',
    fromName: 'A',
    toName: 'X',
    fromLat: 1,
    fromLng: 2,
    toLat: 5,
    toLng: 6,
    minutes: 10,
  },
  {
    kind: 'transfer',
    fromHubId: 'X',
    toHubId: 'X2',
    fromName: 'X',
    toName: 'X2',
    fromLat: 5,
    fromLng: 6,
    toLat: 5.1,
    toLng: 6.1,
    minutes: 4,
  },
  {
    kind: 'ride',
    fromHubId: 'X2',
    toHubId: 'B',
    fromName: 'X2',
    toName: 'B',
    fromLat: 5.1,
    fromLng: 6.1,
    toLat: 3,
    toLng: 4,
    minutes: 20,
  },
];

let state = { phase: 'walkingToTransit', activeLegIndex: 0 };
assert.deepEqual(
  progress.resolveNavigationTarget(state, direct, { lat: 9, lng: 9, name: 'End' }),
  { id: 'A', name: 'A', lat: 1, lng: 2, kind: 'stop' }
);

state = progress.advanceNavigationProgress(state, transfer);
assert.deepEqual(state, { phase: 'waiting', activeLegIndex: 0 });
state = progress.advanceNavigationProgress(state, transfer);
assert.deepEqual(state, { phase: 'riding', activeLegIndex: 0 });
assert.equal(progress.resolveNavigationTarget(state, transfer, { lat: 9, lng: 9, name: 'End' }).id, 'X');
state = progress.advanceNavigationProgress(state, transfer);
assert.deepEqual(state, { phase: 'walkingTransfer', activeLegIndex: 1 });
assert.deepEqual(
  progress.resolveNavigationTarget(state, transfer, { lat: 9, lng: 9, name: 'End' }),
  { id: 'X2', name: 'X2', lat: 5.1, lng: 6.1, kind: 'stop' }
);
assert.deepEqual(
  progress.resolveRemainingNavigationSegments({ phase: 'walkingTransfer', activeLegIndex: 1 }, transfer),
  { rideMinutes: 20, transferMinutes: 0, transferCount: 0, accessTransferMinutes: 4 }
);
state = progress.advanceNavigationProgress(state, transfer);
state = progress.advanceNavigationProgress(state, transfer);
state = progress.advanceNavigationProgress(state, transfer);
assert.equal(state.phase, 'walkingToDestination');
assert.deepEqual(
  progress.resolveNavigationTarget(state, transfer, { lat: 9, lng: 9, name: 'End' }),
  { id: 'destination', name: 'End', lat: 9, lng: 9, kind: 'end' }
);

assert.equal(
  progress.resolveNavigationTarget(
    { phase: 'walkingToTransit', activeLegIndex: 0 },
    [{ ...direct[0], fromLat: 0 }],
    { lat: 9, lng: 9, name: 'End' }
  ),
  null
);
assert.equal(
  progress.resolveNavigationTarget(
    { phase: 'walkingToDestination', activeLegIndex: 0 },
    direct,
    { lat: Number.NaN, lng: 9, name: 'End' }
  ),
  null
);

console.log('navigation-progress.test.cjs: PASS');
