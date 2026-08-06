# Known Limitations

## Routing

- Walking distance currently uses geographic distance and transfer proxies, not a complete pedestrian street graph.
- Map polylines connect journey waypoints and are not turn-by-turn paths.
- Transfer edges are approximations.
- Ride times use the existing deterministic transit graph model; they are not full timetable simulations.

## Comfort model

- Outdoor exposure is derived from walking plus part of waiting time.
- MTR time is used as a proxy for indoor travel.
- Covered walkway, actual shade, air conditioning, slope, stairs and indoor opening hours are not yet attached to street segments.
- Therefore all comfort UI is explicitly labelled as estimated.

## Live data

- Public operator APIs can be unavailable, delayed or rate-limited.
- Fallback wait values are shown as estimates rather than zero.
- The supplied GMB snapshot is legacy and requires refresh.
- MTR station coordinates are incomplete.
- Place search relies on a throttled public Nominatim request and has no persistent offline POI index.

## Live journey

- GPS tracking runs only in the foreground.
- Speed updates reject poor-accuracy and implausible samples but are still affected by urban-canyon GPS noise.
- Boarding and alighting are not automatically inferred; a manual next-stage control is retained.
- The ETA recalculation does not predict traffic congestion, by product design.

## Native release

- Native in-app MapKit rendering is not implemented in this web handoff.
- No TestFlight/App Store build was produced.
- EAS identifiers are placeholders pending the owner's Apple Developer setup.

## Preparation environment

- Full npm dependency installation and Expo web export could not run because the preparation environment's internal npm registry lacked required packages.
- Core tests, syntax checks and offline structural TypeScript verification were run instead.
