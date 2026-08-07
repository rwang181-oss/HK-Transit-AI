# HK Transit AI Mobile Performance and Navigation Fix Design

**Date:** 2026-08-06
**Status:** Approved by user through explicit implementation request

## Goal

Make the deployed web app feel native on an iPhone-sized screen: fast first paint, crisp and responsive map, visible journey action without scrolling, clear feedback after selecting and starting a route, and a simplified journey-results page. Preserve Expo/React Native boundaries so the same screens and platform-neutral stores remain reusable for an App Store iOS build.

## Root causes

1. The home screen immediately loads and parses large Citybus/GMB snapshots, downloads the full KMB topology, and constructs the entire multimodal graph before the primary action can be used.
2. Journey planning requests realtime ETA for too many candidate routes concurrently, so one slow provider delays the whole result set.
3. The Leaflet map is initialized immediately with standard-resolution tiles, dynamic CSS loading, animated panning, and no loading shell.
4. The home flow places the map before the primary action, making the search button fall below the first phone viewport.
5. Starting navigation updates a panel already rendered above the route cards, but the page neither scrolls to it nor opens a dedicated navigation surface.
6. The result screen contains weather, map, explanatory copy, mode controls and confidence text before the actual routes, increasing render cost and hiding the primary content.
7. Web layout lacks an explicit mobile HTML viewport and maximum-content-width wrapper.

## Design

### Mobile shell

- Add a web HTML document with `width=device-width`, `initial-scale=1`, safe-area support and disabled accidental text-size inflation.
- Constrain content to a centered mobile column on wide screens while allowing full width on phones.
- Use safe-area padding and a sticky bottom primary action on the journey form.

### Home journey flow

- Keep only compact branding, origin/destination inputs, suggestions, status and the primary search button above the fold.
- Move the map into an optional collapsible section labelled “Choose on map”.
- Load transit topology after the first render and show a concise readiness state without blocking typing.
- Search local station data immediately; only call external geocoding after a longer debounce and when local results are insufficient.

### Map

- Use a loading placeholder and initialize Leaflet only when the map section is opened or a result route needs it.
- Load Leaflet CSS from the document head, use high-DPI CARTO/OSM-compatible raster tiles with retina suffix, disable expensive animations, keep a small tile buffer and invalidate size with `requestAnimationFrame`.
- Preserve the existing native fallback that opens Apple Maps.

### Data and realtime performance

- Add in-memory request deduplication and short TTL caching to KMB and provider fetch helpers.
- Persist KMB topology and route data first, then refresh in the background rather than blocking the UI.
- Limit realtime ETA enrichment to the best four rough candidates and bound concurrent ETA calls to three.
- Return estimated route options immediately if live ETA calls time out; mark them as estimated.

### Results and navigation

- Render route cards first. Keep the map behind a compact “View route map” toggle and remove nonessential introductory copy.
- Make tapping a card select and expand it with a visible selected state.
- Starting a route opens a full-screen navigation modal/sheet immediately. On denied location permission, show an explicit error in the same sheet.
- The navigation surface contains the live phase, remaining time, route summary and stop/next-stage controls.

### iOS readiness

- Keep all planning, caching, ETA and navigation state in platform-neutral TypeScript.
- Keep map implementation behind `TransitMap`; web uses Leaflet and native uses Apple Maps fallback until a native map package is added.
- Retain the existing iOS bundle identifier and permission strings; do not add web-only APIs to stores.

## Acceptance criteria

1. On a phone-width viewport, no horizontal zooming or manual page scaling is needed.
2. Origin, destination and the enabled journey-search action are visible without scrolling.
3. Map is crisp on retina screens and does not initialize until requested on the home screen.
4. Selecting a route produces an immediate visual state; pressing Start opens the navigation surface.
5. Results show route options before map and explanatory content.
6. API calls are cached/deduplicated and ETA enrichment is concurrency-limited.
7. Core tests, source verification, structural type verification and web build pass.
8. The deployed GitHub Pages site is updated and reports a successful Pages deployment.
