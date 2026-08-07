const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const DIR = path.join(ROOT, 'public', 'data', 'journey');
const EYE_HOSPITAL = { lat: 22.3150, lng: 114.1810 };
const SCHOOL_VILLAGE = { lat: 22.3420, lng: 114.1980 };

function fail(message) {
  console.error(`journey-index verification failed: ${message}`);
  process.exit(1);
}

function read(name) {
  const file = path.join(DIR, name);
  if (!fs.existsSync(file)) fail(`missing ${name}`);
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    fail(`${name} is invalid JSON: ${error.message}`);
  }
}

function haversineMeters(a, b) {
  const R = 6_371_000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) *
      Math.cos((b.lat * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

const meta = read('meta.json');
const hubs = read('hubs.json');
const cells = read('cells.json');
const routes = read('routes.json');
const routeNeighbors = read('route-neighbors.json');

if (meta.schemaVersion !== 1) fail(`unexpected schemaVersion ${meta.schemaVersion}`);
if (!Array.isArray(hubs) || hubs.length <= 1000) fail(`expected >1000 hubs, got ${hubs?.length || 0}`);
if (!routes || Object.keys(routes).length <= 100) fail(`expected >100 routes, got ${Object.keys(routes || {}).length}`);
if (!cells || Object.keys(cells).length <= 100) fail(`expected >100 cells, got ${Object.keys(cells || {}).length}`);
if (!routeNeighbors || typeof routeNeighbors !== 'object') fail('route-neighbors.json must be an object');

const hubById = new Map(hubs.map((hub) => [hub.id, hub]));
const routeEntries = Object.entries(routes);
for (const [routeKey, route] of routeEntries) {
  if (!Array.isArray(route.hubs) || route.hubs.length < 2) fail(`${routeKey} has too few hubs`);
  if (!Array.isArray(route.cumulativeMinutes) || route.cumulativeMinutes.length !== route.hubs.length) {
    fail(`${routeKey} cumulativeMinutes length does not match hubs`);
  }
  for (let index = 0; index < route.cumulativeMinutes.length; index += 1) {
    const value = Number(route.cumulativeMinutes[index]);
    if (!Number.isFinite(value)) fail(`${routeKey} has non-finite cumulative time`);
    if (index > 0 && value < Number(route.cumulativeMinutes[index - 1])) {
      fail(`${routeKey} cumulativeMinutes is not monotonic`);
    }
  }
}

const route203E = routeEntries
  .filter(([key]) => key === 'KMB:203E:O' || key === 'KMB:203E:I')
  .map(([, route]) => route);
if (!route203E.length) fail('KMB 203E route is missing');

let regressionOk = false;
for (const route of route203E) {
  let eyeSeq = -1;
  let schoolSeq = -1;
  route.hubs.forEach((hubId, index) => {
    const hub = hubById.get(hubId);
    if (!hub || !Number.isFinite(hub.lat) || !Number.isFinite(hub.lng) || hub.lat === 0 || hub.lng === 0) return;
    const point = { lat: hub.lat, lng: hub.lng };
    if (eyeSeq < 0 && haversineMeters(point, EYE_HOSPITAL) <= 500) eyeSeq = index;
    if (eyeSeq >= 0 && index > eyeSeq && haversineMeters(point, SCHOOL_VILLAGE) <= 700) schoolSeq = index;
  });
  if (eyeSeq >= 0 && schoolSeq > eyeSeq) {
    regressionOk = true;
    break;
  }
}
if (!regressionOk) fail('203E does not connect the Eye Hospital area to a later School Village area hub');

console.log(`journey-index verification: PASS (${hubs.length} hubs, ${Object.keys(routes).length} routes, ${Object.keys(cells).length} cells)`);
