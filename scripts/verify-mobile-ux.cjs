#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const failures = [];
const expect = (condition, message) => { if (!condition) failures.push(message); };

const home = read('app/(tabs)/index.tsx');
const result = read('app/journey/result.tsx');
const map = read('src/components/TransitMap.tsx');
const html = read('app/+html.tsx');
const layout = read('app/_layout.tsx');
const mapPickerPath = path.join(root, 'app/journey/map-picker.tsx');

expect(!home.includes('setTimeout(() => void loadData()'), 'home typing must not schedule loadData or build the transit graph');
expect(!home.includes('<TransitMap'), 'home must not embed the interactive map');
expect(!home.includes('showMap'), 'home must not keep the old inline-map toggle state');
expect(!home.includes("t('home.cityLabel')"), 'home must not render the redundant cityLabel / 為香港而設 copy');
expect(!home.includes('routeDataReady'), 'home must not render route-data-ready status copy');
expect(home.includes('map-picker'), 'home must navigate to the dedicated map picker');
expect(home.includes('styles.fixedAction'), 'home must keep the primary journey action outside the scroll area');
expect(home.indexOf('styles.fixedAction') > home.lastIndexOf('</ScrollView>'), 'fixed journey action must appear after the ScrollView');
expect(!home.includes('heroSubtitle'), 'home must not render the verbose marketing subtitle');
expect(!home.includes('promiseRow'), 'home must not render the three promotional promise cards');
expect(fs.existsSync(mapPickerPath), 'fullscreen journey map picker must exist');
if (fs.existsSync(mapPickerPath)) {
  const picker = read('app/journey/map-picker.tsx');
  expect(picker.includes("import('leaflet')"), 'map picker must lazy-load Leaflet');
  expect(picker.includes("map.on('moveend'"), 'map picker must update selection only when map movement ends');
  expect(picker.includes('voyager'), 'map picker must use CARTO Voyager tiles');
  expect(!picker.includes("map.on('move',"), 'map picker must not update React state on every map move frame');
}
expect(layout.includes('journey/map-picker'), 'root layout must register the fullscreen map picker route');
expect(result.includes('NavigationModal'), 'journey result must present live navigation in a modal');
expect(result.includes('showRouteMap'), 'journey result map must be optional and rendered after route options');
expect(result.indexOf('JourneyOptionCard') < result.indexOf('showRouteMap'), 'route cards must appear before the optional map control');
expect(map.includes('basemaps.cartocdn.com'), 'result map must use CARTO tiles');
expect(html.includes('width=device-width'), 'web HTML must declare a mobile viewport');
expect(html.includes('viewport-fit=cover'), 'web HTML must support iOS safe areas');

if (failures.length) {
  console.error('Mobile UX verification failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log('Mobile UX verification passed.');
