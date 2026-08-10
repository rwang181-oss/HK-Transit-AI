# HK Transit Live Navigation and Multimodal Search Design

**Date:** 2026-08-10
**Status:** Approved direction; awaiting written-spec review

## Goal

Remove the `AI` wording from the home brand, expose the language switch on the headerless home screen, make route search cover KMB, Citybus, Green Minibus and MTR, and replace the text-only navigation sheet with an in-app live map that follows the user's GPS position and dynamically routes the current walking stage to the next target stop.

## Confirmed Product Decisions

- The home brand is `HK Transit` in both languages.
- The home screen has a visible `中 / EN` language control without restoring the hidden navigation header.
- Route search covers all four providers: `KMB`, `CTB`, `GMB` and `MTR`.
- Starting navigation opens an in-app map; it does not hand the primary experience to Google Maps or Apple Maps.
- During a walking stage, the app requests a pedestrian route from the current GPS position to the next target stop and refreshes that route after meaningful movement or deviation.
- The existing public Valhalla pedestrian endpoint remains the routing source. No paid map API or API key is added.
- If pedestrian routing fails, the UI clearly labels the displayed connection as an estimate and continues showing the user and target markers.

## Root Causes

1. `app/(tabs)/search.tsx` reads `useRouteStore`, and `src/stores/routeStore.ts` imports only KMB API functions. The screen therefore cannot return Citybus, GMB or MTR routes.
2. The language switch is defined as `headerRight` in `app/(tabs)/_layout.tsx`, while the home tab sets `headerShown: false`. The switch is therefore absent from the home screen.
3. The home brand is a hard-coded `HK Transit AI` string.
4. `NavigationModal` renders only `LiveJourneyPanel`. Although `navigationStore` receives GPS updates, no map consumes `currentPosition` in the navigation surface.
5. The result map connects journey geometry points and transit stops. These lines are useful as an overview but are not a continuously refreshed route from the user's live position.
6. A downloaded source tree does not contain `public/data/journey/*`; `npm run build:web` generates it, but a direct development start can leave the journey planner without its index.

## Architecture

### 1. Home Header and Language

The home screen owns its compact header because its Expo navigation header remains hidden for layout reasons. The header contains the `HK Transit` brand, weather pill and an accessible language button. The button calls the existing `changeLanguage` function and displays `EN` while Chinese is active and `繁中` while English is active.

Other tabs retain their current navigation-header language switch. Translation state remains global through i18next.

### 2. Provider-Neutral Route Catalogue

Introduce a route-catalogue store dedicated to the route-search experience. It loads providers independently through `getProvider`, so one failed provider does not hide successful providers. KMB may refresh from its API; CTB, GMB and MTR use their bundled route snapshots. The catalogue stores loading/error state per provider and keeps the last successful results in memory.

Each searchable entry retains:

- provider ID;
- internal route ID;
- public route label;
- direction;
- bilingual origin and destination;
- optional GMB source metadata already contained in its internal route ID.

Search matches the public route label, internal route ID, origin and destination in English or Chinese. Results are deduplicated by provider, internal route ID and direction. Provider badges prevent identically numbered KMB, Citybus and minibus routes from being confused.

Selecting a result opens a provider-aware route screen. That screen uses the existing `TransitProvider` interface to load the direction's stop sequence and stop names, and to request ETA for an expanded stop. If a provider has no live ETA for that stop, the screen shows an explicit unavailable state rather than a fabricated time. Existing KMB favourites remain KMB-only; this change does not silently alter their storage schema.

### 3. Live Navigation Map

`NavigationModal` becomes a full-screen live-navigation surface with the map above the existing timing/status panel. It reads `option`, `destination`, `currentPosition`, `phase` and `activeLegIndex` from `navigationStore`.

The navigation store adds a `walkingTransfer` phase and tracks the active itinerary leg. The existing manual “next stage” action advances through the actual itinerary: walk to the first boarding stop, wait, ride, walk to the next boarding stop when a transfer exists, wait, ride, and finally walk to the destination. Automatic proximity transitions remain limited to walking phases; the app does not infer bus boarding or alighting from noisy GPS data.

The current navigation target is deterministic:

- `walkingToTransit`: the first ride leg's `fromHubId`;
- `walkingTransfer`: the next ride leg's `fromHubId`;
- `waiting`: the active ride leg's `fromHubId`;
- `riding`: the active ride leg's `toHubId`;
- `walkingToDestination`: the final destination;
- `arrived`: the final destination, with the route line removed.

Every hub target is resolved from the selected option's itinerary and journey geometry. If a required hub coordinate is unavailable, navigation stays on the textual stage panel and labels the map target as unavailable instead of silently using a different stop.

The map renders:

- a blue `me` marker for the latest valid GPS position;
- a highlighted next-target marker with its bilingual station name;
- the live pedestrian route during walking phases;
- the selected journey's transit geometry as contextual background during waiting/riding;
- a recenter control when the user pans away from GPS follow mode.

GPS follow is enabled when navigation opens. Programmatic centring uses the current position and next target without re-fitting the full journey on every location update.

### 4. Dynamic Pedestrian Rerouting

Add a small live-route controller separate from the navigation timing calculations. It consumes current position, current target and phase, and calls the existing `walkingRouter` only for `walkingToTransit`, `walkingTransfer` and `walkingToDestination`.

To protect the public endpoint and avoid visible route jitter:

- the first valid GPS position triggers a route request;
- subsequent requests require at least 25 metres of movement from the last routed origin or a target/phase change;
- only one request is active at a time;
- a newer position supersedes an older pending result;
- failures return `conservativeWalkingRoute` and expose `source: estimated` to the UI;
- the controller does not request routes during waiting, riding or arrived phases.

The existing 5-second/5-metre GPS subscription remains unchanged initially. Rerouting policy, not GPS sampling, controls network traffic.

### 5. Journey Index Development Reliability

Development and verification commands must ensure the journey index exists before the web app expects it. Add a development wrapper that builds the index before starting Expo web, while retaining `build:web` as the production path. Verification checks the generated index's provider coverage and rejects a build that omits KMB, CTB, GMB or MTR routes.

Generated index files remain build artefacts rather than manually maintained source files.

## Data and Error Flow

Provider-route loading uses independent settled promises. The search page reports partial availability, such as “MTR data temporarily unavailable,” while keeping other provider results usable.

Live navigation starts only after foreground location permission is granted. Until the first GPS fix, the map shows the planned start/target context and a locating indicator. Permission denial and tracking failure remain visible inside the navigation modal.

Pedestrian route failures never stop navigation timing. The route line changes to the estimated style, and the user still sees their current position, next target and distance/time status.

## Testing Strategy

Automated tests will be written before production changes and will cover:

- a provider-neutral route catalogue returning KMB, CTB, GMB and MTR entries;
- partial provider failure without losing successful results;
- matching route numbers and bilingual origin/destination text;
- distinct provider results for the same public route number;
- navigation target selection for every navigation phase;
- active-leg advancement across a direct trip and a one-transfer trip;
- reroute triggering on initial fix, 25-metre movement and target changes;
- no reroute below the threshold or during non-walking phases;
- stale route responses not replacing newer results;
- estimated fallback after pedestrian-router failure;
- the home source contract containing `HK Transit` and a visible language control;
- journey-index verification containing routes for all four providers.

Browser acceptance will be performed at phone and desktop widths. It will verify home language switching, provider badges and route selection, navigation-modal opening, GPS permission states, live marker updates, follow/recenter behaviour, target station display and routed-versus-estimated styling.

## Acceptance Criteria

1. The home screen displays `HK Transit` and no `HK Transit AI` brand.
2. The home screen always exposes a working English/Traditional Chinese switch.
3. Searching representative KMB, Citybus, GMB and MTR routes returns provider-labelled results.
4. A provider failure does not prevent other provider results from appearing.
5. Selecting any supported provider route opens its ordered stop list; available live ETA is shown honestly.
6. Pressing Start opens a full-screen in-app map immediately.
7. After a GPS fix, the map follows the user and shows the next target stop.
8. Walking phases display a pedestrian route from the live position to the target and reroute after meaningful movement.
9. Routing failure produces an explicitly estimated connection rather than a blank or misleading accurate route.
10. A one-transfer itinerary advances to the correct transfer boarding stop instead of jumping directly to the final alighting stop.
11. Existing timing, ETA, phase controls, KMB favourites and phone-width layout continue to work.
12. Core tests, source verification, structural type verification, journey-index verification and web export pass in an environment with the declared dependencies installed.

## Out of Scope

- Google Maps Platform, Mapbox Directions or another paid routing service;
- voice instructions and turn-by-turn manoeuvre text;
- background GPS navigation;
- automatic inference of boarding and alighting;
- native MapKit rendering or an App Store build;
- redesigning the KMB favourites and nearby-stop stores for all providers;
- claiming that public Valhalla routing has Google Maps-level availability or accuracy.
