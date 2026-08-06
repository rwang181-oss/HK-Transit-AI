import { create } from 'zustand';
import type { WeatherSnapshot } from '@/src/journey/model/types';
import { fallbackWeather, fetchCurrentWeather } from '@/src/services/weatherService';

interface WeatherState {
  weather: WeatherSnapshot;
  loading: boolean;
  refresh: () => Promise<void>;
}

export const useWeatherStore = create<WeatherState>((set) => ({
  weather: fallbackWeather(),
  loading: false,
  refresh: async () => {
    set({ loading: true });
    const weather = await fetchCurrentWeather();
    set({ weather, loading: false });
  },
}));
