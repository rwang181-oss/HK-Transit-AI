#!/usr/bin/env node
const fs = require('node:fs');
const { spawnSync } = require('node:child_process');

const hasExpoTypes = fs.existsSync('node_modules/expo/tsconfig.base.json');
const command = process.platform === 'win32' && hasExpoTypes ? 'npx.cmd' : hasExpoTypes ? 'npx' : 'tsc';
const args = hasExpoTypes
  ? ['tsc', '--noEmit', '-p', 'tsconfig.json', '--pretty', 'false']
  : ['-p', 'tsconfig.verify.json', '--pretty', 'false'];

console.log(hasExpoTypes
  ? 'Running full project TypeScript check with installed Expo dependencies.'
  : 'Running offline structural TypeScript check with local module stubs.');
const result = spawnSync(command, args, { stdio: 'inherit' });
process.exit(result.status ?? 1);
