#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const ignored = new Set(['node_modules', '.git', '.expo', 'dist', '.core-test-dist']);

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ignored.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

function relative(file) {
  return path.relative(root, file).replaceAll(path.sep, '/');
}

let failures = 0;
let typescript;
try {
  const globalRoot = execFileSync('npm', ['root', '-g'], { encoding: 'utf8' }).trim();
  typescript = require(path.join(globalRoot, 'typescript'));
} catch (error) {
  console.error('Unable to load the globally installed TypeScript parser:', error.message);
  process.exit(1);
}

const files = walk(root);
for (const file of files.filter((item) => /\.(ts|tsx)$/.test(item))) {
  const text = fs.readFileSync(file, 'utf8');
  const kind = file.endsWith('.tsx')
    ? typescript.ScriptKind.TSX
    : typescript.ScriptKind.TS;
  const source = typescript.createSourceFile(
    file,
    text,
    typescript.ScriptTarget.Latest,
    true,
    kind
  );
  if (source.parseDiagnostics.length) {
    failures += source.parseDiagnostics.length;
    for (const diagnostic of source.parseDiagnostics) {
      const position = source.getLineAndCharacterOfPosition(diagnostic.start || 0);
      const message = typescript.flattenDiagnosticMessageText(diagnostic.messageText, '\n');
      console.error(`${relative(file)}:${position.line + 1}:${position.character + 1} ${message}`);
    }
  }
}

for (const file of files.filter((item) => item.endsWith('.json'))) {
  try {
    JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    failures += 1;
    console.error(`${relative(file)}: invalid JSON: ${error.message}`);
  }
}


function flattenKeys(value, prefix = '', out = new Set()) {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    for (const [key, child] of Object.entries(value)) {
      const next = prefix ? `${prefix}.${key}` : key;
      if (child && typeof child === 'object' && !Array.isArray(child)) flattenKeys(child, next, out);
      else out.add(next);
    }
  }
  return out;
}

try {
  const en = JSON.parse(fs.readFileSync(path.join(root, 'src/i18n/en.json'), 'utf8'));
  const zh = JSON.parse(fs.readFileSync(path.join(root, 'src/i18n/zh-HK.json'), 'utf8'));
  const enKeys = flattenKeys(en);
  const zhKeys = flattenKeys(zh);
  const onlyEn = [...enKeys].filter((key) => !zhKeys.has(key));
  const onlyZh = [...zhKeys].filter((key) => !enKeys.has(key));
  if (onlyEn.length || onlyZh.length) {
    failures += onlyEn.length + onlyZh.length;
    if (onlyEn.length) console.error(`Translation keys missing in zh-HK:\n- ${onlyEn.join('\n- ')}`);
    if (onlyZh.length) console.error(`Translation keys missing in en:\n- ${onlyZh.join('\n- ')}`);
  }
} catch (error) {
  failures += 1;
  console.error(`Unable to compare translation keys: ${error.message}`);
}

for (const file of files.filter((item) => /\.(js|cjs)$/.test(item))) {
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (result.status !== 0) {
    failures += 1;
    console.error(`${relative(file)}: JavaScript syntax error`);
    console.error(result.stderr.trim());
  }
}

if (failures) {
  console.error(`Source verification failed with ${failures} issue(s).`);
  process.exit(1);
}

console.log(`Source verification passed for ${files.length} files.`);
