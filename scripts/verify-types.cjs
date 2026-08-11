#!/usr/bin/env node
const fs = require('node:fs');
const { spawnSync } = require('node:child_process');

const hasExpoTypes = fs.existsSync('node_modules/expo/tsconfig.base.json');
let localTscPath = null;
try {
  localTscPath = require.resolve('typescript/bin/tsc');
} catch {
  // The offline handoff path can use a globally installed compiler.
}

const typecheckArgs = hasExpoTypes
  ? ['--noEmit', '-p', 'tsconfig.json', '--pretty', 'false']
  : ['-p', 'tsconfig.verify.json', '--pretty', 'false'];
const command = localTscPath
  ? process.execPath
  : process.platform === 'win32'
    ? process.env.ComSpec || 'cmd.exe'
    : 'tsc';
const args = localTscPath
  ? [localTscPath, ...typecheckArgs]
  : process.platform === 'win32'
    ? ['/d', '/s', '/c', 'tsc', ...typecheckArgs]
    : typecheckArgs;

console.log(hasExpoTypes
  ? 'Running full project TypeScript check with installed Expo dependencies.'
  : 'Running offline structural TypeScript check with local module stubs.');
const result = spawnSync(command, args, { stdio: 'inherit' });
if (result.error) console.error(result.error);
process.exit(result.status ?? 1);
