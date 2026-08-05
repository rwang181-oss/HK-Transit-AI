/**
 * Build-time data crawler for journey planner.
 *
 * CTB and GMB have no bulk stop-list endpoint, so we crawl their
 * route-stop topology + stop details once and snapshot to src/data/.
 * Run: node scripts/fetch-transit-data.js
 */
const fs = require('fs');
const path = require('path');

const OUT_DIR = path.join(__dirname, '..', 'src', 'data');
const CONCURRENCY = 10;

const ctbRoutesUrl = 'https://rt.data.gov.hk/v2/transport/citybus/route/ctb';
const ctbStopUrl = (id) => `https://rt.data.gov.hk/v2/transport/citybus/stop/${id}`;
const ctbRouteStopUrl = (route, dir) =>
  `https://rt.data.gov.hk/v2/transport/citybus/route-stop/ctb/${route}/${dir}`;

const gmbRoutesUrl = 'https://data.etagmb.gov.hk/route';
const gmbRouteUrl = (region, route) =>
  `https://data.etagmb.gov.hk/route/${region}/${route}`;
const gmbRouteStopUrl = (routeId, type) =>
  `https://data.etagmb.gov.hk/route-stop/${routeId}/${type}`;

async function getJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.json();
}

async function mapLimit(items, limit, fn) {
  const results = new Array(items.length);
  let idx = 0;
  const workers = Array.from({ length: limit }, async () => {
    while (idx < items.length) {
      const i = idx++;
      try {
        results[i] = await fn(items[i], i);
      } catch (e) {
        results[i] = null;
      }
    }
  });
  await Promise.all(workers);
  return results.filter(Boolean);
}

// ---------- CTB ----------
async function crawlCtb() {
  const { data: rawRoutes } = await getJson(ctbRoutesUrl);
  console.log(`CTB routes: ${rawRoutes.length}`);

  const routeStopByRoute = await mapLimit(rawRoutes, CONCURRENCY, async (r) => {
    const pair = {};
    for (const dir of ['outbound', 'inbound']) {
      try {
        const { data } = await getJson(ctbRouteStopUrl(r.route, dir));
        pair[dir] = data;
      } catch {
        pair[dir] = [];
      }
    }
    return { route: r.route, pair };
  });

  // Collect unique stop ids
  const stopIds = new Set();
  const routeStops = [];
  for (const { route, pair } of routeStopByRoute) {
    for (const dir of ['outbound', 'inbound']) {
      const bound = dir === 'outbound' ? 'O' : 'I';
      for (const rs of pair[dir] || []) {
        stopIds.add(rs.stop);
        routeStops.push({
          route,
          bound,
          seq: rs.seq,
          stopId: rs.stop,
        });
      }
    }
  }
  console.log(`CTB unique stops: ${stopIds.size}`);

  // Bulk stop detail
  const stops = await mapLimit([...stopIds], CONCURRENCY, async (id) => {
    try {
      const { data } = await getJson(ctbStopUrl(id));
      return {
        stopId: data.stop,
        name_en: data.name_en || '',
        name_tc: data.name_tc || '',
        name_sc: data.name_sc || '',
        lat: parseFloat(data.lat) || 0,
        lng: parseFloat(data.long) || 0,
      };
    } catch {
      return null;
    }
  });

  const routes = rawRoutes
    .filter((r) => r.route)
    .map((r) => ({
      route: r.route,
      bound: 'O',
      orig_en: r.orig_en || '',
      orig_tc: r.orig_tc || '',
      dest_en: r.dest_en || '',
      dest_tc: r.dest_tc || '',
    }));

  fs.writeFileSync(
    path.join(OUT_DIR, 'ctb.json'),
    JSON.stringify({ routes, stops, routeStops })
  );
  console.log(`CTB snapshot: ${routes.length} routes, ${stops.length} stops, ${routeStops.length} links`);
}

// ---------- GMB ----------
async function crawlGmb() {
  const { data } = await getJson(gmbRoutesUrl);
  const regions = data.routes; // { HKI: [], KLN: [], NT: [] }
  console.log(
    `GMB routes: ${Object.entries(regions).map(([k, v]) => `${k}=${v.length}`).join(', ')}`
  );

  const routes = [];
  const routeStops = [];
  const stopMap = new Map(); // stopId -> {name_en, name_tc}

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  for (const [region, routeCodes] of Object.entries(regions)) {
    const details = await mapLimit(routeCodes, 3, async (code) => {
      try {
        const d = await getJson(gmbRouteUrl(region, code));
        await sleep(50);
        return d.data || [];
      } catch {
        return [];
      }
    });
    for (const batch of details) {
      for (const route of batch) {
        for (const dir of route.directions || []) {
          const bound = dir.route_seq === 2 ? 'I' : 'O';
          const routeId = route.route_id;
          const routeKey = `${route.route_code}-${bound}`;
          routes.push({
            route: routeKey,
            bound,
            orig_en: dir.orig_en || '',
            orig_tc: dir.orig_tc || '',
            dest_en: dir.dest_en || '',
            dest_tc: dir.dest_tc || '',
          });
          // route-stop carries stop names
          try {
            const rsData = await getJson(gmbRouteStopUrl(routeId, 1));
            await sleep(50);
            for (const rs of rsData.data.route_stops || []) {
              const sid = String(rs.stop_id);
              if (!stopMap.has(sid)) {
                stopMap.set(sid, {
                  name_en: rs.name_en || '',
                  name_tc: rs.name_tc || '',
                  name_sc: rs.name_sc || '',
                });
              }
              routeStops.push({
                route: routeKey,
                bound,
                seq: rs.stop_seq,
                stopId: sid,
              });
            }
          } catch {
            // skip route-stop for this direction
          }
        }
      }
    }
  }

  // GMB stops: name from route-stop (coordinates unavailable in v1)
  const stops = [...stopMap.entries()].map(([stopId, n]) => ({
    stopId,
    name_en: n.name_en,
    name_tc: n.name_tc,
    name_sc: n.name_sc,
    lat: 0,
    lng: 0,
  }));

  fs.writeFileSync(
    path.join(OUT_DIR, 'gmb.json'),
    JSON.stringify({ routes, stops, routeStops })
  );
  console.log(`GMB snapshot: ${routes.length} routes, ${stops.length} stops, ${routeStops.length} links`);
}

// ---------- MTR stations CSV ----------
async function crawlMtr() {
  const url =
    'https://opendata.mtr.com.hk/data/mtr_lines_and_stations.csv';
  const res = await fetch(url);
  if (!res.ok) throw new Error(`MTR CSV ${res.status}`);
  const csv = await res.text();
  fs.writeFileSync(path.join(OUT_DIR, 'mtr_stations.csv'), csv);
  const lines = csv.trim().split('\n').slice(1);
  console.log(`MTR CSV saved: ${lines.length} rows`);
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  await crawlCtb();
  await crawlGmb();
  await crawlMtr();
  console.log('Done.');
}

main().catch((e) => {
  console.error('FAILED:', e.message);
  process.exit(1);
});
