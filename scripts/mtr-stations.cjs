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

  return rows.reduce((stations, row) => {
    const [line, dir, code, id, tc, en, rawSeq] = parseCsvRow(row);
    const seq = Number(rawSeq);
    if (line && dir && code && Number.isFinite(seq)) {
      stations.push({ line, dir, code, id, tc, en, seq });
    }
    return stations;
  }, []);
}

function validateMtrStations(stations) {
  if (stations.length < MIN_MTR_ROWS) {
    throw new Error(`MTR station CSV has ${stations.length} valid rows; expected at least ${MIN_MTR_ROWS}`);
  }
  const stopCount = new Set(stations.map((station) => station.code)).size;
  if (stopCount < MIN_MTR_STOPS) {
    throw new Error(`MTR station CSV has ${stopCount} unique stops; expected at least ${MIN_MTR_STOPS}`);
  }
}

function writeMtrStationsSnapshots(outputDir, csv) {
  const stations = parseMtrStationsCsv(csv);
  validateMtrStations(stations);
  fs.mkdirSync(outputDir, { recursive: true });
  const token = `${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const csvTarget = path.join(outputDir, 'mtr_stations.csv');
  const jsonTarget = path.join(outputDir, 'mtr_stations.json');
  const csvTemp = path.join(outputDir, `.mtr_stations.csv.${token}.tmp`);
  const jsonTemp = path.join(outputDir, `.mtr_stations.json.${token}.tmp`);

  try {
    fs.writeFileSync(csvTemp, csv);
    fs.writeFileSync(jsonTemp, `${JSON.stringify(stations)}\n`);
    fs.renameSync(csvTemp, csvTarget);
    fs.renameSync(jsonTemp, jsonTarget);
    return stations;
  } finally {
    fs.rmSync(csvTemp, { force: true });
    fs.rmSync(jsonTemp, { force: true });
  }
}

module.exports = { parseMtrStationsCsv, validateMtrStations, writeMtrStationsSnapshots };
