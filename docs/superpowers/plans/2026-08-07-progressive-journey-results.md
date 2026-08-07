# Progressive Journey Results Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace result-page full-graph startup with a build-time compact journey index that can return 3–5 practical routes quickly, then refine in the background without automatically reordering the visible list.

**Architecture:** Generate a compact route-centric index during `npm run build:web`, containing merged hubs, spatial cells, ordered route sequences, cumulative ride times, and route-transfer relationships. Runtime Stage 1 loads only this index and performs bounded direct/one-transfer lookups; Stage 2 expands a bounded route-level search, yields between chunks, then enriches candidates with walking routing and ETA. The result screen keeps initial and refined result sets separate and only applies refined results when the user taps `發現更優路線` / `Better routes found`.

**Tech Stack:** Expo Router 57, React Native Web 0.21, React 19, TypeScript 5.7, Zustand 5, Node.js build scripts, existing walkingRouter / provider ETA APIs, GitHub Pages.

## Global Constraints

- Primary target: first 3–5 practical routes visible within 1 second on a normal mobile device/network when the build-time index is cached or reasonably fast to fetch.
- Warm-cache target: preferably under 500 ms.
- No synchronous full-network `buildGraph()` on result-page entry.
- No 10×10 exhaustive full-graph search loop before first render.
- Stage 1 must not wait for pedestrian routing or live ETA.
- Direct routes remain strongly preferred; a direct route stays ahead when it is no more than 15 minutes slower than a transfer route.
- Do not display routes with more than two transfers.
- Preserve candidate diversity and the 203E Hong Kong Eye Hospital → Tsz Ching Estate direct-route regression.
- Background refinement must not automatically reorder visible routes.
- Minor ETA-only changes must not trigger the better-results banner.
- KMB local/bundled fallback and current GitHub Pages version metadata contract must remain intact.
- A single provider, walking, or ETA failure must degrade gracefully rather than fail the whole planner.

---

## File Structure

Create these focused units:

- `scripts/build-journey-index.cjs` — convert existing KMB/CTB/GMB/MTR snapshots into static journey-index JSON before Expo export.
- `scripts/verify-journey-index.cjs` — structural and regression verification for generated index files.
- `src/journey/index/types.ts` — runtime index and indexed-candidate interfaces.
- `src/journey/index/loader.ts` — fetch/cache static index shards from `/HK-Transit-AI/data/journey/`.
- `src/journey/index/fastPlanner.ts` — bounded Stage 1 direct + one-transfer lookup with conservative walking/service estimates.
- `src/journey/index/refinePlanner.ts` — bounded two-transfer route-level expansion and async walking/ETA enrichment with cooperative yielding.
- `src/journey/index/betterResults.ts` — deterministic comparison deciding whether refined results justify the update banner.
- `src/journey/index/progressivePlanner.ts` — public orchestration interface used by the result screen.
- `tests/core/journey-index.test.cjs` — index schema, direct lookup, 203E, bounded-operation tests.
- `tests/core/progressive-planner.test.cjs` — Stage 1/Stage 2 and better-result behavior tests.

Modify:

- `package.json`
- `scripts/run-core-tests.cjs`
- `scripts/post-build.js`
- `scripts/verify-handoff.cjs`
- `tsconfig.core.json`
- `app/journey/result.tsx`
- `src/i18n/zh-HK.json`
- `src/i18n/en.json`
- `.github/workflows/deploy.yml`
- `.github/workflows/verify-local-first-kmb.yml`

Keep `src/stores/journeyStore.ts` as the legacy/deep-planning implementation for ETA screens and compatibility during migration, but the result page must stop calling `loadData()` and `plan()` on its critical path.

---

### Task 1: Build the Compact Journey Index

**Files:**
- Create: `scripts/build-journey-index.cjs`
- Create: `scripts/verify-journey-index.cjs`
- Modify: `package.json`
- Test: `tests/core/journey-index.test.cjs`

**Interfaces:**
- Consumes: `src/data/kmb.json`, `src/data/ctb.json`, `src/data/gmb.json`, `src/data/mtr_stations.json`.
- Produces under `public/data/journey/`:
  - `meta.json`
  - `hubs.json`
  - `cells.json`
  - `routes.json`
  - `route-neighbors.json`

Generated shape:

```ts
interface IndexedHub {
  id: string;
  name_en: string;
  name_tc: string;
  name_sc: string;
  lat: number;
  lng: number;
  members: Array<{ provider: ProviderId; stopId: string }>;
  services: Array<{ routeKey: string; seq: number }>;
}

interface IndexedRoute {
  routeKey: string;
  provider: ProviderId;
  route: string;
  bound: 'O' | 'I';
  hubs: string[];
  cumulativeMinutes: number[];
}

interface IndexedTransfer {
  toRouteKey: string;
  hubId: string;
  fromSeq: number;
  toSeq: number;
}
```

- [ ] **Step 1: Write a failing build-index test**

Create `tests/core/journey-index.test.cjs` that removes a temporary output directory, calls exported generator helpers from `scripts/build-journey-index.cjs`, and asserts that a synthetic two-route topology produces merged hubs, ordered sequences, cumulative minutes, spatial-cell membership, and a route-neighbor transfer record.

Use a synthetic dataset containing route `KMB:203E:O` plus a second intersecting route. Assert:

```js
assert.equal(index.routes['KMB:203E:O'].hubs[0], 'hub-eye');
assert.ok(index.routes['KMB:203E:O'].cumulativeMinutes.at(-1) > 0);
assert.ok(index.routeNeighbors['KMB:203E:O'].some((x) => x.toRouteKey === 'KMB:X1:O'));
assert.ok(Object.values(index.cells).some((ids) => ids.includes('hub-eye')));
```

- [ ] **Step 2: Run the test and verify RED**

Run:

```bash
node tests/core/journey-index.test.cjs
```

Expected: FAIL because `scripts/build-journey-index.cjs` does not exist.

- [ ] **Step 3: Implement the generator**

Implement pure helpers in `scripts/build-journey-index.cjs` and export them for tests:

```js
module.exports = {
  buildJourneyIndex,
  writeJourneyIndex,
  cellKey,
};
```

Use the current `stopMerger.ts` normalization rules and the current `travelTime.ts` provider speed constants exactly:

```js
const MODE_SPEED = {
  KMB: { kmh: 20, dwell: 0.6, circuity: 1.45 },
  CTB: { kmh: 20, dwell: 0.6, circuity: 1.45 },
  GMB: { kmh: 25, dwell: 0.5, circuity: 1.35 },
  MTR: { kmh: 35, dwell: 1.0, circuity: 1.12 },
};
```

Use a `0.01°` spatial cell. Build route-neighbor records only for routes sharing the same merged hub; do not precompute all route-pair Cartesian products.

When invoked as a script, write minified JSON into `public/data/journey/` and log counts and byte sizes.

- [ ] **Step 4: Make `npm run build:web` generate the index before Expo export**

Change `package.json`:

```json
"build:journey-index": "node scripts/build-journey-index.cjs",
"build:web": "npm run build:journey-index && expo export --platform web && node scripts/post-build.js"
```

- [ ] **Step 5: Add structural verification**

`scripts/verify-journey-index.cjs` must verify:

```text
meta.schemaVersion === 1
hubs.length > 1000
Object.keys(routes).length > 100
Object.keys(cells).length > 100
KMB:203E:O or KMB:203E:I exists
at least one 203E route contains a hub within 500 m of Hong Kong Eye Hospital test coordinate
at least one later 203E hub is within 700 m of Po Kong Village Road School Village test coordinate
all route cumulativeMinutes arrays match hubs length and are monotonic
```

- [ ] **Step 6: Run tests and generator**

Run:

```bash
node tests/core/journey-index.test.cjs
npm run build:journey-index
node scripts/verify-journey-index.cjs
```

Expected: all PASS.

- [ ] **Step 7: Commit**

```bash
git add scripts/build-journey-index.cjs scripts/verify-journey-index.cjs tests/core/journey-index.test.cjs package.json public/data/journey
git commit -m "feat: generate compact journey index"
```

---

### Task 2: Add Runtime Index Types and Loader

**Files:**
- Create: `src/journey/index/types.ts`
- Create: `src/journey/index/loader.ts`
- Modify: `tsconfig.core.json`
- Test: `tests/core/progressive-planner.test.cjs`

**Interfaces:**
- Produces:

```ts
export interface JourneyIndexBundle {
  meta: JourneyIndexMeta;
  hubs: IndexedHub[];
  hubById: Map<string, IndexedHub>;
  cells: Record<string, string[]>;
  routes: Record<string, IndexedRoute>;
  routeNeighbors: Record<string, IndexedTransfer[]>;
}

export function loadJourneyIndex(options?: {
  basePath?: string;
  fetchImpl?: typeof fetch;
}): Promise<JourneyIndexBundle>;

export function resetJourneyIndexCache(): void;
```

- [ ] **Step 1: Write failing loader tests**

Add tests that inject a fake `fetchImpl`, call `loadJourneyIndex()` twice, and assert each shard URL is fetched once and the second call reuses the in-memory promise.

Expected shard URLs:

```text
/HK-Transit-AI/data/journey/meta.json
/HK-Transit-AI/data/journey/hubs.json
/HK-Transit-AI/data/journey/cells.json
/HK-Transit-AI/data/journey/routes.json
/HK-Transit-AI/data/journey/route-neighbors.json
```

- [ ] **Step 2: Run and verify RED**

Run:

```bash
npm run test:core
```

Expected: loader symbols missing.

- [ ] **Step 3: Implement loader with one shared in-flight promise**

`loadJourneyIndex()` should use `Promise.all` for the small static shards, validate `meta.schemaVersion === 1`, build `hubById`, and throw a concise `Journey index unavailable` error on malformed data.

Do not import raw `src/data/*.json` from runtime TypeScript.

- [ ] **Step 4: Add index modules to `tsconfig.core.json`**

Add:

```json
"src/journey/index/**/*.ts"
```

to `include`.

- [ ] **Step 5: Run tests and type verification**

```bash
npm run test:core
npm run verify:types
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/journey/index/types.ts src/journey/index/loader.ts tsconfig.core.json tests/core/progressive-planner.test.cjs
git commit -m "feat: load compact journey index"
```

---

### Task 3: Implement the Bounded Stage 1 Fast Planner

**Files:**
- Create: `src/journey/index/fastPlanner.ts`
- Modify: `tests/core/progressive-planner.test.cjs`

**Interfaces:**
- Consumes: `JourneyIndexBundle`, `TripPoint`-compatible coordinates, `JourneyPolicy`.
- Produces:

```ts
export interface IndexedJourneyOption {
  id: string;
  totalMinutes: number;
  walkingMinutes: number;
  walkingMeters: number;
  walkingSource: 'estimated' | 'routed';
  waitMin: number;
  waitStatus: 'estimated' | 'live' | 'unavailable';
  itinerary: {
    transfers: number;
    isDirect: boolean;
    legs: IndexedJourneyLeg[];
  };
  boardProvider: ProviderId;
  boardRoute: string;
  boardBound: 'O' | 'I';
  boardHubId: string;
  alightHubId: string;
}

export function planFastJourney(
  index: JourneyIndexBundle,
  from: { lat: number; lng: number; name: string },
  to: { lat: number; lng: number; name: string },
  policy: JourneyPolicy,
  options?: { maxResults?: number; maxHubCandidates?: number; maxTransferExpansions?: number }
): IndexedJourneyOption[];
```

Defaults:

```ts
maxResults = 5
maxHubCandidates = 12
maxTransferExpansions = 300
```

- [ ] **Step 1: Write failing fast-planner tests**

Cover:

```text
returns direct route before transfer route
returns no more than 5 options
never returns >1 transfer in Stage 1
203E synthetic/fixture case is returned as direct
operation counter never exceeds maxTransferExpansions
walking uses haversine * 1.35 and 70 m/min fallback
wait uses DEFAULT_WAIT_MINUTES without calling provider APIs
```

Expose an optional test-only stats object in return metadata or `options.onStats` so tests can assert bounded expansions without timing-based flakiness.

- [ ] **Step 2: Run tests and verify RED**

```bash
npm run test:core
```

Expected: `planFastJourney` missing.

- [ ] **Step 3: Implement nearby-hub lookup using `cells.json`**

Only inspect the origin/destination cell and its immediate neighbors, calculate haversine distance, keep hubs within 1,200 m, then cap at `maxHubCandidates` while preserving route diversity.

- [ ] **Step 4: Implement direct lookup without Dijkstra**

For every origin-hub service, look for destination hubs containing the same `routeKey` with destination `seq > origin seq`. Ride time is:

```ts
route.cumulativeMinutes[toSeq] - route.cumulativeMinutes[fromSeq]
```

- [ ] **Step 5: Implement bounded one-transfer lookup**

For each origin route, inspect precomputed `routeNeighbors[originRoute]`. Only accept neighbor routes that appear on a destination hub at a later sequence. Increment an expansion counter and stop at 300.

- [ ] **Step 6: Apply existing route policy semantics**

Reuse the same policy ordering constants/logic where possible. Stage 1 `recommended` must prioritize transfer count and keep a direct route ahead unless >15 minutes slower.

- [ ] **Step 7: Run tests**

```bash
npm run test:core
npm run verify:types
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/journey/index/fastPlanner.ts tests/core/progressive-planner.test.cjs
git commit -m "feat: add bounded fast journey planner"
```

---

### Task 4: Implement Stage 2 Refinement Without Main-Thread Monopolization

**Files:**
- Create: `src/journey/index/refinePlanner.ts`
- Modify: `tests/core/progressive-planner.test.cjs`

**Interfaces:**

```ts
export async function refineJourneyOptions(
  index: JourneyIndexBundle,
  initial: IndexedJourneyOption[],
  from: TripPoint,
  to: TripPoint,
  policy: JourneyPolicy,
  deps: {
    routeWalking: (from: TripPoint, to: TripPoint) => Promise<WalkingRoute>;
    fetchDeparture: (provider: ProviderId, route: string, bound: 'O' | 'I', stopId: string, walkMinutes: number) => Promise<DepartureEstimate>;
    yieldToBrowser?: () => Promise<void>;
  }
): Promise<IndexedJourneyOption[]>;
```

- [ ] **Step 1: Write failing refinement tests**

Assert:

```text
Stage 2 may produce two-transfer candidates but never >2 transfers
yieldToBrowser is called during route expansion
walking failures keep estimated Stage 1 values
ETA failures keep fallback wait values
refinement does not mutate the initial array
provider/API failure leaves usable routes intact
```

- [ ] **Step 2: Run tests and verify RED**

```bash
npm run test:core
```

- [ ] **Step 3: Implement bounded route-level two-transfer expansion**

Search route keys, not the full stop graph. Use a queue of route states and `routeNeighbors`; cap total route-neighbor expansions at 1,000 and call:

```ts
await yieldToBrowser();
```

after every 100 expansions. Default browser yield:

```ts
() => new Promise((resolve) => setTimeout(resolve, 0))
```

- [ ] **Step 4: Refine only the retained candidate set**

Before calling walking/ETA dependencies, prune to at most:

```text
8 direct
8 one-transfer
4 two-transfer
```

with route-sequence diversity.

- [ ] **Step 5: Run walking and ETA enrichment with concurrency 4**

Reuse `mapWithConcurrency`. All dependency failures must fall back to the existing conservative estimates.

- [ ] **Step 6: Run tests and commit**

```bash
npm run test:core
npm run verify:types
git add src/journey/index/refinePlanner.ts tests/core/progressive-planner.test.cjs
git commit -m "feat: refine journey routes in bounded background work"
```

---

### Task 5: Add Better-Result Detection and Progressive Orchestration

**Files:**
- Create: `src/journey/index/betterResults.ts`
- Create: `src/journey/index/progressivePlanner.ts`
- Modify: `tests/core/progressive-planner.test.cjs`

**Interfaces:**

```ts
export function hasMeaningfullyBetterResults(
  current: IndexedJourneyOption[],
  refined: IndexedJourneyOption[],
  policy: JourneyPolicy
): boolean;

export interface ProgressiveJourneySession {
  initial: Promise<IndexedJourneyOption[]>;
  refined: Promise<IndexedJourneyOption[]>;
}

export function createProgressiveJourneySession(
  from: TripPoint,
  to: TripPoint,
  policy: JourneyPolicy,
  deps?: ProgressivePlannerDeps
): ProgressiveJourneySession;
```

- [ ] **Step 1: Write failing better-result tests**

Exact trigger rules:

```text
true: refined introduces a direct route when current has none
true: best transfer count is reduced
true: same transfer level and best total time improves by >= 5 minutes
true under lessWalking: best walking distance improves by >= 300 m without worsening transfers
false: ETA-only change < 5 minutes with same route set
false: same services reordered only because of tiny timing drift
```

- [ ] **Step 2: Implement deterministic route-set comparison**

Use stable service signatures derived from ride-leg provider/route/bound sequence so ID changes alone do not count as improvement.

- [ ] **Step 3: Implement progressive session orchestration**

`initial` must only do:

```text
loadJourneyIndex -> planFastJourney
```

`refined` must start after the initial promise settles and call `refineJourneyOptions`.

Do not call `useJourneyStore.getState().loadData()` or `buildGraph()` in this module.

- [ ] **Step 4: Add regression assertion that Stage 1 does not import graphBuilder**

A source-level verification in `tests/core/progressive-planner.test.cjs` should assert `fastPlanner.ts` and `progressivePlanner.ts` contain no `buildGraph` / `graphBuilder` import.

- [ ] **Step 5: Run and commit**

```bash
npm run test:core
npm run verify:types
git add src/journey/index/betterResults.ts src/journey/index/progressivePlanner.ts tests/core/progressive-planner.test.cjs
git commit -m "feat: orchestrate progressive journey results"
```

---

### Task 6: Move the Result Screen to Progressive Results

**Files:**
- Modify: `app/journey/result.tsx`
- Modify: `src/i18n/zh-HK.json`
- Modify: `src/i18n/en.json`
- Modify: `scripts/verify-mobile-ux.cjs`

**Interfaces:**
- Consumes `createProgressiveJourneySession()` and `hasMeaningfullyBetterResults()`.
- Result-screen state:

```ts
const [initialLoading, setInitialLoading] = useState(true);
const [displayedOptions, setDisplayedOptions] = useState<IndexedJourneyOption[]>([]);
const [refining, setRefining] = useState(false);
const [pendingImprovedOptions, setPendingImprovedOptions] = useState<IndexedJourneyOption[] | null>(null);
```

- [ ] **Step 1: Strengthen mobile verification before modifying UI**

Add source checks that fail while the old result page remains:

```js
expect(!result.includes('await loadData()'), 'result page must not build the legacy graph before first results');
expect(!result.includes("useJourneyStore.getState().plan("), 'result page must use progressive planner');
expect(result.includes('betterResultsAvailable') || result.includes('pendingImprovedOptions'), 'result page must expose pending refined results');
```

- [ ] **Step 2: Run verification and confirm RED**

```bash
npm run verify:mobile
```

Expected: FAIL on result-page legacy planner checks.

- [ ] **Step 3: Replace result-page planning effect**

On route/query change:

```ts
const session = createProgressiveJourneySession(fromPoint, toPoint, policy);
const initial = await session.initial;
setDisplayedOptions(initial);
setInitialLoading(false);
setRefining(true);
const refined = await session.refined;
if (hasMeaningfullyBetterResults(initial, refined, policy)) {
  setPendingImprovedOptions(refined);
}
setRefining(false);
```

Use cancellation generation IDs so stale searches cannot overwrite a newer search.

- [ ] **Step 4: Preserve policy-chip behavior**

Changing a policy re-ranks only `displayedOptions` immediately. If `pendingImprovedOptions` exists, the banner remains but the comparison is recomputed under the new policy.

- [ ] **Step 5: Add better-results action**

Add translations:

```json
"betterRoutesFound": "發現更優路線",
"betterRoutesFoundHint": "點按後更新目前結果"
```

and English:

```json
"betterRoutesFound": "Better routes found",
"betterRoutesFoundHint": "Tap to update the current results"
```

On press:

```ts
setDisplayedOptions(pendingImprovedOptions);
setPendingImprovedOptions(null);
```

Do not auto-apply.

- [ ] **Step 6: Keep the initial loading screen only until Stage 1 resolves**

After initial results display, show a subtle refining indicator, not a blocking full-screen loader.

- [ ] **Step 7: Run verification**

```bash
npm run verify:mobile
npm run verify:types
npm run test:core
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add app/journey/result.tsx src/i18n/zh-HK.json src/i18n/en.json scripts/verify-mobile-ux.cjs
git commit -m "feat: show progressive journey results"
```

---

### Task 7: Wire Real Walking and ETA Dependencies Into Stage 2

**Files:**
- Modify: `src/journey/index/progressivePlanner.ts`
- Modify: `src/journey/index/refinePlanner.ts`
- Modify: `tests/core/progressive-planner.test.cjs`

**Interfaces:**
- Reuse `walkingRouter.route()`.
- Reuse `getProvider(providerId).fetchETA(stopId, route)`.
- Reuse `selectDepartureEstimate()` and the existing provider fallback headways:

```ts
KMB: 8
CTB: 8
GMB: 10
MTR: 4
```

- [ ] **Step 1: Write failing dependency-fallback tests**

Use injected fake walking and ETA functions and verify a rejected promise does not reject `session.refined`.

- [ ] **Step 2: Implement production dependency adapters**

Resolve the boarding stop from `IndexedHub.members` for the route provider. Filter ETA rows by bound, convert ISO times to minutes, and use `selectDepartureEstimate()`.

- [ ] **Step 3: Ensure Stage 1 still has zero network dependency**

Tests must use throwing fake network functions and prove `session.initial` still returns routes before any refinement dependency is awaited.

- [ ] **Step 4: Run and commit**

```bash
npm run test:core
npm run verify:types
git add src/journey/index/progressivePlanner.ts src/journey/index/refinePlanner.ts tests/core/progressive-planner.test.cjs
git commit -m "feat: enrich progressive routes with walking and eta"
```

---

### Task 8: Add Build/CI Gates and Final Deployment Verification

**Files:**
- Modify: `scripts/run-core-tests.cjs`
- Modify: `scripts/verify-handoff.cjs`
- Modify: `.github/workflows/deploy.yml`
- Modify: `.github/workflows/verify-local-first-kmb.yml`
- Modify: `scripts/post-build.js` only if necessary to copy `public/data/journey` correctly after Expo export.

**Interfaces:**
- CI must run `node scripts/verify-journey-index.cjs` after index generation and before Pages upload.

- [ ] **Step 1: Add new tests to the core runner**

Add:

```text
tests/core/journey-index.test.cjs
tests/core/progressive-planner.test.cjs
```

to `scripts/run-core-tests.cjs`.

- [ ] **Step 2: Extend handoff verification**

Require the generator, verifier, runtime planner modules, and generated journey-index directory.

- [ ] **Step 3: Update CI workflows**

In both verification and deployment workflows, ensure the sequence includes:

```bash
npm ci
npm run build:journey-index
node scripts/verify-journey-index.cjs
npm run verify
npm run build:web
```

`build:web` may regenerate the index; that is acceptable and deterministic.

- [ ] **Step 4: Run the complete local-equivalent verification**

```bash
npm ci
npm run build:journey-index
node scripts/verify-journey-index.cjs
npm run verify
npm run build:web
```

Expected: all commands exit 0.

- [ ] **Step 5: Inspect production output**

Verify:

```text
dist/data/journey/meta.json exists
dist/data/journey/hubs.json exists
dist/data/journey/routes.json exists
dist/version.json exists
dist/index.html contains meta name="hk-transit-build"
```

- [ ] **Step 6: Create PR and wait for fresh GitHub Actions**

PR title:

```text
Make journey results progressive and non-blocking
```

PR body must state the root cause (full graph + repeated graph searches), new build-time index, Stage 1 bounded search, Stage 2 background refinement, better-results user action, 203E preservation, and test/build evidence.

- [ ] **Step 7: Only merge after the PR workflow is green**

Use expected-head-SHA protection when merging.

- [ ] **Step 8: Verify Pages deployment**

Confirm `Deploy HK Transit AI V2` has both `build=success` and `deploy=success`, and latest `github-pages` deployment SHA equals the merge commit SHA.

- [ ] **Step 9: Verify deployed artifact metadata**

Download the workflow artifact and confirm its `version.json` / HTML build meta matches the merge SHA and contains `data/journey/*`.

- [ ] **Step 10: Commit final CI changes before PR merge**

```bash
git add scripts/run-core-tests.cjs scripts/verify-handoff.cjs .github/workflows/deploy.yml .github/workflows/verify-local-first-kmb.yml scripts/post-build.js
git commit -m "ci: verify progressive journey index"
```

---

## Plan Self-Review

- Spec coverage: build-time index, bounded Stage 1, non-blocking Stage 2, user-controlled refined update, fallback behavior, 203E, policy preservation, and deployment verification are all assigned to explicit tasks.
- Placeholder scan: no TBD/TODO/"implement later" steps remain.
- Type consistency: `JourneyIndexBundle`, `IndexedJourneyOption`, `planFastJourney`, `refineJourneyOptions`, `hasMeaningfullyBetterResults`, and `createProgressiveJourneySession` are defined before their consumers.
- Scope: this plan does not change map-picker behavior, hosting, or unrelated ETA pages.
