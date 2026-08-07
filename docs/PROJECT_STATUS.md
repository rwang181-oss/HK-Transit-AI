# Project Status

## Current web release

The mobile performance and journey-flow update now includes:

- Mobile viewport and safe-area handling without manual page zooming
- 16 px journey inputs to prevent iPhone Safari focus zoom
- Always-visible route-search action outside the scrollable content
- Optional, high-DPI web maps that load only after the user expands them
- Results-first journey screen with compact preference filters and route cards
- Route selection that immediately expands the itinerary steps
- Dedicated live-navigation modal with location permission and tracking errors
- Cached and deduplicated public-data requests with request timeouts
- Bounded realtime ETA enrichment instead of unbounded parallel calls
- Cached route and stop indexes with immediate stale data display during refresh
- Nearby-stop route discovery using only the ten nearest stop ETA endpoints
- Shared Expo/TypeScript architecture preserved for native iOS work

## Verification in this environment

- 25 dependency-free behavioural core tests
- Offline structural TypeScript validation
- TS/TSX syntax parsing
- Translation-key parity and JSON validation
- JavaScript syntax validation
- Mobile UX source-contract verification
- Handoff structure verification

The full Expo web export is verified by the GitHub Actions deployment workflow because the preparation container cannot reliably install the complete dependency tree from its internal package mirror.

## iOS readiness boundary

The repository remains suitable for an iOS production track: it has an Expo Router application, `com.rwang181.hktransitai`, foreground location permission text, EAS preview/production profiles, shared platform-neutral journey stores and a native Apple Maps fallback. A future App Store submission still requires Apple Developer signing, a native MapKit adapter, physical-device testing, privacy/support URLs, screenshots and App Review. This codebase preserves that route but cannot guarantee Apple's approval.

## Recommended acceptance checks

Test on at least one iPhone-sized browser and one desktop browser:

- Open the journey tab and confirm the map does not load until expanded
- Focus both inputs and confirm the page does not zoom or overflow horizontally
- Confirm the route-search button is visible without scrolling
- Search an address before route data finishes loading
- Open results and confirm route cards appear before the optional map
- Tap a route and confirm its steps expand
- Start a route and confirm the live-navigation modal opens immediately
- Deny location once and confirm the error appears in the modal
- Open Nearby and confirm stop cards appear without downloading the full route-stop network
- Check KMB, Citybus, GMB and MTR candidate journeys on normal and weak networks
