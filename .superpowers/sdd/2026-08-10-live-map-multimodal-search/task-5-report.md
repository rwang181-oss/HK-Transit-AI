# Task 5 Report: Live pedestrian-route controller

## Status

Implemented a platform-neutral live walking-route controller. It requests routes only for the three walking phases, applies a default 25-metre movement threshold, bypasses that threshold when the phase or target changes, keeps at most one route request active, replaces queued work with the latest accepted position, ignores stale results, and forwards routed/estimated `WalkingRoute` results unchanged.

## RED evidence

Initial focused command after adding the behavior test:

```text
node .\node_modules\typescript\bin\tsc -p tsconfig.core.json; node tests\core\live-route-controller.test.cjs
Error: Cannot find module '../../.core-test-dist/journey/realtime/liveRouteController.js'
Exit code: 1
```

The failure was the expected missing production module, not a test syntax or fixture error.

## GREEN evidence

Focused command:

```text
node .\node_modules\typescript\bin\tsc -p tsconfig.core.json; node tests\core\live-route-controller.test.cjs
6 behavior cases passed
live-route-controller.test.cjs: PASS
Exit code: 0
```

Fresh full core suite:

```text
npm run test:core
...
live-route-controller.test.cjs: PASS
Exit code: 0
```

Fresh source and diff checks:

```text
npm run verify:source
Source verification passed for 179 files.
Exit code: 0

git diff --check
Exit code: 0
```

## Structural typecheck

Required command:

```text
npx tsc -p tsconfig.verify.json --noEmit
app/journey/map-picker.tsx(1,10): error TS2305: Module '"react"' has no exported member 'useCallback'.
src/stores/journeyStore.ts(633,40): error TS2345: Argument of type 'string' is not assignable to parameter of type 'JourneyPolicy'.
Exit code: 1
```

These are the same two documented project-baseline errors present before Task 5. The structural compiler reports no error in the new controller or its core-test wiring.

## Files changed

- `src/journey/realtime/liveRouteController.ts`
- `tests/core/live-route-controller.test.cjs`
- `tsconfig.core.json`
- `scripts/run-core-tests.cjs`
- `.superpowers/sdd/2026-08-10-live-map-multimodal-search/task-5-report.md`

## Self-review

- No UI, store, Expo, React Native, browser, or native-platform file was changed.
- The phase gate includes exactly `walkingToTransit`, `walkingTransfer`, and `walkingToDestination`.
- The target key includes phase, target kind, target ID, and target coordinates, so a target or phase change reroutes even without movement.
- Each accepted reroute increments a generation. An active request can have only one queued successor; newer accepted input replaces that successor, and only the newest generation can reach `onResult`.
- `reset`, invalid points, and leaving a walking phase clear queued work and invalidate any active result.
- `onResult` receives the original `WalkingRoute`; the controller does not rewrite its `source`, geometry, distance, or duration.
