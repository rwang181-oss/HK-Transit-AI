const assert = require('node:assert/strict');
const versions = require('../../.core-test-dist/utils/versionMonitor.js');

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

test('matching build identifiers do not reload', () => {
  assert.equal(
    versions.shouldReloadVersion('build-a', 'build-a', null, 1_000),
    false
  );
});

test('a different valid build reloads immediately', () => {
  assert.equal(
    versions.shouldReloadVersion('build-a', 'build-b', null, 1_000),
    true
  );
});

test('the same target build is protected from a five minute reload loop', () => {
  const guard = { targetBuildId: 'build-b', reloadedAt: 1_000 };
  assert.equal(
    versions.shouldReloadVersion('build-a', 'build-b', guard, 1_000 + 4 * 60_000),
    false
  );
  assert.equal(
    versions.shouldReloadVersion('build-a', 'build-b', guard, 1_000 + 6 * 60_000),
    true
  );
});

test('missing or malformed build identifiers are ignored', () => {
  assert.equal(versions.shouldReloadVersion('', 'build-b', null, 1_000), false);
  assert.equal(versions.shouldReloadVersion('build-a', '', null, 1_000), false);
  assert.equal(versions.shouldReloadVersion('build-a', '   ', null, 1_000), false);
});

test('version payload parser accepts only a non-empty build identifier', () => {
  assert.deepEqual(
    versions.parseVersionPayload({ buildId: 'abc', commitSha: '123', builtAt: 'now' }),
    { buildId: 'abc', commitSha: '123', builtAt: 'now' }
  );
  assert.equal(versions.parseVersionPayload({ buildId: '' }), null);
  assert.equal(versions.parseVersionPayload(null), null);
});

test('reload URL preserves route, query, and hash while replacing build id', () => {
  const result = versions.buildVersionReloadUrl(
    'https://rwang181-oss.github.io/HK-Transit-AI/journey/result?fromLat=22.3&build=old#details',
    'build-new'
  );
  const url = new URL(result);
  assert.equal(url.pathname, '/HK-Transit-AI/journey/result');
  assert.equal(url.searchParams.get('fromLat'), '22.3');
  assert.deepEqual(url.searchParams.getAll('build'), ['build-new']);
  assert.equal(url.hash, '#details');
});

test('reload URL adds a build id when none exists', () => {
  const result = versions.buildVersionReloadUrl(
    'https://rwang181-oss.github.io/HK-Transit-AI/',
    'build-new'
  );
  const url = new URL(result);
  assert.equal(url.searchParams.get('build'), 'build-new');
});

(async () => {
  for (const { name, fn } of tests) {
    await fn();
    console.log(`✓ ${name}`);
  }
  console.log(`\n${tests.length} version monitor tests passed.`);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
