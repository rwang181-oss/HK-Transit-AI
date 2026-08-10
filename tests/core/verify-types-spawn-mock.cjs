const childProcess = require('node:child_process');

Object.defineProperty(process, 'platform', { value: 'win32' });

childProcess.spawnSync = (command) => {
  if (typeof command === 'string' && command.toLowerCase().endsWith('.cmd')) {
    return {
      status: null,
      signal: null,
      error: Object.assign(new Error(`spawnSync ${command} EINVAL`), { code: 'EINVAL' }),
    };
  }
  return { status: 0, signal: null };
};
