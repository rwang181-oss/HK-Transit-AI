# HK Transit Live Map and Multimodal Search Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a home-visible bilingual switch, rename the home brand to HK Transit, search KMB/Citybus/GMB/MTR routes, and provide in-app GPS-follow navigation with dynamically rerouted walking paths to the correct next stop.

**Architecture:** Keep provider integration behind the existing `TransitProvider` interface, adding a testable provider-neutral route-catalogue layer and provider-aware route-detail screen. Extend navigation with a pure itinerary-progress model and a separately testable live pedestrian-route controller, then render both through the existing Leaflet-based `TransitMap` and `NavigationModal` boundaries.

**Tech Stack:** Expo Router 57, React Native 0.86, React 19, TypeScript 5.7, Zustand 5, Leaflet 1.9, i18next, Node core assertion tests, Jest, Valhalla pedestrian routing.

## Global Constraints

- Home brand text is exactly `HK Transit`; do not rename package identifiers, repository references or native bundle identifiers.
- Home language control displays `EN` in Traditional Chinese mode and `繁中` in English mode.
- Route search includes `KMB`, `CTB`, `GMB` and `MTR`, and provider failures degrade independently.
- The in-app navigation map is primary; do not add Google Maps Platform, Mapbox or a paid API key.
- Reroute only during `walkingToTransit`, `walkingTransfer` and `walkingToDestination`.
- Reroute after 25 metres of meaningful movement or a target/phase change; keep at most one routing request active and ignore stale results.
- Routing fallback must be labelled `estimated`; never present a straight line as an accurate pedestrian route.
- Preserve KMB favourites and nearby-route storage schemas.
- Generated `public/data/journey/*` files are build artefacts, not manually edited source.
- Keep shared navigation state and planning logic platform-neutral; DOM and Leaflet APIs stay inside `TransitMap.tsx` web branches.
- Preserve the existing native Apple Maps fallback, iOS bundle identifier, foreground-location permission copy and EAS profiles.
- Do not claim App Store submission readiness without a signed iOS build and physical-device verification.
- Work runs in an isolated clone on `agent/live-map-multimodal-search`; commit each reviewed task intentionally.

---

### Task 1: Provider-neutral route catalogue

**Files:**
- Create: `src/journey/search/routeCatalog.ts`
- Create: `tests/core/route-catalog.test.cjs`
- Modify: `tsconfig.core.json`
- Modify: `scripts/run-core-tests.cjs`

**Interfaces:**
- Consumes: `ProviderId`, `Route`, `TransitProvider`, `formatPublicRouteCode(provider, route)`.
- Produces: `RouteCatalogEntry`, `RouteCatalogResult`, `loadRouteCatalog(loadProvider)`, and `searchRouteCatalog(entries, query, limit)`.

- [ ] **Step 1: Install the locked dependencies**

Run: `npm ci`

Expected: the exact dependency versions from `package-lock.json`, including TypeScript 5.7, are installed without modifying package versions.

- [ ] **Step 2: Register the future module and failing core test**

Add `src/journey/search/routeCatalog.ts` to `tsconfig.core.json` and `tests/core/route-catalog.test.cjs` to the ordered list in `scripts/run-core-tests.cjs`. Create the test with fake providers:

```js
const assert = require('node:assert/strict');
const catalog = require('../../.core-test-dist/journey/search/routeCatalog.js');

const routes = {
  KMB: [{ route: '1', bound: 'O', orig_en: 'A', orig_tc: '甲', dest_en: 'B', dest_tc: '乙', provider: 'KMB' }],
  CTB: [{ route: '1', bound: 'O', orig_en: 'Central', orig_tc: '中環', dest_en: 'Peak', dest_tc: '山頂', provider: 'CTB' }],
  GMB: [{ route: '1~2006408-O', bound: 'O', orig_en: 'Peak', orig_tc: '山頂', dest_en: 'Central', dest_tc: '中環', provider: 'GMB' }],
  MTR: [{ route: 'EAL', bound: 'O', orig_en: 'Admiralty', orig_tc: '金鐘', dest_en: 'Lo Wu', dest_tc: '羅湖', provider: 'MTR' }],
};

const loadProvider = async (id) => ({ id, fetchRoutes: async () => routes[id] });

(async () => {
  const result = await catalog.loadRouteCatalog(loadProvider);
  assert.deepEqual(new Set(result.entries.map((entry) => entry.provider)), new Set(['KMB', 'CTB', 'GMB', 'MTR']));
  assert.equal(result.entries.find((entry) => entry.provider === 'GMB').publicRoute, '1');
  assert.equal(catalog.searchRouteCatalog(result.entries, '中環', 20).length, 2);
  assert.equal(catalog.searchRouteCatalog(result.entries, 'EAL', 20)[0].provider, 'MTR');

  const partial = await catalog.loadRouteCatalog(async (id) => {
    if (id === 'CTB') throw new Error('offline');
    return loadProvider(id);
  });
  assert.equal(partial.errors.CTB, 'offline');
  assert.equal(partial.entries.some((entry) => entry.provider === 'KMB'), true);
  assert.equal(partial.entries.some((entry) => entry.provider === 'MTR'), true);
  console.log('route-catalog.test.cjs: PASS');
})().catch((error) => { console.error(error); process.exit(1); });
```

- [ ] **Step 3: Run the test and verify RED**

Run: `tsc -p tsconfig.core.json; node tests/core/route-catalog.test.cjs`

Expected: TypeScript reports that `src/journey/search/routeCatalog.ts` does not exist, or Node reports that the compiled module cannot be found.

- [ ] **Step 4: Implement the catalogue minimally**

Create the module with these public shapes and independent provider loading:

```ts
import type { ProviderId, Route, TransitProvider } from '../providers/types';
import { formatPublicRouteCode } from '../providers/routeDisplay';

export interface RouteCatalogEntry extends Route {
  key: string;
  publicRoute: string;
  searchableText: string;
}

export interface RouteCatalogResult {
  entries: RouteCatalogEntry[];
  errors: Partial<Record<ProviderId, string>>;
}

export type ProviderLoader = (id: ProviderId) => Promise<Pick<TransitProvider, 'fetchRoutes'>>;
const PROVIDERS: ProviderId[] = ['KMB', 'CTB', 'GMB', 'MTR'];

export async function loadRouteCatalog(loadProvider: ProviderLoader): Promise<RouteCatalogResult> {
  const settled = await Promise.all(PROVIDERS.map(async (provider) => {
    try {
      const rows = await (await loadProvider(provider)).fetchRoutes();
      return { provider, rows, error: '' };
    } catch (error) {
      return { provider, rows: [] as Route[], error: error instanceof Error ? error.message : String(error) };
    }
  }));
  const errors: Partial<Record<ProviderId, string>> = {};
  const entries = settled.flatMap(({ provider, rows, error }) => {
    if (error) errors[provider] = error;
    return rows.map((route) => {
      const publicRoute = formatPublicRouteCode(provider, route.route);
      return {
        ...route,
        provider,
        publicRoute,
        key: `${provider}:${route.route}:${route.bound}`,
        searchableText: [publicRoute, route.route, route.orig_en, route.orig_tc, route.dest_en, route.dest_tc]
          .join(' ')
          .toLocaleUpperCase(),
      };
    });
  });
  return { entries, errors };
}

export function searchRouteCatalog(entries: RouteCatalogEntry[], query: string, limit = 30): RouteCatalogEntry[] {
  const normalized = query.trim().toLocaleUpperCase();
  if (!normalized) return [];
  return entries.filter((entry) => entry.searchableText.includes(normalized)).slice(0, limit);
}
```

- [ ] **Step 5: Run GREEN and the complete core suite**

Run: `npm run test:core`

Expected: `route-catalog.test.cjs: PASS` and every existing core test passes.

- [ ] **Step 6: Record checkpoint**

Run: `git rev-parse --is-inside-work-tree`. If it returns true, commit `src/journey/search/routeCatalog.ts`, the test and runner/config changes with `feat: add multimodal route catalog`. If it returns false, leave files uncommitted and record Task 1 as complete in this plan.

---

### Task 2: Route catalogue store, search UI and provider-aware stop list

**Files:**
- Create: `src/stores/routeCatalogStore.ts`
- Create: `src/journey/search/routeDetails.ts`
- Create: `tests/core/route-details.test.cjs`
- Create: `app/route-detail.tsx`
- Modify: `app/(tabs)/search.tsx`
- Modify: `app/_layout.tsx`
- Modify: `tsconfig.core.json`
- Modify: `scripts/run-core-tests.cjs`
- Modify: `src/i18n/en.json`
- Modify: `src/i18n/zh-HK.json`

**Interfaces:**
- Consumes: Task 1 `loadRouteCatalog`/`searchRouteCatalog`, `getProvider(providerId)`, `TransitProvider.fetchTopology`, `fetchRouteStops` and `fetchETA`.
- Produces: `useRouteCatalogStore`, `loadRouteDirection(provider, route, bound)`, and the `/route-detail` route accepting `provider`, `route` and `bound` query parameters.

- [ ] **Step 1: Write the failing route-detail core test**

Register `src/journey/search/routeDetails.ts` and `tests/core/route-details.test.cjs`, then test ordered stops and unavailable ETA without React:

```js
const assert = require('node:assert/strict');
const details = require('../../.core-test-dist/journey/search/routeDetails.js');

const provider = {
  id: 'CTB',
  fetchStops: async () => [
    { stopId: 'b', name_en: 'Beta', name_tc: '乙', lat: 1, lng: 2, provider: 'CTB' },
    { stopId: 'a', name_en: 'Alpha', name_tc: '甲', lat: 1, lng: 2, provider: 'CTB' },
  ],
  fetchRouteStops: async () => [
    { route: '1', bound: 'O', seq: 2, stopId: 'b', provider: 'CTB' },
    { route: '1', bound: 'O', seq: 1, stopId: 'a', provider: 'CTB' },
  ],
  fetchETA: async () => [],
};

(async () => {
  const rows = await details.loadRouteDirection(provider, '1', 'O');
  assert.deepEqual(rows.map((row) => row.stop.stopId), ['a', 'b']);
  assert.deepEqual(await details.loadStopEta(provider, 'a', '1'), []);
  console.log('route-details.test.cjs: PASS');
})().catch((error) => { console.error(error); process.exit(1); });
```

- [ ] **Step 2: Run RED**

Run: `tsc -p tsconfig.core.json; node tests/core/route-details.test.cjs`

Expected: compiled `routeDetails.js` is missing.

- [ ] **Step 3: Implement route-detail domain functions**

Implement exact signatures:

```ts
export interface RouteDirectionStop { link: RouteStopLink; stop: Stop }
export async function loadRouteDirection(
  provider: Pick<TransitProvider, 'fetchStops' | 'fetchRouteStops'>,
  route: string,
  bound: 'O' | 'I'
): Promise<RouteDirectionStop[]>;
export async function loadStopEta(
  provider: Pick<TransitProvider, 'fetchETA'>,
  stopId: string,
  route: string
): Promise<ETA[]>;
```

Build a stop index from `fetchStops()`, sort links by `seq`, discard links whose stop is absent, and let provider errors propagate to the screen.

- [ ] **Step 4: Run GREEN**

Run: `npm run test:core`

Expected: all core tests pass, including `route-details.test.cjs: PASS`.

- [ ] **Step 5: Add the Zustand catalogue store**

Create a store with this state contract:

```ts
interface RouteCatalogState {
  entries: RouteCatalogEntry[];
  errors: Partial<Record<ProviderId, string>>;
  loading: boolean;
  loaded: boolean;
  query: string;
  load: () => Promise<void>;
  setQuery: (query: string) => void;
}
```

`load()` calls `loadRouteCatalog(getProvider)`, deduplicates concurrent calls with a module-level promise, and keeps successful entries even when `errors` is non-empty.

- [ ] **Step 6: Replace KMB-only search rendering**

Update `app/(tabs)/search.tsx` to use `useRouteCatalogStore`. Use `searchRouteCatalog(entries, query)`, render `t('providers.<provider>')` as a badge, display `publicRoute`, and match bilingual origin/destination. Navigate with encoded query parameters:

```ts
const params = new URLSearchParams({
  provider: item.provider,
  route: item.route,
  bound: item.bound,
});
router.push(`/route-detail?${params.toString()}` as never);
```

Show a compact partial-data warning when one or more provider errors exist, without replacing successful results.

- [ ] **Step 7: Build the provider-aware route-detail screen**

Add `route-detail.tsx` to the root stack in `app/_layout.tsx`. On mount, validate `provider` against `KMB|CTB|GMB|MTR`, load the provider and ordered direction, and render stop rows. Expanding a stop calls `loadStopEta`; render translated live, unavailable and error states. Do not write to `favoriteStore` from this screen.

- [ ] **Step 8: Add paired translations and verify parity**

Add the same keys to both JSON files: `search.partialData`, `search.providerUnavailable`, `eta.unavailable`, and `eta.loadError`. Run `npm run verify:source` after dependencies are installed and expect translation-key parity.

- [ ] **Step 9: Verify search behaviour**

Run: `npm run test:core && tsc -p tsconfig.verify.json --noEmit`

Expected: all core tests pass and structural type verification exits 0 using the project's TypeScript 5.7 dependency.

- [ ] **Step 10: Record checkpoint**

If Git metadata exists, commit Task 2 files with `feat: search all transit providers`; otherwise mark Task 2 complete without initializing a repository.

---

### Task 3: Home brand and visible language switch

**Files:**
- Create: `src/utils/languageSwitch.ts`
- Create: `tests/core/language-switch.test.cjs`
- Modify: `app/(tabs)/index.tsx`
- Modify: `tsconfig.core.json`
- Modify: `scripts/run-core-tests.cjs`

**Interfaces:**
- Consumes: `changeLanguage(lang)` and the current `i18n.language`.
- Produces: `nextLanguage(language)`, `languageSwitchLabel(language)` and a home-owned visible language button while leaving the home Expo header hidden.

- [ ] **Step 1: Write the failing language-switch behavior test**

Register `src/utils/languageSwitch.ts` and `tests/core/language-switch.test.cjs`, then add:

```js
const assert = require('node:assert/strict');
const language = require('../../.core-test-dist/utils/languageSwitch.js');
assert.equal(language.nextLanguage('en'), 'zh-HK');
assert.equal(language.nextLanguage('zh-HK'), 'en');
assert.equal(language.languageSwitchLabel('en'), '繁中');
assert.equal(language.languageSwitchLabel('zh-HK'), 'EN');
console.log('language-switch.test.cjs: PASS');
```

- [ ] **Step 2: Run RED**

Run: `tsc -p tsconfig.core.json; node tests/core/language-switch.test.cjs`

Expected: compiled `languageSwitch.js` is missing.

- [ ] **Step 3: Implement the compact header change**

Implement the two pure functions, then destructure `i18n` from `useTranslation`, normalize `lang` to `en|zh-HK`, import `changeLanguage`, change the brand string to `HK Transit`, and add an accessible Pressable beside the weather pill:

```tsx
<Pressable
  accessibilityRole="button"
  accessibilityLabel={lang === 'en' ? '切換至繁體中文' : 'Switch to English'}
  onPress={() => void changeLanguage(nextLanguage(lang))}
  style={styles.languageButton}
>
  <Text style={styles.languageText}>{languageSwitchLabel(lang)}</Text>
</Pressable>
```

Keep the weather pill visible by grouping it and the language control in a right-side row with bounded widths.

- [ ] **Step 4: Run GREEN**

Run: `npm run test:core && npm run verify:mobile`

Expected: `language-switch.test.cjs: PASS`, the complete core suite passes, and `Mobile UX verification passed.`

- [ ] **Step 5: Record checkpoint**

If Git metadata exists, commit with `fix: expose home language switch`; otherwise mark Task 3 complete.

---

### Task 4: Itinerary-aware navigation progress and next-target coordinates

**Files:**
- Create: `src/journey/realtime/navigationProgress.ts`
- Create: `tests/core/navigation-progress.test.cjs`
- Modify: `src/journey/planner/planner.ts`
- Modify: `src/journey/index/types.ts`
- Modify: `src/journey/index/fastPlanner.ts`
- Modify: `src/stores/journeyStore.ts`
- Modify: `src/stores/navigationStore.ts`
- Modify: `src/i18n/en.json`
- Modify: `src/i18n/zh-HK.json`
- Modify: `tsconfig.core.json`
- Modify: `scripts/run-core-tests.cjs`

**Interfaces:**
- Consumes: itinerary ride legs with endpoint coordinates and final destination.
- Produces: `NavigationPhase` including `walkingTransfer`, `NavigationProgress`, `advanceNavigationProgress(progress, legs)`, and `resolveNavigationTarget(progress, legs, destination)`.

- [ ] **Step 1: Write the failing progress tests**

Test direct and one-transfer sequences:

```js
const assert = require('node:assert/strict');
const progress = require('../../.core-test-dist/journey/realtime/navigationProgress.js');
const direct = [{ kind: 'ride', fromHubId: 'A', toHubId: 'B', fromName: 'A', toName: 'B', fromLat: 1, fromLng: 2, toLat: 3, toLng: 4 }];
const transfer = [
  { kind: 'ride', fromHubId: 'A', toHubId: 'X', fromName: 'A', toName: 'X', fromLat: 1, fromLng: 2, toLat: 5, toLng: 6 },
  { kind: 'ride', fromHubId: 'X', toHubId: 'B', fromName: 'X', toName: 'B', fromLat: 5, fromLng: 6, toLat: 3, toLng: 4 },
];
let state = { phase: 'walkingToTransit', activeLegIndex: 0 };
assert.equal(progress.resolveNavigationTarget(state, direct, { lat: 9, lng: 9, name: 'End' }).id, 'A');
state = progress.advanceNavigationProgress(state, transfer);
assert.deepEqual(state, { phase: 'waiting', activeLegIndex: 0 });
state = progress.advanceNavigationProgress(state, transfer);
assert.deepEqual(state, { phase: 'riding', activeLegIndex: 0 });
state = progress.advanceNavigationProgress(state, transfer);
assert.deepEqual(state, { phase: 'walkingTransfer', activeLegIndex: 1 });
assert.equal(progress.resolveNavigationTarget(state, transfer, { lat: 9, lng: 9, name: 'End' }).id, 'X');
state = progress.advanceNavigationProgress(state, transfer);
state = progress.advanceNavigationProgress(state, transfer);
state = progress.advanceNavigationProgress(state, transfer);
assert.equal(state.phase, 'walkingToDestination');
assert.equal(progress.resolveNavigationTarget(state, transfer, { lat: 9, lng: 9, name: 'End' }).id, 'destination');
console.log('navigation-progress.test.cjs: PASS');
```

- [ ] **Step 2: Run RED**

Run: `tsc -p tsconfig.core.json; node tests/core/navigation-progress.test.cjs`

Expected: the navigation progress module is missing.

- [ ] **Step 3: Add coordinate-complete leg types**

Add `fromLat`, `fromLng`, `toLat`, and `toLng` to `ItineraryLeg` and `IndexedJourneyLeg`. Populate them in `planner.ts` when reconstructing graph legs and in `fastPlanner.ts` inside `rideLeg`. When planner legs merge, update both the destination name and destination coordinates. Populate the direct legacy leg created in `journeyStore.ts`.

- [ ] **Step 4: Implement the pure progress module**

Export:

```ts
export type NavigationPhase = 'idle' | 'walkingToTransit' | 'walkingTransfer' | 'waiting' | 'riding' | 'walkingToDestination' | 'arrived';
export interface NavigationProgress { phase: NavigationPhase; activeLegIndex: number }
export interface NavigationTarget { id: string; name: string; lat: number; lng: number; kind: 'stop' | 'end' }
```

Filter itinerary legs to ride legs for stage advancement. `activeLegIndex` is the zero-based ordinal inside that filtered ride-leg list, not the index of the unfiltered itinerary array. `riding` advances to `walkingTransfer` with the next ride ordinal when one exists, otherwise to `walkingToDestination`. Resolve target coordinates from the active ride leg's endpoints, and return `null` for non-finite or zero coordinates.

- [ ] **Step 5: Run GREEN**

Run: `npm run test:core`

Expected: the direct/transfer progress test and all existing tests pass.

- [ ] **Step 6: Integrate progress into navigationStore**

Add `activeLegIndex` to state, initialize it to the first ride leg at start, reset it on stop, and use `advanceNavigationProgress` inside `advancePhase`. Treat `walkingTransfer` like `walkingToTransit` for proximity-to-target transitions and timing, using `resolveNavigationTarget` rather than always using `option.boardHub`.

Add `navigation.phases.walkingTransfer` to both languages.

- [ ] **Step 7: Verify store type compatibility**

Run: `npm run test:core && tsc -p tsconfig.verify.json --noEmit`

Expected: all tests pass and both legacy `JourneyOption` and `IndexedJourneyOption` remain assignable to navigation start.

- [ ] **Step 8: Record checkpoint**

If Git metadata exists, commit with `feat: track multimodal navigation stages`; otherwise mark Task 4 complete.

---

### Task 5: Live pedestrian-route controller

**Files:**
- Create: `src/journey/realtime/liveRouteController.ts`
- Create: `tests/core/live-route-controller.test.cjs`
- Modify: `tsconfig.core.json`
- Modify: `scripts/run-core-tests.cjs`

**Interfaces:**
- Consumes: `WalkingRoute`, a route function `(from, to) => Promise<WalkingRoute>`, current phase, position and resolved target.
- Produces: `createLiveRouteController(route, onResult, options)` with `update(input)` and `reset()`.

- [ ] **Step 1: Write failing threshold, phase and stale-result tests**

Use deferred route promises to prove one active request and latest-position queuing:

```js
const assert = require('node:assert/strict');
const live = require('../../.core-test-dist/journey/realtime/liveRouteController.js');
const calls = [];
const resolvers = [];
const results = [];
const route = (from, to) => new Promise((resolve) => { calls.push({ from, to }); resolvers.push(resolve); });
const controller = live.createLiveRouteController(route, (result) => results.push(result), { thresholdMeters: 25 });
const target = { id: 'A', lat: 22.3, lng: 114.2, name: 'A', kind: 'stop' };
controller.update({ phase: 'walkingToTransit', position: { lat: 22.29, lng: 114.19 }, target });
controller.update({ phase: 'walkingToTransit', position: { lat: 22.29005, lng: 114.19005 }, target });
assert.equal(calls.length, 1, 'sub-threshold movement must not reroute');
controller.update({ phase: 'walkingToTransit', position: { lat: 22.291, lng: 114.191 }, target });
assert.equal(calls.length, 1, 'new request must queue while one is active');
resolvers.shift()({ meters: 100, minutes: 2, geometry: [], source: 'routed' });
setImmediate(() => {
  assert.equal(calls.length, 2, 'latest queued position must route after the active request');
  resolvers.shift()({ meters: 80, minutes: 1, geometry: [], source: 'routed' });
  setImmediate(() => {
    assert.equal(results.length, 1, 'stale first result must be ignored');
    controller.update({ phase: 'riding', position: { lat: 22.292, lng: 114.192 }, target });
    assert.equal(calls.length, 2, 'riding must not request a walking route');
    console.log('live-route-controller.test.cjs: PASS');
  });
});
```

- [ ] **Step 2: Run RED**

Run: `tsc -p tsconfig.core.json; node tests/core/live-route-controller.test.cjs`

Expected: missing compiled module.

- [ ] **Step 3: Implement a single-flight latest-wins controller**

Use `haversineMeters` for the 25-metre threshold. Maintain `running`, `queued`, `lastRequestedOrigin`, `lastTargetKey`, and a monotonically increasing generation. `update` rejects non-walking phases and invalid points; a target/phase change bypasses the distance threshold. While running, replace the one queued input with the newest input. Emit only the newest generation through `onResult`.

The controller must preserve `WalkingRoute.source`; the existing `walkingRouter.route` already returns `estimated` on endpoint failure.

- [ ] **Step 4: Run GREEN and full core suite**

Run: `npm run test:core`

Expected: controller test prints PASS and no regression fails.

- [ ] **Step 5: Record checkpoint**

If Git metadata exists, commit with `feat: add live walking reroute controller`; otherwise mark Task 5 complete.

---

### Task 6: GPS-follow Leaflet map and navigation modal integration

**Files:**
- Create: `src/journey/realtime/navigationMapModel.ts`
- Create: `tests/core/navigation-map-model.test.cjs`
- Modify: `src/components/TransitMap.tsx`
- Modify: `src/components/NavigationModal.tsx`
- Modify: `src/components/LiveJourneyPanel.tsx`
- Modify: `app/journey/result.tsx`
- Modify: `src/i18n/en.json`
- Modify: `src/i18n/zh-HK.json`
- Modify: `tsconfig.core.json`
- Modify: `scripts/run-core-tests.cjs`

**Interfaces:**
- Consumes: Task 4 progress/target resolver, Task 5 controller, `walkingRouter.route`, and navigation-store GPS state.
- Produces: `buildNavigationMapModel(input)`, `TransitMap.followPoint`, full-screen live map, routed/estimated path styling and recenter interaction.

- [ ] **Step 1: Write the failing navigation-map model behavior test**

Register the new module and test. Use literal fixtures to prove current-position and estimated-path output:

```js
const assert = require('node:assert/strict');
const model = require('../../.core-test-dist/journey/realtime/navigationMapModel.js');
const output = model.buildNavigationMapModel({
  phase: 'walkingToTransit',
  currentPosition: { lat: 22.3, lng: 114.2 },
  target: { id: 'A', lat: 22.31, lng: 114.21, name: 'Station A', kind: 'stop' },
  liveRoute: { meters: 100, minutes: 2, geometry: [{ lat: 22.3, lng: 114.2 }, { lat: 22.31, lng: 114.21 }], source: 'estimated' },
  optionGeometry: [],
  currentPositionLabel: 'You are here',
});
assert.deepEqual(output.points[0], { lat: 22.3, lng: 114.2, kind: 'me', label: 'You are here' });
assert.equal(output.points[1].label, 'Station A');
assert.equal(output.paths[0].dashed, true);
assert.equal(output.routeSource, 'estimated');
console.log('navigation-map-model.test.cjs: PASS');
```

- [ ] **Step 2: Run RED**

Run: `tsc -p tsconfig.core.json; node tests/core/navigation-map-model.test.cjs`

Expected: the compiled navigation map model is missing.

- [ ] **Step 3: Implement the pure navigation map model**

Return typed `points`, `paths`, `routeSource` and `center`. Walking phases prefer `liveRoute.geometry`; waiting/riding use `optionGeometry`; arrived removes the route. Mark estimated walking paths dashed and preserve routed paths as solid.

- [ ] **Step 4: Add follow mode to TransitMap**

Extend props:

```ts
followPoint?: { lat: number; lng: number } | null;
followZoom?: number;
```

Track `following` state. On Leaflet `dragstart`, set it false. When following and `followPoint` changes, call `map.setView([lat, lng], followZoom ?? Math.max(map.getZoom(), 16), { animate: false })`. Render an accessible recenter Pressable when following is false; pressing it restores following and centres immediately. Do not run `fitBounds` after every live-position layer update when `followPoint` is present.

- [ ] **Step 5: Render live navigation map in NavigationModal**

Read `option`, `destination`, `phase`, `activeLegIndex`, and `currentPosition` from the store. Resolve the target with Task 4. Create/reset Task 5's controller through refs and feed it only valid walking-phase inputs. Store the emitted `WalkingRoute` in component state.

Build translated inputs and render the model returned by `buildNavigationMapModel`:

```ts
const points = [
  currentPosition && { ...currentPosition, kind: 'me' as const, label: t('navigation.youAreHere') },
  target && { ...target, kind: target.kind, label: target.name },
].filter(Boolean);
```

During walking, render the live route path; during waiting/riding, render `option.geometry` as context. Use a dashed path and `navigation.estimatedRoute` label when `source === 'estimated'`. Until the first GPS fix, show the planned target and `navigation.locating`.

- [ ] **Step 6: Keep the timing panel and pass selected option consistently**

The store already owns the active option. Remove any duplicate option prop design. In `result.tsx`, continue calling `startNavigation(option, toPoint)` before GPS tracking and keep the modal open through permission errors. Keep `LiveJourneyPanel` below the map and show the new transfer phase translation.

- [ ] **Step 7: Add paired navigation translations**

Add `navigation.youAreHere`, `navigation.nextTarget`, `navigation.locating`, `navigation.recenter`, `navigation.routedPath`, and `navigation.estimatedRoute` in English and Traditional Chinese.

- [ ] **Step 8: Run GREEN and type verification**

Run: `npm run verify:mobile && npm run test:core && tsc -p tsconfig.verify.json --noEmit`

Expected: mobile contracts, all core tests and structural types pass.

- [ ] **Step 9: Record checkpoint**

If Git metadata exists, commit with `feat: show gps-follow navigation map`; otherwise mark Task 6 complete.

---

### Task 7: Development index reliability and provider coverage

**Files:**
- Modify: `package.json`
- Modify: `scripts/verify-journey-index.cjs`
- Modify: `scripts/verify-handoff.cjs`
- Modify: `docs/DATA_REFRESH.md`

**Interfaces:**
- Consumes: `scripts/build-journey-index.cjs` output.
- Produces: a `web` command that builds the local journey index before Expo starts and verification that all four providers exist.

- [ ] **Step 1: Generate the existing index and establish the baseline**

Run: `npm run build:journey-index && npm run verify:journey-index`

Expected: the existing index is generated and the current verification passes before new assertions are added.

- [ ] **Step 2: Add failing package/index verification**

In `verify-handoff.cjs`, assert `packageJson.scripts.web` begins with `npm run build:journey-index`. In `verify-journey-index.cjs`, count routes by provider and fail unless every value is positive:

```js
const providerCounts = { KMB: 0, CTB: 0, GMB: 0, MTR: 0 };
for (const route of Object.values(routes)) {
  if (route && route.provider in providerCounts) providerCounts[route.provider] += 1;
}
for (const [provider, count] of Object.entries(providerCounts)) {
  if (count === 0) fail(`${provider} routes are missing from journey index`);
}
```

- [ ] **Step 3: Run RED for the web-script contract**

Run: `node scripts/verify-handoff.cjs`

Expected: failure because the existing `web` script is only `expo start --web`.

- [ ] **Step 4: Update development script and documentation**

Set:

```json
"web": "npm run build:journey-index && expo start --web"
```

Document that `npm run web` refreshes generated index files from bundled snapshots, while `npm run data:refresh` updates the snapshots themselves.

- [ ] **Step 5: Build and verify the index**

Run: `npm run build:journey-index && npm run verify:journey-index && npm run verify:handoff`

Expected: generated files exist, route counts for KMB/CTB/GMB/MTR are all positive, and handoff verification passes.

- [ ] **Step 6: Record checkpoint**

If Git metadata exists, commit source/config/docs changes but not ignored generated artefacts with `fix: build journey index before local web start`; otherwise mark Task 7 complete.

---

### Task 8: Full verification and browser acceptance

**Files:**
- Modify only files required to correct failures found by the commands below.
- Update: `docs/VERIFICATION_REPORT.md` with dated commands and honest results.

**Interfaces:**
- Consumes: all preceding task outputs.
- Produces: a verified web export and browser-tested acceptance record.

- [ ] **Step 1: Install declared dependencies without changing versions**

Run: `npm ci`

Expected: installs exactly `package-lock.json`. If installation fails, report the exact registry/network failure; do not claim full verification.

- [ ] **Step 2: Run the full automated verification**

Run: `npm run verify`

Expected: journey index, core tests, TypeScript verification, source parsing, mobile contracts and handoff checks all exit 0.

- [ ] **Step 3: Run the production web export**

Run: `npm run build:web`

Expected: Expo exports `dist`, post-build completes and the command exits 0.

- [ ] **Step 4: Start the built site and test phone width**

Serve `dist` with a local static server and inspect at approximately 390×844. Verify:

- home reads `HK Transit`;
- `EN/繁中` is visible and changes all home labels;
- representative route searches show KMB, Citybus, Green Minibus and MTR provider badges;
- a provider route opens an ordered stop list;
- Start opens the navigation modal immediately;
- permission prompt, denied state and locating state stay inside the modal;
- a simulated/available location creates the blue marker and follows it;
- walking path targets the correct boarding or transfer stop;
- panning reveals recenter and recenter resumes following;
- estimated fallback is visually distinct.

- [ ] **Step 5: Repeat desktop acceptance**

At approximately 1440×900, confirm the centred-width layout, map resizing, language switch, search results and navigation modal have no overflow or obscured controls.

- [ ] **Step 6: Update verification report**

Record exact commands, exit codes, browser sizes, behaviours tested and any external-service limitation. Do not convert untested native iOS behaviour into a completed claim.

- [ ] **Step 7: Final diff and requirement audit**

Run: `git diff --check` only if Git metadata exists. Independently search for home `HK Transit AI`, confirm translation-key parity, confirm all four provider counts, and check each acceptance criterion in the design document against automated or browser evidence.

- [ ] **Step 8: Record final checkpoint**

If Git metadata exists, commit the verification report and final corrections with `test: verify live navigation and multimodal search`. If Git metadata is absent, leave all work uncommitted and report that boundary explicitly.

---

### Task 9: iOS architecture audit, GitHub publication and Pages deployment

**Files:**
- Modify only release notes or workflow files required by verified publication failures.

**Interfaces:**
- Consumes: the reviewed branch, Expo configuration, GitHub Actions workflow and Pages site.
- Produces: pushed branch, merged pull request, successful Pages deployment and an honest iOS-readiness boundary.

- [ ] **Step 1: Audit the shared iOS architecture**

Run: `npx expo config --type public` and inspect `app.json`, `eas.json`, navigation stores and map imports. Confirm:

- `ios.bundleIdentifier` remains `com.rwang181.hktransitai`;
- foreground location permission copy remains present;
- EAS preview/production profiles remain present;
- Leaflet and DOM APIs are not imported by stores or shared planning modules;
- native `TransitMap` still returns the Apple Maps fallback.

Expected: Expo config resolves successfully and no web-only dependency leaks into platform-neutral state.

- [ ] **Step 2: Run fresh release verification**

Run: `npm run verify && npm run build:web`

Expected: both commands exit 0 immediately before publication.

- [ ] **Step 3: Review and stage only intended files**

Run: `git status -sb`, `git diff --check`, and inspect `git diff --stat`. Stage the implementation, tests, design, plan and verification report; exclude `.superpowers/sdd`, `node_modules`, temporary browser artefacts and ignored generated files.

- [ ] **Step 4: Commit and push the feature branch**

Commit with a terse message covering the full change, then run:

```powershell
git push -u origin agent/live-map-multimodal-search
```

Expected: the remote branch tracks origin successfully.

- [ ] **Step 5: Open, validate and merge the pull request**

Create a pull request targeting `main` with the root causes, implementation summary, user impact, test commands and iOS boundary. Wait for required GitHub Actions checks. When checks pass, merge the pull request and delete the remote feature branch.

- [ ] **Step 6: Verify Pages deployment**

Wait for the Pages workflow triggered by the merged `main` commit. Confirm the workflow conclusion is `success`, then open `https://rwang181-oss.github.io/HK-Transit-AI/` and verify the deployed build reports the new commit/build and passes the key phone-width checks for brand, language switch, multimodal search and navigation-map opening.

- [ ] **Step 7: Report the App Store boundary honestly**

Report that the shared Expo/iOS structure was preserved and configuration audited. Do not state that an App Store binary is ready: signing, native MapKit work, physical-device testing, privacy/support URLs, screenshots and App Review remain future release work unless separately completed.
