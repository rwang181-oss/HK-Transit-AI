# Verification Report

Prepared: 2026-08-06

## Checks completed in the preparation environment

The following commands were run against the handoff source tree:

```bash
npm run test:core
npm run verify:types
npm run verify:source
npm run verify:handoff
npm run verify
```

Recorded result before packaging:

- 22 dependency-free core behavioural tests passed.
- Offline structural TypeScript checking passed using `tsconfig.verify.json` and local module stubs.
- TS/TSX parsing, JSON parsing and JavaScript syntax checks passed.
- Handoff structure validation passed.
- The handoff verifier correctly emitted the expected warning that the bundled GMB snapshot is legacy.

The core suite covers comfort-mode selection/ranking, transparent comfort metrics, GPS speed filtering/smoothing, dynamic ETA calculation, geo-aware stable stop merging, reachable/missed departure selection, decreasing live wait/ride clocks, GMB public route display and multiple GMB ETA response shapes.

## Full dependency/build limitation

A full dependency installation was attempted with the public npm registry:

```bash
npm ci --registry=https://registry.npmjs.org --ignore-scripts --no-audit --no-fund
```

The command timed out in the preparation environment and did not leave a usable `node_modules` directory. The full Expo TypeScript environment, Jest suite and web export therefore could not be verified here.

The receiving agent must run, with normal internet access:

```bash
npm install
npm run data:refresh
npm run verify
npm test
npm run build:web
```

No claim is made that the Expo web export or an iOS binary has already passed.

## Mandatory deployment gate

Do not publish the included legacy GMB snapshot. Refresh it first and confirm:

- `src/data/gmb.json` reports `schemaVersion: 2`.
- Route-stop rows contain `sourceRouteId`, `routeSeq` and `stopSeq`.
- GMB route variation keys remain unique internally.
- Passenger-facing screens display clean route numbers without internal suffixes.
