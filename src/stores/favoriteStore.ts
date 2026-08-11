import { create } from 'zustand';
import { storage } from '@/src/database';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { ProviderId } from '@/src/journey/providers/types';
import { createKmbServiceVariant } from '@/src/journey/providers/kmbServiceVariant';

export interface RouteIdentity {
  provider: ProviderId;
  route: string;
  bound: 'O' | 'I';
  routeVariant?: string;
  serviceType?: number;
  stopId: string;
}

export interface FavoriteRoute extends RouteIdentity {
  dest_en: string;
  dest_tc: string;
  stopNameEn: string;
  stopNameTc: string;
  serviceType: number;
}

export interface FavoriteStop {
  stopId: string;
  name_en: string;
  name_tc: string;
}

export interface FavoritePersistedStateV1 {
  favoriteRoutes: Array<Omit<FavoriteRoute, 'provider'>>;
  favoriteStops: FavoriteStop[];
}

interface FavoriteState {
  favoriteRoutes: FavoriteRoute[];
  favoriteStops: FavoriteStop[];
  addRoute: (r: FavoriteRoute) => void;
  removeRoute: (identity: RouteIdentity) => void;
  isRouteFavorited: (identity: RouteIdentity) => boolean;
  addStop: (s: FavoriteStop) => void;
  removeStop: (stopId: string) => void;
  isStopFavorited: (stopId: string) => boolean;
}

function resolvedRouteVariant(identity: RouteIdentity): string | undefined {
  return identity.routeVariant ?? (
    identity.provider === 'KMB'
      ? createKmbServiceVariant(Number(identity.serviceType) || 1)
      : undefined
  );
}

export function migrateFavoriteState(
  persistedState: FavoritePersistedStateV1 | unknown,
  version: number
): unknown {
  if (version >= 3 || !persistedState || typeof persistedState !== 'object') return persistedState;
  const state = persistedState as { favoriteRoutes?: unknown[] };
  return {
    ...state,
    favoriteRoutes: Array.isArray(state.favoriteRoutes)
      ? state.favoriteRoutes.map((favorite) => {
        if (!favorite || typeof favorite !== 'object') return favorite;
        const route = favorite as Partial<FavoriteRoute>;
        const provider = route.provider ?? 'KMB';
        return {
          ...route,
          provider,
          routeVariant: route.routeVariant ?? (
            provider === 'KMB'
              ? createKmbServiceVariant(Number(route.serviceType) || 1)
              : undefined
          ),
        };
      })
      : [],
  };
}

export const useFavoriteStore = create<FavoriteState>()(
  persist(
    (set, get) => ({
      favoriteRoutes: [],
      favoriteStops: [],

      addRoute: (r) => {
        if (get().isRouteFavorited(r)) return;
        const normalized = { ...r, routeVariant: resolvedRouteVariant(r) };
        set((state) => ({
          favoriteRoutes: [...state.favoriteRoutes, normalized],
        }));
      },

      removeRoute: (identity) => {
        set((state) => ({
          favoriteRoutes: state.favoriteRoutes.filter(
            (fr) =>
              !(
                fr.provider === identity.provider &&
                fr.route === identity.route &&
                fr.bound === identity.bound &&
                fr.routeVariant === resolvedRouteVariant(identity) &&
                fr.stopId === identity.stopId
              )
          ),
        }));
      },

      isRouteFavorited: (identity) => {
        return get().favoriteRoutes.some(
          (fr) =>
            fr.provider === identity.provider &&
            fr.route === identity.route &&
            fr.bound === identity.bound &&
            fr.routeVariant === resolvedRouteVariant(identity) &&
            fr.stopId === identity.stopId
        );
      },

      addStop: (s) => {
        if (get().isStopFavorited(s.stopId)) return;
        set((state) => ({
          favoriteStops: [...state.favoriteStops, s],
        }));
      },

      removeStop: (stopId) => {
        set((state) => ({
          favoriteStops: state.favoriteStops.filter(
            (fs) => fs.stopId !== stopId
          ),
        }));
      },

      isStopFavorited: (stopId) => {
        return get().favoriteStops.some((fs) => fs.stopId === stopId);
      },
    }),
    {
      name: 'hk-transit-favorites',
      version: 3,
      migrate: migrateFavoriteState,
      storage: createJSONStorage(() => ({
        getItem: async (name) => storage.getItem(name),
        setItem: async (name, value) => storage.setItem(name, value),
        removeItem: async (name) => storage.removeItem(name),
      })),
    }
  )
);
