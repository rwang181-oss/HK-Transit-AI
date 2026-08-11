# Project Status

## Current web review (unreleased)

The web-review branch provides the following pending owner approval; this is not a published `2.0.2` release, and the application/package version remains `2.0.0`:

- Exact public route-number ranking, deterministic provider order, and one provider-neutral route-detail destination for search and saved-route cards.
- Saved-route provider/boarding-stop persistence, including migration of version-1 saved KMB entries without data loss.
- Explicit, retryable browser-location states and one shared foreground location watcher for nearby search and live journeys.
- A live-journey modal with current location, destination, honest routed-versus-estimated walking treatment, and journey-progress updates. It does not claim background tracking, vehicle tracking, or voice turn-by-turn navigation.
- Leaflet map initialization once per mount, stable marker/path reconciliation, drag-to-disable-follow, and an explicit recenter control.
- A static GitHub Pages export under `/HK-Transit-AI` with five generated journey-index shards, `.nojekyll`, `version.json`, and an SPA `404.html` fallback.

## Verification in this environment

On 2026-08-11 (Node `v24.18.0`, npm `11.16.0`), `npm run verify` exited `0`: journey-index generation/validation reported 8,769 hubs, 3,189 routes, and 483 cells; provider coverage was KMB 1,317, CTB 688, GMB 1,160, and MTR 24. It also passed 25 dependency-free core checks, Jest's 17 suites/72 tests, TypeScript, source/translation parity, mobile UX, and handoff validation.

`npm run build:web` also exited `0`, exported 898 modules, and produced the Pages-path and journey-index artifacts described above. The only build output warning was Node reporting that `NO_COLOR` was ignored because `FORCE_COLOR` was set.

`npm run data:refresh` was intentionally stopped after upstream GMB route-stop requests returned HTTP 403 responses; no partial refreshed snapshot was accepted. The retained `src/data/gmb.json` is schema version 2 and has 1,161 routes plus 13,101 route-stop records, with no missing `sourceRouteId`, `routeSeq`, or `stopSeq` values.

## iOS readiness boundary

The repository retains the shared Expo Router/TypeScript route, `com.rwang181.hktransitai`, foreground-location permission text, EAS profiles, and a native map fallback. **Do not start the iOS implementation/release phase until the owner approves the web preview.** After that approval, iOS still requires an Apple Maps adapter, physical-device testing, Apple Developer signing, privacy/support URLs, screenshots, and App Review; no Apple approval is implied.

## Recommended acceptance checks

Test on at least one iPhone-sized browser and one desktop browser:

- Search an exact route code and a prefix; confirm the exact public code ranks first and provider badges are correct.
- Open a saved route and a search result for the same route; confirm both reach the same detail screen and the saved stop is expanded for ETA.
- Exercise location denied, timed-out/unavailable, retry, and live tracking states; confirm the app does not request permission before an explicit location action.
- Start a journey, drag the map, then tap Recenter; confirm a later foreground GPS sample resumes following.
- Check KMB, Citybus, GMB, and MTR journeys on normal and weak networks, including the stated estimated/offline fallbacks.
