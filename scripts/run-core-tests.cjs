const { spawnSync } = require('node:child_process');
const fs = require('node:fs');

const output = '.core-test-dist';
fs.rmSync(output, { recursive: true, force: true });
const compile = spawnSync('tsc', ['-p', 'tsconfig.core.json'], { stdio: 'inherit' });
if (compile.status !== 0) {
  fs.rmSync(output, { recursive: true, force: true });
  process.exit(compile.status ?? 1);
}
const tests = spawnSync(process.execPath, ['tests/core/run-core-tests.cjs'], { stdio: 'inherit' });
fs.rmSync(output, { recursive: true, force: true });
process.exit(tests.status ?? 1);
