import { create } from 'zustand';
import { getProvider } from '@/src/journey/providers';
import type { ProviderId } from '@/src/journey/providers/types';
import {
  loadRouteCatalog,
  type RouteCatalogEntry,
} from '@/src/journey/search/routeCatalog';

interface RouteCatalogState {
  entries: RouteCatalogEntry[];
  errors: Partial<Record<ProviderId, string>>;
  loading: boolean;
  loaded: boolean;
  query: string;
  load: () => Promise<void>;
  setQuery: (query: string) => void;
}

let routeCatalogLoad: Promise<void> | null = null;

export const useRouteCatalogStore = create<RouteCatalogState>((set, get) => ({
  entries: [],
  errors: {},
  loading: false,
  loaded: false,
  query: '',

  load: async () => {
    if (get().loaded) return;
    if (routeCatalogLoad) return routeCatalogLoad;

    set({ loading: true });
    routeCatalogLoad = loadRouteCatalog(getProvider)
      .then(({ entries, errors }) => {
        set({ entries, errors, loaded: true, loading: false });
      })
      .catch((error) => {
        set({ loading: false });
        throw error;
      })
      .finally(() => {
        routeCatalogLoad = null;
      });
    return routeCatalogLoad;
  },

  setQuery: (query) => set({ query }),
}));
