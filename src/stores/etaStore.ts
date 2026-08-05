import { create } from 'zustand';
import { fetchETA } from '@/src/services/kmbAPI';
import type { ETA } from '@/src/services/kmbAPI';
import { ETA_REFRESH_INTERVAL } from '@/src/utils/constants';

interface ETAState {
  etaCache: Record<string, ETA[]>;
  loading: boolean;
  error: string | null;
  refreshTimer: ReturnType<typeof setInterval> | null;
  fetchETAForStop: (
    stopId: string,
    route: string,
    serviceType?: number
  ) => Promise<ETA[]>;
  startAutoRefresh: (
    stopId: string,
    route: string,
    serviceType?: number
  ) => void;
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
      set((state) => ({
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
    get().stopAutoRefresh();
    get().fetchETAForStop(stopId, route, serviceType); // immediate first fetch
    const timer = setInterval(
      () => get().fetchETAForStop(stopId, route, serviceType),
      ETA_REFRESH_INTERVAL
    );
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
