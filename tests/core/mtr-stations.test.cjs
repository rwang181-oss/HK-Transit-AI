const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { parseMtrStationsCsv, writeMtrStationsSnapshots } = require('../../scripts/mtr-stations.cjs');

const csv = [
  '"Line Code","Direction","Station Code","Station ID","Chinese Name","English Name","Sequence"',
  '"AEL","DT","AWE","56","博覽館","AsiaWorld-Expo",1.00',
  '"DRL","UT","SUN","54","欣澳","Sunny, Bay",2.00',
  ',,,,,,',
].join('\r\n');
const header = '"Line Code","Direction","Station Code","Station ID","Chinese Name","English Name","Sequence"';

function makeTopologyCsv({ seq, dir = 'DT' }) {
  return [
    header,
    ...Array.from({ length: 200 }, (_, index) =>
      `"TST","${dir}","S${index % 90}","${index + 1}","站${index}","Stop ${index}",${seq}`,
    ),
  ].join('\n');
}

assert.deepEqual(parseMtrStationsCsv(csv), [
  { line: 'AEL', dir: 'DT', code: 'AWE', id: '56', tc: '博覽館', en: 'AsiaWorld-Expo', seq: 1 },
  { line: 'DRL', dir: 'UT', code: 'SUN', id: '54', tc: '欣澳', en: 'Sunny, Bay', seq: 2 },
]);

const output = fs.mkdtempSync(path.join(os.tmpdir(), 'hk-transit-mtr-'));
try {
  const csvSnapshot = path.join(output, 'mtr_stations.csv');
  const jsonSnapshot = path.join(output, 'mtr_stations.json');
  const previousCsv = 'existing CSV snapshot\n';
  const previousJson = '[{"existing":true}]\n';
  fs.writeFileSync(csvSnapshot, previousCsv);
  fs.writeFileSync(jsonSnapshot, previousJson);

  const headerOnly = `${header}\n`;
  for (const rejectedCsv of [
    headerOnly,
    'not the official MTR CSV\n',
    makeTopologyCsv({ seq: '' }),
    makeTopologyCsv({ seq: '0' }),
    makeTopologyCsv({ seq: '1.5' }),
    makeTopologyCsv({ seq: '1', dir: 'SIDEWAYS' }),
    makeTopologyCsv({ seq: '1' }),
  ]) {
    assert.throws(() => writeMtrStationsSnapshots(output, rejectedCsv));
    assert.equal(fs.readFileSync(csvSnapshot, 'utf8'), previousCsv);
    assert.equal(fs.readFileSync(jsonSnapshot, 'utf8'), previousJson);
  }

  const currentCsv = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'data', 'mtr_stations.csv'), 'utf8');
  assert.throws(
    () => writeMtrStationsSnapshots(output, currentCsv, {
      renameSync: (from, to) => {
        if (/\.mtr_stations\.json\..+\.tmp$/.test(from) && to === jsonSnapshot) {
          throw new Error('injected second replacement failure');
        }
        fs.renameSync(from, to);
      },
    }),
    /injected second replacement failure/,
  );
  assert.equal(fs.readFileSync(csvSnapshot, 'utf8'), previousCsv);
  assert.equal(fs.readFileSync(jsonSnapshot, 'utf8'), previousJson);
  assert.deepEqual(
    fs.readdirSync(output).filter((name) => name.includes('.tmp') || name.includes('.backup')),
    [],
  );

  const rows = writeMtrStationsSnapshots(output, currentCsv);
  assert.ok(rows.length >= 200);
  assert.ok(new Set(rows.map((station) => station.code)).size >= 90);
  assert.equal(fs.readFileSync(csvSnapshot, 'utf8'), currentCsv);
  assert.deepEqual(
    JSON.parse(fs.readFileSync(jsonSnapshot, 'utf8')),
    rows,
  );
} finally {
  fs.rmSync(output, { recursive: true, force: true });
}

console.log('mtr-stations.test.cjs: PASS');
