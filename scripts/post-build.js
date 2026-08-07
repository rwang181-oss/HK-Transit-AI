/**
 * Post-build fixer for GitHub Pages deployment.
 *
 * 1. Patch Expo Router loader path for /HK-Transit-AI/ subpath
 * 2. Create .nojekyll so Jekyll doesn't eat `_expo/` directories
 * 3. Create 404.html as SPA fallback for deep links
 * 4. Generate version.json for client-side version monitoring
 * 5. Inject build-id meta tag for version monitor initialization
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const root = path.join(__dirname, '..');
const dist = path.join(root, 'dist');
const jsDir = path.join(dist, '_expo', 'static', 'js', 'web');
const BASE = '/HK-Transit-AI';

// Generate a stable build ID based on dist content hash
function generateBuildId() {
  const hash = crypto.createHash('sha256');
  // Hash key JS bundles for a content-based build ID
  if (fs.existsSync(jsDir)) {
    const files = fs.readdirSync(jsDir).filter((f) => f.endsWith('.js')).sort();
    for (const file of files) {
      const content = fs.readFileSync(path.join(jsDir, file));
      hash.update(content);
    }
  }
  // Also hash index.html
  const indexHtml = path.join(dist, 'index.html');
  if (fs.existsSync(indexHtml)) {
    hash.update(fs.readFileSync(indexHtml));
  }
  return hash.digest('hex').slice(0, 12);
}

// ---- 1. Patch the hardcoded loader path in every JS bundle ----
if (fs.existsSync(jsDir)) {
  const files = fs.readdirSync(jsDir).filter((f) => f.endsWith('.js'));
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

// ---- 2. Create .nojekyll ----
const nojekyll = path.join(dist, '.nojekyll');
if (!fs.existsSync(nojekyll)) {
  fs.writeFileSync(nojekyll, '');
  console.log('Created .nojekyll');
}

// ---- 3. SPA fallback: copy index.html → 404.html ----
const indexHtml = path.join(dist, 'index.html');
const notFound = path.join(dist, '404.html');
if (fs.existsSync(indexHtml)) {
  fs.copyFileSync(indexHtml, notFound);
  console.log('Created 404.html (SPA fallback)');
}

// ---- 4. Generate version.json ----
const buildId = generateBuildId();
const versionJson = {
  buildId,
  generatedAt: new Date().toISOString(),
  version: require(path.join(root, 'package.json')).version,
};
fs.writeFileSync(
  path.join(dist, 'version.json'),
  JSON.stringify(versionJson) + '\n'
);
console.log(`Generated version.json (buildId: ${buildId})`);

// ---- 5. Inject build-id meta tag into index.html ----
if (fs.existsSync(indexHtml)) {
  let html = fs.readFileSync(indexHtml, 'utf8');
  // Inject <meta name="build-id"> before </head>
  const metaTag = `<meta name="build-id" content="${buildId}">`;
  if (!html.includes('name="build-id"')) {
    html = html.replace('</head>', `  ${metaTag}\n</head>`);
    fs.writeFileSync(indexHtml, html);
    console.log('Injected build-id meta tag');
  }
  // Also update 404.html
  if (fs.existsSync(notFound)) {
    let html404 = fs.readFileSync(notFound, 'utf8');
    if (!html404.includes('name="build-id"')) {
      html404 = html404.replace('</head>', `  ${metaTag}\n</head>`);
      fs.writeFileSync(notFound, html404);
    }
  }
}

console.log('Post-build complete.');
