const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const DEFAULT_OUT_DIR = path.join(ROOT, 'public', 'data', 'journey');
const CELL_DEGREES = 0.01;
const MERGE_CELL_DEGREES = 0.005;
const MAX_SAME_NAME_MERGE_DISTANCE_M = 350;

const MODE_SPEED = {
  KMB: { kmh: 20, dwell: 0.6, circuity: 1.45 },
  CTB: { kmh: 20, dwell: 0.6, circuity: 1.45 },
  GMB: { kmh: 25, dwell: 0.5, circuity: 1.35 },
  MTR: { kmh: 35, dwell: 1.0, circuity: 1.12 },
};

function cleanStopName(name) {
  return String(name || '')
    .replace(/[（(][A-Za-z]{1,3}\d{3,4}[)）]/g, ' ')
    .replace(/\b[A-Za-z]{1,3}\d{3,4}\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeName(name) {
  return cleanStopName(name)
    .toLowerCase()
    .replace(/[（(].*?[)）]/g, ' ')
    .replace(/\b(terminus|station|bus stop|public transport interchange|stop)\b/g, ' ')
    .replace(/[站總巴士公共運輸交匯處]/g, ' ')
    .replace(/[^a-z0-9一-鿿 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function finiteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function hasCoordinates(value) {
  return Number.isFinite(value.lat) && Number.isFinite(value.lng) && value.lat !== 0 && value.lng !== 0;
}

function haversineMeters(lat1, lng1, lat2, lng2) {
  const R = 6_371_000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function estimateLegMinutes(from, to, provider) {
  if (!hasCoordinates(from) || !hasCoordinates(to)) return 3;
  const meters = haversineMeters(from.lat, from.lng, to.lat, to.lng);
  const km = meters / 1000;
  const config = MODE_SPEED[provider] || MODE_SPEED.KMB;
  return Math.max(1, ((km * config.circuity) / config.kmh) * 60 + config.dwell);
}

function stableHash(input) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

function mergeHubKey(normalizedName, stop) {
  if (!hasCoordinates(stop)) return normalizedName;
  const gx = Math.floor(stop.lng / MERGE_CELL_DEGREES);
  const gy = Math.floor(stop.lat / MERGE_CELL_DEGREES);
  return `${normalizedName}:${gx}:${gy}`;
}

function canMerge(existing, stop) {
  if (!hasCoordinates(existing) || !hasCoordinates(stop)) return true;
  return haversineMeters(existing.lat, existing.lng, stop.lat, stop.lng) <= MAX_SAME_NAME_MERGE_DISTANCE_M;
}

function cellKey(lat, lng) {
  return `${Math.floor(lng / CELL_DEGREES)}:${Math.floor(lat / CELL_DEGREES)}`;
}

function normalizeStop(provider, raw) {
  return {
    stopId: String(raw.stopId || raw.stop || raw.code || ''),
    name_en: String(raw.name_en || raw.nameEn || raw.en || ''),
    name_tc: String(raw.name_tc || raw.nameTc || raw.tc || ''),
    name_sc: String(raw.name_sc || raw.nameSc || raw.sc || ''),
    lat: finiteNumber(raw.lat ?? raw.latitude),
    lng: finiteNumber(raw.lng ?? raw.long ?? raw.longitude),
    provider,
  };
}

function normalizeLink(provider, raw) {
  return {
    route: String(raw.route || raw.line || ''),
    bound: raw.bound === 'I' || raw.direction === 'DT' || raw.dir === 'DT' ? 'I' : 'O',
    seq: finiteNumber(raw.seq),
    stopId: String(raw.stopId || raw.stop || raw.stationCode || raw.code || ''),
    provider,
  };
}

function topologyFromSnapshot(provider, payload) {
  if (provider === 'MTR') {
    const rows = Array.isArray(payload) ? payload : [];
    const stopMap = new Map();
    const links = [];
    for (const row of rows) {
      const stop = normalizeStop('MTR', row);
      if (!stop.stopId) continue;
      if (!stopMap.has(stop.stopId)) stopMap.set(stop.stopId, stop);
      const link = normalizeLink('MTR', row);
      if (link.route && link.seq > 0) links.push(link);
    }
    return { stops: [...stopMap.values()], links };
  }

  const rawStops = Array.isArray(payload?.stops) ? payload.stops : [];
  const rawLinks = Array.isArray(payload?.links)
    ? payload.links
    : Array.isArray(payload?.routeStops)
      ? payload.routeStops
      : [];
  return {
    stops: rawStops.map((stop) => normalizeStop(provider, stop)).filter((stop) => stop.stopId),
    links: rawLinks
      .map((link) => normalizeLink(provider, link))
      .filter((link) => link.route && link.stopId && link.seq > 0),
  };
}

function loadProjectTopologies(rootDir = ROOT) {
  const dataDir = path.join(rootDir, 'src', 'data');
  const read = (name) => JSON.parse(fs.readFileSync(path.join(dataDir, name), 'utf8'));
  return {
    KMB: topologyFromSnapshot('KMB', read('kmb.json')),
    CTB: topologyFromSnapshot('CTB', read('ctb.json')),
    GMB: topologyFromSnapshot('GMB', read('gmb.json')),
    MTR: topologyFromSnapshot('MTR', read('mtr_stations.json')),
  };
}

function mergeStops(topologies, options = {}) {
  const hubs = [];
  const nameIndex = new Map();
  const memberToHub = new Map();
  const idByMember = options.idByMember || {};

  for (const provider of ['KMB', 'CTB', 'GMB', 'MTR']) {
    const topology = topologies[provider];
    if (!topology) continue;
    for (const rawStop of topology.stops || []) {
      const stop = normalizeStop(provider, rawStop);
      const normalized = normalizeName(`${stop.name_en} ${stop.name_tc}`);
      if (!stop.stopId || !normalized) continue;
      const cleanEn = cleanStopName(stop.name_en);
      const cleanTc = cleanStopName(stop.name_tc);
      const cleanSc = cleanStopName(stop.name_sc);
      const candidates = nameIndex.get(normalized) || [];
      let hub = candidates.find((candidate) => canMerge(candidate, stop));

      if (!hub) {
        const memberKey = `${provider}:${stop.stopId}`;
        const id = idByMember[memberKey] || `hub-${stableHash(mergeHubKey(normalized, stop))}`;
        hub = {
          id,
          name_en: cleanEn,
          name_tc: cleanTc,
          name_sc: cleanSc,
          lat: stop.lat,
          lng: stop.lng,
          members: [],
          services: [],
        };
        hubs.push(hub);
        candidates.push(hub);
        nameIndex.set(normalized, candidates);
      } else {
        if (!hub.name_en && cleanEn) hub.name_en = cleanEn;
        if (!hub.name_tc && cleanTc) hub.name_tc = cleanTc;
        if (!hub.name_sc && cleanSc) hub.name_sc = cleanSc;
        if (!hasCoordinates(hub) && hasCoordinates(stop)) {
          hub.lat = stop.lat;
          hub.lng = stop.lng;
        }
      }

      if (!hub.members.some((member) => member.provider === provider && member.stopId === stop.stopId)) {
        hub.members.push({ provider, stopId: stop.stopId });
      }
      memberToHub.set(`${provider}:${stop.stopId}`, hub);
    }
  }

  for (const hub of hubs) {
    hub.members.sort((a, b) => `${a.provider}:${a.stopId}`.localeCompare(`${b.provider}:${b.stopId}`));
  }
  hubs.sort((a, b) => a.id.localeCompare(b.id));
  return { hubs, memberToHub };
}

function buildJourneyIndex(topologies, options = {}) {
  const normalizedTopologies = {};
  for (const [provider, topology] of Object.entries(topologies || {})) {
    if (!topology) continue;
    normalizedTopologies[provider] = {
      stops: (topology.stops || []).map((stop) => normalizeStop(provider, stop)),
      links: (topology.links || topology.routeStops || []).map((link) => normalizeLink(provider, link)),
    };
  }

  const { hubs, memberToHub } = mergeStops(normalizedTopologies, options);
  const hubById = new Map(hubs.map((hub) => [hub.id, hub]));
  const routes = {};
  const grouped = new Map();

  for (const [provider, topology] of Object.entries(normalizedTopologies)) {
    for (const link of topology.links || []) {
      if (!link.route || !link.stopId || link.seq <= 0) continue;
      const routeKey = `${provider}:${link.route}:${link.bound}`;
      if (!grouped.has(routeKey)) grouped.set(routeKey, []);
      grouped.get(routeKey).push(link);
    }
  }

  for (const [routeKey, links] of grouped.entries()) {
    links.sort((a, b) => a.seq - b.seq);
    const first = links[0];
    const hubIds = [];
    for (const link of links) {
      const hub = memberToHub.get(`${link.provider}:${link.stopId}`);
      if (!hub) continue;
      if (hubIds[hubIds.length - 1] === hub.id) continue;
      hubIds.push(hub.id);
    }
    if (hubIds.length < 2) continue;

    const cumulativeMinutes = [0];
    for (let index = 1; index < hubIds.length; index += 1) {
      const previous = hubById.get(hubIds[index - 1]);
      const current = hubById.get(hubIds[index]);
      const segment = previous && current ? estimateLegMinutes(previous, current, first.provider) : 3;
      cumulativeMinutes.push(Number((cumulativeMinutes[index - 1] + segment).toFixed(3)));
    }

    routes[routeKey] = {
      routeKey,
      provider: first.provider,
      route: first.route,
      bound: first.bound,
      hubs: hubIds,
      cumulativeMinutes,
    };

    hubIds.forEach((hubId, seq) => {
      const hub = hubById.get(hubId);
      if (!hub) return;
      if (!hub.services.some((service) => service.routeKey === routeKey && service.seq === seq)) {
        hub.services.push({ routeKey, seq });
      }
    });
  }

  const cells = {};
  for (const hub of hubs) {
    hub.services.sort((a, b) => a.routeKey.localeCompare(b.routeKey) || a.seq - b.seq);
    if (!hasCoordinates(hub)) continue;
    const key = cellKey(hub.lat, hub.lng);
    if (!cells[key]) cells[key] = [];
    cells[key].push(hub.id);
  }
  for (const ids of Object.values(cells)) ids.sort();

  const routeNeighbors = {};
  for (const routeKey of Object.keys(routes)) routeNeighbors[routeKey] = [];
  for (const hub of hubs) {
    const services = hub.services.filter((service) => routes[service.routeKey]);
    for (const from of services) {
      const seen = new Set();
      for (const to of services) {
        if (from.routeKey === to.routeKey) continue;
        const signature = `${to.routeKey}|${hub.id}|${from.seq}|${to.seq}`;
        if (seen.has(signature)) continue;
        seen.add(signature);
        routeNeighbors[from.routeKey].push({
          toRouteKey: to.routeKey,
          hubId: hub.id,
          fromSeq: from.seq,
          toSeq: to.seq,
        });
      }
    }
  }
  for (const neighbors of Object.values(routeNeighbors)) {
    neighbors.sort((a, b) =>
      a.toRouteKey.localeCompare(b.toRouteKey) ||
      a.fromSeq - b.fromSeq ||
      a.toSeq - b.toSeq ||
      a.hubId.localeCompare(b.hubId)
    );
  }

  const meta = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    hubCount: hubs.length,
    routeCount: Object.keys(routes).length,
    cellCount: Object.keys(cells).length,
  };

  return { meta, hubs, cells, routes, routeNeighbors };
}

function writeJourneyIndex(index, outDir = DEFAULT_OUT_DIR) {
  fs.mkdirSync(outDir, { recursive: true });
  const files = {
    'meta.json': index.meta,
    'hubs.json': index.hubs,
    'cells.json': index.cells,
    'routes.json': index.routes,
    'route-neighbors.json': index.routeNeighbors,
  };
  for (const [name, value] of Object.entries(files)) {
    const file = path.join(outDir, name);
    fs.writeFileSync(file, JSON.stringify(value));
    console.log(`journey-index ${name}: ${fs.statSync(file).size} bytes`);
  }
}

function main() {
  const topologies = loadProjectTopologies();
  const index = buildJourneyIndex(topologies);
  writeJourneyIndex(index);
  console.log(`journey-index ready: ${index.hubs.length} hubs, ${Object.keys(index.routes).length} routes, ${Object.keys(index.cells).length} cells`);
}

if (require.main === module) main();

module.exports = {
  buildJourneyIndex,
  writeJourneyIndex,
  cellKey,
  topologyFromSnapshot,
  loadProjectTopologies,
};
