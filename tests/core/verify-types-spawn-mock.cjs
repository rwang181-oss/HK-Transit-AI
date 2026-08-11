const childProcess = require('node:child_process');
const fs = require('node:fs');
const Module = require('node:module');

Object.defineProperty(process, 'platform', { value: 'win32' });

if (process.env.VERIFY_TYPES_NO_LOCAL_TSC === '1') {
  const originalExistsSync = fs.existsSync;
  fs.existsSync = (candidate) => String(candidate).endsWith('node_modules/expo/tsconfig.base.json')
    ? false
    : originalExistsSync(candidate);
  const originalResolveFilename = Module._resolveFilename;
  Module._resolveFilename = function resolveFilename(request, ...args) {
    if (request === 'typescript/bin/tsc') {
      const error = Object.assign(new Error(`Cannot find module '${request}'`), { code: 'MODULE_NOT_FOUND' });
      throw error;
    }
    return originalResolveFilename.call(this, request, ...args);
  };
}

childProcess.spawnSync = (command, args) => {
  process.stdout.write(`VERIFY_TYPES_SPAWN:${JSON.stringify({ command, args })}\n`);
  return { status: 0, signal: null };
};
