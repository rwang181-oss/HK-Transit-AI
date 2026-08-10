const assert = require('node:assert/strict');
const { isJourneyIndexBuildCommand } = require('../../scripts/verify-handoff.cjs');

assert.equal(isJourneyIndexBuildCommand('npm run build:journey-index && expo start --web'), true);
assert.equal(isJourneyIndexBuildCommand('npm run build:journey-index-bogus && expo start --web'), false);
assert.equal(isJourneyIndexBuildCommand('expo start --web'), false);

console.log('handoff-web-command.test.cjs: PASS');
