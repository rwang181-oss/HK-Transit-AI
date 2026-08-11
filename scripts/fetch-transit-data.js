/**
 * Refresh static transit topology used by the local-first journey planner.
 *
 * Run: npm run data:refresh
 *
 * The script performs network requests only at build/maintenance time. End
 * users read the generated snapshots locally and call operator ETA endpoints
 * directly for live arrivals.
 */
const fs = require('node:fs');
const path = require('node:path');
const { writeMtrStationsSnapshots } = require('./mtr-stations.cjs');

const OUT_DIR = path.join(__dirname, '..', 'src', 'data');
const CONCURRENCY = 8;
const RETRIES = 3;

const ctbRoutesUrl = 'https://rt.data.gov.hk/v2/transport/citybus/route/ctb';
const ctbStopUrl = (id) => `https://rt.data.gov.hk/v2/transport/citybus/stop/${id}`;
const ctbRouteStopUrl = (route, dir) =>
  `https://rt.data.gov.hk/v2/transport/citybus/route-stop/ctb/${route}/${dir}`;

const gmbRoutesUrl = 'https://data.etagmb.gov.hk/route';
const gmbRouteUrl = (region, route) =>
  `https://data.etagmb.gov.hk/route/${region}/${encodeURIComponent(route)}`;
const gmbRouteStopUrl = (routeId, routeSeq) =>
  `https://data.etagmb.gov.hk/route-stop/${routeId}/${routeSeq}`;
const gmbStopUrl = (stopId) => `https://data.etagmb.gov.hk/stop/${stopId}`;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function getJson(url, attempt = 1) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) throw new Error(`${response.status} ${url}`);
    return await response.json();
  } catch (error) {
    if (attempt >= RETRIES) throw error;
    await sleep(350 * 2 ** (attempt - 1));
    return getJson(url, attempt + 1);
  } finally {
    clearTimeout(timer);
  }
}

async function mapLimit(items, limit, fn) {
  const results = new Array(items.length);
  let index = 0;
  const workers = Array.from({ length: limit }, async () => {
    while (index < items.length) {
      const current = index++;
      try {
        results[current] = await fn(items[current], current);
      } catch (error) {
        console.warn(`Skipped item ${current}: ${error.message}`);
        results[current] = null;
      }
    }
  });
  await Promise.all(workers);
  return results.filter(Boolean);
}

function writeSnapshot(name, payload) {
  fs.writeFileSync(
    path.join(OUT_DIR, name),
    `${JSON.stringify({
      schemaVersion: 2,
      generatedAt: new Date().toISOString(),
      ...payload,
    })}\n`
  );
}

async function crawlCtb() {
  const { data: rawRoutes = [] } = await getJson(ctbRoutesUrl);
  console.log(`CTB routes: ${rawRoutes.length}`);

  const topology = await mapLimit(rawRoutes, CONCURRENCY, async (route) => {
    const pair = {};
    for (const direction of ['outbound', 'inbound']) {
      try {
        const response = await getJson(ctbRouteStopUrl(route.route, direction));
        pair[direction] = response.data || [];
      } catch {
        pair[direction] = [];
      }
    }
    return { meta: route, pair };
  });

  const routes = [];
  const routeStops = [];
  const stopIds = new Set();
  for (const { meta, pair } of topology) {
    for (const direction of ['outbound', 'inbound']) {
      const links = pair[direction] || [];
      if (!links.length) continue;
      const bound = direction === 'outbound' ? 'O' : 'I';
      routes.push({
        route: meta.route,
        bound,
        orig_en: bound === 'O' ? meta.orig_en || '' : meta.dest_en || '',
        orig_tc: bound === 'O' ? meta.orig_tc || '' : meta.dest_tc || '',
        dest_en: bound === 'O' ? meta.dest_en || '' : meta.orig_en || '',
        dest_tc: bound === 'O' ? meta.dest_tc || '' : meta.orig_tc || '',
      });
      for (const link of links) {
        stopIds.add(String(link.stop));
        routeStops.push({
          route: meta.route,
          bound,
          seq: Number(link.seq),
          stopId: String(link.stop),
        });
      }
    }
  }

  const stops = await mapLimit([...stopIds], CONCURRENCY, async (stopId) => {
    const response = await getJson(ctbStopUrl(stopId));
    const stop = response.data || {};
    return {
      stopId: String(stop.stop || stopId),
      name_en: stop.name_en || '',
      name_tc: stop.name_tc || '',
      name_sc: stop.name_sc || '',
      lat: Number(stop.lat) || 0,
      lng: Number(stop.long) || 0,
    };
  });

  writeSnapshot('ctb.json', { routes, stops, routeStops });
  console.log(`CTB snapshot: ${routes.length} directions, ${stops.length} stops, ${routeStops.length} links`);
}

async function crawlGmb() {
  const response = await getJson(gmbRoutesUrl);
  const regions = response?.data?.routes || {};
  const routeRequests = [];
  for (const [region, routeCodes] of Object.entries(regions)) {
    for (const routeCode of routeCodes) routeRequests.push({ region, routeCode });
  }
  console.log(`GMB route codes: ${routeRequests.length}`);

  const routeDetails = await mapLimit(routeRequests, 3, async ({ region, routeCode }) => {
    const detail = await getJson(gmbRouteUrl(region, routeCode));
    await sleep(40);
    return { region, routeCode, variations: detail.data || [] };
  });

  const directionRequests = [];
  for (const detail of routeDetails) {
    for (const variation of detail.variations) {
      for (const direction of variation.directions || []) {
        directionRequests.push({
          region: detail.region,
          routeCode: variation.route_code || detail.routeCode,
          sourceRouteId: String(variation.route_id),
          routeSeq: Number(direction.route_seq),
          direction,
        });
      }
    }
  }

  const topologies = await mapLimit(directionRequests, 4, async (item) => {
    const payload = await getJson(gmbRouteStopUrl(item.sourceRouteId, item.routeSeq));
    await sleep(35);
    return { ...item, routeStops: payload?.data?.route_stops || [] };
  });

  const routes = [];
  const routeStops = [];
  const stopNames = new Map();
  for (const item of topologies) {
    const bound = item.routeSeq === 2 ? 'I' : 'O';
    // Keep route variations distinct in the graph while hiding this internal
    // suffix from passenger-facing copy via formatPublicRouteCode().
    const routeKey = `${item.routeCode}~${item.sourceRouteId}-${bound}`;
    routes.push({
      route: routeKey,
      bound,
      orig_en: item.direction.orig_en || '',
      orig_tc: item.direction.orig_tc || '',
      dest_en: item.direction.dest_en || '',
      dest_tc: item.direction.dest_tc || '',
      sourceRouteId: item.sourceRouteId,
      routeSeq: item.routeSeq,
      region: item.region,
    });
    for (const stop of item.routeStops) {
      const stopId = String(stop.stop_id);
      stopNames.set(stopId, {
        name_en: stop.name_en || '',
        name_tc: stop.name_tc || '',
        name_sc: stop.name_sc || '',
      });
      routeStops.push({
        route: routeKey,
        bound,
        seq: Number(stop.stop_seq),
        stopId,
        sourceRouteId: item.sourceRouteId,
        routeSeq: item.routeSeq,
        stopSeq: Number(stop.stop_seq),
      });
    }
  }

  const stops = await mapLimit([...stopNames.entries()], CONCURRENCY, async ([stopId, names]) => {
    const payload = await getJson(gmbStopUrl(stopId));
    const wgs84 = payload?.data?.coordinates?.wgs84 || {};
    return {
      stopId,
      ...names,
      lat: Number(wgs84.latitude) || 0,
      lng: Number(wgs84.longitude) || 0,
    };
  });

  writeSnapshot('gmb.json', { routes, stops, routeStops });
  console.log(`GMB snapshot: ${routes.length} directions, ${stops.length} stops, ${routeStops.length} links`);
}

async function crawlMtr() {
  const url = 'https://opendata.mtr.com.hk/data/mtr_lines_and_stations.csv';
  const response = await fetch(url);
  if (!response.ok) throw new Error(`MTR CSV ${response.status}`);
  const csv = await response.text();
  const stations = writeMtrStationsSnapshots(OUT_DIR, csv);
  console.log(`MTR CSV saved: ${csv.trim().split('\n').length - 1} rows`);
  console.log(`MTR station snapshot: ${stations.length} rows`);
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  await crawlCtb();
  await crawlGmb();
  await crawlMtr();
  console.log('Transit snapshots refreshed.');
}

main().catch((error) => {
  console.error('FAILED:', error.stack || error.message);
  process.exit(1);
});
