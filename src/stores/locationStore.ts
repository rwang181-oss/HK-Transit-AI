import { create } from 'zustand';
import * as Location from 'expo-location';

export type LocationStatus =
  | 'idle'
  | 'requesting'
  | 'locating'
  | 'tracking'
  | 'denied'
  | 'timedOut'
  | 'unavailable'
  | 'failed';

export type LocationError = 'denied' | 'timedOut' | 'unavailable' | 'failed';

export interface LocationPosition {
  lat: number;
  lng: number;
}

export interface LocationSample {
  position: LocationPosition;
  accuracyMeters: number | null;
  speedMps: number | null;
  timestampMs: number;
}

type SampleListener = (sample: LocationSample) => void;

interface LocationState {
  position: LocationPosition | null;
  latestSample: LocationSample | null;
  status: LocationStatus;
  error: LocationError | null;
  requestError: LocationError | null;
  permissionGranted: boolean;
  loading: boolean;
  locateOnce: () => Promise<LocationSample | null>;
  startTracking: () => Promise<LocationSample | null>;
  stopTracking: () => void;
  retryLocate: () => Promise<LocationSample | null>;
  retryTracking: () => Promise<LocationSample | null>;
  subscribeSamples: (listener: SampleListener) => () => void;
}

const FIRST_FIX_TIMEOUT_MS = 12_000;
const LAST_KNOWN_MAX_AGE_MS = 60_000;
const LAST_KNOWN_MAX_ACCURACY_METERS = 100;
const listeners = new Set<SampleListener>();
let subscription: Location.LocationSubscription | null = null;
let acquisitionGeneration = 0;
let trackingGeneration = 0;
let lifecycleGeneration = 0;
let pendingTimeout: ReturnType<typeof setTimeout> | null = null;
let settlePendingAcquisition: ((location: Location.LocationObject | null) => void) | null = null;

function toSample(location: Location.LocationObject): LocationSample {
  return {
    position: {
      lat: location.coords.latitude,
      lng: location.coords.longitude,
    },
    accuracyMeters: location.coords.accuracy ?? null,
    speedMps: location.coords.speed ?? null,
    timestampMs: location.timestamp || Date.now(),
  };
}

export function isUsableLocationSample(
  sample: LocationSample | null,
  nowMs = Date.now()
): sample is LocationSample {
  if (!sample) return false;
  const ageMs = nowMs - sample.timestampMs;
  const accuracy = sample.accuracyMeters;
  return ageMs >= 0 && ageMs <= LAST_KNOWN_MAX_AGE_MS &&
    typeof accuracy === 'number' && accuracy <= LAST_KNOWN_MAX_ACCURACY_METERS;
}

function isRecentAccurateLocation(location: Location.LocationObject | null): location is Location.LocationObject {
  return Boolean(location && isUsableLocationSample(toSample(location)));
}

function classifyFailure(error: unknown): LocationError {
  const message = String(error).toLowerCase();
  return message.includes('unavailable') || message.includes('provider')
    ? 'unavailable'
    : 'failed';
}

function stopSubscription(): void {
  subscription?.remove();
  subscription = null;
}

function notify(sample: LocationSample): void {
  for (const listener of listeners) listener(sample);
}

function cancelPendingAcquisition(): void {
  if (pendingTimeout !== null) clearTimeout(pendingTimeout);
  pendingTimeout = null;
  const settle = settlePendingAcquisition;
  settlePendingAcquisition = null;
  settle?.(null);
}

function waitForCurrentPosition(): Promise<Location.LocationObject | null> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (location: Location.LocationObject | null) => {
      if (settled) return;
      settled = true;
      if (pendingTimeout !== null) clearTimeout(pendingTimeout);
      pendingTimeout = null;
      settlePendingAcquisition = null;
      resolve(location);
    };
    settlePendingAcquisition = finish;
    pendingTimeout = setTimeout(() => finish(null), FIRST_FIX_TIMEOUT_MS);
    Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })
      .then(finish)
      .catch((error) => {
        if (settled) return;
        settled = true;
        if (pendingTimeout !== null) clearTimeout(pendingTimeout);
        pendingTimeout = null;
        settlePendingAcquisition = null;
        reject(error);
      });
  });
}

export const useLocationStore = create<LocationState>((set, get) => {
  let operationActive = false;
  const operationQueue: Array<() => void> = [];
  let pendingLocate: Promise<LocationSample | null> | null = null;
  let pendingTrack: Promise<LocationSample | null> | null = null;
  const publish = (sample: LocationSample, nextStatus: LocationStatus) => {
    set({
      position: sample.position,
      latestSample: sample,
      status: nextStatus,
      error: null,
      loading: nextStatus === 'requesting' || nextStatus === 'locating',
    });
    notify(sample);
  };

  const requestAndLocate = async (tracking: boolean): Promise<LocationSample | null> => {
    const activeTracking = subscription !== null;
    set({ requestError: null });
    if (!tracking && activeTracking && isUsableLocationSample(get().latestSample)) {
      return get().latestSample;
    }
    const requestGeneration = ++acquisitionGeneration;
    if (tracking) {
      stopSubscription();
      trackingGeneration += 1;
    }
    if (!activeTracking || tracking) set({ status: 'requesting', error: null, loading: true });

    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (requestGeneration !== acquisitionGeneration) return null;
      if (permission.status !== 'granted') {
        set({ requestError: 'denied' });
        if (!activeTracking || tracking) {
          set({ permissionGranted: false, status: 'denied', error: 'denied', loading: false });
        }
        return null;
      }
      if (!activeTracking || tracking) {
        set({ permissionGranted: true, status: 'locating', error: null, loading: true });
      }

      try {
        const lastKnown = await Location.getLastKnownPositionAsync();
        if (requestGeneration !== acquisitionGeneration) return null;
        if (isRecentAccurateLocation(lastKnown) && (!activeTracking || tracking)) {
          publish(toSample(lastKnown), 'locating');
        }
      } catch {
        // A missing cached location never prevents a fresh foreground request.
      }

      let current: Location.LocationObject | null;
      try {
        current = await waitForCurrentPosition();
      } catch (error) {
        if (requestGeneration !== acquisitionGeneration) return null;
        const status = classifyFailure(error);
        set({ requestError: status });
        if (!activeTracking || tracking) set({ status, error: status, loading: false });
        return null;
      }
      if (requestGeneration !== acquisitionGeneration) return null;
      if (!current) {
        set({ requestError: 'timedOut' });
        if (!activeTracking || tracking) set({ status: 'timedOut', error: 'timedOut', loading: false });
        return null;
      }

      const currentSample = toSample(current);
      if (!activeTracking || tracking) publish(currentSample, tracking ? 'locating' : 'idle');
      if (!tracking) return currentSample;

      try {
        const requestTrackingGeneration = trackingGeneration;
        const nextSubscription = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.Balanced,
            timeInterval: 5_000,
            distanceInterval: 5,
          },
          (location) => {
            if (requestTrackingGeneration !== trackingGeneration) return;
            publish(toSample(location), 'tracking');
          }
        );
        if (requestGeneration !== acquisitionGeneration || requestTrackingGeneration !== trackingGeneration) {
          nextSubscription.remove();
          return null;
        }
        subscription = nextSubscription;
        set({ status: 'tracking', error: null, loading: false });
        return currentSample;
      } catch (error) {
        if (requestGeneration !== acquisitionGeneration) return null;
        const status = classifyFailure(error);
        set({ requestError: status });
        set({ status, error: status, loading: false });
        return null;
      }
    } catch (error) {
      if (requestGeneration !== acquisitionGeneration) return null;
      const status = classifyFailure(error);
      set({ requestError: status });
      if (!activeTracking || tracking) set({ status, error: status, loading: false });
      return null;
    }
  };

  const enqueueAcquisition = (tracking: boolean): Promise<LocationSample | null> => {
    const existing = tracking ? pendingTrack : pendingLocate;
    if (existing) return existing;

    const requestedLifecycle = lifecycleGeneration;
    let operation: Promise<LocationSample | null>;
    operation = new Promise((resolve) => {
      const run = () => {
        if (requestedLifecycle !== lifecycleGeneration) {
          resolve(null);
          if (tracking && pendingTrack === operation) pendingTrack = null;
          if (!tracking && pendingLocate === operation) pendingLocate = null;
          operationQueue.shift()?.();
          return;
        }
        operationActive = true;
        const finish = () => {
          operationActive = false;
          if (tracking && pendingTrack === operation) pendingTrack = null;
          if (!tracking && pendingLocate === operation) pendingLocate = null;
          operationQueue.shift()?.();
        };
        void requestAndLocate(tracking)
          .then(
            (result) => {
              finish();
              resolve(result);
            },
            () => {
              finish();
              resolve(null);
            }
          );
      };
      if (operationActive) operationQueue.push(run);
      else run();
    });
    if (tracking) pendingTrack = operation;
    else pendingLocate = operation;
    return operation;
  };

  return {
    position: null,
    latestSample: null,
    status: 'idle',
    error: null,
    requestError: null,
    permissionGranted: false,
    loading: false,
    locateOnce: () => enqueueAcquisition(false),
    startTracking: () => enqueueAcquisition(true),
    stopTracking: () => {
      lifecycleGeneration += 1;
      acquisitionGeneration += 1;
      trackingGeneration += 1;
      cancelPendingAcquisition();
      stopSubscription();
      set({ status: 'idle', error: null, requestError: null, loading: false });
    },
    retryLocate: () => enqueueAcquisition(false),
    retryTracking: () => enqueueAcquisition(true),
    subscribeSamples: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
});
