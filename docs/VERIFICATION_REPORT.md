# Verification Report

Prepared: 2026-08-11

## Environment

- Windows PowerShell
- Node.js `v24.18.0`
- npm `11.17.0`
- Source checkpoint before Task 8 corrections: `f60276eb00ab434a9c95e6866d587bfe6ea239bf`

## Dependency installation

```powershell
npm ci
```

Exit code: `0`. The lockfile installation completed with 916 packages. npm's audit summary reported 21 transitive findings (7 moderate and 14 high); no automatic or breaking dependency upgrade was applied during this scoped verification task. `react-native-web` is declared as `~0.21.0`, matching the Expo 57 bundled-module range, and is installed from the lockfile.

## Automated verification

```powershell
npm run verify
```

Exit code: `0`.

- Journey-index generation and validation passed: 8,769 hubs, 3,189 routes and 483 cells.
- Provider route coverage passed: KMB 1,317, CTB 688, GMB 1,160 and MTR 24.
- All dependency-free core suites passed, including the Node 24/Windows type-wrapper regression and the default 25-metre live-reroute threshold regression.
- Full Expo TypeScript checking, source parsing and translation-key parity, mobile UX contracts, and handoff validation passed.

```powershell
npm test
```

Exit code: `0`. Jest reported 9 passed suites, 47 passed tests, 0 failures and 0 snapshots.

```powershell
npm run build:web
```

Exit code: `0`. Expo bundled 896 modules, exported `dist`, and the post-build step created `.nojekyll`, `version.json`, and the SPA `404.html` fallback.

Additional focused evidence:

```powershell
node .\node_modules\typescript\bin\tsc -p tsconfig.verify.json --noEmit --pretty false
git diff --check
```

Both commands exited `0`. The offline structural check covers the local React type stubs and the explicitly typed `JourneyPolicy` default.

## Corrected verification debt

- `scripts/verify-types.cjs` now invokes the installed TypeScript JavaScript entry point through Node instead of spawning `npx.cmd`, which Node 24 rejects with `EINVAL` on Windows.
- The offline React stub includes `useCallback`, and the journey-store plan default is explicitly typed as `JourneyPolicy`.
- Legacy Jest fixtures now resolve stable hashed hub IDs from stop membership, isolate the KMB request cache per test, and assert current request options. The KMB service-adapter suite also verifies exact bundled stop/route-stop mapping and one shared topology load across both public adapters.
- The Windows spawn regression asserts the exact Node executable and resolved `typescript/bin/tsc` arguments, plus the explicit no-local-TypeScript `cmd.exe` fallback.
- The search screen keeps the partial-provider warning visible beside the no-results state.
- The live-route regression now exercises the default 25-metre threshold rather than supplying the same value explicitly.
- `react-native-web` was restored to `package.json` and synchronized with `package-lock.json`.
- As defensive state-machine hardening, the web map now uses one authoritative follow flag for Leaflet drag/recenter events and recentres in the same update that renders a new GPS marker. A mocked-Leaflet behavior lock covers drag-to-disable, immediate recenter, and a later followed GPS update at the requested zoom; it does not establish that the prior implementation failed in a browser.
- The web test waits for the observable Leaflet `dragstart` registration with a bounded timeout rather than assuming the dynamic loader completes in one event-loop turn.

## Acceptance status and boundaries

Controller browser acceptance completed on 2026-08-11 against the local Pages base path.

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
- Independent review approved the completed Task 8 evidence. One combined-stress run timed out once and was not reproduced; it was followed by 15 successful full runs.
- No signed iOS build, physical-device location acceptance, native MapKit acceptance, App Store signing, or submission-readiness claim is made.

The source audit confirms the home component renders `HK Transit`, translation-key parity passes, and the generated journey index contains all four required providers. This automated pass does not verify signed iOS builds, physical-device location behaviour, native MapKit behaviour, App Store signing, or submission readiness. The existing native/iOS boundary was not expanded.
