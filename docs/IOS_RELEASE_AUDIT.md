# iOS Release Architecture Audit

Prepared: 2026-08-11
Audited branch: `agent/live-map-multimodal-search` at `72047ea` before this audit-documentation commit

## Scope and evidence

This is a pre-publication repository audit for Task 9 of `docs/superpowers/plans/2026-08-10-live-map-multimodal-search.md`. The requested `task-9-brief.md` was not present in this checkout or its parent workspace when the audit began, so this document relies on that Task 9 plan, the associated design, current configuration, and the existing verification report. No branch was pushed, merged, deployed, or submitted to Apple during this audit.

Fresh commands completed on Windows PowerShell with Node.js `v24.18.0` and npm `11.17.0`:

| Command | Result | Evidence |
| --- | --- | --- |
| `npm ci` | exit `0` | Installed 916 packages from the lockfile. npm reported 21 transitive audit findings (7 moderate, 14 high); no dependency upgrade was applied. |
| `npx expo config --type public` | exit `0` | Expo SDK `57.0.0` resolved public iOS, Android, and web configuration. |
| `npm run verify` | exit `0` | Journey index validation, 49 core/planner tests, TypeScript, source, mobile UX, and handoff checks passed. |
| `npm test` | exit `0` | Jest: 9 suites, 47 tests, 0 failures. |
| `npm run build:web` | exit `0` | Expo exported the web build with 896 modules; generated output remains ignored. |
| `git diff --check` | exit `0` | No whitespace errors before audit-documentation changes. |

## Configuration and release identity

- `app.json` resolves `ios.bundleIdentifier` to `com.rwang181.hktransitai`.
- Both foreground-location declarations remain present: `ios.infoPlist.NSLocationWhenInUseUsageDescription` and the `expo-location.locationWhenInUsePermission` plugin text.
- `eas.json` retains `development`, `preview`, and `production` build profiles, plus the production submit section.
- `name` (`HK Transit AI`), `slug` (`hk-transit-ai`), `scheme` (`hk-transit`), iOS bundle identifier, and EAS configuration have no diff from `main...HEAD` at the audit point. The feature branch's only package-manifest changes are the intentional `react-native-web` declaration/lockfile alignment and the web-start index-generation command.

## Platform-boundary findings

- `src/components/TransitMap.tsx` calls Leaflet only inside its `Platform.OS === 'web'` effect. Its native return path selects an `end` point, then the last `stop` point, for the Apple Maps destination. It never selects a `me` point, so a current-location marker cannot become the Apple Maps destination.
- `src/components/loadLeaflet.ts` is a dynamic Leaflet loader. Stores, the navigation controller, and shared planning modules import neither Leaflet nor that loader. They use Expo Location and platform-neutral TypeScript only.
- The dedicated `app/journey/map-picker.tsx` also has a dynamic Leaflet import and DOM/CSS work, all inside its `Platform.OS === 'web'` effect. Its native branch renders a safe no-map return path. Therefore web-only map code is not literally exclusive to `TransitMap`; any future platform split must include this route as well.
- `src/journey/index/loader.ts` performs a guarded `document` meta-tag read only to obtain a web build cache-buster. In a native runtime it returns an empty build id before touching the DOM. This is native-safe at runtime, but it means this loader is not DOM-free in the strict source-level sense.
- `src/utils/versionMonitor.ts` is likewise web-oriented and guards its DOM/window access; it is not imported by navigation stores/controllers.

The guarded map-picker and journey-index cases are architecture qualifications, not an identified native release blocker: the audited native paths neither initialize Leaflet nor dereference DOM globals. They must remain in the native test matrix and should be separated into explicit `.web` modules before introducing a real native map implementation.

## App Store boundary

This repository is not App Store ready based on this audit alone. A signed EAS iOS build, Apple Developer signing, physical-device GPS and Apple Maps/MapKit acceptance, privacy and support URLs, location-data disclosure, screenshots, review metadata, and App Review are still required. No claim is made that a binary was produced, signed, or accepted by Apple.
