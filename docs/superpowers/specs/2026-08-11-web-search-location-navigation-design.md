# Web Search, Location, and Live Navigation Design

## Goal

Deliver the web release first: exact route-number results rank first, saved routes and search share one provider-neutral detail page, browser GPS has explicit recoverable states, and the in-app Leaflet map follows live location without rebuilding all layers. iOS reuses the interfaces only after the owner approves the web preview.

## Product boundaries

- GitHub Pages remains a static, local-first client. No project-operated backend is added.
- Route planning, ranking, favorites, navigation phases, and ETA recalculation run in the browser or app.
- Public transport ETA, weather, map tiles, geocoding, and optional pedestrian routing remain network dependencies with honest fallbacks.
- Live navigation means foreground position, map follow, and journey progress. It does not mean vehicle tracking, background location, or turn-by-turn voice guidance.

## Route search and saved routes

Every route is identified by provider, internal route code, bound, and optional variant. Search ranks exact public route-code matches ahead of public-code prefixes, public-code substrings, internal-code matches, and origin/destination text matches. Ties remain deterministic in KMB, CTB, GMB, MTR order.

A saved route remains a route plus a commonly used boarding stop. Search and saved-route cards open the same provider-neutral route-detail screen. A saved-route link includes the stop id, and the detail screen scrolls to, expands, and loads ETA for that stop. Persisted version-1 saved routes migrate without data loss by assigning KMB as their provider.

## Location and navigation

Location permission is requested only after the user taps My Location or Start Live Journey. One shared location store owns permission, one-shot acquisition, tracking, errors, latest sample, and subscription cleanup. Search uses a recent sufficiently accurate last-known sample when available, then refreshes it. Navigation acquires an initial current position before starting the foreground watcher.

The visible status distinguishes idle, requesting, locating, tracking, denied, timed out, unavailable, and failed. A first fix is bounded to 12 seconds and every failure has a retry action. Navigation consumes shared samples; it does not create a second location watcher.

## Maps

The shared map contract uses stable point and path ids. Web keeps Leaflet, initializes the map and tile layer once, updates markers in place, and updates polylines only when their geometry changes. Dragging disables follow mode until the user taps Recenter. The current native fallback stays in place during the web phase, behind the same contract; after web approval it will be replaced by an in-app Apple Maps adapter using `react-native-maps`.

## Verification and release

Every behavior change follows a failing-test-first cycle. The web phase must pass core tests, Jest, TypeScript, source/mobile/handoff verification, and web export. It is delivered on a feature branch for owner review before main is changed. Project status, changelog, and verification report are updated with evidence and remaining iOS work.
