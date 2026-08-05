# Journey Planner Implementation Plan

**Goal:** Multi-modal point-to-point journey planning (KMB + Citybus + Green Minibus + MTR) with fastest-route recommendation, deployed to production.

**Architecture:** Unified `TransitProvider` interface over 4 public APIs → stop merging into hubs → graph build → Dijkstra → ranked itineraries → new Journey tab UI.

**Tech Stack:** TypeScript, Zustand, existing Expo Web stack, Leaflet (optional map, Web only)

## Global Constraints
- All 4 providers reachable via public government APIs, no auth
- Travel times are estimates labeled as such in UI
- KMB provider reuses existing `src/services/kmbAPI.ts`
- Stop-name search is the primary input method; map picker optional
- Each task ends with passing tests + git commit + push
- Windows-compatible deploy (npm run deploy already fixed)

---

### Task 1: Unified Types + Travel Time Estimate

**Files:**
- Create: `src/journey/providers/types.ts`
- Create: `src/journey/graph/travelTime.ts`
- Test: `src/journey/graph/__tests__/travelTime.test.ts`

**Produces:**
- `ProviderId`, `Route`, `Stop`, `RouteStopLink`, `ETA`, `TransitProvider` (from spec §3.1)
- `estimateLegMinutes(from: {lat,lng}, to: {lat,lng}, provider: ProviderId): number`
- `estimateWalkMinutes(distanceMeters: number): number`

### Task 2: KMB + CTB Provider Adapters

**Files:**
- Create: `src/journey/providers/kmb.ts`
- Create: `src/journey/providers/ctb.ts`
- Test: `src/journey/providers/__tests__/ctb.test.ts`

**Produces:** `kmbProvider: TransitProvider`, `ctbProvider: TransitProvider` conforming to `TransitProvider`. CTB base: `https://rt.data.gov.hk/v2/transport/citybus`. CTB stop ids are 6-digit; routes endpoint `/route/ctb`, stops `/stop`, route-stop `/route-stop/ctb/{route}/{dir}`, eta `/eta/ctb/{stop}/{route}`.

### Task 3: GMB + MTR Provider Adapters

**Files:**
- Create: `src/journey/providers/gmb.ts`
- Create: `src/journey/providers/mtr.ts`
- Test: `src/journey/providers/__tests__/gmb.test.ts`

**Produces:** `gmbProvider`, `mtrProvider`. GMB base `https://data.etagmb.gov.hk`: `/route` (grouped by region), `/route/{region}/{route}`, `/stop`, `/route-stop/{route}/{route_type}`. MTR: `getSchedule.php` for ETA; station catalogue CSV for the fixed network (line→station sequence).

### Task 4: Stop Merger

**Files:**
- Create: `src/journey/graph/stopMerger.ts`
- Test: `src/journey/graph/__tests__/stopMerger.test.ts`

**Produces:** `mergeStops(providerStops: Stop[][]): StopHub[]`. Name-key match first (normalize: lowercase, strip suffixes like 站/station/公共運輸交匯處), then geo cluster ≤200m with ≥2 shared name tokens.

### Task 5: Graph Builder

**Files:**
- Create: `src/journey/graph/graphBuilder.ts`
- Test: `src/journey/graph/__tests__/graphBuilder.test.ts`

**Produces:** `buildGraph(providers, hubs): Graph`. Nodes = hubs. Ride edges from route-stop sequences (weight via `estimateLegMinutes`). Transfer edges between nearby hubs (weight via `estimateWalkMinutes`). MTR edges from the station sequence CSV.

### Task 6: Planner (Dijkstra)

**Files:**
- Create: `src/journey/planner/planner.ts`
- Test: `src/journey/planner/__tests__/planner.test.ts`

**Produces:** `planJourney(graph, fromHubId, toHubId): Itinerary[]`. Dijkstra min-heap, returns ranked itineraries with legs and totalMinutes. Direct routes flagged.

### Task 7: Journey Store (orchestration + caching)

**Files:**
- Create: `src/stores/journeyStore.ts`

**Produces:** `useJourneyStore` — loads all providers' data once (cached), builds graph lazily, exposes `search(fromQuery, toQuery)`, `plan(fromHubId, toHubId)`. Status: loading/ready/error.

### Task 8: Journey Tab UI

**Files:**
- Modify: `app/(tabs)/_layout.tsx` (add 5th tab)
- Create: `app/(tabs)/journey.tsx`
- Create: `app/journey/result.tsx`
- Modify: `src/i18n/en.json`, `src/i18n/zh-HK.json`

**Produces:** From/To stop search inputs (debounced), swap button, search → result page with ranked itineraries, fastest/direct badges, expandable legs.

### Task 9: Integration + Deploy

- Full test suite pass, tsc clean, expo export web, npm run deploy.
- Manual smoke: direct route, KMB→MTR transfer, no-result case.
- Update README with new feature + roadmap.
