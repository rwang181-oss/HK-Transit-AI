# Journey Ranking, Walking Accuracy, Map Loading, and Auto-Update Design

Date: 2026-08-07

## Goal

Make journey recommendations behave like a practical Hong Kong passenger would expect: direct and low-transfer routes must not be discarded, walking estimates must use road routing when available, route preference buttons must materially change the result set, maps must not block the page, and users must receive newly deployed code without manually refreshing.

## Scope

This change includes six connected areas:

1. Candidate generation and transfer-aware planning.
2. User-facing route preference modes.
3. Walking distance and walking time estimation.
4. Map loading performance.
5. Automatic web version refresh.
6. Regression and deployment verification.

## 1. Candidate generation

### Nearby stop selection

The planner will no longer keep only the five geographically nearest hubs. It will collect all valid boarding and alighting hubs within the configured walking radius, then cap the working set only after grouping by route coverage and distance. This prevents a dense group of nearby stops from hiding a slightly farther stop served by a useful direct route.

The initial limits will be:

- Boarding and alighting search radius: 1,200 metres.
- Maximum working hubs per side after route-aware pruning: 20.
- At least one hub per distinct direct route is retained before applying the cap.

### Direct routes

Direct candidates are generated first and kept in a separate pool. A direct route must never be removed merely because a transfer itinerary has a lower rough travel-time estimate.

The planner retains up to:

- 8 direct candidates.
- 8 one-transfer candidates.
- 4 two-transfer candidates.

Routes with three or more transfers are not presented.

### Transfer-aware graph search

The graph search cost will include transfer penalties during path finding, not after the route is already chosen.

Default search costs:

- Boarding a first service: no transfer penalty.
- Every change to another transit service: 10-minute generalized penalty.
- Walking transfer edge: its estimated walking time plus a 2-minute uncertainty buffer.
- More than two transfers: rejected.

The displayed journey time remains the estimated physical duration. The generalized penalty is used only for route discovery and ranking.

### Candidate diversity

Results are deduplicated by the full sequence of provider, route, direction, boarding hub, and alighting hub. The final candidate set must preserve diversity instead of returning several nearly identical variants of the same route.

## 2. Route preference modes

The main route buttons become:

- Comprehensive recommendation.
- Direct first.
- At most one transfer.
- Fastest.
- Less walking.

These are planning policies, not cosmetic re-sorting buttons.

### Comprehensive recommendation

Ranking order:

1. Prefer fewer transfers.
2. A direct route stays ahead of a transfer route unless it is more than 15 minutes slower.
3. Compare total time.
4. Compare walking distance.
5. Compare estimated waiting time.

The first three results must contain no route with more than one transfer when any zero- or one-transfer alternative exists.

### Direct first

Show direct routes first. When at least one direct route exists, all direct routes appear before transfer routes. When no direct route exists, display a clear message and show the best one-transfer alternatives.

### At most one transfer

Filter out all itineraries with more than one transfer before ranking.

### Fastest

Rank by total estimated journey time, then by transfers, then by walking distance.

### Less walking

Rank by routed walking distance, then by transfers, then by total journey time.

### Weather preferences

The existing sun, rain, and indoor calculations remain available as secondary badges and explanations. They no longer occupy the main route-policy row or determine the initial candidate pool.

## 3. Walking estimation

### Primary method

Use a pedestrian routing service to calculate road-network distance, duration, and geometry for:

- Origin to boarding stop.
- Transfer walks.
- Alighting stop to destination.

The first implementation will use a Valhalla-compatible pedestrian route endpoint through an isolated walking-router adapter. The endpoint is configurable and may be replaced without changing planner logic.

### Caching and concurrency

- Cache walking routes by rounded coordinate pair.
- Cache lifetime: 24 hours.
- Maximum concurrent routing requests: 4.
- Request timeout: 5 seconds.
- Only shortlisted transit candidates receive road-routing requests.

### Fallback

When road routing is unavailable, fall back to a conservative estimate:

- Haversine distance multiplied by 1.35.
- Walking speed: 70 metres per minute.
- Minimum walking segment: 2 minutes.

Fallback results are marked as estimated. The UI must not present them as precise road-walking times.

## 4. Map loading

The route result page renders text results first. Leaflet and map tiles load only after the user expands the route map.

Additional rules:

- Do not preload Leaflet CSS from the global HTML head.
- Load Leaflet CSS and JavaScript only when a web map is first requested.
- Reuse the map component instance while switching options.
- The map may fail without affecting route results.
- Display routed walking geometry when available; otherwise display clearly marked approximate geometry.
- Keep tile buffer small and disable animations on mobile.

## 5. Automatic web update

### Build metadata

Every production build generates `version.json` containing:

- Build identifier.
- Commit SHA when available.
- Build timestamp.

The file must be included in the GitHub Pages artifact.

### Runtime checking

The web app:

- Reads its current build identifier at startup.
- Fetches `/HK-Transit-AI/version.json` with `cache: no-store` and a timestamp query parameter.
- Checks once immediately after startup and every 60 seconds.
- Immediately reloads when a different build identifier is detected.

### Loop protection

Before reloading, store the target build identifier and reload timestamp in session storage. Do not trigger another automatic reload for the same target build within five minutes. Network failures are ignored and do not interrupt the app.

### Cache cleanup

Before reloading:

- Delete Cache Storage entries owned by the app, when available.
- Unregister stale service workers, if any exist.
- Preserve the current URL and query parameters.

## 6. User interface

The result page shows the five planning policies in a horizontally scrollable row on mobile.

Changing a policy must visibly update at least one of the following:

- The candidate set.
- The candidate order.
- A filter explanation or empty-state message.

Each route card displays:

- Direct or number of transfers.
- Walking distance and time.
- Whether walking is road-routed or estimated.
- Total estimated time.
- Live or estimated waiting status.

## 7. Regression requirements

### Hong Kong Eye Hospital to Tsz Ching Estate case

Add a deterministic fixture covering the relevant KMB topology. The test must prove that:

- Route 203E is discovered as a direct candidate between a boarding stop near Hong Kong Eye Hospital and an alighting stop near Po Kong Village Road School Village.
- The 203E direct candidate is not removed by the candidate cap.
- In comprehensive mode, it ranks ahead of a two-transfer route unless it is more than 15 minutes slower.
- In direct-first mode, it appears before all transfer routes.

### Policy tests

Tests must cover:

- Direct-first filtering and ordering.
- Maximum-one-transfer filtering.
- Fastest ordering.
- Less-walking ordering.
- Rejection of three-transfer routes.
- Candidate diversity and per-pool limits.

### Walking tests

Tests must cover:

- Road-routing success.
- Timeout fallback.
- Cached route reuse.
- Conservative fallback distance and duration.

### Auto-update tests

Tests must cover:

- No reload when versions match.
- Immediate reload when versions differ.
- No repeated reload loop for the same target build.
- Version file creation during production build.

## 8. Deployment gates

The pull request workflow must run:

- Core tests.
- TypeScript verification.
- Source verification.
- Mobile UX verification.
- Production web build.
- Checks that `dist/version.json` exists and contains a non-empty build identifier.

After merge, GitHub Pages deployment must complete successfully before the change is considered released.

## Acceptance criteria

The work is complete only when all of the following are true:

1. The 203E fixture passes and the route appears as a direct option.
2. Direct and one-transfer routes cannot be prematurely removed by a four-candidate global cap.
3. The five preference buttons materially filter or reorder results according to their definitions.
4. Walking time uses pedestrian routing when available and a clearly marked conservative fallback otherwise.
5. Opening the result page does not load Leaflet or map tiles until the user opens the map.
6. A newly deployed web build causes an open older page to refresh automatically within 60 seconds without user action.
7. Full verification and production build pass in GitHub Actions.
8. The GitHub Pages deployment for the merged commit reports success.
