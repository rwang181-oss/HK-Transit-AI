const fs = require('node:fs');
const path = require('node:path');

const MTR_HEADER = [
  'Line Code',
  'Direction',
  'Station Code',
  'Station ID',
  'Chinese Name',
  'English Name',
  'Sequence',
];
const MIN_MTR_ROWS = 200;
const MIN_MTR_STOPS = 90;
const MTR_DIRECTION_PATTERN = /^(?:[A-Z]+-)?(?:DT|UT)$/;

function parseCsvRow(row) {
  const fields = [];
  let field = '';
  let quoted = false;
  for (let index = 0; index < row.length; index += 1) {
    const char = row[index];
    if (char === '"') {
      if (quoted && row[index + 1] === '"') {
        field += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (char === ',' && !quoted) {
      fields.push(field);
      field = '';
    } else {
      field += char;
    }
  }
  fields.push(field);
  return fields;
}

function parseMtrStationsCsv(csv) {
  const rows = String(csv || '')
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .filter((row) => row.trim());
  const header = parseCsvRow(rows.shift() || '');
  if (header.length !== MTR_HEADER.length || header.some((value, index) => value !== MTR_HEADER[index])) {
    throw new Error('Unexpected MTR station CSV header');
  }

  return rows
    .map((row) => parseCsvRow(row))
    .filter((fields) => fields.some((field) => field.trim()))
    .map(([line, dir, code, id, tc, en, rawSeq]) => ({
      line,
      dir,
      code,
      id,
      tc,
      en,
      seq: Number(rawSeq),
    }));
}

function validateMtrStations(stations) {
  if (stations.length < MIN_MTR_ROWS) {
    throw new Error(`MTR station CSV has ${stations.length} valid rows; expected at least ${MIN_MTR_ROWS}`);
  }
  const stopCount = new Set(stations.map((station) => station.code)).size;
  if (stopCount < MIN_MTR_STOPS) {
    throw new Error(`MTR station CSV has ${stopCount} unique stops; expected at least ${MIN_MTR_STOPS}`);
  }

  for (const station of stations) {
    if (!station.line || !station.code) throw new Error('MTR station CSV has a row without a usable route or stop code');
    if (!MTR_DIRECTION_PATTERN.test(station.dir)) {
      throw new Error(`MTR station CSV has unsupported direction ${station.dir || '(blank)'}`);
    }
    if (!Number.isInteger(station.seq) || station.seq <= 0) {
      throw new Error(`MTR station CSV has invalid sequence ${Number.isNaN(station.seq) ? '(blank)' : station.seq}`);
    }
  }

  const routes = new Map();
  for (const station of stations) {
    const routeKey = `${station.line}:${station.dir}`;
    if (!routes.has(routeKey)) routes.set(routeKey, new Map());
    routes.get(routeKey).set(station.seq, station.code);
  }
  const hasAdjacentLink = [...routes.values()].some((stopsBySequence) =>
    [...stopsBySequence.entries()].some(([seq, code]) =>
      stopsBySequence.has(seq + 1) && stopsBySequence.get(seq + 1) !== code,
    ),
  );
  if (!hasAdjacentLink) throw new Error('MTR station CSV does not produce usable adjacent route links');
}

function writeMtrStationsSnapshots(outputDir, csv, { renameSync = fs.renameSync } = {}) {
  const stations = parseMtrStationsCsv(csv);
  validateMtrStations(stations);
  fs.mkdirSync(outputDir, { recursive: true });
  const token = `${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const snapshots = [
    { target: path.join(outputDir, 'mtr_stations.csv'), content: csv },
    { target: path.join(outputDir, 'mtr_stations.json'), content: `${JSON.stringify(stations)}\n` },
  ].map((snapshot) => ({
    ...snapshot,
    temp: path.join(outputDir, `.${path.basename(snapshot.target)}.${token}.tmp`),
    backup: path.join(outputDir, `.${path.basename(snapshot.target)}.${token}.backup`),
    hadOriginal: false,
    replaced: false,
  }));
  let rollbackFailed = false;

  try {
    for (const snapshot of snapshots) fs.writeFileSync(snapshot.temp, snapshot.content);
    for (const snapshot of snapshots) {
      if (fs.existsSync(snapshot.target)) {
        renameSync(snapshot.target, snapshot.backup);
        snapshot.hadOriginal = true;
      }
      renameSync(snapshot.temp, snapshot.target);
      snapshot.replaced = true;
    }
    return stations;
  } catch (error) {
    const rollbackErrors = [];
    for (const snapshot of [...snapshots].reverse()) {
      try {
        if (snapshot.replaced && fs.existsSync(snapshot.target)) fs.rmSync(snapshot.target, { force: true });
        if (snapshot.hadOriginal && fs.existsSync(snapshot.backup)) renameSync(snapshot.backup, snapshot.target);
      } catch (rollbackError) {
        rollbackErrors.push(rollbackError.message);
      }
    }
    if (rollbackErrors.length) {
      rollbackFailed = true;
      throw new Error(`MTR snapshot replacement failed: ${error.message}; rollback failed: ${rollbackErrors.join('; ')}`);
    }
    throw new Error(`MTR snapshot replacement failed and existing snapshots were restored: ${error.message}`);
  } finally {
    for (const snapshot of snapshots) {
      fs.rmSync(snapshot.temp, { force: true });
      if (!rollbackFailed) fs.rmSync(snapshot.backup, { force: true });
    }
  }
}

module.exports = { parseMtrStationsCsv, validateMtrStations, writeMtrStationsSnapshots };
