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
  isRouteFavorited: (
    route: string,
    bound: string,
    stopId: string
  ) => boolean;
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
        set((state) => ({
          favoriteRoutes: [...state.favoriteRoutes, r],
        }));
      },

      removeRoute: (route, bound, stopId) => {
        set((state) => ({
          favoriteRoutes: state.favoriteRoutes.filter(
            (fr) =>
              !(
                fr.route === route &&
                fr.bound === bound &&
                fr.stopId === stopId
              )
          ),
        }));
      },

      isRouteFavorited: (route, bound, stopId) => {
        return get().favoriteRoutes.some(
          (fr) =>
            fr.route === route &&
            fr.bound === bound &&
            fr.stopId === stopId
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
      storage: createJSONStorage(() => ({
        getItem: async (name) => storage.getItem(name),
        setItem: async (name, value) => storage.setItem(name, value),
        removeItem: async (name) => storage.removeItem(name),
      })),
    }
  )
);
