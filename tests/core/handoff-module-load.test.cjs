const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const output = path.join(__dirname, '..', '..', '.core-test-dist');
const sentinel = path.join(output, 'handoff-module-load-sentinel');
const outputExisted = fs.existsSync(output);
fs.mkdirSync(output, { recursive: true });
fs.writeFileSync(sentinel, 'keep');

try {
  require('../../scripts/verify-handoff.cjs');
  assert.equal(fs.existsSync(sentinel), true, 'requiring the verifier must not remove generated output');
} finally {
  fs.rmSync(sentinel, { force: true });
  if (!outputExisted) fs.rmSync(output, { recursive: true, force: true });
}

console.log('handoff-module-load.test.cjs: PASS');
