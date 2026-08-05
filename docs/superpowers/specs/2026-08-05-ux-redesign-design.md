# HK Transit AI — UX Redesign Spec (User-Centric Journey Flow)

**Date:** 2026-08-05
**Status:** Approved by user (self-execute)
**Author:** User + Claude Code

## 1. Problem

The current app is feature-scattered. The user's real need is a single flow:

> **"I'm at [here], I want to go to [there] — which bus do I take, can I walk there in time to catch it, and when does it arrive?"**

Everything must revolve around this journey flow, with live bus ETA integrated at each boarding stop.

## 2. New User Flow (the core logic)

```
① Journey screen (becomes the primary screen)
   • My Location (GPS) is the default start
   • Destination: type any place/address/station → geocode + fuzzy station search
   • Map shows: current location, chosen points, nearby stations
   • "Plan" button

② Results screen — ranked itineraries by TOTAL time
   TOTAL = walk to board stop + wait for bus + in-vehicle time + walk to destination
   Each card:
     🚶 Walk to [station] (X min)
     🚌 Route 8  [station] → [station]  (Y min)   ← tap → live ETA page
     🚶 Walk to destination (Z min)
   First bus at each boarding stop shows live ETA + "can you make it" verdict:
     ✓ catchable (walk ≤ next bus)  /  ✗ miss it (suggest earlier)

③ Tap a route leg → live ETA page for that stop+route (existing feature)

④ Live ETA page (existing) — auto-refreshes every 30s
```

## 3. Technical Additions

### 3.1 Geocoding (src/journey/geo/geocode.ts)
- **Nominatim (OpenStreetMap)**: `https://nominatim.openstreetmap.org/search?q=<query>&format=json&limit=3`
- **Important:** do NOT pass `countrycodes=hk` (it breaks HK results).
- Send a descriptive `User-Agent`. Rate-limit to ≤1 req/s (debounce UI).
- Fallback chain for a query: fuzzy station search → Nominatim → nearest stations to geocoded point.

### 3.2 Walk & wait time (src/journey/geo/walkTime.ts)
- `estimateWalkMinutes(meters)` = meters / 80 m·min⁻¹ (already exists in travelTime.ts).
- Nearest station to a coordinate: Haversine over hubs.

### 3.3 Catch-the-bus logic (in journeyStore)
- For each itinerary's FIRST boarding stop, fetch live ETA for the first route.
- `nextBusMin` = minutes until next bus.
- `catchable` = walkToStationMin ≤ nextBusMin.
- If not catchable, show "suggest departing earlier" and the wait time to the NEXT bus.

### 3.4 Journey store plan() (rewritten)
```ts
plan(from: {lat,lng,name}, to: {lat,lng,name}): Promise<JourneyOption[]>
```
- Find up to 3 boarding hubs near `from`, 3 alighting hubs near `to`.
- For each pair: `planJourney(graph, board, alight)`.
- Compose options: walk-to-station + wait + itinerary + walk-from-station.
- Fetch live ETA for each option's first boarding stop (parallel, fault-tolerant).
- Rank by total minutes.

### 3.5 Map (src/components/TransitMap.tsx)
- Leaflet (Web). Native fallback later.
- Shows: current location, selected start/dest, nearby stations (markers).
- Click to pick a point (fills the start/dest coordinate).
- Used on journey screen (pick points) and result screen (show route).

## 4. Screen Reorganization

| Screen | Role |
|--------|------|
| `app/(tabs)/journey.tsx` | **Primary**: start/dest input + map + plan |
| `app/journey/result.tsx` | Ranked options, step-by-step, tap leg → ETA |
| `app/(tabs)/index.tsx` | Dashboard: favorite routes ETA (unchanged) |
| `app/(tabs)/search.tsx` | Route search (unchanged) |
| `app/(tabs)/nearby.tsx` | Nearby routes (unchanged) |
| `app/eta/[routeId].tsx` | Live ETA (unchanged) |

## 5. Acceptance Criteria
1. User picks a destination (typed or map-tapped), gets ranked options.
2. Each option shows walk + wait + ride + walk with live first-bus ETA.
3. "Can you catch it" verdict on the first boarding stop.
4. Tapping a route leg opens the live ETA page for that stop.
5. Map shows current location, picks, and nearby stations.
6. Chinese UI contains no English (except route numbers / proper nouns).
7. All existing features still work.
