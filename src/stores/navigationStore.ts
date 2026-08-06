import { create } from 'zustand';
import * as Location from 'expo-location';
import type { EtaStatus, JourneyOption, TripPoint } from '@/src/stores/journeyStore';
import {
  createWalkingSpeedState,
  estimateRemainingWalkMinutes,
  recalculateJourneyEta,
  updateWalkingSpeed,
  type WalkingSpeedState,
} from '@/src/journey/realtime/etaEstimator';
import {
  estimateDynamicDeparture,
  remainingRideMinutes,
} from '@/src/journey/realtime/navigationTiming';
import { haversineMeters } from '@/src/journey/graph/travelTime';
import type { JourneyArrivalWindow } from '@/src/journey/model/types';

export type NavigationPhase =
  | 'idle'
  | 'walkingToTransit'
  | 'waiting'
  | 'riding'
  | 'walkingToDestination'
  | 'arrived';

interface NavigationState {
  phase: NavigationPhase;
  phaseStartedAtMs: number | null;
  option: JourneyOption | null;
  destination: TripPoint | null;
  currentPosition: { lat: number; lng: number } | null;
  speed: WalkingSpeedState;
  liveArrival: JourneyArrivalWindow | null;
  liveWaitMinutes: number;
  liveCatchable: boolean;
  liveDepartureStatus: EtaStatus;
  error: string | null;
  start: (option: JourneyOption, destination: TripPoint) => Promise<void>;
  stop: () => void;
  advancePhase: () => void;
}

interface LiveTiming {
  arrival: JourneyArrivalWindow;
  waitMinutes: number;
  catchable: boolean;
  departureStatus: EtaStatus;
}

let subscription: Location.LocationSubscription | null = null;

function nextPhase(phase: NavigationPhase): NavigationPhase {
  switch (phase) {
    case 'walkingToTransit': return 'waiting';
    case 'waiting': return 'riding';
    case 'riding': return 'walkingToDestination';
    case 'walkingToDestination': return 'arrived';
    default: return phase;
  }
}

function calculateLiveTiming(
  phase: NavigationPhase,
  phaseStartedAtMs: number,
  option: JourneyOption,
  destination: TripPoint,
  position: { lat: number; lng: number } | null,
  speed: WalkingSpeedState,
  nowMs = Date.now()
): LiveTiming {
  const toBoardMeters = position
    ? haversineMeters(position.lat, position.lng, option.boardHub.lat, option.boardHub.lng)
    : option.walkToStationMeters;
  const toDestinationMeters = position
    ? haversineMeters(position.lat, position.lng, destination.lat, destination.lng)
    : option.walkFromStationMeters;
  const walkToBoardMinutes = estimateRemainingWalkMinutes(
    Math.max(0, toBoardMeters),
    speed.speedMps
  );
  const dynamicDeparture = estimateDynamicDeparture({
    nowMs,
    departureAtMs: option.departureAtMs,
    walkMinutes: phase === 'walkingToTransit' ? walkToBoardMinutes : 0,
    fallbackHeadwayMinutes: option.fallbackHeadwayMinutes,
  });

  let remainingWalkMeters = 0;
  let remainingWaitMinutes = 0;
  let remainingRide = 0;
  let transferBufferMinutes = 0;

  switch (phase) {
    case 'walkingToTransit':
      remainingWalkMeters = Math.max(0, toBoardMeters) + option.walkFromStationMeters;
      remainingWaitMinutes = dynamicDeparture.waitMinutes;
      remainingRide = option.rideMinutes;
      transferBufferMinutes = option.transferMinutes + option.transferWaitMinutes;
      break;
    case 'waiting':
      remainingWalkMeters = option.walkFromStationMeters;
      remainingWaitMinutes = dynamicDeparture.waitMinutes;
      remainingRide = option.rideMinutes;
      transferBufferMinutes = option.transferMinutes + option.transferWaitMinutes;
      break;
    case 'riding':
      remainingWalkMeters = option.walkFromStationMeters;
      remainingRide = remainingRideMinutes(option.rideMinutes, phaseStartedAtMs, nowMs);
      transferBufferMinutes = option.transferMinutes + option.transferWaitMinutes;
      break;
    case 'walkingToDestination':
      remainingWalkMeters = Math.max(0, toDestinationMeters);
      break;
    case 'arrived':
    case 'idle':
    default:
      break;
  }

  const arrival = recalculateJourneyEta({
    nowMs,
    remainingWalkMeters,
    walkingSpeedMps: speed.speedMps,
    remainingWaitMinutes,
    remainingRideMinutes: remainingRide,
    transferBufferMinutes,
    hasLiveSpeed: speed.acceptedSamples >= 2,
  });

  return {
    arrival,
    waitMinutes: remainingWaitMinutes,
    catchable: phase === 'walkingToTransit' || phase === 'waiting'
      ? dynamicDeparture.catchable
      : true,
    departureStatus: phase === 'walkingToTransit' || phase === 'waiting'
      ? dynamicDeparture.status
      : option.waitStatus,
  };
}

export const useNavigationStore = create<NavigationState>((set, get) => ({
  phase: 'idle',
  phaseStartedAtMs: null,
  option: null,
  destination: null,
  currentPosition: null,
  speed: createWalkingSpeedState(),
  liveArrival: null,
  liveWaitMinutes: 0,
  liveCatchable: true,
  liveDepartureStatus: 'estimated',
  error: null,

  start: async (option, destination) => {
    subscription?.remove();
    subscription = null;
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== 'granted') {
        set({ error: 'locationPermissionDenied' });
        return;
      }

      const phase: NavigationPhase = 'walkingToTransit';
      const phaseStartedAtMs = Date.now();
      const speed = createWalkingSpeedState();
      const timing = calculateLiveTiming(
        phase,
        phaseStartedAtMs,
        option,
        destination,
        null,
        speed,
        phaseStartedAtMs
      );
      set({
        phase,
        phaseStartedAtMs,
        option,
        destination,
        currentPosition: null,
        speed,
        liveArrival: timing.arrival,
        liveWaitMinutes: timing.waitMinutes,
        liveCatchable: timing.catchable,
        liveDepartureStatus: timing.departureStatus,
        error: null,
      });

      subscription = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.Balanced,
          timeInterval: 5_000,
          distanceInterval: 5,
        },
        (location) => {
          const position = {
            lat: location.coords.latitude,
            lng: location.coords.longitude,
          };
          const current = get();
          if (!current.option || !current.destination) return;

          const nowMs = location.timestamp || Date.now();
          const updatedSpeed = updateWalkingSpeed(current.speed, {
            speedMps: location.coords.speed,
            accuracyMeters: location.coords.accuracy,
            timestampMs: nowMs,
          });
          let phase = current.phase;
          let phaseStartedAtMs = current.phaseStartedAtMs || nowMs;

          if (
            phase === 'walkingToTransit' &&
            haversineMeters(
              position.lat,
              position.lng,
              current.option.boardHub.lat,
              current.option.boardHub.lng
            ) <= 80
          ) {
            phase = 'waiting';
            phaseStartedAtMs = nowMs;
          }
          if (
            phase === 'walkingToDestination' &&
            haversineMeters(
              position.lat,
              position.lng,
              current.destination.lat,
              current.destination.lng
            ) <= 45
          ) {
            phase = 'arrived';
            phaseStartedAtMs = nowMs;
          }

          const timing = calculateLiveTiming(
            phase,
            phaseStartedAtMs,
            current.option,
            current.destination,
            position,
            updatedSpeed,
            nowMs
          );
          set({
            phase,
            phaseStartedAtMs,
            currentPosition: position,
            speed: updatedSpeed,
            liveArrival: timing.arrival,
            liveWaitMinutes: timing.waitMinutes,
            liveCatchable: timing.catchable,
            liveDepartureStatus: timing.departureStatus,
          });
        }
      );
    } catch {
      subscription?.remove();
      subscription = null;
      set({ error: 'locationTrackingFailed' });
    }
  },

  stop: () => {
    subscription?.remove();
    subscription = null;
    set({
      phase: 'idle',
      phaseStartedAtMs: null,
      option: null,
      destination: null,
      currentPosition: null,
      speed: createWalkingSpeedState(),
      liveArrival: null,
      liveWaitMinutes: 0,
      liveCatchable: true,
      liveDepartureStatus: 'estimated',
      error: null,
    });
  },

  advancePhase: () => {
    const current = get();
    if (!current.option || !current.destination) return;
    const phase = nextPhase(current.phase);
    const phaseStartedAtMs = Date.now();
    const timing = calculateLiveTiming(
      phase,
      phaseStartedAtMs,
      current.option,
      current.destination,
      current.currentPosition,
      current.speed,
      phaseStartedAtMs
    );
    set({
      phase,
      phaseStartedAtMs,
      liveArrival: timing.arrival,
      liveWaitMinutes: timing.waitMinutes,
      liveCatchable: timing.catchable,
      liveDepartureStatus: timing.departureStatus,
    });
  },
}));
