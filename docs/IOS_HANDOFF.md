# iOS Handoff

## Current iOS-ready pieces

- Expo Router application structure
- Shared TypeScript journey, comfort and realtime modules
- `com.rwang181.hktransitai` placeholder bundle identifier
- foreground location permission copy
- EAS development/preview/production profiles
- automatic light/dark appearance setting
- app icon
- native fallback that opens Apple Maps

## Remaining native work

### 1. Confirm identity

Replace the placeholder bundle identifier if the owner uses another Apple Developer identifier. Configure the EAS project and signing team.

### 2. Native map adapter

Replace the native fallback in `src/components/TransitMap.tsx` with a platform-specific component, for example:

```text
TransitMap.web.tsx      Leaflet
TransitMap.ios.tsx      Apple Maps through a supported React Native map layer
TransitMap.android.tsx  Android map implementation
```

The adapter must support:

- start/end/current markers
- selected journey polyline
- fit-to-route bounds
- accessibility labels
- no embedded unrestricted paid API key

### 3. Improve pedestrian geometry

Before presenting turn-by-turn directions inside the app, add a licensed pedestrian routing source or an on-device pedestrian graph. Current geometry is only a sequence of major waypoints.

### 4. Navigation lifecycle

The MVP is foreground-only. Do not request background location until the feature, privacy disclosure, battery handling and App Store justification are complete. Add native motion/activity integration only after privacy review.

### 5. TestFlight gate

```bash
npm install
npm run data:refresh
npm run verify
npm test
npx expo prebuild --clean
npx expo run:ios
# or configure EAS then:
eas build --platform ios --profile preview
```

Test on a physical iPhone:

- denied/allowed location permission
- Traditional Chinese and English
- map fallback/native adapter
- foreground speed recalibration
- incoming call/background/resume behaviour
- low network and no live ETA
- accessibility text size and VoiceOver

### 6. App Store materials

Prepare:

- privacy policy
- location data disclosure
- support URL
- screenshots in both languages
- description that labels comfort and walking values as estimates
- data source acknowledgements

Do not claim exact covered walkway, shade or indoor routing until verified segment data is installed.
