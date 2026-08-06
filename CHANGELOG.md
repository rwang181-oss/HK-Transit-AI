# Changelog

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
