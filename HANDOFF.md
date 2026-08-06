# HK Transit AI V2 Handoff

This package is prepared for another coding/deployment agent. It contains the complete source tree, local-first comfort-navigation core, bilingual UI, test harness, data refresh script, web/iOS configuration and explicit limitation records.

## Mandatory first actions

```bash
npm install
npm run data:refresh
npm run verify
npm run build:web
```

Do not deploy until all four commands have been reviewed. The supplied GMB snapshot predates the corrected route-stop metadata contract, so `npm run data:refresh` is mandatory for production GMB routing and ETA.

## Safe deployment order

1. Create a new feature/deployment branch; do not overwrite `main` immediately.
2. Install dependencies from the public npm registry.
3. Refresh CTB, GMB and MTR topology with internet access.
4. Run `npm run verify` and the existing Jest suite.
5. Run `npm run build:web`.
6. Serve `dist/` locally and test both languages, location permission, several origin/destination pairs and route cards.
7. Deploy to a preview path or preview branch.
8. Ask the owner to approve the preview before replacing the current GitHub Pages build.

## What changed

- Reworked journey options into explicit walking/wait/ride/transfer values.
- Added live, estimated and unavailable ETA states with non-zero fallback waits.
- Added comfort, fastest, sun, rain and indoor scoring.
- Added HKO weather context.
- Added foreground GPS walking-speed smoothing, decreasing wait/ride clocks and live arrival windows.
- Corrected route totals so time-to-departure is not added twice on top of the walk to the stop.
- Added dynamic next-service estimation when current walking speed makes the selected departure unreachable.
- Kept GMB route variations distinct internally while showing clean public route numbers.
- Added stable geo-aware stop merging.
- Corrected CTB direction generation and prepared the precise GMB route-stop ETA contract.
- Replaced the journey search/results experience with a map-first bilingual design.
- Added icons, Expo identifiers, EAS profiles and iOS handoff guidance.

## Evidence available in this package

- `npm run test:core` compiles and executes dependency-free tests.
- `npm run verify:source` parses TS/TSX, validates JSON and checks JS syntax.
- `npm run verify:handoff` validates required delivery files and warns if the GMB snapshot is still legacy.
- `docs/VERIFICATION_REPORT.md` records the exact preparation-environment checks and the npm/build limitation.
- `tsconfig.verify.json` plus `tests/type-stubs.d.ts` provides an offline structural TypeScript check when Expo packages cannot be installed.

## Do not misrepresent

This package does **not** yet provide verified Hong Kong covered-walkway routing, a full offline pedestrian graph, background navigation, native turn-by-turn MapKit rendering or a production-ready GMB snapshot. These are recorded in `docs/KNOWN_LIMITATIONS.md`.
