# Web Search, Location, and Live Navigation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a reviewable Web build with exact route search, provider-neutral saved-route navigation, reliable browser GPS, and efficient in-app live maps while reserving the same interfaces for a later iOS adapter.

**Architecture:** Keep the app local-first. Consolidate route identity and location state into shared typed boundaries, let screens consume those boundaries, and split map data from the platform renderer so Web Leaflet can update persistent layers now and iOS Apple Maps can be added only after Web approval.

**Tech Stack:** Expo Router 57, React Native Web, TypeScript, Zustand, Leaflet, Jest, Node core tests.

## Global Constraints

- Do not add a project-operated backend or unrestricted client API key.
- Ask for location only from a user gesture; first acquisition times out after 12 seconds.
- Web maps stay inside the app and use optimized Leaflet.
- Keep Traditional Chinese and English copy in sync.
- Do not implement iOS, Android, background location, vehicle tracking, or turn-by-turn guidance in this plan.
- Use TDD: each production behavior must have a test that was observed failing first.

---

### Task 1: Rank searches and unify saved-route details

**Files:** Modify `src/journey/search/routeCatalog.ts`, `src/stores/favoriteStore.ts`, `app/(tabs)/favorites.tsx`, `app/route-detail.tsx`, and their focused tests.

**Interfaces:** Produce `RouteIdentity`, a persisted saved-route v2 containing `provider`, `route`, `bound`, optional `routeVariant`, and `stopId`, plus route-detail support for an optional `stopId` query parameter.

- [ ] Add failing core tests proving exact public codes precede prefix/text matches and ties use deterministic provider order.
- [ ] Run the focused core test and confirm the relevance assertions fail for the current filter-only implementation.
- [ ] Implement relevance scoring and deterministic sorting without fuzzy search.
- [ ] Add failing store/UI tests for v1-to-v2 KMB migration and saved-route navigation to provider-neutral details with the stop id.
- [ ] Implement persisted version 2, migration, provider-aware identity, and detail-page auto-expansion/ETA loading.
- [ ] Run focused core and Jest tests, then commit the task.

### Task 2: Consolidate explicit, recoverable location

**Files:** Modify `src/stores/locationStore.ts`, `src/stores/navigationStore.ts`, journey/nearby screens, translations, and focused location/navigation tests.

**Interfaces:** Produce `LocationStatus`, `LocationSample`, `locateOnce()`, `startTracking()`, `stopTracking()`, and `retry()` on the shared store. Navigation subscribes to samples and never calls `expo-location` directly.

- [ ] Add failing tests for no automatic permission request, recent last-known use, 12-second timeout, retry, initial fix before tracking, sample propagation, and subscription cleanup.
- [ ] Run the focused tests and confirm failures identify missing shared behavior.
- [ ] Implement the minimal shared location lifecycle with generation guards and user-facing error states.
- [ ] Move navigation timing updates to shared samples and remove its direct location watcher.
- [ ] Wire My Location, Nearby, and Navigation retry states to the shared lifecycle with bilingual copy.
- [ ] Run focused core/Jest tests, then commit the task.

### Task 3: Make Leaflet updates persistent and live navigation visible

**Files:** Modify the shared map types/renderer, `NavigationModal`, map picker integration, and focused map tests.

**Interfaces:** Require stable `id` on `MapPoint`; preserve `MapPath.id`; keep `center`, `points`, `paths`, `followPoint`, `followZoom`, and recenter behavior as the platform-neutral map contract.

- [ ] Add failing tests proving a position update reuses the map/tile layer, moves the existing marker, leaves unchanged polylines intact, and drag/recenter toggles follow state.
- [ ] Run the focused tests and confirm the current full layer-group replacement fails them.
- [ ] Implement keyed marker/polyline reconciliation and one-time Leaflet/tile initialization.
- [ ] Update all callers with stable point ids and show current location accuracy/update state plus retry in live navigation.
- [ ] Verify estimated walking fallback remains dashed and honestly labelled.
- [ ] Run focused core/Jest tests, then commit the task.

### Task 4: Verify, document, and prepare Web review

**Files:** Modify `CHANGELOG.md`, `docs/PROJECT_STATUS.md`, and `docs/VERIFICATION_REPORT.md`; create only build artifacts ignored by Git.

- [ ] Run `npm run data:refresh`, review any snapshot changes separately, and retain them only if schema/version checks pass.
- [ ] Run `npm run verify` and fix only evidenced regressions through new red-green cycles.
- [ ] Run `npm run build:web` and verify the GitHub Pages base path and journey-index artifacts.
- [ ] Update project status, changelog, and verification report with exact commands/results and the explicit iOS-after-Web-approval gate.
- [ ] Review the full branch diff for scope, secrets, bilingual parity, and honest navigation claims.
- [ ] Create a remote feature branch based on the real GitHub `main` SHA and publish the reviewed changes without modifying `main`.
