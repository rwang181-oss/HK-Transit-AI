const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { parseMtrStationsCsv, writeMtrStationsSnapshot } = require('../../scripts/mtr-stations.cjs');

const csv = [
  '"Line Code","Direction","Station Code","Station ID","Chinese Name","English Name","Sequence"',
  '"AEL","DT","AWE","56","博覽館","AsiaWorld-Expo",1.00',
  '"DRL","UT","SUN","54","欣澳","Sunny, Bay",2.00',
  ',,,,,,',
].join('\r\n');

assert.deepEqual(parseMtrStationsCsv(csv), [
  { line: 'AEL', dir: 'DT', code: 'AWE', id: '56', tc: '博覽館', en: 'AsiaWorld-Expo', seq: 1 },
  { line: 'DRL', dir: 'UT', code: 'SUN', id: '54', tc: '欣澳', en: 'Sunny, Bay', seq: 2 },
]);

const output = fs.mkdtempSync(path.join(os.tmpdir(), 'hk-transit-mtr-'));
try {
  const rows = writeMtrStationsSnapshot(output, csv);
  assert.equal(rows.length, 2);
  assert.deepEqual(
    JSON.parse(fs.readFileSync(path.join(output, 'mtr_stations.json'), 'utf8')),
    rows,
  );
} finally {
  fs.rmSync(output, { recursive: true, force: true });
}

console.log('mtr-stations.test.cjs: PASS');
