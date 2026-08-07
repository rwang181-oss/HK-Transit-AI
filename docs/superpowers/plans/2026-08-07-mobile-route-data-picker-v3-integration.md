# Mobile Route Data, Map Picker, and Auto-Update V3 Integration Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reapply the useful PR #4 mobile performance, resilient data loading, fullscreen map picker, and auto-update changes on top of the latest `main` without regressing the existing low-transfer route policies, walking routing, 203E regression coverage, or Pages deployment guard.

**Architecture:** Keep the latest `main` as the source of truth. Modify the current journey store rather than replacing it with the stale PR #4 copy. Reuse the existing `src/journey/data/kmbTopology.ts`, route policies, candidate pools, and walking router. Make the home screen lightweight; defer transit graph loading until route search. Add a dedicated fullscreen map picker and strengthen the existing version monitor with foreground events and cache-busting navigation while preserving the existing `hk-transit-build` metadata contract.

**Tech Stack:** Expo Router, React Native Web, TypeScript, Zustand, Leaflet, AsyncStorage, Jest/core tests, GitHub Actions, GitHub Pages.

## Global Constraints

- Work only on `fix/mobile-route-data-and-picker-v3` until PR verification passes.
- Do not remove `JourneyPolicy`, `candidatePools`, `walkingRouter`, or the existing 203E regression behavior.
- Keep `hk-transit-build` as the production build metadata key because current CI and Pages deployment validate it.
- Home page typing must not call `loadData()` or build the transit graph.
- A single provider failure must not make all journey data unavailable.
- KMB priority remains cache -> bundled snapshot -> background network refresh.
- Map code loads only when map picker is opened.
- Version checks run on startup, every 60 seconds, and on `visibilitychange`, `pageshow`, `focus`, and `online`.
- A detected build change must preserve the current URL and replace/add `build=<remoteBuildId>` with reload-loop protection.
- `npm run verify` and `npm run build:web` must pass in GitHub Actions before merge.

---

### Task 1: Resilient journey data loading without route-policy regression

**Files:**
- Modify: `src/stores/journeyStore.ts`
- Reuse: `src/journey/data/kmbTopology.ts`
- Test: `tests/core/journey-data-loader.test.cjs` or the repository's existing equivalent core test file
- Modify: `scripts/run-core-tests.cjs` when a new core test file is added

**Interfaces:**
- Consumes: `resolveKmbTopology()` from `src/journey/data/kmbTopology.ts`
- Preserves: `JourneyPolicy`, `retainCandidatePools`, `selectRouteAwareHubs`, `walkingRouter`, `sortJourneyOptions`
- Produces: provider-isolated `loadData()` and `pendingMapPick` state setters

- [ ] **Step 1: Add regression tests for KMB bundled fallback and provider isolation**

Test the real loader helper rather than duplicating the intended logic inside the test. The test must cover: KMB network failure still yields bundled data; one static provider rejection still yields usable combined data; all providers empty/failing yields an error result.

- [ ] **Step 2: Run the focused tests and confirm they fail against the unmodified current-main loader path**

Run the repository's core/Jest focused command and record the failing assertion.

- [ ] **Step 3: Integrate `resolveKmbTopology()` into the current latest journey store**

Keep the current candidate generation, transfer-aware planner, `JourneyPolicy`, walking router, ETA concurrency, and 203E-related behavior. Replace only the data-loading orchestration. Use `Promise.allSettled` for CTB/GMB/MTR and continue when at least one provider has usable stops and links.

- [ ] **Step 4: Add `pendingMapPick` state without changing route option types or ranking APIs**

Expose `pendingMapPick: { lat; lng; name; target } | null` and `setPendingMapPick()` for the map picker return flow.

- [ ] **Step 5: Run focused data-loader tests and existing journey-policy/candidate-pool/walking tests**

Expected: all pass.

---

### Task 2: Keep the journey home screen lightweight

**Files:**
- Modify: `app/(tabs)/index.tsx`
- Test: source regression check in `scripts/verify-mobile-ux.cjs` or a focused Jest/source test

**Interfaces:**
- Consumes: `searchAny`, `pendingMapPick`, `setPendingMapPick`
- Produces: lightweight home screen that navigates to `/journey/result` only after both points are selected

- [ ] **Step 1: Add a regression assertion that the home screen does not invoke `loadData()` from mount or typing effects**

The check must inspect/import the actual screen behavior or source, not a placeholder boolean.

- [ ] **Step 2: Remove all automatic topology loading from the home page**

Weather and location may refresh on mount. Destination text search may use lightweight geocoding. No transit graph build is allowed during typing.

- [ ] **Step 3: Remove the embedded map and nonessential copy**

Remove `為香港而設`, route-data-ready copy, and the embedded map panel. Keep the five route-policy controls on the result screen unchanged.

- [ ] **Step 4: Add the `地圖選址 / Pick on map` entry and consume `pendingMapPick` on return**

Default the picker target to the currently focused field; when neither is focused, choose destination unless the origin is missing.

- [ ] **Step 5: Run the home-screen regression check**

Expected: no `loadData()` call is reachable from initial render/typing.

---

### Task 3: Fullscreen crosshair map picker

**Files:**
- Create: `app/journey/map-picker.tsx`
- Modify: `app/_layout.tsx`
- Modify: `src/i18n/en.json`
- Modify: `src/i18n/zh-HK.json`

**Interfaces:**
- Consumes: current/GPS coordinates and `setPendingMapPick()`
- Produces: confirmed `{ lat, lng, name, target }`

- [ ] **Step 1: Build a fullscreen web map that lazy-imports Leaflet and CSS**

Use CARTO Voyager tiles. Disable default attribution and zoom controls if custom controls are used. Do not mount Leaflet on the journey home screen.

- [ ] **Step 2: Use a fixed center crosshair and update coordinates only on `moveend`**

Do not call React state setters or reverse-geocode during every drag frame. Keep center coordinates in a ref during interaction.

- [ ] **Step 3: Reverse-geocode only after movement stops**

Cache recent reverse-geocode results. Network failure must fall back to coordinates and must not block the confirm button.

- [ ] **Step 4: Add back, current-location, and confirm controls**

Confirm writes `pendingMapPick` and returns to the journey screen.

- [ ] **Step 5: Register the route in `app/_layout.tsx` and add bilingual strings**

Expected: the picker is a fullscreen modal/page on web and has a safe native fallback.

---

### Task 4: Strengthen automatic update without breaking Pages metadata

**Files:**
- Modify: `src/utils/versionMonitor.ts`
- Modify: `app/_layout.tsx`
- Modify only if necessary: `scripts/post-build.js`
- Test: `tests/core/version-monitor.test.cjs` and/or existing version-monitor tests

**Interfaces:**
- Preserves: `<meta name="hk-transit-build" ...>` and `dist/version.json`
- Produces: `startVersionMonitor()` cleanup function; pure URL/reload decision helpers for tests

- [ ] **Step 1: Add real tests around exported version-monitor helpers**

Cover same-build no reload; new build URL preserves pathname/query/hash; existing `build` param is replaced; reload guard blocks loops.

- [ ] **Step 2: Add foreground event triggers**

Check immediately on visible `visibilitychange`, `pageshow`, `focus`, and `online`, plus startup and the existing 60-second interval.

- [ ] **Step 3: On mismatch, clear only project-owned cache/service-worker state and navigate to the same URL with `build=<remoteBuildId>`**

Do not rename the existing `hk-transit-build` meta key. Do not delete unrelated browser caches.

- [ ] **Step 4: Ensure `app/_layout.tsx` installs and cleans up the monitor once**

Expected: no duplicate listeners during remount/HMR.

- [ ] **Step 5: Run version-monitor tests and build metadata checks**

Expected: `dist/version.json` has `buildId` and `dist/index.html` contains `name="hk-transit-build"`.

---

### Task 5: Verification, PR, merge, and Pages deployment

**Files:**
- Do not add a duplicate CI workflow unless it is required; use the existing `Verify HK Transit AI` workflow already on `main`.

- [ ] **Step 1: Run full branch verification through GitHub Actions**

Required commands in CI: `npm ci --no-audit --no-fund`, `npm run verify`, `npm run build:web`, and automatic refresh metadata verification.

- [ ] **Step 2: Review the final diff against latest `main`**

Confirm no deletion/reversion of `app/+html.tsx`, route policies, candidate pools, walking router, current result-screen policy chips, or 203E regression coverage.

- [ ] **Step 3: Open a PR from `fix/mobile-route-data-and-picker-v3` to `main`**

The PR must be mergeable and based on the current main head.

- [ ] **Step 4: Merge only after the PR workflow succeeds**

Use expected head SHA to prevent merging a moved branch.

- [ ] **Step 5: Verify `Deploy HK Transit AI V2`**

Require both `build` and `deploy` jobs to conclude `success` and verify the newest `github-pages` deployment SHA equals the merge commit SHA.
