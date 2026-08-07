# Journey Ranking, Walking Accuracy, Map Loading, and Auto-Update Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make route choices direct/low-transfer first, provide materially different route policies, improve walking estimates, delay map loading, and automatically reload stale deployed pages.

**Architecture:** Extract pure journey-policy and pedestrian-routing modules so candidate selection, ranking, fallback walking estimates, and update decisions can be tested without React or network dependencies. Keep the existing Zustand store as orchestration, but make it generate separate direct/one-transfer/two-transfer pools and enrich only shortlisted candidates with walking routes and ETA. Generate build metadata during `post-build.js` and run a small web-only update monitor from the root layout.

**Tech Stack:** TypeScript, React Native Web/Expo Router, Zustand, Leaflet, Valhalla-compatible pedestrian HTTP API, Node core test runner, GitHub Actions, GitHub Pages.

## Global Constraints

- Boarding and alighting radius remains 1,200 metres.
- Route-aware nearby-hub working set is capped at 20 hubs per side.
- Candidate pools retain at most 8 direct, 8 one-transfer, and 4 two-transfer routes.
- Three-or-more-transfer routes are rejected.
- Every service change costs 10 generalized minutes during route discovery.
- Walking-transfer uncertainty adds 2 generalized minutes.
- A direct route stays ahead of a transfer route unless more than 15 physical minutes slower.
- Pedestrian route timeout is 5 seconds, cache lifetime is 24 hours, and request concurrency is 4.
- Walking fallback uses haversine × 1.35, 70 metres/minute, minimum 2 minutes.
- Open stale pages check `version.json` immediately and every 60 seconds, then reload immediately with five-minute loop protection.

---

### Task 1: Pure route policies and transfer-aware planning

**Files:**
- Create: `src/journey/planner/routePolicies.ts`
- Modify: `src/journey/planner/planner.ts`
- Modify: `src/journey/model/types.ts`
- Modify: `tsconfig.core.json`
- Test: `tests/core/journey-policy.test.cjs`
- Modify: `scripts/run-core-tests.cjs`

**Interfaces:**
- Produces `JourneyPolicy = 'recommended' | 'direct' | 'oneTransfer' | 'fastest' | 'lessWalking'`.
- Produces `applyJourneyPolicy<T extends PolicyOption>(options, policy): T[]`.
- Extends `planJourney(graph, fromHubId, toHubId, options?)` with `{ transferPenaltyMinutes: number; transferWalkBufferMinutes: number; maxTransfers: number }`.

- [ ] **Step 1: Write failing policy and planner tests**

Test direct-first ordering, one-transfer filtering, fastest ordering, less-walking ordering, the 15-minute direct tolerance, and rejection of a three-transfer path.

- [ ] **Step 2: Run `npm run test:core` and verify the new tests fail**

Expected: module-not-found or missing-export failures for `routePolicies` and planner options.

- [ ] **Step 3: Implement `routePolicies.ts`**

Use this option surface:

```ts
export interface PolicyOption {
  totalMinutes: number;
  walkingMeters: number;
  waitMin: number;
  itinerary: { transfers: number; isDirect: boolean };
}

export function applyJourneyPolicy<T extends PolicyOption>(
  options: T[],
  policy: JourneyPolicy
): T[];
```

Recommended mode must compare transfer count first, except a direct option may be overtaken when it is more than 15 minutes slower. `direct` groups direct routes first; `oneTransfer` filters transfers above one; `fastest` sorts by total time; `lessWalking` sorts by walking distance.

- [ ] **Step 4: Make planner search state route-aware**

Track the active service key and transfer count in Dijkstra state. Add 10 generalized minutes when changing service, add 2 minutes to transfer walking edges, and do not enqueue states above `maxTransfers`.

- [ ] **Step 5: Run core tests and commit**

Expected: all existing tests plus policy/planner tests pass.

---

### Task 2: Candidate generation, diversity, and 203E regression

**Files:**
- Create: `src/journey/planner/candidatePools.ts`
- Modify: `src/stores/journeyStore.ts`
- Modify: `tsconfig.core.json`
- Test: `tests/core/candidate-pools.test.cjs`
- Modify: `scripts/run-core-tests.cjs`

**Interfaces:**
- Produces `selectRouteAwareHubs(hubs, origin, graph, radius, limit)`.
- Produces `retainCandidatePools(candidates, limits)` preserving direct/one-transfer/two-transfer pools.
- Store `plan(from, to, weather, policy?)` returns options after policy filtering/ranking.

- [ ] **Step 1: Write failing candidate-pool tests**

Build a deterministic graph where route `203E` boards near Hong Kong Eye Hospital and alights near Po Kong Village Road School Village. Assert it remains in the direct pool even when faster transfer candidates exist. Assert pool limits 8/8/4 and route-sequence diversity.

- [ ] **Step 2: Run the focused core test and verify failure**

Expected: missing candidate-pool module.

- [ ] **Step 3: Implement route-aware nearby hub selection**

Collect all hubs in radius, sort by distance, then retain nearest hubs while ensuring distinct route coverage before applying the 20-hub cap.

- [ ] **Step 4: Replace the global four-candidate cap**

Generate direct routes first, transfer routes second, reject transfers above two, deduplicate by full ride sequence and boarding/alighting hubs, then retain 8 direct, 8 one-transfer, and 4 two-transfer candidates.

- [ ] **Step 5: Apply the selected policy before returning results**

Only shortlisted candidates receive ETA and pedestrian-route enrichment. Policy changes operate on the complete retained candidate set rather than the original four options.

- [ ] **Step 6: Run core tests and commit**

Expected: 203E regression and pool-diversity tests pass.

---

### Task 3: Pedestrian road routing and conservative fallback

**Files:**
- Create: `src/journey/walking/walkingRouter.ts`
- Modify: `src/journey/graph/travelTime.ts`
- Modify: `src/stores/journeyStore.ts`
- Modify: `tsconfig.core.json`
- Test: `tests/core/walking-router.test.cjs`
- Modify: `scripts/run-core-tests.cjs`

**Interfaces:**
- Produces `WalkingRoute { meters; minutes; geometry; source: 'routed' | 'estimated' }`.
- Produces `createWalkingRouter({ fetchImpl, endpoint, now })` with `route(from, to)`.
- Uses `https://valhalla1.openstreetmap.de/route` by default and sends `costing: 'pedestrian'` plus `X-Client-Id: hk-transit-ai`.

- [ ] **Step 1: Write failing routing tests**

Cover Valhalla success parsing, 5-second abort fallback, 24-hour cache reuse, and conservative fallback calculation.

- [ ] **Step 2: Verify tests fail**

Expected: missing walking-router module.

- [ ] **Step 3: Implement the adapter**

Cache by coordinate pairs rounded to five decimals. Parse trip summary length/time and decoded shape when supplied. On HTTP, parse, timeout, or network failure, return fallback distance/time and straight geometry.

- [ ] **Step 4: Enrich shortlisted candidates with maximum concurrency four**

Route origin→boarding and alighting→destination. Replace straight-line meters/minutes and include routed walking geometry. Mark `walkingSource` on each journey option.

- [ ] **Step 5: Run tests and commit**

Expected: routing, cache, timeout, and fallback tests pass.

---

### Task 4: Real route-policy controls and lazy map loading

**Files:**
- Modify: `src/components/JourneyModeChips.tsx`
- Modify: `src/components/JourneyOptionCard.tsx`
- Modify: `app/journey/result.tsx`
- Modify: `src/components/TransitMap.tsx`
- Modify: `app/+html.tsx`
- Modify: `src/i18n/en.json`
- Modify: `src/i18n/zh-HK.json`

**Interfaces:**
- Chips use `JourneyPolicy`, not weather comfort modes.
- Result screen replans or reapplies policy and shows a direct-unavailable explanation.
- Cards display direct/transfer count, walking metres/minutes, and routed/estimated status.

- [ ] **Step 1: Replace the five chip labels**

Use Comprehensive / Direct first / At most one transfer / Fastest / Less walking in both languages.

- [ ] **Step 2: Make policy changes visibly alter results**

Call policy-aware planning or filtering when the chip changes. Reset selection to the first visible option. Show an explanatory note when direct mode has no direct option.

- [ ] **Step 3: Add transparent walking labels to cards**

Display metres and minutes and either Road-routed / Estimated.

- [ ] **Step 4: Remove global Leaflet CSS/preconnects**

Inject Leaflet CSS only when `TransitMap` mounts. The result screen already mounts the map only after the user opens it; preserve that behavior and avoid loading map resources before expansion.

- [ ] **Step 5: Run source, mobile UX, and type verification**

Expected: translation-key parity and all TypeScript checks pass.

---

### Task 5: Automatic deployed-version refresh

**Files:**
- Create: `src/utils/versionMonitor.ts`
- Modify: `app/_layout.tsx`
- Modify: `scripts/post-build.js`
- Modify: `scripts/verify-handoff.cjs`
- Modify: `tsconfig.core.json`
- Test: `tests/core/version-monitor.test.cjs`
- Modify: `scripts/run-core-tests.cjs`

**Interfaces:**
- Produces `shouldReloadVersion(current, remote, guard)` and `startVersionMonitor(options)`.
- `post-build.js` writes `dist/version.json` with `{ buildId, commitSha, builtAt }` and embeds the same current build identifier into `dist/index.html` as `meta[name="hk-transit-build"]`.

- [ ] **Step 1: Write failing version tests**

Cover matching versions, changed versions, five-minute same-target loop protection, and missing/invalid metadata.

- [ ] **Step 2: Implement pure decision logic and browser monitor**

Fetch `/HK-Transit-AI/version.json?t=<timestamp>` with `cache: 'no-store'` immediately and every 60 seconds. Before reload, clear Cache Storage, unregister service workers, store guard data in session storage, and call `location.reload()`.

- [ ] **Step 3: Generate and verify build metadata**

Use `GITHUB_SHA` when available; otherwise derive a build ID from timestamp plus entry bundle name. Fail `post-build.js` if `version.json` cannot be written or has an empty `buildId`.

- [ ] **Step 4: Start the monitor from the root layout on web only**

Cleanup the interval on unmount.

- [ ] **Step 5: Run core and build verification and commit**

Expected: version tests pass and `dist/version.json` exists after `npm run build:web`.

---

### Task 6: Full verification, PR, merge, and Pages deployment

**Files:**
- Modify: `.github/workflows/verify-local-first-kmb.yml`
- Modify: `.github/workflows/deploy.yml`

- [ ] **Step 1: Add an explicit build-metadata gate**

After `npm run build:web`, run:

```bash
node -e "const v=require('./dist/version.json'); if(!v.buildId) process.exit(1)"
```

- [ ] **Step 2: Run `npm run verify` and `npm run build:web`**

Expected: all core tests, type checks, source checks, mobile checks, handoff checks, and production build pass.

- [ ] **Step 3: Open a pull request and wait for CI**

Do not merge until the PR workflow completes successfully on the final head SHA.

- [ ] **Step 4: Merge and verify Pages**

Verify the main-branch deployment build and deploy jobs both report success and the latest deployment SHA equals the merge SHA.
