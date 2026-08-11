# Changelog

## [Unreleased]

### Added
- Web route search ranks exact public route numbers first and opens the provider-neutral route-detail view used by saved-route cards.
- Saved routes retain their provider and boarding stop; legacy saved routes migrate to KMB without losing the saved entry.
- Shared foreground location lifecycle and live journey progress are covered by core and component tests.

### Changed
- Leaflet keeps one map and tile layer, reconciles markers and path layers by stable identifiers, and lets the rider recenter after manually dragging the map.
- The GitHub Pages web export serves journey-index shards and loader paths below `/HK-Transit-AI` and includes `.nojekyll`, `version.json`, and an SPA `404.html` fallback.

### Release gate
- The 2026-08-11 topology refresh was not accepted because the GMB route-stop upstream returned HTTP 403 responses. The previously validated schema-v2 snapshots remain checked in.
- Web review is the delivery gate. Native iOS map replacement, device testing, signing, and App Store work begin only after owner approval of the web preview.

## 2.0.1 mobile performance and journey UX — 2026-08-06

### Changed
- Rebuilt the journey home screen as a mobile-first layout with 16 px inputs and a primary route-search button that remains visible below the scroll area.
- Made both the location picker map and route map opt-in so Leaflet and map tiles are not loaded during the initial screen render.
- Switched web maps to high-DPI CARTO raster tiles, added an explicit mobile viewport, iOS safe-area handling, loading feedback and resize recovery.
- Simplified journey results so route cards and steps appear before optional maps and secondary explanation.
- Route selection now expands the selected itinerary, while starting a journey opens a dedicated live-navigation modal with permission/error feedback and a reopen control.
- Added request TTL caching, in-flight request deduplication, route-data stale-while-revalidate behaviour and bounded realtime ETA concurrency.
- Deferred the full multimodal journey graph until the user begins searching or opens the result screen; route planning now awaits an existing graph build instead of racing it.
- Replaced the nearby page's full-network route-stop download with bounded per-stop Stop ETA requests for only the ten nearest KMB stops.

### iOS continuity
- The shared Expo Router, TypeScript stores, journey engine, location permission flow, EAS profiles and iOS bundle identifier remain intact.
- Native map rendering remains isolated behind `TransitMap`, preserving the planned `TransitMap.web.tsx` / `TransitMap.ios.tsx` adapter path for a future App Store build.

## 2.0.0 handoff — 2026-08-06

### Added
- Five journey preference modes: recommended, fastest, less sun, less rain and more indoor.
- Transparent comfort metrics and reason labels.
- HKO current-weather adapter and Zustand weather store.
- Foreground walking-speed smoothing, dynamic missed-service adjustment and arrival-window recalculation.
- Live journey state machine and bilingual tracking panel.
- Map polylines and selected route display.
- Bilingual map-first origin/destination experience.
- Offline core tests and source/handoff verification scripts.
- App icon, favicon, iOS/Android identifiers and EAS profiles.
- Complete architecture, data, deployment and iOS handoff documentation.

### Changed
- Journey store now parallelises candidate ETA checks and distinguishes live, estimated and unavailable data.
- Route options expose walking, waiting, riding, transfers, geometry, comfort scores and arrival windows.
- Stop merging now uses geographic distance and deterministic IDs.
- Citybus routes derive both outbound and inbound directions from available route-stop data.
- Green Minibus provider uses the precise numeric route/route-sequence/stop-sequence ETA contract after data refresh. Internal variation keys remain unique while passenger-facing route numbers stay clean.
- Public geocoding now returns the actual selected place instead of snapping the destination to a nearby stop.
- Journey totals now subtract the walk-to-stop portion from the time-to-departure, avoiding double counting, and include an explicit transfer waiting buffer.

### Known deployment gate
- Refresh `src/data/gmb.json` with `npm run data:refresh` before production deployment.
