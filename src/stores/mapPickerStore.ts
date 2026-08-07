import { create } from 'zustand';

export type MapPickTarget = 'from' | 'to';

export interface PendingMapPick {
  lat: number;
  lng: number;
  name: string;
  target: MapPickTarget;
}

interface MapPickerState {
  pending: PendingMapPick | null;
  setPending: (pick: PendingMapPick | null) => void;
  consumePending: () => PendingMapPick | null;
}

export const useMapPickerStore = create<MapPickerState>((set, get) => ({
  pending: null,
  setPending: (pending) => set({ pending }),
  consumePending: () => {
    const pending = get().pending;
    if (pending) set({ pending: null });
    return pending;
  },
}));
