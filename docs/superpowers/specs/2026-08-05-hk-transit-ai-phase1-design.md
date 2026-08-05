# HK Transit AI — Phase 1 Design Spec

**Date:** 2026-08-05
**Status:** Approved
**Author:** User + Claude Code

---

## 1. Project Overview

HK Transit AI is an independent Hong Kong public transport assistant app. Phase 1 delivers a minimal viable product: a bus ETA query tool for KMB (Kowloon Motor Bus) services, deployed as a PWA via Expo Web first, with native iOS/Android builds to follow after validation.

### Non-goals for Phase 1
- No AI features (deferred to Phase 3)
- No push notifications / widgets / Siri shortcuts (deferred to Phase 2)
- No CityBus/CTB support (KMB only; architecture allows future addition)
- No user accounts or backend server (purely client-side)

### Languages
- **UI + Data: English (en) + Traditional Chinese (zh-HK)**
- KMB API returns stop names, route destinations, and remarks in all three languages (en/tc/sc). The app will store and display both en and tc variants.
- UI strings (navigation labels, buttons, empty states, errors) use i18n with `expo-localization` for auto-detection and a manual toggle in settings.
- Language detection priority: device locale → manual override → fallback to English.

---

## 2. Tech Stack

| Layer | Choice | Rationale |
|-------|--------|-----------|
| Framework | Expo SDK 57 | Managed workflow, web-first development, single codebase for iOS/Android |
| Routing | Expo Router (file-based) | Deep linking support, browser-addressable URLs for PWA, auto-registration |
| State | Zustand + persist middleware | ~2KB, intuitive API, AsyncStorage persistence out of the box |
| Local Storage | AsyncStorage | Simple key-value for favorites; extensible to SQLite in Phase 3 via interface abstraction |
| Styling | NativeWind (Tailwind CSS for RN) | Design-token consistency, rapid UI iteration |
| i18n | expo-localization + i18next | Auto-detect device language, manual toggle, en/zh-HK |
| API Source | data.etabus.gov.hk | Official Hong Kong government open data, no API key required, RESTful JSON |
| Version Control | Git + GitHub | Primary project management, CI/CD trigger |

---

## 3. Architecture

### 3.1 Directory Structure

```
HK-Transit-AI/
├── app/                          # Expo Router pages
│   ├── (tabs)/
│   │   ├── _layout.tsx           # Bottom tab navigator
│   │   ├── index.tsx             # Home Dashboard
│   │   ├── search.tsx            # Route/stop search
│   │   ├── nearby.tsx            # GPS nearby stops
│   │   └── favorites.tsx         # Favorites management
│   ├── eta/[routeId].tsx         # ETA detail (deep-linkable)
│   └── _layout.tsx               # Root layout
├── src/
│   ├── components/               # Reusable UI components
│   │   ├── RouteCard.tsx
│   │   ├── ETARow.tsx
│   │   ├── StopItem.tsx
│   │   ├── SearchBar.tsx
│   │   └── NearbyStopCard.tsx
│   ├── services/
│   │   └── kmbAPI.ts             # KMB API client (singleton)
│   ├── stores/
│   │   ├── etaStore.ts           # ETA data + auto-refresh logic
│   │   ├── favoriteStore.ts      # Favorites + persist
│   │   └── locationStore.ts      # GPS state
│   ├── database/
│   │   └── index.ts              # Storage interface (AsyncStorage now, SQLite later)
│   └── utils/
│       ├── formatters.ts         # Time formatting, distance formatting
│       ├── constants.ts          # API URLs, refresh intervals, colors
│       └── i18n.ts               # i18n config + language toggle
├── docs/
│   ├── architecture.md
│   ├── api.md
│   ├── roadmap.md
│   └── superpowers/
│       └── specs/
├── assets/                       # Icons, splash, fonts
├── app.json                      # Expo config
├── package.json
├── tsconfig.json
├── tailwind.config.js            # NativeWind config
├── .gitignore
└── README.md
```

### 3.2 Data Flow

```
data.etabus.gov.hk  ──HTTP──>  src/services/kmbAPI.ts  ──typed data──>  Zustand stores
                                                                             │
                                                                     (state subscription)
                                                                             │
                                                                             ▼
                                                                     UI Components
                                                                             │
                                                                     (user actions)
                                                                             │
                                                                             ▼
                                                                     Zustand actions  ──persist──>  AsyncStorage
```

- **kmbAPI.ts** is a pure data-fetching layer. It knows nothing about React or Zustand.
- **Stores** call the API service, hold the state, expose actions. Components never call kmbAPI directly.
- **Components** are pure presentational where possible; container logic lives in stores or custom hooks.

### 3.3 API Endpoints Used

Base URL: `https://data.etabus.gov.hk/v1/transport/kmb/`

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/route/` | GET | Fetch all KMB routes |
| `/stop/` | GET | Fetch all bus stops (with names, lat/lng) |
| `/route-stop/` | GET | Fetch ordered stop list for a route+direction |
| `/eta/{stop_id}/{route}/{service_type}` | GET | Fetch real-time ETA (up to 3 buses per direction) |

**Note:** The route list and stop list are static data updated daily by the government. They are fetched once on app startup and cached in the store. Only ETA data is fetched repeatedly (30s intervals). This avoids hammering the API and gives instant search results.

### 3.4 State Design

```typescript
// etaStore
interface ETAState {
  etas: Map<string, ETA[]>;        // keyed by "route_bound_stop"
  loading: boolean;
  error: string | null;
  fetchETA: (route: string, stop: string, bound: string) => Promise<void>;
  startAutoRefresh: () => void;    // 30s interval
  stopAutoRefresh: () => void;
}

// favoriteStore (persisted to AsyncStorage)
interface FavoriteState {
  favoriteRoutes: FavoriteRoute[];
  favoriteStops: FavoriteStop[];
  addRoute: (route: FavoriteRoute) => void;
  removeRoute: (routeId: string) => void;
  addStop: (stop: FavoriteStop) => void;
  removeStop: (stopId: string) => void;
}

// locationStore
interface LocationState {
  position: { lat: number; lng: number } | null;
  error: string | null;
  permissionGranted: boolean;
  requestPermission: () => Promise<void>;
}
```

---

## 4. Feature Specifications

### 4.1 Home Dashboard

**Goal:** User opens the app and immediately sees relevant bus ETA.

**Behavior:**
- Displays a list of favorited routes (or default popular routes if none favorited)
- Each card shows: route number, destination, next 2 ETA times
- Auto-refreshes every 30 seconds
- Pull-to-refresh supported
- Empty state (no favorites): Show a set of popular Hong Kong routes as suggestions (1A, 6, 8, 40, 101, etc.) with a prompt "Add your favorite routes to get started" and a link to search. Once the user favorites at least one route, the dashboard switches to showing only favorites

**UI:** Vertical scroll of `RouteCard` components. Large ETA minutes. Green text for <5 min, default for others.

### 4.2 Route Search

**Goal:** User types a route number and sees route details.

**Behavior:**
- Search input at top (numeric keypad hint on mobile)
- Debounced search (300ms) against local route list
- Results show: route number, origin → destination, bound selector
- Tap a result → navigate to ETA detail page

**UI:** Search bar + flat list of results. Each result is a card with route number prominently displayed.

### 4.3 ETA Detail

**Goal:** Show all stops for a selected route, with real-time ETA.

**Behavior:**
- Displays ordered stop list for the route+direction
- Each stop shows stop name and next 3 ETA times
- Tapping a stop highlights it and shows detailed ETA
- Auto-refreshes every 30 seconds while page is visible
- Page URL: `/eta/8?bound=O` (shareable, deep-linkable)

**UI:** Header with route number + destination. Scrollable stop list. Active stop expands to show larger ETA numbers.

### 4.4 Favorites

**Goal:** Persist user's preferred routes and stops across sessions.

**Behavior:**
- Add: long-press any route card or stop, or tap star icon
- Remove: swipe-to-delete or tap star icon in favorites list
- Data persists via AsyncStorage (Zustand persist middleware)
- Favorite routes appear on home dashboard

**UI:** Two sections: "Favorite Routes" and "Favorite Stops". Each item tappable → navigates to ETA detail.

### 4.5 Nearby Stops

**Goal:** Show bus stops near the user's current location.

**Behavior:**
- Request GPS permission on first visit
- Calculate distance from user to each stop
- Sort by distance ascending, show top 10
- Each card shows: stop name, distance (m), routes serving this stop
- Tap a card → navigate to that stop's ETA view

**UI:** Permission prompt if not granted. Loading state while acquiring GPS. List of `NearbyStopCard` with distance badge.

---

## 5. UI Design System

### 5.1 Colors

| Token | Value | Usage |
|-------|-------|-------|
| `--hk-red` | `#C41230` | Primary brand, active tab, important badges |
| `--bg-system` | `#F2F2F7` | Page background |
| `--bg-card` | `#FFFFFF` | Card background |
| `--text-primary` | `#1C1C1E` | Headings |
| `--text-secondary` | `#8E8E93` | Subtitle, distance |
| `--eta-urgent` | `#34C759` | ETA < 5 min |
| `--eta-warning` | `#FF9500` | ETA 5-10 min |

### 5.2 Typography

- Route numbers: 28px bold (system font)
- ETA minutes: 36px bold, monospaced digits
- Stop names: 17px regular
- Section titles: 22px semibold

### 5.3 Components

- Cards: 16px border-radius, subtle shadow (0px 2px 8px rgba(0,0,0,0.08))
- Bottom tab: Apple-style with filled/unfilled icons
- Navigation: stack push for detail pages, tab for top-level

---

## 6. Testing Strategy (Phase 1)

| Level | Tool | Scope |
|-------|------|-------|
| Unit | Jest | API service parsing, formatters, store logic |
| Component | React Native Testing Library | Card rendering, ETA display edge cases |
| Manual | Chrome DevTools + Physical iPhone PWA | User flow, GPS, PWA install |

---

## 7. Acceptance Criteria

1. User can search for a KMB route by number and see its stops
2. User can view real-time ETA for any stop on any route
3. ETA auto-refreshes every 30 seconds without user action
4. User can favorite routes and stops; favorites persist after page reload
5. User can see nearby bus stops ordered by distance (when GPS is granted)
6. PWA can be installed on iPhone home screen and launched as standalone app
7. No advertisements, no KMB branding, no misleading official-app appearance
