#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const required = [
  'README.md',
  'HANDOFF.md',
  'CHANGELOG.md',
  'app.json',
  'eas.json',
  'assets/icon.png',
  'assets/favicon.png',
  'src/components/JourneyModeChips.tsx',
  'src/components/JourneyOptionCard.tsx',
  'src/components/LiveJourneyPanel.tsx',
  'src/components/NavigationModal.tsx',
  'src/journey/planner/routePolicies.ts',
  'src/journey/planner/candidatePools.ts',
  'src/journey/walking/walkingRouter.ts',
  'src/journey/index/types.ts',
  'src/journey/index/loader.ts',
  'src/journey/index/fastPlanner.ts',
  'src/journey/index/refinePlanner.ts',
  'src/journey/index/betterResults.ts',
  'src/journey/index/progressivePlanner.ts',
  'src/utils/versionMonitor.ts',
  'app/+html.tsx',
  'scripts/post-build.js',
  'scripts/verify-mobile-ux.cjs',
  'scripts/fetch-kmb-data.cjs',
  'scripts/build-journey-index.cjs',
  'scripts/verify-journey-index.cjs',
  'src/data/kmb.json',
  'public/data/journey/meta.json',
  'public/data/journey/hubs.json',
  'public/data/journey/cells.json',
  'public/data/journey/routes.json',
  'public/data/journey/route-neighbors.json',
  'docs/ARCHITECTURE.md',
  'docs/PROJECT_STATUS.md',
  'docs/DEPLOYMENT.md',
  'docs/DATA_REFRESH.md',
  'docs/IOS_HANDOFF.md',
  'docs/KNOWN_LIMITATIONS.md',
  'docs/VERIFICATION_REPORT.md',
  'docs/AGENT_PROMPT.md',
];

const generatedDirs = ['.core-test-dist', 'dist'];
for (const item of generatedDirs) {
  const target = path.join(root, item);
  if (fs.existsSync(target)) {
    fs.rmSync(target, { recursive: true, force: true });
  }
}

const missing = required.filter((item) => !fs.existsSync(path.join(root, item)));
const forbidden = generatedDirs.filter((item) => fs.existsSync(path.join(root, item)));

for (const item of required.filter((value) => value.startsWith('public/data/journey/'))) {
  const target = path.join(root, item);
  if (fs.existsSync(target) && fs.statSync(target).size <= 2) {
    missing.push(`non-empty ${item}`);
  }
}

let gmbWarning = null;
try {
  const gmb = JSON.parse(fs.readFileSync(path.join(root, 'src/data/gmb.json'), 'utf8'));
  const routeStop = Array.isArray(gmb.routeStops) ? gmb.routeStops[0] : null;
  if (!routeStop || routeStop.sourceRouteId == null || routeStop.routeSeq == null || routeStop.stopSeq == null) {
    gmbWarning = 'GMB snapshot is legacy. Run npm run data:refresh with internet before production deployment.';
  }
} catch (error) {
  missing.push('valid src/data/gmb.json');
}

try {
  const kmb = JSON.parse(fs.readFileSync(path.join(root, 'src/data/kmb.json'), 'utf8'));
  if (!Array.isArray(kmb.stops) || kmb.stops.length < 1000) {
    missing.push('complete KMB stop snapshot in src/data/kmb.json');
  }
  if (!Array.isArray(kmb.routeStops) || kmb.routeStops.length < 10000) {
    missing.push('complete KMB route-stop snapshot in src/data/kmb.json');
  }
} catch (error) {
  missing.push('valid src/data/kmb.json');
}

if (missing.length || forbidden.length) {
  if (missing.length) console.error(`Missing required handoff files:\n- ${missing.join('\n- ')}`);
  if (forbidden.length) console.error(`Remove generated directories before packaging:\n- ${forbidden.join('\n- ')}`);
  process.exit(1);
}

console.log('Handoff structure verification passed, including progressive journey index assets.');
if (gmbWarning) console.warn(`WARNING: ${gmbWarning}`);
