const assert = require('node:assert/strict');
const maps = require('../../.core-test-dist/components/transitMapInitialization.js');

const initialization = maps.createTransitMapInitialization({
  center: { lat: 22.2, lng: 114.1 },
  points: [{ lat: 22.2, lng: 114.1, kind: 'stop', label: 'Old' }],
  paths: [],
  followPoint: null,
  followZoom: undefined,
});

initialization.update({
  center: { lat: 22.3, lng: 114.2 },
  points: [{ lat: 22.31, lng: 114.21, kind: 'me', label: 'Latest' }],
  paths: [{ id: 'latest', points: [{ lat: 22.3, lng: 114.2 }, { lat: 22.31, lng: 114.21 }] }],
  followPoint: { lat: 22.31, lng: 114.21 },
  followZoom: 17,
});

assert.deepEqual(initialization.consume(), {
  mapCenter: { lat: 22.31, lng: 114.21 },
  mapZoom: 17,
  points: [{ lat: 22.31, lng: 114.21, kind: 'me', label: 'Latest' }],
  paths: [{ id: 'latest', points: [{ lat: 22.3, lng: 114.2 }, { lat: 22.31, lng: 114.21 }] }],
  shouldFitBounds: false,
});

console.log('transit-map-initialization.test.cjs: PASS');
