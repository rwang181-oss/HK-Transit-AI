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

expect(home.includes('showMap'), 'home must lazy-render the map behind a showMap toggle');
expect(home.includes('styles.fixedAction'), 'home must keep the primary journey action outside the scroll area');
expect(home.indexOf('styles.fixedAction') > home.lastIndexOf('</ScrollView>'), 'fixed journey action must appear after the ScrollView');
expect(!home.includes('heroSubtitle'), 'home must not render the verbose marketing subtitle');
expect(!home.includes('promiseRow'), 'home must not render the three promotional promise cards');
expect(result.includes('NavigationModal'), 'journey result must present live navigation in a modal');
expect(result.includes('showRouteMap'), 'journey result map must be optional and rendered after route options');
expect(result.indexOf('JourneyOptionCard') < result.indexOf('showRouteMap'), 'route cards must appear before the optional map control');
expect(map.includes('basemaps.cartocdn.com'), 'map must use high-DPI CARTO tiles');
expect(html.includes('width=device-width'), 'web HTML must declare a mobile viewport');
expect(html.includes('viewport-fit=cover'), 'web HTML must support iOS safe areas');

if (failures.length) {
  console.error('Mobile UX verification failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log('Mobile UX verification passed.');
