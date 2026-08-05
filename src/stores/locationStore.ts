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
    set({
      permissionGranted: granted,
      error: granted ? null : 'Location permission denied',
    });
    return granted;
  },

  getPosition: async () => {
    set({ loading: true, error: null });
    try {
      const { coords } = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      set({
        position: { lat: coords.latitude, lng: coords.longitude },
        loading: false,
      });
    } catch (err) {
      set({ error: String(err), loading: false });
    }
  },
}));
