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

function writeMtrStationsSnapshot(outputDir, csv) {
  const stations = parseMtrStationsCsv(csv);
  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(path.join(outputDir, 'mtr_stations.json'), `${JSON.stringify(stations)}\n`);
  return stations;
}

module.exports = { parseMtrStationsCsv, writeMtrStationsSnapshot };
