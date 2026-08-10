const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const projectRoot = path.resolve(__dirname, '..', '..');
const preload = path.join(__dirname, 'verify-types-spawn-mock.cjs');
const script = path.join(projectRoot, 'scripts', 'verify-types.cjs');
const tsc = require.resolve('typescript/bin/tsc');

function runVerifyTypes(env = {}) {
  const result = spawnSync(
    process.execPath,
    ['--require', preload, script],
    { cwd: projectRoot, encoding: 'utf8', env: { ...process.env, ...env } }
  );
  assert.equal(result.status, 0, `verify-types failed:\n${result.stdout}${result.stderr}`);
  const line = result.stdout.split(/\r?\n/).find((row) => row.startsWith('VERIFY_TYPES_SPAWN:'));
  assert.ok(line, `verify-types did not record its compiler spawn:\n${result.stdout}`);
  return JSON.parse(line.slice('VERIFY_TYPES_SPAWN:'.length));
}

assert.deepEqual(runVerifyTypes(), {
  command: process.execPath,
  args: [tsc, '--noEmit', '-p', 'tsconfig.json', '--pretty', 'false'],
});

assert.deepEqual(runVerifyTypes({ VERIFY_TYPES_NO_LOCAL_TSC: '1' }), {
  command: process.env.ComSpec || 'cmd.exe',
  args: ['/d', '/s', '/c', 'tsc', '-p', 'tsconfig.verify.json', '--pretty', 'false'],
});
console.log('verify-types.test.cjs: PASS');
