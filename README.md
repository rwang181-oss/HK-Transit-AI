# HK Transit AI

**Local-first, bilingual comfort navigation for Hong Kong pedestrians.**

**為香港行人而設的本地優先、繁體中文／英文舒適出行助手。**

HK Transit AI combines walking estimates, public transport topology, live arrival checks, Hong Kong weather context and foreground GPS speed recalibration. It compares five route preferences: comfort pick, fastest, less sun, less rain and more indoor travel.

> This handoff is a web MVP and iOS-ready core—not a finished App Store binary. Read [`HANDOFF.md`](HANDOFF.md) and [`docs/PROJECT_STATUS.md`](docs/PROJECT_STATUS.md) before deployment.

## Current feature set

- Bilingual Traditional Chinese and English UI
- Map-first origin/destination search and map point selection
- KMB, Citybus, Green Minibus and MTR provider adapters
- Live/estimated/unavailable ETA confidence labels
- Five transparent journey-ranking modes
- Weather context from the Hong Kong Observatory adapter
- Route cards with walking, waiting, riding and transfer breakdowns
- Foreground GPS walking-speed smoothing, decreasing wait/ride clocks and dynamic arrival windows
- Stable, geo-aware transit stop merging
- GitHub Pages web build scripts
- iOS/Android identifiers, location permission copy and EAS profiles

## Quick start

```bash
npm install
npm run data:refresh   # required before production deployment
npm run verify
npm run build:web
```

To run locally:

```bash
npm run web
```

## Verification scripts

```bash
npm run test:core       # dependency-free core TypeScript tests
npm run verify:source   # TS/TSX parser, JSON and JS syntax checks
npm run verify:handoff  # assets, documentation and package structure
npm run verify          # all checks above
```

The full Expo/Jest build still requires a normal npm registry and installed dependencies.

## Project map

```text
app/
  (tabs)/index.tsx             map-first journey search
  journey/result.tsx           comfort-ranked route results
src/
  journey/comfort/             ranking and transparent comfort proxies
  journey/realtime/            walking speed and arrival recalculation
  journey/providers/           KMB / CTB / GMB / MTR adapters
  journey/graph/               stop merging and transport graph
  stores/journeyStore.ts       planner integration
  stores/navigationStore.ts    foreground live journey state
  services/weatherService.ts   HKO weather adapter
scripts/
  fetch-transit-data.js        build-time snapshot refresh
  run-core-tests.cjs           dependency-free test runner
  verify-source.cjs            source validation
  verify-handoff.cjs           delivery validation
```

## Important limitations

- Walking route lines are waypoint approximations, not turn-by-turn pedestrian paths.
- Covered, shaded and indoor values are transparent proxy estimates until verified segment data is installed.
- The included GMB snapshot is legacy and must be refreshed before production use.
- MTR station coordinates still depend on cross-provider name merging where possible.
- Live journey tracking is foreground-only.
- Native iOS currently falls back to opening Apple Maps; the native MapKit adapter is a documented next step.

See [`docs/KNOWN_LIMITATIONS.md`](docs/KNOWN_LIMITATIONS.md) for the full list.

## Handoff documents

- [`HANDOFF.md`](HANDOFF.md) — start here
- [`docs/PROJECT_STATUS.md`](docs/PROJECT_STATUS.md) — exact completed/incomplete status
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — system boundaries and data flow
- [`docs/DATA_REFRESH.md`](docs/DATA_REFRESH.md) — transit snapshot refresh
- [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) — web deployment
- [`docs/IOS_HANDOFF.md`](docs/IOS_HANDOFF.md) — TestFlight/App Store preparation
- [`docs/VERIFICATION_REPORT.md`](docs/VERIFICATION_REPORT.md) — checks run and environment limits
- [`docs/AGENT_PROMPT.md`](docs/AGENT_PROMPT.md) — copy-paste prompt for the next agent

**Repository:** `rwang181-oss/HK-Transit-AI`
