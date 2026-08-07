/**
 * Post-build fixer for GitHub Pages deployment.
 *
 * - Patches Expo Router loader paths for the repository subpath.
 * - Creates .nojekyll and the SPA 404 fallback.
 * - Writes version.json and embeds the same build id into index.html so
 *   open pages can detect a newer deployment without manual refreshing.
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const dist = path.join(root, 'dist');
const jsDir = path.join(dist, '_expo', 'static', 'js', 'web');
const BASE = '/HK-Transit-AI';

if (!fs.existsSync(dist)) {
  console.error('Missing dist directory after Expo export.');
  process.exit(1);
}

// 1. Patch the hardcoded loader path in every JS bundle.
if (fs.existsSync(jsDir)) {
  const files = fs.readdirSync(jsDir).filter((file) => file.endsWith('.js'));
  for (const file of files) {
    const filePath = path.join(jsDir, file);
    let content = fs.readFileSync(filePath, 'utf8');
    const before = content.split('/_expo/loaders').length - 1;
    content = content.split('/_expo/loaders').join(`${BASE}/_expo/loaders`);
    fs.writeFileSync(filePath, content);
    if (before > 0) console.log(`Patched ${file}: ${before} loader path(s)`);
  }
}

// 2. Create .nojekyll.
const nojekyll = path.join(dist, '.nojekyll');
if (!fs.existsSync(nojekyll)) {
  fs.writeFileSync(nojekyll, '');
  console.log('Created .nojekyll');
}

// 3. Generate immutable build metadata and embed it into the HTML shell.
const builtAt = new Date().toISOString();
const commitSha = String(process.env.GITHUB_SHA || process.env.HK_TRANSIT_COMMIT_SHA || '').trim();
const buildId = String(
  process.env.HK_TRANSIT_BUILD_ID || commitSha || `local-${builtAt}`
).trim();
if (!buildId) {
  console.error('Unable to create a non-empty build identifier.');
  process.exit(1);
}

const version = { buildId, commitSha, builtAt };
const versionPath = path.join(dist, 'version.json');
fs.writeFileSync(versionPath, `${JSON.stringify(version, null, 2)}\n`);
const writtenVersion = JSON.parse(fs.readFileSync(versionPath, 'utf8'));
if (!writtenVersion.buildId) {
  console.error('version.json does not contain a build identifier.');
  process.exit(1);
}
console.log(`Created version.json (${buildId})`);

const indexHtml = path.join(dist, 'index.html');
const notFound = path.join(dist, '404.html');
if (!fs.existsSync(indexHtml)) {
  console.error('Missing dist/index.html after Expo export.');
  process.exit(1);
}

let html = fs.readFileSync(indexHtml, 'utf8');
const escapedBuildId = buildId
  .replaceAll('&', '&amp;')
  .replaceAll('"', '&quot;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;');
const buildMeta = `<meta name="hk-transit-build" content="${escapedBuildId}">`;
if (/<meta\s+name=["']hk-transit-build["'][^>]*>/i.test(html)) {
  html = html.replace(/<meta\s+name=["']hk-transit-build["'][^>]*>/i, buildMeta);
} else if (/<head[^>]*>/i.test(html)) {
  html = html.replace(/<head[^>]*>/i, (head) => `${head}\n    ${buildMeta}`);
} else {
  console.error('Unable to embed the build identifier because index.html has no head element.');
  process.exit(1);
}
fs.writeFileSync(indexHtml, html);

// 4. SPA fallback must contain the same build metadata.
fs.copyFileSync(indexHtml, notFound);
console.log('Created 404.html (SPA fallback)');
console.log('Post-build complete.');
