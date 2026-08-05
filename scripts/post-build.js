/**
 * Post-build fixer for GitHub Pages deployment.
 *
 * GitHub Pages serves the app under the /HK-Transit-AI/ subpath.
 * Expo's experiments.baseUrl fixes the static asset URLs, but the
 * Expo Router loader path is built with a template string that baseUrl
 * does NOT rewrite. This script patches it.
 *
 * Also creates .nojekyll so GitHub Pages does not run Jekyll (which
 * silently drops `_expo/` directories).
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const dist = path.join(root, 'dist');
const jsDir = path.join(dist, '_expo', 'static', 'js', 'web');
const BASE = '/HK-Transit-AI';

// 1. Patch the hardcoded loader path in every JS bundle
if (fs.existsSync(jsDir)) {
  const files = fs
    .readdirSync(jsDir)
    .filter((f) => f.endsWith('.js'));
  for (const file of files) {
    const fp = path.join(jsDir, file);
    let content = fs.readFileSync(fp, 'utf8');
    const before = content.split('/_expo/loaders').length - 1;
    content = content.split('/_expo/loaders').join(`${BASE}/_expo/loaders`);
    fs.writeFileSync(fp, content);
    if (before > 0) {
      console.log(`Patched ${file}: ${before} loader path(s)`);
    }
  }
}

// 2. Create .nojekyll
const nojekyll = path.join(dist, '.nojekyll');
if (!fs.existsSync(nojekyll)) {
  fs.writeFileSync(nojekyll, '');
  console.log('Created .nojekyll');
}

// 3. SPA fallback: copy index.html → 404.html so GitHub Pages serves
//    the app for unknown deep links (e.g. /HK-Transit-AI/journey/result)
//    instead of a 404.
const indexHtml = path.join(dist, 'index.html');
const notFound = path.join(dist, '404.html');
if (fs.existsSync(indexHtml)) {
  fs.copyFileSync(indexHtml, notFound);
  console.log('Created 404.html (SPA fallback)');
}

console.log('Post-build complete.');
