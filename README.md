# HK Transit AI

Hong Kong public transport assistant — independent, ad-free, real-time bus ETA.

香港公共交通助手 — 獨立、無廣告、即時巴士到站時間查詢。

---

## Tech Stack / 技術架構

| Layer | Choice |
|-------|--------|
| Framework | Expo SDK 57 + Expo Router |
| State | Zustand |
| Styling | StyleSheet (Apple-style design) |
| i18n | i18next + expo-localization (en / zh-HK) |
| API | data.etabus.gov.hk (KMB open data) |
| Storage | AsyncStorage |
| Platform | Web PWA → iOS → Android |

## Project Structure / 項目結構

```
HK-Transit-AI/
├── app/                    # Expo Router pages
│   ├── (tabs)/             # Tab navigation
│   │   ├── index.tsx       # Home Dashboard
│   │   ├── search.tsx      # Route search
│   │   ├── nearby.tsx      # Nearby stops
│   │   └── favorites.tsx   # Favorites
│   └── eta/[routeId].tsx   # ETA detail
├── src/
│   ├── components/         # Reusable UI
│   ├── services/           # API client
│   ├── stores/             # Zustand stores
│   ├── database/           # Storage abstraction
│   ├── i18n/               # Translations
│   └── utils/              # Helpers
└── docs/                   # Documentation
```

## Quick Start / 快速開始

```bash
npm install
npx expo start --web
```

Open in browser → test on iPhone → "Add to Home Screen" for PWA.

## Features (MVP) / 功能

- [x] KMB open data API integration
- [x] Home Dashboard with favorite route ETAs
- [x] Route search by number
- [x] Real-time ETA with 30s auto-refresh
- [x] Favorites (routes & stops)
- [x] GPS nearby stops
- [x] Bilingual UI (English / 繁體中文)
- [x] PWA (iPhone home screen installable)

## Roadmap

### Phase 2 — Advanced
- iOS Widget
- Push notifications
- Siri Shortcuts

### Phase 3 — AI
- Personal commute assistant
- Wait time prediction (XGBoost / LSTM)
- Natural language transport queries
