# Architecture

## Product boundary

HK Transit AI is local-first. The web/native client performs journey graph construction, option generation, comfort scoring, ranking, GPS speed smoothing and arrival recalculation. It does not require a project-operated backend.

Network requests are limited to public data sources:

- KMB topology/ETA
- Citybus ETA
- Green Minibus ETA
- MTR next-train data
- Hong Kong Observatory current weather
- Nominatim place search

Static CTB/GMB/MTR topology is refreshed at maintenance/build time and bundled with the app.

## Main data flow

```text
Origin + destination
        |
        v
Nearby stop hubs (geo-aware merged providers)
        |
        v
Transit graph + direct/transfer candidates
        |
        v
Concurrent live ETA checks with timeout/fallback
        |
        v
JourneyOption model
  - walking / waiting / riding / transfer time
  - provider legs
  - approximate waypoint geometry
  - arrival range
  - confidence states
        |
        v
Comfort scores for five modes
        |
        v
Bilingual route cards and map selection
```

## Core modules

### `src/journey/graph`
- `stopMerger.ts` protects against distant same-name merges and generates stable hub IDs.
- `graphBuilder.ts` builds ride and transfer edges.
- `travelTime.ts` contains current deterministic travel estimates.

### `src/journey/providers`
Each provider implements `TransitProvider`: routes, stops, route-stop links and ETA.

- KMB topology is fetched at runtime and cached locally.
- CTB/GMB/MTR topology is bundled.
- All live provider calls have timeout/error boundaries.

### `src/stores/journeyStore.ts`
Integrates topology, graph planning, ETA selection, option deduplication, comfort metrics and arrival windows.

### `src/journey/comfort/comfortEngine.ts`
Pure TypeScript scoring. Current comfort values are proxy metrics, not claims of verified street-level cover.

### `src/journey/realtime/etaEstimator.ts` and `navigationTiming.ts`
Reject inaccurate or implausible GPS speed samples, smooth accepted samples, count down waiting/riding time and transparently roll a missed departure to an estimated following service.

### `src/stores/navigationStore.ts`
Foreground-only journey phases:

```text
walkingToTransit -> waiting -> riding -> walkingToDestination -> arrived
```

Boarding/riding transitions remain user-confirmable because the MVP does not infer vehicle occupancy.

## Platform boundary

`TransitMap.tsx` uses Leaflet on web. On native it deliberately shows a safe fallback that opens Apple Maps. The shared planner, ranking, stores, translations and result components remain reusable for the iOS conversion.
