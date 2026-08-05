/**
 * End-to-end smoke test for the journey planner using real data.
 * Loads KMB from API + CTB/GMB/MTR from static snapshots, builds the
 * graph, and plans a few real routes.
 */
const fs = require('fs');
const path = require('path');

const KMB = 'https://data.etabus.gov.hk/v1/transport/kmb';

const ctb = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', 'src', 'data', 'ctb.json'), 'utf8')
);
const gmb = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', 'src', 'data', 'gmb.json'), 'utf8')
);
const mtrRows = JSON.parse(
  fs.readFileSync(
    path.join(__dirname, '..', 'src', 'data', 'mtr_stations.json'),
    'utf8'
  )
);

async function getJson(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return r.json();
}

// ---- replicate mergeStops + buildGraph + planner inline ----
function normalizeName(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/[（(].*?[)）]/g, ' ')
    .replace(/\b(terminus|station|bus stop|public transport interchange|stop)\b/g, ' ')
    .replace(/[站總站巴士公共運輸交匯處]/g, ' ')
    .replace(/[^a-z0-9一-鿿 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function mergeStops(stops) {
  const hubs = [];
  const idx = new Map();
  for (const s of stops) {
    const key = `${s.provider}:${s.stopId}`;
    if (idx.has(key)) continue;
    const norm = normalizeName(`${s.name_en} ${s.name_tc}`);
    let hub = idx.get(`name:${norm}`);
    if (!hub) {
      hub = {
        id: `hub-${hubs.length}`,
        name_en: s.name_en,
        name_tc: s.name_tc,
        lat: s.lat,
        lng: s.lng,
        members: [],
      };
      hubs.push(hub);
      idx.set(`name:${norm}`, hub);
    }
    hub.members.push({ provider: s.provider, stopId: s.stopId });
    idx.set(key, hub);
  }
  return hubs;
}

function haversine(a, b) {
  const R = 6371000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) *
      Math.cos((b.lat * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

function buildGraph(stops, links) {
  const hubs = mergeStops(stops);
  const hubByMember = new Map();
  for (const h of hubs)
    for (const m of h.members) hubByMember.set(`${m.provider}:${m.stopId}`, h);
  const hubById = new Map(hubs.map((h) => [h.id, h]));
  const adjacency = new Map();

  const addEdge = (from, to, weight, provider, route, bound, kind) => {
    if (!adjacency.has(from)) adjacency.set(from, []);
    adjacency.get(from).push({ from, to, weight, provider, route, bound, kind });
  };

  const byRoute = new Map();
  for (const rs of links) {
    const k = `${rs.provider}:${rs.route}:${rs.bound}`;
    if (!byRoute.has(k)) byRoute.set(k, []);
    byRoute.get(k).push(rs);
  }
  for (const links of byRoute.values()) {
    const sorted = links.slice().sort((a, b) => a.seq - b.seq);
    for (let i = 0; i < sorted.length - 1; i++) {
      const a = sorted[i];
      const b = sorted[i + 1];
      const ha = hubByMember.get(`${a.provider}:${a.stopId}`);
      const hb = hubByMember.get(`${b.provider}:${b.stopId}`);
      if (!ha || !hb || ha.id === hb.id) continue;
      let w = 3;
      if (ha.lat && hb.lat) {
        const km = haversine(ha, hb) / 1000;
        w = Math.max(1, (km / 22) * 60 + 0.6);
      }
      addEdge(ha.id, hb.id, w, a.provider, a.route, a.bound, 'ride');
    }
  }
  for (let i = 0; i < hubs.length; i++)
    for (let j = i + 1; j < hubs.length; j++) {
      const a = hubs[i];
      const b = hubs[j];
      if (!a.lat || !b.lat) continue;
      const d = haversine(a, b);
      if (d > 0 && d <= 500) {
        const w = Math.max(1.5, d / 80);
        addEdge(a.id, b.id, w, 'KMB', '', 'O', 'transfer');
        addEdge(b.id, a.id, w, 'KMB', '', 'O', 'transfer');
      }
    }
  return { hubs, adjacency, hubById };
}

function plan(graph, fromId, toId) {
  const dist = new Map();
  const prev = new Map();
  const heap = [[0, fromId]];
  dist.set(fromId, 0);
  const seen = new Set();
  while (heap.length) {
    heap.sort((a, b) => a[0] - b[0]);
    const [cost, id] = heap.shift();
    if (seen.has(id)) continue;
    seen.add(id);
    if (id === toId) break;
    for (const e of graph.adjacency.get(id) || []) {
      const nd = cost + e.weight;
      if (nd < (dist.get(e.to) ?? Infinity)) {
        dist.set(e.to, nd);
        prev.set(e.to, e);
        heap.push([nd, e.to]);
      }
    }
  }
  if (!prev.has(toId)) return null;
  const legs = [];
  let cur = toId;
  while (cur !== fromId) {
    const e = prev.get(cur);
    const fh = graph.hubById.get(e.from);
    const th = graph.hubById.get(cur);
    legs.unshift({
      provider: e.provider,
      route: e.route,
      from: fh.name_en,
      to: th.name_en,
      minutes: Math.round(e.weight),
      kind: e.kind,
    });
    cur = e.from;
  }
  return {
    total: legs.reduce((s, l) => s + l.minutes, 0),
    legs,
  };
}

async function main() {
  console.log('Loading KMB data...');
  const [kmbRoutes, kmbStops, kmbRouteStops] = await Promise.all([
    getJson(`${KMB}/route/`),
    getJson(`${KMB}/stop/`),
    getJson(`${KMB}/route-stop/`),
  ]);
  const kmbStopsArr = kmbStops.data.map((s) => ({
    stopId: s.stop,
    name_en: s.name_en,
    name_tc: s.name_tc,
    lat: s.lat,
    lng: s.long,
    provider: 'KMB',
  }));
  const kmbLinks = kmbRouteStops.data.map((rs) => ({
    provider: 'KMB',
    route: rs.route,
    bound: rs.bound,
    seq: rs.seq,
    stopId: rs.stop,
  }));

  const allStops = [
    ...kmbStopsArr,
    ...ctb.stops.map((s) => ({ ...s, provider: 'CTB' })),
    ...gmb.stops.map((s) => ({ ...s, provider: 'GMB' })),
    ...mtrRows.map((r) => ({
      stopId: r.code,
      name_en: r.en,
      name_tc: r.tc,
      lat: 0,
      lng: 0,
      provider: 'MTR',
    })),
  ];
  const mtrLinks = [];
  for (const line of [...new Set(mtrRows.map((r) => r.line))]) {
    for (const dir of ['UT', 'DT']) {
      const rows = mtrRows
        .filter((r) => r.line === line && r.dir === dir)
        .sort((a, b) => a.seq - b.seq);
      rows.forEach((r, i) =>
        mtrLinks.push({
          provider: 'MTR',
          route: line,
          bound: dir === 'UT' ? 'O' : 'I',
          seq: i + 1,
          stopId: r.code,
        })
      );
    }
  }
  const allLinks = [
    ...kmbLinks,
    ...ctb.routeStops.map((rs) => ({ ...rs, provider: 'CTB' })),
    ...gmb.routeStops.map((rs) => ({ ...rs, provider: 'GMB' })),
    ...mtrLinks,
  ];

  console.log(
    `Stops: ${allStops.length}, Links: ${allLinks.length}, MTR lines: ${[...new Set(mtrRows.map((r) => r.line))].length}`
  );
  const graph = buildGraph(allStops, allLinks);
  console.log(`Hubs: ${graph.hubs.length}, Edges: ${[...graph.adjacency.values()].reduce((s, a) => s + a.length, 0)}`);

  // Find a real test: 紅磡站 (Hung Hom) → 尖沙咀 (Tsim Sha Tsui)
  const findHub = (name) =>
    graph.hubs.find(
      (h) =>
        h.name_en.toLowerCase().includes(name.toLowerCase()) ||
        h.name_tc.includes(name)
    );

  const hh = findHub('Hung Hom');
  const tst = findHub('Tsim Sha Tsui');
  if (hh && tst) {
    console.log(`\nPlan: ${hh.name_en} (${hh.id}) → ${tst.name_en} (${tst.id})`);
    const r = plan(graph, hh.id, tst.id);
    if (r) {
      console.log(`Total ~${r.total} min`);
      for (const l of r.legs)
        console.log(
          `  [${l.provider} ${l.route || 'walk'}] ${l.from} → ${l.to} (~${l.minutes} min)`
        );
    } else {
      console.log('No route found');
    }
  } else {
    console.log('Hung Hom / TST not found in hubs');
    console.log('Sample hubs:', graph.hubs.slice(0, 5).map((h) => h.name_en));
  }

  // Direct: search a specific stop
  const polyu = findHub('PolyU');
  if (polyu) console.log('\nFound PolyU hub:', polyu.name_en);
}

main().catch((e) => {
  console.error('FAILED:', e.message);
  process.exit(1);
});
