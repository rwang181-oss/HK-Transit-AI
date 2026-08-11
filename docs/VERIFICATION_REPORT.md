# Verification Report

Prepared: 2026-08-11

## Environment

- Bash on Windows workspace
- Node.js `v24.18.0`
- npm `11.16.0`
- Final verified web-review code checkpoint: `32671defa08e47feeb05c807bf1bc77be9345758`

## Data refresh

```bash
npm run data:refresh
```

The command was stopped with exit code `130` after Citybus completed because GMB route-stop upstream requests returned repeated HTTP `403` responses, including `https://data.etagmb.gov.hk/route-stop/2000972/1` and `https://data.etagmb.gov.hk/route-stop/2002287/1` and `/2`. A generated Citybus timestamp-only update was restored. No refreshed snapshot was accepted.

The retained `src/data/gmb.json` was independently checked: `schemaVersion` is `2`; it contains 1,161 routes and 13,101 route-stop records; routes have `sourceRouteId` and `routeSeq`; route-stop records have `sourceRouteId`, `routeSeq`, and `stopSeq` with zero missing values. This is a maintenance/network gate, not a claim that the upstream topology is current.

## Automated verification

```bash
npm run verify
```

Exit code: `0`.

- Journey-index generation and validation passed: 8,769 hubs, 3,189 routes and 483 cells.
- Provider route coverage passed: KMB 1,317, CTB 688, GMB 1,160 and MTR 24.
- The dependency-free core runner reported 25 checks passed. Jest reported 17 passed suites, 72 passed tests, 0 failures, and 0 snapshots.
- Full Expo TypeScript checking, source parsing and translation-key parity, mobile UX contracts, and handoff validation passed.

```bash
npm run build:web
```

Exit code: `0`. Expo bundled 898 modules, exported `dist`, and the post-build step created `.nojekyll`, `version.json`, and the SPA `404.html` fallback. Node printed a non-failing warning that `NO_COLOR` was ignored because `FORCE_COLOR` was set.

Post-build inspection confirmed:

- `dist/index.html` and `dist/404.html` reference `/HK-Transit-AI/favicon.ico` and `/HK-Transit-AI/_expo/static/js/web/...` and both carry the same `hk-transit-build` metadata.
- The emitted JavaScript contains `/HK-Transit-AI/_expo/loaders` and loads the journey index from `/HK-Transit-AI/data/journey`.
- All five shards match their generated source exactly: `meta.json`, `hubs.json`, `cells.json`, `routes.json`, and `route-neighbors.json`.
- `dist/data/journey/meta.json` reports schema version 1, 8,769 hubs, 3,189 routes, 483 cells, and 62,687 transfer points.

Additional focused evidence:

```bash
git diff --check
```

Exit code: `0`. The final branch diff from local `main` contains 47 files: application/source files, app and core/UI tests, `scripts/run-core-tests.cjs`, `tsconfig.core.json`, the approved plan/spec, and the three release-evidence documents. It has no whitespace errors. Automated source verification passed translation-key parity. No remote branch, remote `main`, or deployment was changed by this task.

## Sensitive credential pattern scan — 2026-08-11

The following command was run only against application source, scripts, workflow configuration, and manifests; it deliberately did not scan documentation or generated `dist` output:

```bash
set +e
rg -n -i 'AKIA[0-9A-Z]{16}|ASIA[0-9A-Z]{16}|AIza[0-9A-Za-z_-]{35}|gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{20,}|xox[baprs]-[A-Za-z0-9-]{10,}|sk_(live|test)_[A-Za-z0-9]{16,}|-----BEGIN (RSA|EC|OPENSSH|PRIVATE) KEY-----' app src scripts .github app.json package.json
scan_status=$?
if [ "$scan_status" -eq 1 ]; then
  echo 'credential-pattern scan: no matches'
  exit 0
fi
exit "$scan_status"
```

Result: `rg` returned `1` (no matches), and the wrapper exited `0` after printing `credential-pattern scan: no matches`. This is a targeted pattern scan for common cloud/API, GitHub, Slack, Stripe, and private-key formats. It is not a dedicated secret scanner and cannot detect unknown, split, encoded, or non-matching credentials; it does not prove that no secrets exist outside the specified paths.

## Acceptance status and boundaries

Previous controller browser acceptance completed on 2026-08-11 against the local Pages base path. This Task 4 run independently verifies build artifacts and automated checks; it does not repeat or expand browser/device acceptance.

### Phone viewport: 390x844

- The home page visibly rendered `HK Transit`. `EN` and `繁中` were visible, and switching language changed the weather, From/To, map-picker, search, and tab labels.
- Representative route searches returned provider-badged results for KMB (`1`/`1A`), Citybus (`A11`), Green Minibus (`10P`), and MTR (`EAL`). Opening `A11` displayed its ordered 24-stop detail.
- Planning `中環/我的位置` to `金鐘` returned five options. Starting a live journey opened the modal immediately.
- With location denied, the modal remained open and showed an explicit permission-denied state instead of locating indefinitely.
- With synthetic localhost GPS, the modal showed a blue current-position marker, an orange target, and a red routed walking path to `CENTRAL (THE LANDMARK)`, labelled as a pedestrian/walking route. The status recalibrated after movement.
- Dragging the map showed the recenter control; clicking it hid the control; a subsequent synthetic GPS update continued following. For the update from `22.2819,114.1588` to `22.2825,114.1594`, after 1.8 seconds the map rectangle was `(x=17, y=85, w=341, h=360)` with center `(187.5,265)`, while the blue marker rectangle was `(x=179, y=256, w=18, h=18)` with center `(188,265)`. The control stayed hidden, the red route redrew, and the status recalibrated.
- Result cards identified `Walking estimate` and `Estimated wait`; the routed modal identified the pedestrian route. The browser console contained no warnings or errors during acceptance.

### Desktop viewport: 1440x900

- The home content used a centered-width layout. Search, results, the live modal, and maps resized for the desktop viewport, with controls unobscured.
- Neither the page body nor dialog overflowed horizontally: `scrollWidth == clientWidth == 1440`.

### Evidence boundaries

- Browser acceptance used the local Pages base path and synthetic GPS injected into the current page for development testing. No real location was transmitted.
- An earlier old-build observation based only on the marker's inline transform omitted the parent Leaflet pane transform, so it remains inconclusive and is not treated as a valid RED or root-cause proof.
- No signed iOS build, physical-device location acceptance, native MapKit acceptance, App Store signing, or submission-readiness claim is made. The iOS phase remains gated on owner approval of the web preview.

The source audit confirms the home component renders `HK Transit`, translation-key parity passes, and the generated journey index contains all four required providers. This automated pass does not verify signed iOS builds, physical-device location behaviour, native MapKit behaviour, App Store signing, or submission readiness. The existing native/iOS boundary was not expanded.
