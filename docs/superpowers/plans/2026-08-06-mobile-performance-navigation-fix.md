# HK Transit AI Mobile Performance and Navigation Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a fast, phone-native journey flow with lazy high-DPI maps, visible primary actions, clear route-start feedback and reusable iOS architecture.

**Architecture:** Preserve Expo Router and Zustand. Add small pure performance utilities for TTL/deduplication and bounded concurrency, make the map lazy at the screen level, and replace the hidden in-page navigation panel with a modal navigation surface. Data refresh becomes stale-while-revalidate rather than blocking first interaction.

**Tech Stack:** Expo SDK 57, React Native Web, Expo Router, Zustand, TypeScript, Leaflet, i18next, public Hong Kong transport APIs.

## Global Constraints

- No project-operated backend.
- Traditional Chinese and English keys remain in sync.
- Core planning and navigation remain platform-neutral for iOS reuse.
- Missing live data must fall back to an explicit estimate.
- Home map must not initialize until the user opens it.

---

### Task 1: Pure performance utilities

**Files:**
- Create: `src/utils/requestCache.ts`
- Create: `src/utils/asyncPool.ts`
- Modify: `tsconfig.core.json`
- Modify: `tests/core/run-core-tests.cjs`

- [ ] Add failing core tests for TTL cache reuse, in-flight request deduplication and maximum async concurrency.
- [ ] Run `npm run test:core` and confirm the new tests fail because the modules do not exist.
- [ ] Implement the two pure utilities.
- [ ] Run `npm run test:core` and confirm all tests pass.

### Task 2: Cached network/data paths

**Files:**
- Modify: `src/services/kmbAPI.ts`
- Modify: `src/journey/providers/http.ts`
- Modify: `src/stores/routeStore.ts`
- Modify: `src/stores/journeyStore.ts`

- [ ] Wrap repeated API GETs with in-flight deduplication and TTL caching.
- [ ] Change route/topology loading to use cached data immediately and refresh without returning the UI to a blocking state.
- [ ] Enrich only the four best rough route candidates and execute ETA calls through a concurrency-three pool.
- [ ] Keep estimated fallback values when realtime calls fail or exceed their provider timeout.

### Task 3: Mobile document and map

**Files:**
- Create: `app/+html.tsx`
- Modify: `src/components/TransitMap.tsx`

- [ ] Add explicit mobile viewport, safe-area CSS and Leaflet stylesheet preload.
- [ ] Add a map loading shell, retina tile URL, reduced animation and efficient tile options.
- [ ] Ensure native behavior still opens Apple Maps and no web-only global is used outside the web branch.

### Task 4: Home screen mobile-first flow

**Files:**
- Modify: `app/(tabs)/index.tsx`
- Modify: `src/i18n/en.json`
- Modify: `src/i18n/zh-HK.json`

- [ ] Remove hero/promise copy that pushes the action below the fold.
- [ ] Put search inputs and the primary action in a compact first viewport.
- [ ] Add a collapsible map picker; keep it closed by default.
- [ ] Use a longer geocode debounce while retaining immediate local stop results.
- [ ] Add a sticky bottom action on phone-sized web/native layouts.

### Task 5: Results-first screen and navigation modal

**Files:**
- Create: `src/components/NavigationModal.tsx`
- Modify: `app/journey/result.tsx`
- Modify: `src/components/JourneyOptionCard.tsx`
- Modify: `src/components/LiveJourneyPanel.tsx`
- Modify: `src/i18n/en.json`
- Modify: `src/i18n/zh-HK.json`

- [ ] Render route controls/cards before the map and remove nonessential explanatory blocks.
- [ ] Make card selection also expand the selected route.
- [ ] Add a route-map toggle.
- [ ] Open the navigation modal immediately when Start is pressed and show permission/tracking errors there.
- [ ] Keep stop/next-stage controls and allow dismissing/stopping navigation.

### Task 6: Verification, documentation and deployment

**Files:**
- Modify: `CHANGELOG.md`
- Modify: `docs/IOS_HANDOFF.md`
- Modify: `docs/PROJECT_STATUS.md`

- [ ] Run `npm run test:core`.
- [ ] Run `npm run verify:types`.
- [ ] Run `npm run verify:source`.
- [ ] Run `npm run verify:handoff`.
- [ ] Run `npm run build:web` in GitHub Actions.
- [ ] Commit all changes to `main`, deploy GitHub Pages and verify the Pages deployment status is `succeed`.
