# Web Deployment

## Prerequisites

- Node.js version supported by Expo SDK 57
- Public npm registry access
- Internet access for transit data refresh
- A clean branch

## Build

```bash
npm install
npm run data:refresh
npm run verify
npm test
npm run build:web
```

The export is written to `dist/`. `scripts/post-build.js` prepares GitHub Pages SPA routing.

## Local preview

Serve `dist/` using any static server. Verify that the base path matches the configured repository path:

```text
/HK-Transit-AI/
```

Test direct navigation and refresh on:

- `/HK-Transit-AI/`
- journey result route
- ETA detail route

## GitHub Pages

The existing command is:

```bash
npm run deploy
```

For safe owner review, deploy from a preview branch/path first rather than immediately replacing the current live page. Keep the current deployment available until the owner approves:

- origin/destination search
- both languages
- map rendering
- result card clarity
- several live ETA checks
- location permission behaviour

## Common deployment checks

- `assets/icon.png` and `assets/favicon.png` are included.
- No API secrets are present; this project uses public endpoints.
- Nominatim search is throttled and cached in memory.
- Browser location requires HTTPS except on localhost.
- Static host headers allow normal JSON/JS loading.
- `src/data/gmb.json` is schema version 2 before production.

## Rollback

Keep the previous GitHub Pages commit/branch. If the preview produces broken routing, blank pages or widespread live-data failure, restore the previous Pages source and retain the V2 branch for fixes.
