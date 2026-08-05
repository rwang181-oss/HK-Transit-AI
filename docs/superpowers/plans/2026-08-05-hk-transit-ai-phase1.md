# HK Transit AI Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a PWA bus ETA app for KMB Hong Kong using Expo Web, with bilingual support (en/zh-HK), deployable as PWA first, then native iOS/Android later.

**Architecture:** Expo SDK 57 + Expo Router (file-based routing), Zustand for state with AsyncStorage persistence, NativeWind for styling, data.etabus.gov.hk as the sole data source. Single codebase targeting Web PWA → iOS → Android.

**Tech Stack:** Expo SDK 57, Expo Router, Zustand, NativeWind (Tailwind CSS), expo-localization + i18next, AsyncStorage, expo-location, TypeScript

## Global Constraints

- Node.js >= 24.0, npm >= 11.0
- Expo SDK 57, managed workflow
- Target: Web PWA first (iPhone home screen installable), native later
- Languages: English (en) + Traditional Chinese (zh-HK)
- Color theme: Hong Kong red `#C41230`, system gray `#F2F2F7`
- API: data.etabus.gov.hk only, no scraping, no unofficial endpoints
- No KMB branding/logos — this is an independent app
- All code TypeScript, all modules < 200 lines
- ETA auto-refresh interval: 30 seconds
- route/stop data cached on startup, ETA polled on 30s cycle

---

### Task 1: Project Scaffolding

**Files:**
- Create: `app.json`, `package.json`, `tsconfig.json`, `babel.config.js`, `metro.config.js`, `tailwind.config.js`, `.gitignore`
- Create: `app/_layout.tsx`, `app/(tabs)/_layout.tsx`, `app/index.tsx`
- Create: `src/utils/constants.ts`
- Create: `assets/` (placeholder)
- Create: `README.md`

**Interfaces:**
- Produces: `src/utils/constants.ts` exporting `API_BASE_URL`, `COLORS`, `ETA_REFRESH_INTERVAL`

- [ ] **Step 1: Initialize Expo project**

```bash
cd "c:/Users/rwang/Documents/Projects/HK Transit AI"
npx create-expo-app@latest . --template blank-typescript --no-install
```

- [ ] **Step 2: Create .gitignore**

Create `.gitignore`:
```
node_modules/
.expo/
dist/
web-build/
*.jks
*.p8
*.p12
*.key
*.mobileprovision
*.orig.*
.env
.env.local
```

- [ ] **Step 3: Install dependencies**

```bash
npm install
npx expo install expo-router expo-linking expo-constants expo-status-bar
npx expo install expo-localization
npm install i18next react-i18next
npm install zustand
npm install @react-native-async-storage/async-storage
npx expo install expo-location
npx expo install nativewind tailwindcss-react-native
npm install --save-dev tailwindcss @types/react
```

- [ ] **Step 4: Create src/utils/constants.ts**

```typescript
export const API_BASE_URL = 'https://data.etabus.gov.hk/v1/transport/kmb';

export const ETA_REFRESH_INTERVAL = 30_000; // 30 seconds

export const COLORS = {
  hkRed: '#C41230',
  bgSystem: '#F2F2F7',
  bgCard: '#FFFFFF',
  textPrimary: '#1C1C1E',
  textSecondary: '#8E8E93',
  etaUrgent: '#34C759',
  etaWarning: '#FF9500',
} as const;

export const DEFAULT_ROUTES = ['1A', '6', '8', '40', '101'];
```

- [ ] **Step 5: Create the root layout with Expo Router scaffold**

Create `app/_layout.tsx`:
```tsx
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

export default function RootLayout() {
  return (
    <>
      <StatusBar style="dark" />
      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="eta/[routeId]" options={{ headerShown: false }} />
      </Stack>
    </>
  );
}
```

Create `app/(tabs)/_layout.tsx`:
```tsx
import { Tabs } from 'expo-router';
import { COLORS } from '@/src/utils/constants';

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: COLORS.hkRed,
        tabBarInactiveTintColor: COLORS.textSecondary,
        tabBarStyle: { backgroundColor: COLORS.bgCard, borderTopColor: '#E5E5EA' },
        headerStyle: { backgroundColor: COLORS.bgSystem },
        headerTitleStyle: { color: COLORS.textPrimary, fontSize: 22, fontWeight: '600' },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'HK Transit', tabBarLabel: 'Home' }} />
      <Tabs.Screen name="search" options={{ title: 'Search', tabBarLabel: 'Search' }} />
      <Tabs.Screen name="nearby" options={{ title: 'Nearby', tabBarLabel: 'Nearby' }} />
      <Tabs.Screen name="favorites" options={{ title: 'Favorites', tabBarLabel: 'Favorites' }} />
    </Tabs>
  );
}
```

Create `app/(tabs)/index.tsx`:
```tsx
import { View, Text } from 'react-native';

export default function HomeScreen() {
  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
      <Text>HK Transit</Text>
    </View>
  );
}
```

Create placeholder files for remaining tabs:
- `app/(tabs)/search.tsx` — same placeholder content, "Search" title
- `app/(tabs)/nearby.tsx` — same placeholder content, "Nearby" title
- `app/(tabs)/favorites.tsx` — same placeholder content, "Favorites" title
- `app/eta/[routeId].tsx` — same placeholder content, "ETA Detail" title

- [ ] **Step 6: Configure tsconfig.json paths**

Edit `tsconfig.json` to add path aliases:
```json
{
  "extends": "expo/tsconfig.base",
  "compilerOptions": {
    "strict": true,
    "baseUrl": ".",
    "paths": {
      "@/*": ["./*"]
    }
  }
}
```

- [ ] **Step 7: Verify the app runs**

```bash
npx expo start --web
```

Expected: Browser opens with "HK Transit" text, 4 tabs visible, navigation works.

- [ ] **Step 8: Create README.md**

Create `README.md` with project introduction, tech architecture, install steps, current features, roadmap.

- [ ] **Step 9: Initialize Git and first commit**

```bash
git init
git add -A
git commit -m "chore: initialize Expo project with Expo Router tab navigation"
```

- [ ] **Step 10: Create GitHub repository and push**

```bash
gh repo create HK-Transit-AI --public --source . --remote origin --push
```

If `gh` auth not set up, create repo manually on GitHub and:
```bash
git remote add origin https://github.com/<username>/HK-Transit-AI.git
git push -u origin main
```

---

### Task 2: i18n Setup

**Files:**
- Create: `src/i18n/en.json`
- Create: `src/i18n/zh-HK.json`
- Create: `src/utils/i18n.ts`

**Interfaces:**
- Consumes: `src/utils/constants.ts` (none directly)
- Produces: `src/utils/i18n.ts` exporting `i18n` instance, `useTranslation` hook, `changeLanguage(lang: 'en' | 'zh-HK')`, `t(key: string) => string`

- [ ] **Step 1: Create English translation file**

Create `src/i18n/en.json`:
```json
{
  "home": {
    "title": "HK Transit",
    "emptyTitle": "Welcome to HK Transit",
    "emptySubtitle": "Add your favorite routes to get started",
    "goToSearch": "Search Routes",
    "loading": "Loading...",
    "error": "Unable to load ETA data"
  },
  "search": {
    "title": "Search",
    "placeholder": "Enter route number",
    "noResults": "No routes found",
    "direction": "Direction",
    "outbound": "Outbound",
    "inbound": "Inbound"
  },
  "eta": {
    "title": "Route {{route}}",
    "nextBus": "Next bus",
    "min": "min",
    "arriving": "Arriving",
    "noETA": "No ETA data available",
    "refreshingIn": "Refreshing in {{seconds}}s"
  },
  "nearby": {
    "title": "Nearby Stops",
    "permissionDenied": "Location permission is needed to show nearby stops",
    "grantPermission": "Grant Permission",
    "loading": "Finding nearby stops...",
    "noStops": "No stops found nearby",
    "meter": "m",
    "routes": "Routes"
  },
  "favorites": {
    "title": "Favorites",
    "routes": "Favorite Routes",
    "stops": "Favorite Stops",
    "emptyRoutes": "No favorite routes yet",
    "emptyStops": "No favorite stops yet"
  },
  "common": {
    "retry": "Retry",
    "cancel": "Cancel",
    "save": "Save",
    "delete": "Delete"
  }
}
```

- [ ] **Step 2: Create Traditional Chinese translation file**

Create `src/i18n/zh-HK.json`:
```json
{
  "home": {
    "title": "HK Transit",
    "emptyTitle": "歡迎使用 HK Transit",
    "emptySubtitle": "添加常用路線開始使用",
    "goToSearch": "搜尋路線",
    "loading": "載入中...",
    "error": "無法載入到站時間"
  },
  "search": {
    "title": "搜尋",
    "placeholder": "輸入路線號碼",
    "noResults": "找不到相關路線",
    "direction": "方向",
    "outbound": "往",
    "inbound": "往"
  },
  "eta": {
    "title": "路線 {{route}}",
    "nextBus": "下一班",
    "min": "分鐘",
    "arriving": "即將到站",
    "noETA": "暫無到站時間",
    "refreshingIn": "{{seconds}} 秒後更新"
  },
  "nearby": {
    "title": "附近車站",
    "permissionDenied": "需要定位權限才能顯示附近車站",
    "grantPermission": "允許定位",
    "loading": "搜尋附近車站...",
    "noStops": "附近沒有車站",
    "meter": "米",
    "routes": "路線"
  },
  "favorites": {
    "title": "收藏",
    "routes": "收藏路線",
    "stops": "收藏車站",
    "emptyRoutes": "尚未收藏路線",
    "emptyStops": "尚未收藏車站"
  },
  "common": {
    "retry": "重試",
    "cancel": "取消",
    "save": "儲存",
    "delete": "刪除"
  }
}
```

- [ ] **Step 3: Create i18n config**

Create `src/utils/i18n.ts`:
```typescript
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { getLocales } from 'expo-localization';
import en from '@/src/i18n/en.json';
import zhHK from '@/src/i18n/zh-HK.json';

const deviceLanguage = getLocales()[0]?.languageCode ?? 'en';
const defaultLanguage = deviceLanguage === 'zh' ? 'zh-HK' : 'en';

i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    'zh-HK': { translation: zhHK },
  },
  lng: defaultLanguage,
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
  compatibilityJSON: 'v4',
});

export const changeLanguage = (lang: 'en' | 'zh-HK') => {
  return i18n.changeLanguage(lang);
};

export default i18n;
export { useTranslation } from 'react-i18next';
```

- [ ] **Step 4: Wire i18n into root layout**

Modify `app/_layout.tsx` to import `@/src/utils/i18n` (side-effect import to initialize before render).

```tsx
import '@/src/utils/i18n'; // must be first import
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
// ... rest unchanged
```

- [ ] **Step 5: Verify i18n works**

Update `app/(tabs)/index.tsx` to use translations:
```tsx
import { View, Text } from 'react-native';
import { useTranslation } from 'react-i18next';

export default function HomeScreen() {
  const { t } = useTranslation();
  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
      <Text>{t('home.title')}</Text>
    </View>
  );
}
```

Run `npx expo start --web` — verify "HK Transit" shows. Switch device language to Chinese — verify Chinese title shows.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add bilingual i18n support (en/zh-HK)"
git push
```

---

### Task 3: KMB API Service

**Files:**
- Create: `src/services/kmbAPI.ts`
- Create: `src/services/__tests__/kmbAPI.test.ts`

**Interfaces:**
- Consumes: `src/utils/constants.ts` — `API_BASE_URL`
- Produces:
  - `fetchAllRoutes(): Promise<Route[]>` — `Route { route: string; orig_en: string; orig_tc: string; dest_en: string; dest_tc: string }`
  - `fetchAllStops(): Promise<Stop[]>` — `Stop { stop: string; name_en: string; name_tc: string; lat: number; long: number }`
  - `fetchRouteStops(route: string, bound: 'O' | 'I', serviceType: number): Promise<RouteStop[]>` — `RouteStop { co: string; route: string; dir: string; seq: number; stop: string }`
  - `fetchETA(stopId: string, route: string, serviceType: number): Promise<ETA[]>` — `ETA { co: string; route: string; dir: string; service_type: number; seq: number; dest_en: string; dest_tc: string; eta: string; eta_seq: number; rmk_en: string; rmk_tc: string; data_timestamp: string }`

- [ ] **Step 1: Define TypeScript types**

Create `src/services/kmbAPI.ts`:
```typescript
import { API_BASE_URL } from '@/src/utils/constants';

export interface Route {
  route: string;
  orig_en: string;
  orig_tc: string;
  dest_en: string;
  dest_tc: string;
}

export interface Stop {
  stop: string;
  name_en: string;
  name_tc: string;
  lat: number;
  long: number;
}

export interface RouteStop {
  co: string;
  route: string;
  dir: 'O' | 'I';
  seq: number;
  stop: string;
}

export interface ETA {
  co: string;
  route: string;
  dir: 'O' | 'I';
  service_type: number;
  seq: number;
  dest_en: string;
  dest_tc: string;
  eta: string;
  eta_seq: number;
  rmk_en: string;
  rmk_tc: string;
  data_timestamp: string;
}
```

- [ ] **Step 2: Implement API functions**

Append to `src/services/kmbAPI.ts`:

```typescript
async function apiGet<T>(path: string): Promise<T> {
  const url = `${API_BASE_URL}${path}`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`API error: ${response.status} ${response.statusText} for ${url}`);
  }
  return response.json() as Promise<T>;
}

export async function fetchAllRoutes(): Promise<Route[]> {
  const data = await apiGet<{ data: Route[] }>('/route/');
  return data.data;
}

export async function fetchAllStops(): Promise<Stop[]> {
  const data = await apiGet<{ data: Stop[] }>('/stop/');
  return data.data;
}

export async function fetchRouteStops(
  route: string,
  bound: 'O' | 'I',
  serviceType: number = 1
): Promise<RouteStop[]> {
  const data = await apiGet<{ data: RouteStop[] }>(
    `/route-stop/${route}/${bound}/${serviceType}`
  );
  return data.data;
}

export async function fetchETA(
  stopId: string,
  route: string,
  serviceType: number = 1
): Promise<ETA[]> {
  const data = await apiGet<{ data: ETA[] }>(
    `/eta/${stopId}/${route}/${serviceType}`
  );
  return data.data;
}
```

- [ ] **Step 3: Write API service tests**

Create `src/services/__tests__/kmbAPI.test.ts`:
```typescript
import { fetchAllRoutes, fetchAllStops, fetchRouteStops, fetchETA } from '../kmbAPI';

// Mock global fetch
const mockFetch = jest.fn();
global.fetch = mockFetch as unknown as typeof fetch;

describe('kmbAPI', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  describe('fetchAllRoutes', () => {
    it('fetches and returns route data', async () => {
      const mockRoutes = [{ route: '1A', orig_en: 'Star Ferry', dest_en: 'Kwun Tong' }];
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: mockRoutes }),
      });

      const result = await fetchAllRoutes();
      expect(result).toEqual(mockRoutes);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://data.etabus.gov.hk/v1/transport/kmb/route/'
      );
    });

    it('throws on non-OK response', async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, status: 500, statusText: 'Server Error' });
      await expect(fetchAllRoutes()).rejects.toThrow('API error: 500');
    });

    it('throws on network failure', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));
      await expect(fetchAllRoutes()).rejects.toThrow('Network error');
    });
  });

  describe('fetchAllStops', () => {
    it('fetches and returns stop data', async () => {
      const mockStops = [{ stop: 'ABC123', name_en: 'PolyU', lat: 22.3, long: 114.17 }];
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: mockStops }),
      });

      const result = await fetchAllStops();
      expect(result).toEqual(mockStops);
    });
  });

  describe('fetchRouteStops', () => {
    it('fetches stops for a specific route and bound', async () => {
      const mockRouteStops = [{ co: 'KMB', route: '1A', dir: 'O', seq: 1, stop: 'ABC123' }];
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: mockRouteStops }),
      });

      const result = await fetchRouteStops('1A', 'O');
      expect(result).toEqual(mockRouteStops);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://data.etabus.gov.hk/v1/transport/kmb/route-stop/1A/O/1'
      );
    });
  });

  describe('fetchETA', () => {
    it('fetches ETA for a specific stop and route', async () => {
      const mockETA = [
        {
          co: 'KMB',
          route: '1A',
          dir: 'O',
          service_type: 1,
          seq: 5,
          dest_en: 'Kwun Tong',
          dest_tc: '觀塘',
          eta: '2026-08-05T10:30:00+08:00',
          eta_seq: 1,
          rmk_en: '',
          rmk_tc: '',
          data_timestamp: '2026-08-05T10:29:00+08:00',
        },
      ];
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: mockETA }),
      });

      const result = await fetchETA('ABC123', '1A');
      expect(result).toEqual(mockETA);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://data.etabus.gov.hk/v1/transport/kmb/eta/ABC123/1A/1'
      );
    });
  });
});
```

- [ ] **Step 4: Run tests**

```bash
npx jest src/services/__tests__/kmbAPI.test.ts --passWithNoTests
```

Expected: 5 tests pass.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add KMB API service with fetch functions and unit tests"
git push
```

---

### Task 4: Utility Functions

**Files:**
- Create: `src/utils/formatters.ts`
- Create: `src/utils/__tests__/formatters.test.ts`

**Interfaces:**
- Consumes: `ETA` type from `src/services/kmbAPI.ts`
- Produces:
  - `formatMinutesLeft(etaTimestamp: string): number` — returns minutes remaining (integer, always >= 0)
  - `formatDistance(meters: number): string` — returns "120 m" or "1.2 km" bilingual-friendly
  - `getETADisplay(eta: ETA): { minutes: number; text: string }` — returns minutes + display text ("Arriving" if <1 min)

- [ ] **Step 1: Write formatter tests**

Create `src/utils/__tests__/formatters.test.ts`:
```typescript
import { formatMinutesLeft, formatDistance, getETADisplay } from '../formatters';

describe('formatMinutesLeft', () => {
  it('returns minutes difference from now', () => {
    const future = new Date(Date.now() + 5 * 60 * 1000).toISOString();
    expect(formatMinutesLeft(future)).toBe(5);
  });

  it('returns 0 for past timestamps', () => {
    const past = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    expect(formatMinutesLeft(past)).toBe(0);
  });

  it('returns 0 for timestamps within 60 seconds', () => {
    const soon = new Date(Date.now() + 30 * 1000).toISOString();
    expect(formatMinutesLeft(soon)).toBe(0);
  });
});

describe('formatDistance', () => {
  it('formats meters under 1000', () => {
    expect(formatDistance(120)).toBe('120 m');
  });

  it('formats kilometers with one decimal', () => {
    expect(formatDistance(1200)).toBe('1.2 km');
  });

  it('formats exactly 1000m as km', () => {
    expect(formatDistance(1000)).toBe('1.0 km');
  });

  it('handles 0 distance', () => {
    expect(formatDistance(0)).toBe('0 m');
  });
});

describe('getETADisplay', () => {
  it('returns arriving for < 1 minute', () => {
    const soon = new Date(Date.now() + 30 * 1000).toISOString();
    const eta = {
      co: 'KMB', route: '1A', dir: 'O' as const, service_type: 1,
      seq: 1, dest_en: 'Test', dest_tc: '測試',
      eta: soon, eta_seq: 1, rmk_en: '', rmk_tc: '',
      data_timestamp: new Date().toISOString(),
    };
    const result = getETADisplay(eta);
    expect(result.minutes).toBe(0);
    expect(result.text).toBe('Arriving');
  });

  it('returns minutes for >= 1 minute', () => {
    const future = new Date(Date.now() + 8 * 60 * 1000).toISOString();
    const eta = {
      co: 'KMB', route: '1A', dir: 'O' as const, service_type: 1,
      seq: 1, dest_en: 'Test', dest_tc: '測試',
      eta: future, eta_seq: 1, rmk_en: '', rmk_tc: '',
      data_timestamp: new Date().toISOString(),
    };
    const result = getETADisplay(eta);
    expect(result.minutes).toBeGreaterThanOrEqual(7);
    expect(result.text).toMatch(/\d+ min/);
  });
});
```

- [ ] **Step 2: Run tests (should fail)**

```bash
npx jest src/utils/__tests__/formatters.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement formatters**

Create `src/utils/formatters.ts`:
```typescript
import type { ETA } from '@/src/services/kmbAPI';

export function formatMinutesLeft(etaTimestamp: string): number {
  const diff = new Date(etaTimestamp).getTime() - Date.now();
  return Math.max(0, Math.round(diff / 60_000));
}

export function formatDistance(meters: number): string {
  if (meters < 1000) {
    return `${Math.round(meters)} m`;
  }
  return `${(meters / 1000).toFixed(1)} km`;
}

export function getETADisplay(eta: ETA): { minutes: number; text: string } {
  const minutes = formatMinutesLeft(eta.eta);
  if (minutes === 0) {
    return { minutes: 0, text: 'Arriving' };
  }
  return { minutes, text: `${minutes} min` };
}
```

- [ ] **Step 4: Run tests (should pass)**

```bash
npx jest src/utils/__tests__/formatters.test.ts
```

Expected: 7 tests pass.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add time and distance formatter utilities"
git push
```

---

### Task 5: Zustand Stores

**Files:**
- Create: `src/stores/routeStore.ts`
- Create: `src/stores/etaStore.ts`
- Create: `src/stores/favoriteStore.ts`
- Create: `src/stores/locationStore.ts`

**Interfaces:**
- Consumes:
  - `fetchAllRoutes`, `fetchAllStops`, `fetchRouteStops`, `fetchETA` from `src/services/kmbAPI.ts`
  - `COLORS` from `src/utils/constants.ts`
  - `asyncStorage` interface from `src/database/index.ts` (created in this task)
- Produces:
  - `useRouteStore` — `{ routes: Route[]; stops: Stop[]; loading: boolean; loadRouteData(): Promise<void>; getStopsForRoute(route, bound): RouteStop[]; getStopById(stopId): Stop | undefined }`
  - `useETAStore` — `{ etaCache: Record<string, ETA[]>; loading: boolean; fetchETAForStop(stopId, route, serviceType?): Promise<ETA[]>; startAutoRefresh(): void; stopAutoRefresh(): void }`
  - `useFavoriteStore` — (persisted) `{ favoriteRoutes: FavRoute[]; favoriteStops: FavStop[]; addRoute(r): void; removeRoute(id): void; isRouteFavorited(id): boolean; addStop(s): void; removeStop(id): void; isStopFavorited(id): boolean }`
  - `useLocationStore` — `{ position: {lat, lng} | null; error: string | null; permissionGranted: boolean; requestPermission(): Promise<void>; getPosition(): Promise<void> }`

- [ ] **Step 1: Create src/database/index.ts storage abstraction**

```typescript
import AsyncStorage from '@react-native-async-storage/async-storage';

export const storage = {
  getItem: async <T>(key: string): Promise<T | null> => {
    try {
      const value = await AsyncStorage.getItem(key);
      return value ? (JSON.parse(value) as T) : null;
    } catch {
      return null;
    }
  },
  setItem: async <T>(key: string, value: T): Promise<void> => {
    try {
      await AsyncStorage.setItem(key, JSON.stringify(value));
    } catch {
      // silently fail — data will be re-fetched from API
    }
  },
  removeItem: async (key: string): Promise<void> => {
    try {
      await AsyncStorage.removeItem(key);
    } catch {
      // silently fail
    }
  },
};
```

- [ ] **Step 2: Create routeStore.ts**

```typescript
import { create } from 'zustand';
import { fetchAllRoutes, fetchAllStops, fetchRouteStops } from '@/src/services/kmbAPI';
import type { Route, Stop, RouteStop } from '@/src/services/kmbAPI';

interface RouteState {
  routes: Route[];
  stops: Stop[];
  routeStopsCache: Record<string, RouteStop[]>; // key: "route_bound_serviceType"
  loading: boolean;
  error: string | null;
  loaded: boolean;
  loadRouteData: () => Promise<void>;
  getStopsForRoute: (route: string, bound: 'O' | 'I', serviceType?: number) => Promise<RouteStop[]>;
  getStopById: (stopId: string) => Stop | undefined;
}

export const useRouteStore = create<RouteState>((set, get) => ({
  routes: [],
  stops: [],
  routeStopsCache: {},
  loading: false,
  error: null,
  loaded: false,

  loadRouteData: async () => {
    if (get().loaded) return;
    set({ loading: true, error: null });
    try {
      const [routes, stops] = await Promise.all([fetchAllRoutes(), fetchAllStops()]);
      set({ routes, stops, loaded: true, loading: false });
    } catch (err) {
      set({ error: String(err), loading: false });
    }
  },

  getStopsForRoute: async (route, bound, serviceType = 1) => {
    const key = `${route}_${bound}_${serviceType}`;
    const cached = get().routeStopsCache[key];
    if (cached) return cached;
    const routeStops = await fetchRouteStops(route, bound, serviceType);
    set(state => ({
      routeStopsCache: { ...state.routeStopsCache, [key]: routeStops },
    }));
    return routeStops;
  },

  getStopById: (stopId) => {
    return get().stops.find(s => s.stop === stopId);
  },
}));
```

- [ ] **Step 3: Create etaStore.ts**

```typescript
import { create } from 'zustand';
import { fetchETA } from '@/src/services/kmbAPI';
import type { ETA } from '@/src/services/kmbAPI';
import { ETA_REFRESH_INTERVAL } from '@/src/utils/constants';

interface ETAState {
  etaCache: Record<string, ETA[]>; // key: "stopId_route_serviceType"
  loading: boolean;
  error: string | null;
  refreshTimer: ReturnType<typeof setInterval> | null;
  fetchETAForStop: (stopId: string, route: string, serviceType?: number) => Promise<ETA[]>;
  startAutoRefresh: (stopId: string, route: string, serviceType?: number) => void;
  stopAutoRefresh: () => void;
}

export const useETAStore = create<ETAState>((set, get) => ({
  etaCache: {},
  loading: false,
  error: null,
  refreshTimer: null,

  fetchETAForStop: async (stopId, route, serviceType = 1) => {
    set({ loading: true, error: null });
    try {
      const etas = await fetchETA(stopId, route, serviceType);
      const key = `${stopId}_${route}_${serviceType}`;
      set(state => ({
        etaCache: { ...state.etaCache, [key]: etas },
        loading: false,
      }));
      return etas;
    } catch (err) {
      set({ error: String(err), loading: false });
      return [];
    }
  },

  startAutoRefresh: (stopId, route, serviceType = 1) => {
    get().stopAutoRefresh(); // clear existing timer
    const fetch = () => get().fetchETAForStop(stopId, route, serviceType);
    fetch(); // immediate first fetch
    const timer = setInterval(fetch, ETA_REFRESH_INTERVAL);
    set({ refreshTimer: timer });
  },

  stopAutoRefresh: () => {
    const timer = get().refreshTimer;
    if (timer) {
      clearInterval(timer);
      set({ refreshTimer: null });
    }
  },
}));
```

- [ ] **Step 4: Create favoriteStore.ts**

```typescript
import { create } from 'zustand';
import { storage } from '@/src/database';
import { persist, createJSONStorage } from 'zustand/middleware';

export interface FavoriteRoute {
  route: string;
  bound: 'O' | 'I';
  dest_en: string;
  dest_tc: string;
  stopId: string;
  stopNameEn: string;
  stopNameTc: string;
  serviceType: number;
}

export interface FavoriteStop {
  stopId: string;
  name_en: string;
  name_tc: string;
}

interface FavoriteState {
  favoriteRoutes: FavoriteRoute[];
  favoriteStops: FavoriteStop[];
  addRoute: (r: FavoriteRoute) => void;
  removeRoute: (route: string, bound: string, stopId: string) => void;
  isRouteFavorited: (route: string, bound: string, stopId: string) => boolean;
  addStop: (s: FavoriteStop) => void;
  removeStop: (stopId: string) => void;
  isStopFavorited: (stopId: string) => boolean;
}

export const useFavoriteStore = create<FavoriteState>()(
  persist(
    (set, get) => ({
      favoriteRoutes: [],
      favoriteStops: [],

      addRoute: (r) => {
        if (get().isRouteFavorited(r.route, r.bound, r.stopId)) return;
        set(state => ({ favoriteRoutes: [...state.favoriteRoutes, r] }));
      },

      removeRoute: (route, bound, stopId) => {
        set(state => ({
          favoriteRoutes: state.favoriteRoutes.filter(
            fr => !(fr.route === route && fr.bound === bound && fr.stopId === stopId)
          ),
        }));
      },

      isRouteFavorited: (route, bound, stopId) => {
        return get().favoriteRoutes.some(
          fr => fr.route === route && fr.bound === bound && fr.stopId === stopId
        );
      },

      addStop: (s) => {
        if (get().isStopFavorited(s.stopId)) return;
        set(state => ({ favoriteStops: [...state.favoriteStops, s] }));
      },

      removeStop: (stopId) => {
        set(state => ({
          favoriteStops: state.favoriteStops.filter(fs => fs.stopId !== stopId),
        }));
      },

      isStopFavorited: (stopId) => {
        return get().favoriteStops.some(fs => fs.stopId === stopId);
      },
    }),
    {
      name: 'hk-transit-favorites',
      storage: createJSONStorage(() => ({
        getItem: async (name) => storage.getItem(name),
        setItem: async (name, value) => storage.setItem(name, value),
        removeItem: async (name) => storage.removeItem(name),
      })),
    }
  )
);
```

- [ ] **Step 5: Create locationStore.ts**

```typescript
import { create } from 'zustand';
import * as Location from 'expo-location';

interface LocationState {
  position: { lat: number; lng: number } | null;
  error: string | null;
  permissionGranted: boolean;
  loading: boolean;
  requestPermission: () => Promise<boolean>;
  getPosition: () => Promise<void>;
}

export const useLocationStore = create<LocationState>((set, get) => ({
  position: null,
  error: null,
  permissionGranted: false,
  loading: false,

  requestPermission: async () => {
    const { status } = await Location.requestForegroundPermissionsAsync();
    const granted = status === 'granted';
    set({ permissionGranted: granted, error: granted ? null : 'Location permission denied' });
    return granted;
  },

  getPosition: async () => {
    set({ loading: true, error: null });
    try {
      const { coords } = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      set({ position: { lat: coords.latitude, lng: coords.longitude }, loading: false });
    } catch (err) {
      set({ error: String(err), loading: false });
    }
  },
}));
```

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add Zustand stores for routes, ETA, favorites, and location"
git push
```

---

### Task 6: UI Components

**Files:**
- Create: `src/components/RouteCard.tsx`
- Create: `src/components/ETARow.tsx`
- Create: `src/components/StopItem.tsx`
- Create: `src/components/SearchBar.tsx`
- Create: `src/components/NearbyStopCard.tsx`

**Interfaces:**
- Consumes: `useETAStore`, `useFavoriteStore` from stores; `getETADisplay` from formatters; `COLORS` from constants; `t()` from i18n
- Produces: Reusable presentational components, each with explicit Props interface

- [ ] **Step 1: Create ETARow.tsx**

```tsx
import { View, Text, StyleSheet } from 'react-native';
import type { ETA } from '@/src/services/kmbAPI';
import { getETADisplay } from '@/src/utils/formatters';
import { COLORS } from '@/src/utils/constants';

interface ETARowProps {
  eta: ETA;
  isUrgent?: boolean;
}

export function ETARow({ eta, isUrgent }: ETARowProps) {
  const { minutes, text } = getETADisplay(eta);
  const color = isUrgent || minutes === 0 ? COLORS.etaUrgent
    : minutes <= 10 ? COLORS.etaWarning
    : COLORS.textPrimary;

  return (
    <View style={styles.container}>
      <Text style={[styles.minutes, { color }]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: COLORS.bgSystem,
  },
  minutes: {
    fontSize: 18,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
});
```

- [ ] **Step 2: Create RouteCard.tsx**

```tsx
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { COLORS } from '@/src/utils/constants';
import { ETARow } from './ETARow';
import type { ETA } from '@/src/services/kmbAPI';
import type { FavoriteRoute } from '@/src/stores/favoriteStore';

interface RouteCardProps {
  favorite: FavoriteRoute;
  etas: ETA[];
  onPress: () => void;
}

export function RouteCard({ favorite, etas, onPress }: RouteCardProps) {
  const { i18n } = useTranslation();
  const isEN = i18n.language === 'en';
  const dest = isEN ? favorite.dest_en : favorite.dest_tc;
  const stopName = isEN ? favorite.stopNameEn : favorite.stopNameTc;

  return (
    <Pressable style={styles.card} onPress={onPress}>
      <View style={styles.header}>
        <Text style={styles.routeNumber}>{favorite.route}</Text>
        <Text style={styles.dest} numberOfLines={1}>{dest}</Text>
      </View>
      <Text style={styles.stopName} numberOfLines={1}>{stopName}</Text>
      <View style={styles.etas}>
        {etas.length === 0 ? (
          <Text style={styles.noETA}>—</Text>
        ) : (
          etas.slice(0, 2).map((eta, i) => (
            <ETARow key={`${eta.eta_seq}-${i}`} eta={eta} isUrgent={i === 0} />
          ))
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.bgCard,
    borderRadius: 16,
    padding: 16,
    marginHorizontal: 16,
    marginVertical: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginBottom: 4,
  },
  routeNumber: {
    fontSize: 28,
    fontWeight: '700',
    color: COLORS.hkRed,
    marginRight: 12,
  },
  dest: {
    fontSize: 17,
    color: COLORS.textPrimary,
    flex: 1,
  },
  stopName: {
    fontSize: 13,
    color: COLORS.textSecondary,
    marginBottom: 10,
  },
  etas: {
    flexDirection: 'row',
    gap: 8,
  },
  noETA: {
    fontSize: 18,
    color: COLORS.textSecondary,
  },
});
```

- [ ] **Step 3: Create StopItem.tsx**

```tsx
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { COLORS } from '@/src/utils/constants';
import type { ETA } from '@/src/services/kmbAPI';
import { ETARow } from './ETARow';

interface StopItemProps {
  stopName: string;
  seq: number;
  etas: ETA[];
  onPress: () => void;
  isFavorite: boolean;
  onToggleFavorite: () => void;
}

export function StopItem({ stopName, seq, etas, onPress, isFavorite, onToggleFavorite }: StopItemProps) {
  return (
    <Pressable style={styles.container} onPress={onPress}>
      <View style={styles.seqBadge}>
        <Text style={styles.seqText}>{seq}</Text>
      </View>
      <View style={styles.content}>
        <Text style={styles.name} numberOfLines={1}>{stopName}</Text>
        <View style={styles.etas}>
          {etas.length === 0 ? (
            <Text style={styles.noETA}>—</Text>
          ) : (
            etas.slice(0, 3).map((eta, i) => (
              <ETARow key={`${eta.eta_seq}-${i}`} eta={eta} isUrgent={i === 0} />
            ))
          )}
        </View>
      </View>
      <Pressable onPress={onToggleFavorite} style={styles.favButton}>
        <Text style={[styles.favIcon, isFavorite && styles.favActive]}>
          {isFavorite ? '★' : '☆'}
        </Text>
      </Pressable>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.bgCard,
    padding: 12,
    marginHorizontal: 16,
    marginVertical: 3,
    borderRadius: 12,
  },
  seqBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: COLORS.bgSystem,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  seqText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  content: {
    flex: 1,
  },
  name: {
    fontSize: 16,
    color: COLORS.textPrimary,
    marginBottom: 4,
  },
  etas: {
    flexDirection: 'row',
    gap: 6,
  },
  noETA: {
    fontSize: 14,
    color: COLORS.textSecondary,
  },
  favButton: {
    padding: 8,
  },
  favIcon: {
    fontSize: 22,
    color: COLORS.textSecondary,
  },
  favActive: {
    color: '#FFB800',
  },
});
```

- [ ] **Step 4: Create SearchBar.tsx**

```tsx
import { View, TextInput, StyleSheet } from 'react-native';
import { COLORS } from '@/src/utils/constants';
import { useTranslation } from 'react-i18next';

interface SearchBarProps {
  value: string;
  onChangeText: (text: string) => void;
}

export function SearchBar({ value, onChangeText }: SearchBarProps) {
  const { t } = useTranslation();
  return (
    <View style={styles.container}>
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChangeText}
        placeholder={t('search.placeholder')}
        placeholderTextColor={COLORS.textSecondary}
        autoFocus
        keyboardType="number-pad"
        returnKeyType="search"
        clearButtonMode="while-editing"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: COLORS.bgSystem,
  },
  input: {
    backgroundColor: COLORS.bgCard,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 17,
    color: COLORS.textPrimary,
  },
});
```

- [ ] **Step 5: Create NearbyStopCard.tsx**

```tsx
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { COLORS } from '@/src/utils/constants';
import { formatDistance } from '@/src/utils/formatters';
import { useTranslation } from 'react-i18next';

interface NearbyStopCardProps {
  stopName: string;
  distance: number;
  routes: string[];
  onPress: () => void;
}

export function NearbyStopCard({ stopName, distance, routes, onPress }: NearbyStopCardProps) {
  const { t } = useTranslation();

  return (
    <Pressable style={styles.card} onPress={onPress}>
      <View style={styles.header}>
        <Text style={styles.name} numberOfLines={1}>{stopName}</Text>
        <View style={styles.distanceBadge}>
          <Text style={styles.distanceText}>{formatDistance(distance)}</Text>
        </View>
      </View>
      <Text style={styles.routes} numberOfLines={1}>
        {t('nearby.routes')}: {routes.join(', ')}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.bgCard,
    borderRadius: 16,
    padding: 14,
    marginHorizontal: 16,
    marginVertical: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  name: {
    fontSize: 17,
    fontWeight: '600',
    color: COLORS.textPrimary,
    flex: 1,
    marginRight: 8,
  },
  distanceBadge: {
    backgroundColor: COLORS.hkRed,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  distanceText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
  },
  routes: {
    fontSize: 14,
    color: COLORS.textSecondary,
  },
});
```

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add reusable UI components (RouteCard, ETARow, StopItem, SearchBar, NearbyStopCard)"
git push
```

---

### Task 7: Home Dashboard Page

**Files:**
- Modify: `app/(tabs)/index.tsx`

**Interfaces:**
- Consumes: `useFavoriteStore`, `useETAStore`, `useRouteStore`; `RouteCard` component; `DEFAULT_ROUTES` from constants; `t()` from i18n

- [ ] **Step 1: Rewrite app/(tabs)/index.tsx**

```tsx
import { useEffect, useCallback } from 'react';
import { View, Text, FlatList, StyleSheet, RefreshControl } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useFavoriteStore } from '@/src/stores/favoriteStore';
import { useETAStore } from '@/src/stores/etaStore';
import { useRouteStore } from '@/src/stores/routeStore';
import { RouteCard } from '@/src/components/RouteCard';
import { COLORS } from '@/src/utils/constants';

export default function HomeScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { favoriteRoutes } = useFavoriteStore();
  const { etaCache, fetchETAForStop, loading, startAutoRefresh, stopAutoRefresh } = useETAStore();
  const { loadRouteData, loaded, routes } = useRouteStore();

  useEffect(() => {
    loadRouteData();
  }, []);

  const loadAllETAs = useCallback(async () => {
    for (const fav of favoriteRoutes) {
      await fetchETAForStop(fav.stopId, fav.route, fav.serviceType);
    }
  }, [favoriteRoutes, fetchETAForStop]);

  useEffect(() => {
    if (favoriteRoutes.length > 0) {
      loadAllETAs();
      startAutoRefresh(favoriteRoutes[0].stopId, favoriteRoutes[0].route, favoriteRoutes[0].serviceType);
    }
    return () => stopAutoRefresh();
  }, [favoriteRoutes.length > 0]);

  const handleRoutePress = (fav: typeof favoriteRoutes[0]) => {
    router.push(`/eta/${fav.route}?bound=${fav.bound}&stopId=${fav.stopId}&serviceType=${fav.serviceType}`);
  };

  if (!loaded) {
    return (
      <View style={styles.center}>
        <Text style={styles.loadingText}>{t('home.loading')}</Text>
      </View>
    );
  }

  if (favoriteRoutes.length === 0) {
    return (
      <View style={styles.center}>
        <Text style={styles.emptyTitle}>{t('home.emptyTitle')}</Text>
        <Text style={styles.emptySubtitle}>{t('home.emptySubtitle')}</Text>
        <Text style={styles.linkText} onPress={() => router.push('/search')}>
          {t('home.goToSearch')}
        </Text>
      </View>
    );
  }

  return (
    <FlatList
      data={favoriteRoutes}
      keyExtractor={item => `${item.route}_${item.bound}_${item.stopId}`}
      renderItem={({ item }) => {
        const key = `${item.stopId}_${item.route}_${item.serviceType}`;
        const etas = etaCache[key] || [];
        return <RouteCard favorite={item} etas={etas} onPress={() => handleRoutePress(item)} />;
      }}
      contentContainerStyle={styles.list}
      refreshControl={
        <RefreshControl refreshing={loading} onRefresh={loadAllETAs} tintColor={COLORS.hkRed} />
      }
    />
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
    backgroundColor: COLORS.bgSystem,
  },
  loadingText: { fontSize: 17, color: COLORS.textSecondary },
  emptyTitle: { fontSize: 22, fontWeight: '700', color: COLORS.textPrimary, marginBottom: 8 },
  emptySubtitle: { fontSize: 16, color: COLORS.textSecondary, textAlign: 'center', marginBottom: 16 },
  linkText: { fontSize: 17, color: COLORS.hkRed, fontWeight: '600' },
  list: { backgroundColor: COLORS.bgSystem, paddingVertical: 12 },
});
```

- [ ] **Step 2: Verify home screen works**

```bash
npx expo start --web
```

Expected: Home screen shows empty state with "Welcome to HK Transit" message and link to search. No crashes.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat: implement home dashboard with favorite routes and ETA display"
git push
```

---

### Task 8: Route Search Page

**Files:**
- Modify: `app/(tabs)/search.tsx`
- Modify: `app/eta/[routeId].tsx` (initial implementation)

**Interfaces:**
- Consumes: `useRouteStore`, `SearchBar` component; `COLORS`; `t()` from i18n

- [ ] **Step 1: Rewrite app/(tabs)/search.tsx**

```tsx
import { useState, useMemo } from 'react';
import { View, Text, FlatList, Pressable, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useRouteStore } from '@/src/stores/routeStore';
import { SearchBar } from '@/src/components/SearchBar';
import { COLORS } from '@/src/utils/constants';

export default function SearchScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { routes, loadRouteData, loaded } = useRouteStore();
  const [query, setQuery] = useState('');

  useEffect(() => {
    loadRouteData();
  }, []);

  const filteredRoutes = useMemo(() => {
    if (!query.trim()) return [];
    const q = query.trim().toUpperCase();
    return routes.filter(r => r.route.toUpperCase().includes(q)).slice(0, 20);
  }, [routes, query]);

  const handleRoutePress = (route: string) => {
    router.push(`/eta/${route}`);
  };

  return (
    <View style={styles.container}>
      <SearchBar value={query} onChangeText={setQuery} />
      {!loaded ? (
        <View style={styles.center}>
          <Text style={styles.loadingText}>{t('home.loading')}</Text>
        </View>
      ) : filteredRoutes.length === 0 && query.length > 0 ? (
        <View style={styles.center}>
          <Text style={styles.emptyText}>{t('search.noResults')}</Text>
        </View>
      ) : (
        <FlatList
          data={filteredRoutes}
          keyExtractor={item => item.route}
          renderItem={({ item }) => {
            const isEN = true; // simplified for initial version
            return (
              <Pressable
                style={styles.routeItem}
                onPress={() => handleRoutePress(item.route)}
              >
                <Text style={styles.routeNumber}>{item.route}</Text>
                <View style={styles.routeInfo}>
                  <Text style={styles.routeDest} numberOfLines={1}>
                    {isEN ? item.dest_en : item.dest_tc}
                  </Text>
                  <Text style={styles.routeOrigin} numberOfLines={1}>
                    {isEN ? item.orig_en : item.orig_tc}
                  </Text>
                </View>
              </Pressable>
            );
          }}
          contentContainerStyle={styles.list}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bgSystem },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { fontSize: 17, color: COLORS.textSecondary },
  emptyText: { fontSize: 17, color: COLORS.textSecondary },
  list: { paddingVertical: 8 },
  routeItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.bgCard,
    marginHorizontal: 16,
    marginVertical: 3,
    padding: 14,
    borderRadius: 12,
  },
  routeNumber: {
    fontSize: 24,
    fontWeight: '700',
    color: COLORS.hkRed,
    width: 72,
  },
  routeInfo: { flex: 1 },
  routeDest: { fontSize: 17, color: COLORS.textPrimary },
  routeOrigin: { fontSize: 14, color: COLORS.textSecondary, marginTop: 2 },
});
```

- [ ] **Step 2: Create ETA detail page placeholder**

Create `app/eta/[routeId].tsx` (replace placeholder):
```tsx
import { useLocalSearchParams } from 'expo-router';
import { View, Text, StyleSheet } from 'react-native';
import { COLORS } from '@/src/utils/constants';

export default function ETAScreen() {
  const { routeId, bound } = useLocalSearchParams<{ routeId: string; bound?: string }>();

  return (
    <View style={styles.container}>
      <Text style={styles.routeTitle}>Route {routeId}</Text>
      <Text style={styles.subtitle}>Select a stop to view ETA</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.bgSystem },
  routeTitle: { fontSize: 28, fontWeight: '700', color: COLORS.textPrimary },
  subtitle: { fontSize: 17, color: COLORS.textSecondary, marginTop: 8 },
});
```

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat: implement route search with debounced filtering"
git push
```

---

### Task 9: ETA Detail Page (Full)

**Files:**
- Modify: `app/eta/[routeId].tsx`

**Interfaces:**
- Consumes: `useRouteStore`, `useETAStore`, `useFavoriteStore`; `StopItem` component; `t()` from i18n

- [ ] **Step 1: Full ETA detail page implementation**

Rewrite `app/eta/[routeId].tsx`:
```tsx
import { useEffect, useState, useCallback } from 'react';
import { View, Text, FlatList, StyleSheet, RefreshControl } from 'react-native';
import { useLocalSearchParams, Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useRouteStore } from '@/src/stores/routeStore';
import { useETAStore } from '@/src/stores/etaStore';
import { useFavoriteStore } from '@/src/stores/favoriteStore';
import { StopItem } from '@/src/components/StopItem';
import { COLORS } from '@/src/utils/constants';
import type { RouteStop } from '@/src/services/kmbAPI';

export default function ETAScreen() {
  const { routeId, bound: initialBound, stopId: initialStopId, serviceType: initialST } =
    useLocalSearchParams<{ routeId: string; bound?: string; stopId?: string; serviceType?: string }>();

  const { t, i18n } = useTranslation();
  const isEN = i18n.language === 'en';
  const { getStopsForRoute, getStopById, routes } = useRouteStore();
  const { etaCache, fetchETAForStop, startAutoRefresh, stopAutoRefresh, loading } = useETAStore();
  const { addRoute, removeRoute, addStop, removeStop, isRouteFavorited, isStopFavorited } = useFavoriteStore();

  const [bound, setBound] = useState<'O' | 'I'>(initialBound === 'I' ? 'I' : 'O');
  const serviceType = parseInt(initialST || '1', 10);
  const [stopList, setStopList] = useState<RouteStop[]>([]);

  const route = routes.find(r => r.route === routeId);
  const destName = isEN ? route?.dest_en : route?.dest_tc;
  const origName = isEN ? route?.orig_en : route?.orig_tc;

  useEffect(() => {
    getStopsForRoute(routeId, bound, serviceType).then(setStopList);
  }, [routeId, bound, serviceType]);

  useEffect(() => {
    if (stopList.length > 0) {
      const targetStop = initialStopId && stopList.find(s => s.stop === initialStopId)
        ? initialStopId
        : stopList[0].stop;
      startAutoRefresh(targetStop, routeId, serviceType);
    }
    return () => stopAutoRefresh();
  }, [stopList]);

  const toggleBound = () => {
    setBound(b => (b === 'O' ? 'I' : 'O'));
  };

  const handleToggleRouteFav = () => {
    if (!route || !stopList[0]) return;
    const stopId = initialStopId || stopList[0].stop;
    const stop = getStopById(stopId);
    if (!stop) return;
    if (isRouteFavorited(routeId, bound, stopId)) {
      removeRoute(routeId, bound, stopId);
    } else {
      addRoute({
        route: routeId, bound, stopId,
        dest_en: route.dest_en, dest_tc: route.dest_tc,
        stopNameEn: stop.name_en, stopNameTc: stop.name_tc,
        serviceType,
      });
    }
  };

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          title: `${t('eta.title', { route: routeId })}`,
          headerRight: () => (
            <Text style={styles.favButton} onPress={handleToggleRouteFav}>
              {isRouteFavorited(routeId, bound, initialStopId || stopList[0]?.stop || '') ? '★' : '☆'}
            </Text>
          ),
        }}
      />
      <View style={styles.boundSelector}>
        <Text style={styles.boundLabel}>{destName || origName || routeId}</Text>
        <Text style={styles.boundToggle} onPress={toggleBound}>
          {bound === 'O' ? t('search.outbound') : t('search.inbound')} ⇄
        </Text>
      </View>
      <FlatList
        data={stopList}
        keyExtractor={item => `${item.stop}_${item.seq}`}
        renderItem={({ item }) => {
          const stop = getStopById(item.stop);
          const name = isEN ? stop?.name_en : stop?.name_tc;
          const key = `${item.stop}_${routeId}_${serviceType}`;
          const etas = etaCache[key] || [];
          const favStopId = item.stop;
          return (
            <StopItem
              stopName={name || item.stop}
              seq={item.seq}
              etas={etas}
              onPress={() => fetchETAForStop(item.stop, routeId, serviceType)}
              isFavorite={isStopFavorited(favStopId)}
              onToggleFavorite={() => {
                if (isStopFavorited(favStopId)) {
                  removeStop(favStopId);
                } else if (stop) {
                  addStop({ stopId: favStopId, name_en: stop.name_en, name_tc: stop.name_tc });
                }
              }}
            />
          );
        }}
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={() => fetchETAForStop(stopList[0]?.stop || '', routeId, serviceType)} tintColor={COLORS.hkRed} />
        }
        contentContainerStyle={styles.list}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bgSystem },
  boundSelector: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: COLORS.bgCard,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E5E5EA',
  },
  boundLabel: { fontSize: 17, fontWeight: '600', color: COLORS.textPrimary, flex: 1 },
  boundToggle: { fontSize: 15, color: COLORS.hkRed, fontWeight: '600' },
  list: { paddingVertical: 8 },
  favButton: { fontSize: 22, paddingHorizontal: 8 },
});
```

- [ ] **Step 2: Commit**

```bash
git add -A
git commit -m "feat: implement full ETA detail page with stop list and direction toggle"
git push
```

---

### Task 10: Nearby Stops + Favorites Pages

**Files:**
- Modify: `app/(tabs)/nearby.tsx`
- Modify: `app/(tabs)/favorites.tsx`

- [ ] **Step 1: Implement nearby.tsx**

Rewrite `app/(tabs)/nearby.tsx`:
```tsx
import { useEffect, useMemo } from 'react';
import { View, Text, FlatList, Pressable, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useLocationStore } from '@/src/stores/locationStore';
import { useRouteStore } from '@/src/stores/routeStore';
import { NearbyStopCard } from '@/src/components/NearbyStopCard';
import { COLORS } from '@/src/utils/constants';

function getDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export default function NearbyScreen() {
  const { t, i18n } = useTranslation();
  const isEN = i18n.language === 'en';
  const router = useRouter();
  const { position, permissionGranted, loading, requestPermission, getPosition } = useLocationStore();
  const { stops, routes, routeStopsCache, loadRouteData, getStopsForRoute } = useRouteStore();

  useEffect(() => { loadRouteData(); }, []);

  const nearbyStops = useMemo(() => {
    if (!position) return [];
    return stops
      .map(stop => ({
        ...stop,
        distance: getDistance(position.lat, position.lng, stop.lat, stop.long),
      }))
      .sort((a, b) => a.distance - b.distance)
      .slice(0, 10);
  }, [stops, position]);

  if (!permissionGranted) {
    return (
      <View style={styles.center}>
        <Text style={styles.message}>{t('nearby.permissionDenied')}</Text>
        <Pressable style={styles.button} onPress={requestPermission}>
          <Text style={styles.buttonText}>{t('nearby.grantPermission')}</Text>
        </Pressable>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <Text style={styles.message}>{t('nearby.loading')}</Text>
      </View>
    );
  }

  return (
    <FlatList
      data={nearbyStops}
      keyExtractor={item => item.stop}
      renderItem={({ item }) => (
        <NearbyStopCard
          stopName={isEN ? item.name_en : item.name_tc}
          distance={item.distance}
          routes={['—']}
          onPress={() => router.push(`/eta/search?stopId=${item.stop}`)}
        />
      )}
      contentContainerStyle={styles.list}
    />
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32, backgroundColor: COLORS.bgSystem },
  message: { fontSize: 17, color: COLORS.textSecondary, textAlign: 'center', marginBottom: 16 },
  button: { backgroundColor: COLORS.hkRed, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 12 },
  buttonText: { color: '#FFFFFF', fontSize: 17, fontWeight: '600' },
  list: { backgroundColor: COLORS.bgSystem, paddingVertical: 8 },
});
```

- [ ] **Step 2: Implement favorites.tsx**

Rewrite `app/(tabs)/favorites.tsx`:
```tsx
import { View, Text, FlatList, Pressable, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useFavoriteStore } from '@/src/stores/favoriteStore';
import { useETAStore } from '@/src/stores/etaStore';
import { RouteCard } from '@/src/components/RouteCard';
import { COLORS } from '@/src/utils/constants';

export default function FavoritesScreen() {
  const { t, i18n } = useTranslation();
  const isEN = i18n.language === 'en';
  const router = useRouter();
  const { favoriteRoutes, favoriteStops } = useFavoriteStore();
  const { etaCache } = useETAStore();

  return (
    <View style={styles.container}>
      {favoriteRoutes.length === 0 && favoriteStops.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.emptyText}>{t('favorites.emptyRoutes')}</Text>
        </View>
      ) : (
        <FlatList
          data={[
            { type: 'header' as const, key: 'header-routes', label: t('favorites.routes'), count: favoriteRoutes.length },
            ...favoriteRoutes.map(fr => ({ type: 'route' as const, key: `route-${fr.route}-${fr.bound}-${fr.stopId}`, data: fr })),
            { type: 'header' as const, key: 'header-stops', label: t('favorites.stops'), count: favoriteStops.length },
            ...favoriteStops.map(fs => ({ type: 'stop' as const, key: `stop-${fs.stopId}`, data: fs })),
          ]}
          renderItem={({ item }) => {
            if (item.type === 'header') {
              return (
                <View style={styles.sectionHeader}>
                  <Text style={styles.sectionTitle}>{item.label}</Text>
                  <Text style={styles.sectionCount}>{item.count}</Text>
                </View>
              );
            }
            if (item.type === 'route' && 'route' in item.data) {
              const key = `${item.data.stopId}_${item.data.route}_${item.data.serviceType}`;
              return (
                <RouteCard
                  favorite={item.data}
                  etas={etaCache[key] || []}
                  onPress={() => router.push(
                    `/eta/${item.data.route}?bound=${item.data.bound}&stopId=${item.data.stopId}&serviceType=${item.data.serviceType}`
                  )}
                />
              );
            }
            if (item.type === 'stop' && 'stopId' in item.data) {
              return (
                <Pressable
                  style={styles.stopItem}
                  onPress={() => router.push(`/eta/search?stopId=${item.data.stopId}`)}
                >
                  <Text style={styles.stopName}>
                    {isEN ? item.data.name_en : item.data.name_tc}
                  </Text>
                </Pressable>
              );
            }
            return null;
          }}
          contentContainerStyle={styles.list}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bgSystem },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyText: { fontSize: 17, color: COLORS.textSecondary },
  list: { paddingVertical: 8 },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 6,
  },
  sectionTitle: { fontSize: 20, fontWeight: '700', color: COLORS.textPrimary },
  sectionCount: { fontSize: 16, color: COLORS.textSecondary },
  stopItem: {
    backgroundColor: COLORS.bgCard,
    marginHorizontal: 16,
    marginVertical: 3,
    padding: 14,
    borderRadius: 12,
  },
  stopName: { fontSize: 17, color: COLORS.textPrimary },
});
```

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat: implement nearby stops and favorites pages"
git push
```

---

### Task 11: PWA + Final Polish

**Files:**
- Modify: `app.json` (PWA config)
- Modify: `app/_layout.tsx` (language toggle)
- Create: `public/` (PWA icons, manifest)
- Modify: `README.md`

- [ ] **Step 1: Configure PWA in app.json**

Add to `app.json`:
```json
{
  "expo": {
    "name": "HK Transit",
    "slug": "hk-transit-ai",
    "version": "1.0.0",
    "orientation": "portrait",
    "icon": "./assets/icon.png",
    "userInterfaceStyle": "light",
    "splash": { "backgroundColor": "#F2F2F7" },
    "web": {
      "favicon": "./assets/favicon.png",
      "name": "HK Transit",
      "shortName": "HK Transit",
      "lang": "en",
      "themeColor": "#C41230",
      "backgroundColor": "#F2F2F7",
      "display": "standalone",
      "orientation": "portrait"
    },
    "plugins": [
      "expo-router",
      "expo-localization",
      "expo-location"
    ]
  }
}
```

- [ ] **Step 2: Add language toggle to tab layout**

Modify `app/(tabs)/_layout.tsx` to add a language toggle button in the header.

- [ ] **Step 3: Build PWA and test**

```bash
npx expo export:web
npx serve web-build
```

Verify:
- Open on iPhone in Safari
- "Add to Home Screen" works
- Opens standalone without browser chrome
- All features work: search, ETA, favorites, nearby

- [ ] **Step 4: Final README update**

Update README.md with:
- Project description in English + Chinese
- Tech architecture diagram
- Installation steps (clone, npm install, npx expo start --web)
- Completed Phase 1 features checklist
- Phase 2 + Phase 3 roadmap

- [ ] **Step 5: Final commit for Phase 1**

```bash
git add -A
git commit -m "feat: complete Phase 1 MVP — PWA, i18n, search, ETA, favorites, nearby"
git push
```

---

### Task 12: Integration Testing & Bug Fix

**Files:**
- None new; modify any files with bugs discovered during testing.

- [ ] **Step 1: Manual test all user flows**

Test each flow on Web:
1. Open app → see empty state
2. Go to Search → type "8" → see Route 8 result
3. Tap Route 8 → see stop list with ETA
4. Toggle direction → stop list changes
5. Star a route → go to Favorites → route appears
6. Go to Home → favorited route shows with ETA
7. Star a stop → Favorites shows it
8. Test Nearby → grant location → see nearby stops
9. Switch language → all UI text toggles
10. PWA install → standalone mode works

Document all bugs found. Fix each one, commit individually.

- [ ] **Step 2: Run all tests**

```bash
npx jest
```

Expected: All unit tests pass.

- [ ] **Step 3: Bug fix commits**

```bash
git add -A
git commit -m "fix: [bug description]"
git push
```
