# Task 7 Report: Development index reliability and provider coverage

## Implementation commit

`5ea607383838797a102c83299382b640aed232ad` — `fix: build journey index before local web start`

## Evidence

- Baseline: `npm run build:journey-index && npm run verify:journey-index` exited 0 before the new coverage assertion.
- TDD RED: `node tests/core/journey-index-provider-coverage.test.cjs` failed because `assertProviderCoverage` did not exist; the test passed after the minimal verifier implementation.
- Handoff-contract RED: `node scripts/verify-handoff.cjs` failed with `package.json web script beginning with npm run build:journey-index` before the `web` script change.
- `npm run web -- --help` exited 0 and showed `build:journey-index` completing before Expo printed its web-server help.
- Generated catalog verification passed: 8,769 hubs, 3,185 routes, 483 cells; KMB 1,317, CTB 688, GMB 1,160, MTR 20 routes.
- `npm run test:core`, `npm run verify:source`, `npm run verify:mobile`, `npm run verify:handoff`, direct TypeScript (`npx tsc --noEmit -p tsconfig.json --pretty false`), and `git diff --check` exited 0.
- `docs/DATA_REFRESH.md` now distinguishes snapshot refresh (`npm run data:refresh`) from local generated-index refresh (`npm run web` or `npm run build:journey-index`).

## Concerns / verification boundaries

- `npm run verify` is blocked at the pre-existing `verify:types` wrapper: on this Windows/Node 24 environment, `spawnSync('npx.cmd', ...)` returns `EINVAL`. The compiler command it wraps exits 0 when run directly.
- `npm run build:web` is blocked after its index build and verification by the existing missing dependency `react-native-web`; Expo reports it cannot resolve `react-native-web/dist/index`. No dependencies, deployment scripts, UI, or native code were changed in Task 7.
- `public/data/journey/` is intentionally ignored generated output and was not committed.
