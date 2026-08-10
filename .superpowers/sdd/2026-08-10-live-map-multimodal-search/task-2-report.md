# Task 2 Report: Route catalogue store, search UI and provider-aware stop list

## Implementation

- Added `loadRouteDirection` and `loadStopEta` domain functions. Direction rows join provider stops to route-stop links, sort by sequence, and omit links whose stop is unavailable; provider exceptions propagate.
- Added the Zustand route catalogue store. It loads all providers through the existing Task 1 catalogue module, deduplicates in-flight requests with a module-level promise, and keeps successful entries alongside per-provider errors.
- Replaced the KMB-only search tab with the multi-provider catalogue search. Entries show public route codes and translated provider badges; selection uses encoded provider, route, and bound parameters for `/route-detail`.
- Added a provider-aware route-detail stack screen. It validates the provider, loads ordered stops, loads ETA only when a stop expands, and renders translated loading, unavailable, and ETA-error states. It has no favourites-store writes.
- Added matching English and Traditional Chinese translations and registered the core domain test.

## Files

- Created: `src/stores/routeCatalogStore.ts`, `src/journey/search/routeDetails.ts`, `tests/core/route-details.test.cjs`, `app/route-detail.tsx`.
- Modified: `app/(tabs)/search.tsx`, `app/_layout.tsx`, `tsconfig.core.json`, `scripts/run-core-tests.cjs`, `src/i18n/en.json`, `src/i18n/zh-HK.json`.

## RED evidence

Command: `tsc -p tsconfig.core.json; node tests/core/route-details.test.cjs`

Result: the global TypeScript 6.0.3 command first reported deprecated `moduleResolution=node10` and `baseUrl` options. The requested test then failed as expected with `Cannot find module '../../.core-test-dist/journey/search/routeDetails.js'`. The project-local compiler is TypeScript 5.7.3 and is used by the npm test script.

## GREEN evidence

Command: `npm run test:core`

Result: exit 0. All existing core suites passed and `route-details.test.cjs: PASS` was printed.

Command: `npm run verify:source`

Result: exit 0, `Source verification passed for 160 files.` Translation-key parity passed.

Command: `npx tsc -p tsconfig.verify.json --noEmit`

Result: exit 2 because of two pre-existing, out-of-scope errors: `app/journey/map-picker.tsx` expects React `useCallback` from the minimal type stubs, and `src/stores/journeyStore.ts` passes `string` where `JourneyPolicy` is required. Task 2 files introduced no reported structural type errors.

## Self-review and concerns

- Confirmed the search tab no longer imports the KMB route store and the new detail screen does not import or write the favourites store.
- Confirmed `git diff --check` is clean.
- Concern: full structural verification cannot be claimed green until the two existing non-Task-2 type errors are resolved. No unrelated files were changed.
