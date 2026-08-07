#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');

const BASE = 'https://data.etabus.gov.hk/v1/transport/kmb';
const OUT = path.join(__dirname, '..', 'src', 'data', 'kmb.json');
const RETRIES = 3;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function getJson(url, attempt = 1) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 45_000);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) throw new Error(`${response.status} ${response.statusText} ${url}`);
    return await response.json();
  } catch (error) {
    if (attempt >= RETRIES) throw error;
    await sleep(750 * attempt);
    return getJson(url, attempt + 1);
  } finally {
    clearTimeout(timer);
  }
}

async function main() {
  const [stopPayload, routeStopPayload] = await Promise.all([
    getJson(`${BASE}/stop`),
    getJson(`${BASE}/route-stop`),
  ]);

  const stops = (stopPayload.data || [])
    .map((stop) => ({
      stopId: String(stop.stop || ''),
      name_en: stop.name_en || '',
      name_tc: stop.name_tc || '',
      name_sc: stop.name_sc || '',
      lat: Number(stop.lat) || 0,
      lng: Number(stop.long) || 0,
    }))
    .filter((stop) => stop.stopId && stop.lat && stop.lng);

  const routeStops = (routeStopPayload.data || [])
    .map((link) => ({
      route: String(link.route || ''),
      bound: link.bound === 'I' ? 'I' : 'O',
      seq: Number(link.seq) || 0,
      stopId: String(link.stop || ''),
    }))
    .filter((link) => link.route && link.stopId && link.seq > 0);

  if (stops.length < 1000 || routeStops.length < 10000) {
    throw new Error(
      `KMB snapshot unexpectedly small: ${stops.length} stops, ${routeStops.length} route-stop links`
    );
  }

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(
    OUT,
    `${JSON.stringify({
      schemaVersion: 2,
      generatedAt: new Date().toISOString(),
      stops,
      routeStops,
    })}\n`
  );

  const sizeMb = (fs.statSync(OUT).size / 1024 / 1024).toFixed(2);
  console.log(`KMB snapshot saved: ${stops.length} stops, ${routeStops.length} links, ${sizeMb} MB`);
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
