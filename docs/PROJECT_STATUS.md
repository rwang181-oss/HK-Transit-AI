# Project Status

## Completed in this handoff

- Local-first journey option model and planner integration
- Five comfort/time ranking modes
- Transparent confidence and estimate wording
- Live/estimated/unavailable departure states
- Non-zero provider wait fallbacks
- Concurrent candidate ETA requests
- Geo-aware stable stop merging
- Corrected Citybus direction reconstruction
- Correct GMB precise ETA interface after schema-v2 data refresh
- HKO weather adapter
- Foreground walking-speed recalibration with dynamic missed-service/headway adjustment
- Bilingual map-first search/results/tracking UI
- Route waypoint polylines
- Expo app identifiers, permissions, EAS config, icon and favicon
- Core tests and offline source verification
- Deployment and iOS handoff documents

## Verification performed in the preparation environment

- Dependency-free core TypeScript compilation and 22 behavioural tests
- TS/TSX syntax parsing
- JSON parsing
- JavaScript syntax checking
- Offline structural TypeScript check using `tsconfig.verify.json`

## Not verifiable in the preparation environment

The environment could not install Expo dependencies because its internal npm registry did not contain required packages. Therefore the following must be run by the receiving agent with normal internet/npm access:

```bash
npm install
npm test
npm run build:web
```

No claim is made that the full Expo export has already passed.

## Required before public deployment

1. Run `npm run data:refresh`.
2. Confirm the refreshed `src/data/gmb.json` has `schemaVersion: 2` and route-stop entries containing `sourceRouteId`, `routeSeq` and `stopSeq`.
3. Run all verification/build commands.
4. Test real examples across KMB, CTB, GMB and MTR.
5. Deploy to a preview URL for owner acceptance.

## Recommended acceptance routes

Use multiple origin/destination pairs rather than one happy path:

- PolyU / Hung Hom area to Mong Kok
- Central to Causeway Bay
- Sha Tin to Admiralty
- A route where GMB is a candidate
- A route requiring one transfer
- A rain-mode and strong-UV-mode comparison

Record expected route plausibility, ETA status, duplicate options, language copy and map display.
