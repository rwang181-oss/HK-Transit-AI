# iOS Handoff

## Preserved native architecture

This update intentionally keeps web-specific behaviour behind platform boundaries:

- Expo Router remains the application shell.
- Journey planning, realtime timing, weather, caching and Zustand stores remain shared TypeScript modules.
- `app.json` retains the iOS bundle identifier `com.rwang181.hktransitai` and foreground-location permission copy.
- `eas.json` retains development, preview and production build profiles.
- `TransitMap` keeps a native Apple Maps handoff while the high-DPI Leaflet implementation runs only on web.
- The live-navigation modal uses React Native primitives and can be reused in the native build.

## Required native map adapter

Before App Store submission, split the map boundary into platform files:

```text
TransitMap.web.tsx      Leaflet + CARTO tiles
TransitMap.ios.tsx      Apple MapKit through a maintained React Native adapter
TransitMap.android.tsx  Android map implementation
```

The iOS adapter must support start/end/current markers, selected-route polylines, fit-to-route bounds, accessibility labels and safe handling of API credentials.

## Navigation and privacy

The current product uses foreground location only. Do not add background location until the navigation experience, battery behaviour, privacy policy, user controls and App Store justification are complete. Keep the existing explicit permission-denied state and provide a Settings recovery path in the native build.

## Build and TestFlight gate

```bash
npm ci
npm run verify
npm run build:web
npx expo prebuild --clean
npx expo run:ios
# After linking the Expo/Apple accounts:
eas build --platform ios --profile preview
eas submit --platform ios --profile production
```

Test on physical iPhones with:

- denied and allowed location permissions
- Traditional Chinese and English
- compact and large Dynamic Type settings
- VoiceOver
- weak network and missing ETA responses
- foreground/background/resume transitions
- route selection, live modal, stop tracking and stopping navigation
- MapKit route rendering and Apple Maps handoff

## App Store materials

Prepare a privacy policy, support URL, location-data disclosure, bilingual screenshots, source acknowledgements and copy that clearly labels comfort/walking values as estimates. The repository supports an App Store production path, but signing and Apple App Review remain external release gates and approval cannot be guaranteed by code alone.
