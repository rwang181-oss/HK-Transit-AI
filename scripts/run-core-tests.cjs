const { spawnSync } = require('node:child_process');
const fs = require('node:fs');

const output = '.core-test-dist';
fs.rmSync(output, { recursive: true, force: true });
const compile = spawnSync(process.execPath, [require.resolve('typescript/bin/tsc'), '-p', 'tsconfig.core.json'], { stdio: 'inherit' });
if (compile.status !== 0) {
  fs.rmSync(output, { recursive: true, force: true });
  process.exit(compile.status ?? 1);
}

for (const testFile of [
  'tests/core/run-core-tests.cjs',
  'tests/core/kmb-topology.test.cjs',
  'tests/core/journey-policy.test.cjs',
  'tests/core/candidate-pools.test.cjs',
  'tests/core/walking-router.test.cjs',
  'tests/core/version-monitor.test.cjs',
  'tests/core/journey-index.test.cjs',
  'tests/core/journey-index-cache.test.cjs',
  'tests/core/progressive-planner.test.cjs',
  'tests/core/progressive-diversity.test.cjs',
  'tests/core/progressive-refine.test.cjs',
  'tests/core/progressive-session.test.cjs',
  'tests/core/progressive-deps.test.cjs',
  'tests/core/route-catalog.test.cjs',
  'tests/core/route-details.test.cjs',
]) {
  const tests = spawnSync(process.execPath, [testFile], { stdio: 'inherit' });
  if (tests.status !== 0) {
    fs.rmSync(output, { recursive: true, force: true });
    process.exit(tests.status ?? 1);
  }
}

fs.rmSync(output, { recursive: true, force: true });
process.exit(0);
