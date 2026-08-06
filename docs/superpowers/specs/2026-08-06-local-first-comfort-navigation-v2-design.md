# HK Transit AI Local-First Comfort Navigation V2 Design

## Product goal

Turn the existing ETA viewer into a bilingual (Traditional Chinese / English) point-to-point Hong Kong mobility assistant. The first deliverable is a testable web build. Core planning, comfort ranking and live ETA adjustment must stay platform-neutral so a later iOS build can reuse them.

## Non-negotiable constraints

- No project-operated backend.
- Core planning and ranking run on-device.
- Network access is limited to public operator ETA, HKO weather, map tiles, geocoding and optional data refresh.
- Existing `main`/deployed website is not modified by this package delivery.
- Traditional Chinese and English must cover all new user-facing copy.
- Initial times are estimates; live navigation recalibrates remaining walking time from device speed.
- Missing shelter/indoor data must be labelled as estimated or unavailable, never presented as verified.
- Web is the review target; iOS is prepared through platform-neutral modules and handoff documentation, not claimed as App Store-ready.

## Architecture

1. **Transit data layer** retains KMB, Citybus, GMB and MTR providers, but normalises network errors and ETA fallbacks.
2. **Journey graph** merges stops using both names and geography, gives hubs stable IDs, and avoids merging distant same-name stops.
3. **Journey option model** stores total time, walking, waiting, ride time, transfers, route geometry and confidence.
4. **Comfort engine** ranks the same valid journey candidates for fastest, balanced, low-exposure, rain and indoor-first modes. In V2 it uses transparent proxy metrics: walking exposure, waiting, transfers and MTR share. A future pedestrian-segment dataset plugs into the same interface.
5. **Realtime ETA engine** smooths GPS speed, rejects implausible samples, and recalculates remaining walking and arrival ranges.
6. **UI** uses a map-first search and route-card layout with mode chips, reasons, confidence labels and an explicit “estimated” state.
7. **Handoff** includes deployment, data refresh, iOS conversion, known limitations and an agent continuation prompt.

## Acceptance criteria

- A user can choose a start and destination and receive readable options.
- Options can be re-ranked by fastest, recommended, less sun exposure, rain protection and indoor-first preferences.
- KMB/CTB/MTR ETA calls keep working; GMB refresh metadata is corrected for the official route-stop ETA format.
- Missing ETA never becomes a misleading zero-minute wait.
- Live walking speed logic updates remaining time with a bounded, smoothed estimate.
- Web map displays route lines and markers.
- All pure routing/comfort/realtime modules pass a dependency-free core verification suite.
- The package contains complete handoff documents and an automated handoff verifier.
