# Verification Report

Prepared: 2026-08-10

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
- The web map now uses one authoritative follow flag for Leaflet drag/recenter events and recentres in the same update that renders a new GPS marker. A mocked-Leaflet regression covers drag-to-disable, immediate recenter, and a later followed GPS update at the requested zoom.

## Acceptance status and boundaries

Browser acceptance is pending. No phone-width (`390×844`) or desktop (`1440×900`) browser pass is claimed in this report; those checks are assigned to the Task 8 controller. The recenter-follow correction has automated coverage, but its real-browser recheck is still pending.

The source audit confirms the home component renders `HK Transit`, translation-key parity passes, and the generated journey index contains all four required providers. This automated pass does not verify signed iOS builds, physical-device location behaviour, native MapKit behaviour, App Store signing, or submission readiness. The existing native/iOS boundary was not expanded.
