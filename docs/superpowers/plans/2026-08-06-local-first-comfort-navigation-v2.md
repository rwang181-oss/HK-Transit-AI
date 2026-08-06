# HK Transit AI Local-First Comfort Navigation V2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a safer, clearer, bilingual web MVP with comfort ranking, corrected ETA handling, live walking-speed recalibration and iOS-ready core modules.

**Architecture:** Keep Expo Router and the existing provider model, but move ranking and realtime estimation into pure TypeScript modules. The web UI consumes those modules and renders transparent estimates. Native conversion is documented and isolated behind platform-specific map/location boundaries.

**Tech Stack:** Expo SDK 57, React Native Web, Expo Router, Zustand, TypeScript, Leaflet, i18next, public Hong Kong transport/HKO APIs.

## Global Constraints

- No project-operated backend.
- No direct modification of the user's deployed branch.
- New user-facing copy must exist in `en.json` and `zh-HK.json`.
- Missing live data must use an explicit fallback and confidence state; never `0 min` by default.
- Comfort coverage is estimated until verified pedestrian-segment data is installed.
- Core tests must run without downloading npm packages.

---

### Task 1: Baseline, verification harness and handoff structure
- [ ] Add dependency-free TypeScript compile and core test scripts.
- [ ] Add syntax, JSON, asset and required-document checks.
- [ ] Record baseline npm installation limitation in the handoff.

### Task 2: Stable stop merging and transport provider corrections
- [ ] Add geo-aware stable stop hub IDs with regression tests.
- [ ] Correct Citybus inbound route snapshot generation.
- [ ] Correct GMB snapshot metadata, coordinates and route-stop ETA contract.
- [ ] Add timeout/error wrappers and non-zero ETA fallback behaviour.

### Task 3: Journey model, comfort ranking and realtime estimator
- [ ] Add pure journey model types.
- [ ] Add comfort metrics and five ranking modes with tests.
- [ ] Add speed smoothing and arrival-window recalculation with tests.

### Task 4: Refactor planner/store integration
- [ ] Parallelise ETA requests with timeouts.
- [ ] Distinguish live, scheduled-estimate and unavailable ETA.
- [ ] Attach geometry, comfort metrics, reasons, arrival ranges and mode scores.
- [ ] Return distinct options instead of duplicate board/alight combinations.

### Task 5: Bilingual map-first route experience
- [ ] Redesign the home journey form.
- [ ] Redesign results with preference chips and readable route cards.
- [ ] Render route polylines and confidence labels.
- [ ] Add weather context and explicit estimate wording.

### Task 6: Live journey tracking preparation
- [ ] Add navigation state store using foreground location updates.
- [ ] Recalculate walking ETA from smoothed speed.
- [ ] Add start/stop tracking UI without background-location claims.

### Task 7: Web/iOS configuration and assets
- [ ] Add missing icon/favicon assets.
- [ ] Add iOS bundle/permission placeholders and EAS configuration.
- [ ] Keep native map conversion documented rather than adding an unverified dependency.

### Task 8: Documentation, final verification and package
- [ ] Update README.
- [ ] Add ARCHITECTURE, DEPLOYMENT, DATA_REFRESH, IOS_HANDOFF, KNOWN_LIMITATIONS, PROJECT_STATUS and AGENT_PROMPT.
- [ ] Run core tests, source syntax parse, JSON checks and package verification.
- [ ] Remove generated caches/node_modules and create the final zip.
