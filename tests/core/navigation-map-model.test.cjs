const assert = require('node:assert/strict');
const model = require('../../.core-test-dist/journey/realtime/navigationMapModel.js');

const currentPosition = { lat: 22.3, lng: 114.2 };
const target = {
  id: 'A',
  lat: 22.31,
  lng: 114.21,
  name: 'Station A',
  kind: 'stop',
};
const estimatedRoute = {
  meters: 100,
  minutes: 2,
  geometry: [currentPosition, { lat: 22.31, lng: 114.21 }],
  source: 'estimated',
};
const optionGeometry = [
  { lat: 22.29, lng: 114.19 },
  { lat: 22.32, lng: 114.22 },
];

{
  const output = model.buildNavigationMapModel({
    phase: 'walkingToTransit',
    currentPosition,
    target,
    liveRoute: estimatedRoute,
    optionGeometry,
    currentPositionLabel: 'You are here',
  });

  assert.deepEqual(output.points[0], {
    lat: 22.3,
    lng: 114.2,
    kind: 'me',
    label: 'You are here',
  });
  assert.deepEqual(output.points[1], {
    lat: 22.31,
    lng: 114.21,
    kind: 'stop',
    label: 'Station A',
  });
  assert.deepEqual(output.paths, [{
    id: 'live-walking-route',
    points: [{ lat: 22.3, lng: 114.2 }, { lat: 22.31, lng: 114.21 }],
    dashed: true,
  }]);
  assert.equal(output.routeSource, 'estimated');
  assert.deepEqual(output.center, currentPosition);
  console.log('✓ walking map uses the live position, target and honest estimated styling');
}

{
  const output = model.buildNavigationMapModel({
    phase: 'walkingTransfer',
    currentPosition,
    target,
    liveRoute: { ...estimatedRoute, source: 'routed' },
    optionGeometry,
    currentPositionLabel: 'You are here',
  });

  assert.equal(output.paths[0].dashed, false);
  assert.equal(output.routeSource, 'routed');
  console.log('✓ routed walking geometry is solid');
}

for (const phase of ['waiting', 'riding']) {
  const output = model.buildNavigationMapModel({
    phase,
    currentPosition,
    target,
    liveRoute: estimatedRoute,
    optionGeometry,
    currentPositionLabel: 'You are here',
  });

  assert.deepEqual(output.paths, [{
    id: 'journey-context-route',
    points: optionGeometry,
    dashed: false,
  }]);
  assert.equal(output.routeSource, null);
}
console.log('✓ waiting and riding use planned journey geometry as context');

{
  const output = model.buildNavigationMapModel({
    phase: 'arrived',
    currentPosition: null,
    target,
    liveRoute: estimatedRoute,
    optionGeometry,
    currentPositionLabel: 'You are here',
  });

  assert.deepEqual(output.paths, []);
  assert.deepEqual(output.center, { lat: 22.31, lng: 114.21 });
  console.log('✓ arrived removes route lines and locating centres the planned target');
}

console.log('navigation-map-model.test.cjs: PASS');
