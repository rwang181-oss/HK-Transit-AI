# Progressive Journey Results Design

## Goal

Eliminate browser main-thread freezes on the journey result page while preserving useful route quality. The page must show an initial set of practical routes quickly, then continue deeper search in the background without automatically reordering the routes the user is already reading.

## Confirmed User Experience

- The first useful route set should appear within 1 second whenever practical on a normal mobile connection/device.
- The initial set should contain 3–5 practical routes, prioritizing direct and low-transfer options.
- The page must remain responsive while planning; it must not trigger browser "This page isn't responding" warnings under normal use.
- Background search may continue after the first results are shown.
- If background search finds better routes, the existing list must NOT automatically reorder.
- Instead, show a small action such as `發現更優路線` / `Better routes found`.
- Only when the user taps that action should the displayed list be replaced/re-ranked.
- Existing route preference modes remain: recommended, direct-first, at-most-one-transfer, fastest, and less walking.
- The existing 203E regression requirement remains mandatory.

## Root Cause Being Addressed

The current result-page flow performs too much synchronous CPU work before any route is shown:

1. `loadData()` loads KMB, CTB, GMB, and MTR topology.
2. Several megabytes of topology data are parsed in the browser.
3. `buildGraph()` builds the full Hong Kong transit graph on the main thread.
4. Candidate generation can evaluate up to roughly 10 boarding hubs × 10 alighting hubs.
5. Transfer candidate generation repeatedly runs full graph searches before pruning candidates.
6. Walking routing and ETA work are then applied before final options are displayed.

Moving this work from the home screen to the result screen reduced typing-time freezes but did not remove the expensive computation.

## Architecture

### 1. Build-Time Journey Index

Add a build-time generator that converts raw provider topology into compact, browser-oriented route indexes. Runtime route planning must not require rebuilding the complete raw transit graph before the first result.

The generated data should be split so the browser can load only what the first-stage planner needs. Suggested structure:

- `public/data/journey/meta.json`
- `public/data/journey/hubs.json` or spatially partitioned hub index
- `public/data/journey/direct-index.json`
- provider/route adjacency shards only when needed for deeper transfer search

The exact filenames may change during implementation if a more compact structure is found, but the following behavior is fixed:

- initial route search does not parse all raw KMB/CTB/GMB topology;
- initial route search does not call full `buildGraph()`;
- large provider topology is loaded lazily for deeper planning only when necessary.

### 2. Stage 1: Fast Planner

The initial planner returns the first 3–5 routes.

Priority:

1. direct routes;
2. strong one-transfer candidates;
3. only if necessary, limited additional alternatives.

The fast planner must use bounded candidate counts and index lookups rather than exhaustive origin-destination graph searches.

It should use approximate but conservative walking and service-time values if live walking/ETA data is not yet available. Route cards may then receive refinements later, but the first useful list must not wait for every remote API.

### 3. Stage 2: Background Refinement

After Stage 1 renders, a background planner may perform:

- broader one-transfer search;
- limited two-transfer search;
- pedestrian-route corrections;
- live ETA corrections;
- more complete ranking.

This work must be chunked/yielded, moved off the main thread where appropriate, or use precomputed indexes so it cannot monopolize the browser event loop.

The background result is stored separately as a pending improved result set.

### 4. Better-Route Update UX

If the refined result set is meaningfully better than the currently displayed set:

- do not reorder automatically;
- set a `betterResultsAvailable` state;
- show a compact `發現更優路線` / `Better routes found` action;
- tapping the action swaps the displayed options to the refined set and re-applies the current user policy.

A route set counts as meaningfully better when at least one of the following is true:

- a direct route becomes available when none was displayed;
- the best route under the current policy improves materially;
- a lower-transfer route becomes available;
- a materially shorter route appears without violating transfer policy.

Minor ETA drift alone must not trigger the banner.

## Route Policy Preservation

The refactor must preserve these rules from the current application:

- direct routes are strongly preferred;
- a direct route remains ahead when it is no more than 15 minutes slower than a faster transfer alternative;
- routes with more than two transfers are not displayed;
- candidate diversity is preserved so duplicate boarding/alighting variants do not crowd out other useful services;
- `203E` must remain discoverable as a direct candidate for the Hong Kong Eye Hospital → Tsz Ching Estate scenario via the relevant stops around Hong Kong Eye Hospital and Po Kong Village Road School Village;
- user-selectable policies continue to operate on the route set rather than being decorative UI controls.

## Walking and ETA Behavior

Stage 1 must not block on pedestrian-routing or live-ETA services.

For initial results:

- use cached pedestrian results if available;
- otherwise use conservative walking estimates;
- use cached/live ETA only when immediately available;
- otherwise use provider fallback headways.

Stage 2 may replace estimates with routed walking distances and live ETA values.

External walking/ETA failures must not remove otherwise valid routes or hold the screen in a loading state.

## Main-Thread Safety

The following are forbidden on the critical first-result path:

- parsing all raw transit provider JSON;
- calling the existing full `buildGraph()` synchronously;
- running an unbounded set of Dijkstra searches;
- generating all 10×10 boarding/alighting combinations and fully searching each before pruning;
- waiting for all walking routes;
- waiting for all live ETA requests;
- large synchronous sorts/merges over complete provider topology.

Any unavoidable heavier work after first paint must yield to the browser between chunks or run in a worker/precomputed path.

## Result Page State Model

The result screen should distinguish:

- `initialLoading`: waiting for Stage 1 only;
- `displayedOptions`: routes currently shown to the user;
- `refining`: Stage 2 is still running;
- `pendingImprovedOptions`: better refined set not yet applied;
- `betterResultsAvailable`: whether the update action should be shown;
- `planningError`: only for the absence of any usable planning data/result, not for a single provider/API failure.

Once Stage 1 returns results, the full-screen loading state must end even if Stage 2 continues.

## Error Handling

- A single provider failure must degrade gracefully.
- KMB bundled/local-first topology behavior must remain intact.
- CTB/GMB/MTR failures must not prevent KMB-based initial routes.
- Walking or ETA API failures must fall back to estimates.
- Only show a fatal journey-data error when no usable planning index/data can produce any route.
- Background refinement failure must not remove already displayed routes.

## Build and Deployment

The build pipeline must generate and validate the journey index before GitHub Pages upload.

`npm run verify` and/or the production build gate should verify:

- required journey-index files exist;
- generated metadata version matches the current build/source version where applicable;
- index files are non-empty and structurally valid;
- the fast planner can load the index without raw topology graph construction;
- 203E direct regression still passes.

The existing version refresh metadata contract must remain compatible with GitHub Pages deployment.

## Tests

At minimum add regression tests for:

1. Stage 1 does not call full `buildGraph()`.
2. Stage 1 does not wait for pedestrian routing.
3. Stage 1 does not wait for live ETA.
4. Stage 1 returns a bounded first set of 3–5 routes when suitable candidates exist.
5. Direct routes are searched before transfer-heavy routes.
6. 203E remains present in the direct-route regression scenario.
7. The initial displayed list is not automatically reordered when Stage 2 finishes.
8. Better background routes set `betterResultsAvailable`.
9. Applying the better-results action swaps in the refined set.
10. Minor ETA-only changes do not trigger the better-results banner.
11. A provider failure does not prevent initial routes from other available providers.
12. Background refinement failure leaves initial routes intact.
13. Performance-oriented test/benchmark proves Stage 1 uses bounded operations and no 10×10 exhaustive full-graph search loop.

## Performance Acceptance Criteria

- Primary target: first 3–5 practical routes visible within 1 second on a normal mobile device/network when the build-time index is cached or reasonably fast to fetch.
- Warm-cache target: preferably under 500 ms.
- The UI event loop must remain responsive during both stages.
- No synchronous full-network graph construction on result-page entry.
- No 100 full graph searches before first render.
- The user can navigate back or interact with the page while refinement continues.

The 1-second figure is a product target rather than a guarantee across every network/device condition. The hard technical requirement is that first-result work is bounded, lightweight, and non-blocking; slower network fetches must not become CPU freezes.

## Out of Scope

- A paid backend routing server.
- Replacing GitHub Pages hosting.
- Changing the existing map-picker redesign.
- Rewriting unrelated ETA screens.
- Automatically reshuffling visible results without user action.
