const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const projectRoot = path.resolve(__dirname, '..', '..');
const preload = path.join(__dirname, 'verify-types-spawn-mock.cjs');
const result = spawnSync(
  process.execPath,
  ['--require', preload, path.join(projectRoot, 'scripts', 'verify-types.cjs')],
  { cwd: projectRoot, encoding: 'utf8' }
);

assert.equal(
  result.status,
  0,
  `verify-types must not execute a Windows .cmd shim directly:\n${result.stdout}${result.stderr}`
);
console.log('verify-types.test.cjs: PASS');
