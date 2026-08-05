# HK Transit AI — Journey Planner Design Spec

**Date:** 2026-08-05
**Status:** Draft
**Author:** User + Claude Code

## 1. Overview

Add a point-to-point journey planner to HK Transit AI. User picks a start stop and a destination stop; the app finds all direct and transfer routes across **KMB, Citybus (CTB), Green Minibuses (GMB), and MTR**, and recommends the route with the least total travel time.

### Non-goals for this iteration
- No fare calculation (headway/fare data exists but is out of scope)
- No walking-only routes (HKeMobility pedestrian network not used)
- No footpath / step-free accessibility options
- Ferries, trams, NLB not included in v1 (data available, add later)
- Map point selection: v1 uses stop-name search; a lightweight Leaflet map picker is a stretch goal for Web

## 2. Data Sources (all public, no auth)

| Mode | Provider id | Base | Notes |
|------|------------|------|-------|
| KMB | `KMB` | `https://data.etabus.gov.hk/v1/transport/kmb/` | already integrated |
| Citybus | `CTB` | `https://rt.data.gov.hk/v2/transport/citybus/` | routes, stops, ETA |
| Green Minibus | `GMB` | `https://data.etagmb.gov.hk` | routes grouped by region (HKI/KLN/NT), 8-digit stop ids |
| MTR | `MTR` | `https://rt.data.gov.hk/v1/transport/mtr/getSchedule.php` | next-train ETA |
| MTR stations | — | `https://opendata.mtr.com.hk/data/mtr_lines_and_stations.csv` | line/station/sequence catalogue |

## 2.5 Data Acquisition Strategy

- **KMB**: full stops + route-stops available via API (already integrated).
- **MTR**: fixed network from `mtr_lines_and_stations.csv` (bundle a snapshot), ETA from `getSchedule.php`.
- **CTB**: no bulk stop-list endpoint. A build-time script `scripts/fetch-transit-data.js` crawls `route/ctb` → `route-stop/ctb/*` → bulk `stop/{id}` lookups (rate-limited), emitting `src/data/ctb.json`.
- **GMB**: no bulk stop-list endpoint. Same script crawls `/route` → `/route/{region}/{route}` → `/route-stop/{route_id}/{type}`, emitting `src/data/gmb.json`.
- Static JSON snapshots are committed to the repo; providers read them (data refreshes on next build).

## 3. Architecture

```
src/journey/
├── providers/
│   ├── types.ts          # unified Route/Stop/RouteStop/ETA types
│   ├── kmb.ts            # adapter over src/services/kmbAPI
│   ├── ctb.ts            # adapter over rt.data.gov.hk/v2/transport/citybus
│   ├── gmb.ts            # adapter over data.etagmb.gov.hk
│   ├── mtr.ts            # adapter over mtr schedule + station CSV
│   └── index.ts          # getProviders(): TransitProvider[]
├── graph/
│   ├── stopMerger.ts     # merge stops across providers into hubs
│   ├── graphBuilder.ts   # build nodes + edges from route/stop data
│   └── travelTime.ts     # estimate leg travel time from distance
├── planner/
│   └── planner.ts        # Dijkstra, returns ranked itineraries
└── __tests__/
    ├── stopMerger.test.ts
    ├── travelTime.test.ts
    └── planner.test.ts
```

### 3.1 Unified Types (src/journey/providers/types.ts)

```typescript
export type ProviderId = 'KMB' | 'CTB' | 'GMB' | 'MTR';

export interface Route {
  route: string;          // "1A" / "1" / "26" / "EAL"
  bound: 'O' | 'I';
  orig_en: string;
  orig_tc: string;
  dest_en: string;
  dest_tc: string;
  provider: ProviderId;
}

export interface Stop {
  stopId: string;         // provider-specific id
  name_en: string;
  name_tc: string;
  lat: number;
  lng: number;
  provider: ProviderId;
}

export interface RouteStopLink {
  route: string;
  bound: 'O' | 'I';
  seq: number;
  stopId: string;
  provider: ProviderId;
}

export interface ETA {
  route: string;
  bound: 'O' | 'I';
  stopId: string;
  eta: string;            // ISO timestamp
  provider: ProviderId;
}

export interface TransitProvider {
  id: ProviderId;
  fetchRoutes(): Promise<Route[]>;
  fetchStops(): Promise<Stop[]>;
  fetchRouteStops(route: string, bound: 'O' | 'I'): Promise<RouteStopLink[]>;
  fetchETA(stopId: string, route: string): Promise<ETA[]>;
}
```

### 3.2 Stop Merger (src/journey/graph/stopMerger.ts)

- Collect all stops from all providers.
- **Name-key match first**: normalize name (lowercase, strip "站/Station/公共運輸交匯處"), group stops sharing a name-key. This merges 紅磡站 (MTR) with 紅磡站 (bus, minibus).
- **Geo fallback**: for stops without a name match, cluster stops within 200m whose names share ≥2 tokens.
- Output: `StopHub[]` — each hub has `id`, `name_en`, `name_tc`, `lat`, `lng`, `members: {provider, stopId}[]`.

```typescript
export interface StopHub {
  id: string;             // stable hash of name+coords
  name_en: string;
  name_tc: string;
  lat: number;
  lng: number;
  members: { provider: ProviderId; stopId: string }[];
}
```

### 3.3 Graph Builder (src/journey/graph/graphBuilder.ts)

- **Nodes** = StopHub.
- **In-route edges**: for each route, each consecutive stop pair (seq n → n+1) is an edge weighted by estimated travel time. MTR: same from the line/station CSV sequence.
- **Transfer edges**: between hubs that share ≥1 provider stop **and** have a distinct walk — weight = walking estimate (Haversine / 80 m·min⁻¹, min 1.5 min). Hubs with overlapping members merge, so no artificial transfer.
- **Reverse edges**: routes are directional; add the reverse leg only if the provider declares both bounds.
- `buildGraph(providers)`: `{ nodes: StopHub[], edges: Edge[] }` with lazy loading + cached in a store.

```typescript
export interface Edge {
  from: string;           // hub id
  to: string;             // hub id
  weight: number;         // minutes
  provider: ProviderId;
  route: string;
  bound: 'O' | 'I';
  kind: 'ride' | 'transfer';
  fromStopId: string;     // actual stop within from hub
  toStopId: string;
}
```

### 3.4 Travel Time Estimate (src/journey/graph/travelTime.ts)

No public station-to-station timing exists. Estimate from Haversine distance and a mode speed, plus a fixed stop dwell:

```typescript
const MODE_SPEED: Record<ProviderId, { kmh: number; dwell: number }> = {
  KMB: { kmh: 22, dwell: 0.6 },   // bus ~22 km/h avg, 36s dwell
  CTB: { kmh: 22, dwell: 0.6 },
  GMB: { kmh: 28, dwell: 0.5 },
  MTR: { kmh: 38, dwell: 1.0 },   // metro ~38 km/h avg incl. dwell
};
// legMinutes = distance(km)/speed(kmh)*60 + dwell
```

### 3.5 Planner (src/journey/planner/planner.ts)

- Standard **Dijkstra** with a min-heap over total estimated minutes.
- Returns the single shortest-time itinerary, plus up to K alternates (via a k-shortest-paths variant: run Dijkstra, then generate alternatives by pruning used edges).
- Itinerary structure:

```typescript
export interface Itinerary {
  legs: {
    provider: ProviderId;
    route: string;
    bound: 'O' | 'I';
    fromHub: string;
    toHub: string;
    fromName: string;
    toName: string;
    minutes: number;
    kind: 'ride' | 'transfer';
  }[];
  totalMinutes: number;
  transfers: number;
}
```

- Ranking: sort by `totalMinutes`; flag `[0]` as fastest. If the fastest has 0 transfers (direct), show a "Direct" badge.

## 4. UI

### 4.1 New Tab "Journey" (app/(tabs)/journey.tsx)

- Add 5th tab to the bottom bar: **行程 / Journey**.
- Two search inputs: **From** and **To**.
- Each input: stop-name search (debounced 300ms) over a flat list of all hubs (from all providers). Results show name + district. Selecting sets the field.
- Swap button between From/To.
- Search button → navigates to `/journey/result?from=<hubId>&to=<hubId>`.

### 4.2 Result Page (app/journey/[result].tsx)

- Header: "From → To".
- List of itineraries ranked by total minutes.
- Each itinerary card: total time big, mode chips per leg (九巴/城巴/小巴/港鐵), route numbers, transfer count.
- First card has a "最快 / Fastest" badge.
- Tap a card to expand legs breakdown (like the stop accordion).

### 4.3 i18n additions

- en.json / zh-HK.json: journey tab labels, "From", "To", "Fastest", "Direct", "Transfer", "departure", provider names (九巴/城巴/綠色小巴/港鐵).

## 5. Testing Strategy

- Unit: travelTime estimation, stopMerger (name + geo merging), planner (single-route direct, one-transfer, no-route-found, cycle safety).
- Manual: real KMB→MTR transfer at 紅磡站, direct route 8, GMB route, no-result case.

## 6. Acceptance Criteria

1. User can pick any two stops and get ranked itineraries in <2s after data load.
2. Itineraries mix KMB, CTB, GMB, MTR legs where applicable.
3. Transfer points use real hub names (e.g. 紅磡站).
4. Fastest itinerary flagged; direct routes flagged.
5. Travel times labeled as estimates.
6. All existing features still work (regression).
