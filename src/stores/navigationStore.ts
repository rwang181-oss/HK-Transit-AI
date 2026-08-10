import { create } from 'zustand';
import * as Location from 'expo-location';
import type { EtaStatus, JourneyOption, TripPoint } from '@/src/stores/journeyStore';
import type { IndexedJourneyOption } from '@/src/journey/index/types';
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
import {
  advanceNavigationProgress,
  resolveRemainingNavigationSegments,
  resolveNavigationTarget,
  type NavigationPhase,
} from '@/src/journey/realtime/navigationProgress';

export type { NavigationPhase } from '@/src/journey/realtime/navigationProgress';

type NavigationJourneyOption = JourneyOption | IndexedJourneyOption;

interface NavigationState {
  phase: NavigationPhase;
  activeLegIndex: number;
  phaseStartedAtMs: number | null;
  option: NavigationJourneyOption | null;
  destination: TripPoint | null;
  currentPosition: { lat: number; lng: number } | null;
  speed: WalkingSpeedState;
  liveArrival: JourneyArrivalWindow | null;
  liveWaitMinutes: number;
  liveCatchable: boolean;
  liveDepartureStatus: EtaStatus;
  error: string | null;
  start: (option: NavigationJourneyOption, destination: TripPoint) => Promise<void>;
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
let navigationGeneration = 0;
const TRANSFER_HEADWAY_MINUTES: Record<string, number> = {
  KMB: 8,
  CTB: 8,
  GMB: 10,
  MTR: 4,
};

function calculateLiveTiming(
  phase: NavigationPhase,
  activeLegIndex: number,
  phaseStartedAtMs: number,
  option: NavigationJourneyOption,
  destination: TripPoint,
  position: { lat: number; lng: number } | null,
  speed: WalkingSpeedState,
  nowMs = Date.now()
): LiveTiming {
  const segment = resolveRemainingNavigationSegments(
    { phase, activeLegIndex },
    option.itinerary.legs
  );
  const rideLegs = option.itinerary.legs.filter((leg) => leg.kind === 'ride');
  const currentRide = rideLegs[activeLegIndex];
  const previousRide = rideLegs[activeLegIndex - 1];
  const transferCoordinatesAreValid = previousRide && currentRide &&
    Number.isFinite(previousRide.toLat) && Number.isFinite(previousRide.toLng) &&
    Number.isFinite(currentRide.fromLat) && Number.isFinite(currentRide.fromLng) &&
    previousRide.toLat !== 0 && previousRide.toLng !== 0 &&
    currentRide.fromLat !== 0 && currentRide.fromLng !== 0;
  const fallbackTransferMeters = transferCoordinatesAreValid
    ? haversineMeters(
        previousRide.toLat,
        previousRide.toLng,
        currentRide.fromLat,
        currentRide.fromLng
      )
    : segment.accessTransferMinutes * 70;
  const target = resolveNavigationTarget(
    { phase, activeLegIndex },
    option.itinerary.legs,
    destination
  );
  const toTransitTargetMeters = position && target
    ? haversineMeters(position.lat, position.lng, target.lat, target.lng)
    : phase === 'walkingTransfer'
      ? fallbackTransferMeters
      : option.walkToStationMeters;
  const toDestinationMeters = position
    ? haversineMeters(position.lat, position.lng, destination.lat, destination.lng)
    : option.walkFromStationMeters;
  const walkToBoardMinutes = estimateRemainingWalkMinutes(
    Math.max(0, toTransitTargetMeters),
    speed.speedMps
  );
  const boardingWalkMinutes = phase === 'walkingToTransit' || phase === 'walkingTransfer'
    ? walkToBoardMinutes
    : 0;
  const isLaterBoarding = activeLegIndex > 0 &&
    (phase === 'walkingTransfer' || phase === 'waiting');
  const fallbackHeadwayMinutes = isLaterBoarding
    ? TRANSFER_HEADWAY_MINUTES[currentRide?.provider] ?? option.fallbackHeadwayMinutes
    : option.fallbackHeadwayMinutes;
  const dynamicDeparture = isLaterBoarding
    ? {
        ...estimateDynamicDeparture({
          nowMs,
          departureAtMs: phaseStartedAtMs + fallbackHeadwayMinutes * 60_000,
          walkMinutes: boardingWalkMinutes,
          fallbackHeadwayMinutes,
        }),
        status: 'estimated' as const,
      }
    : estimateDynamicDeparture({
        nowMs,
        departureAtMs: option.departureAtMs,
        walkMinutes: boardingWalkMinutes,
        fallbackHeadwayMinutes: option.fallbackHeadwayMinutes,
      });
  const currentRideMinutes = currentRide?.minutes || 0;
  const totalTransferCount = Math.max(0, rideLegs.length - 1);
  const remainingTransferWaitMinutes = totalTransferCount > 0
    ? option.transferWaitMinutes * segment.transferCount / totalTransferCount
    : 0;
  const remainingTransferBufferMinutes = segment.transferMinutes + remainingTransferWaitMinutes;

  let remainingWalkMeters = 0;
  let remainingWaitMinutes = 0;
  let remainingRide = 0;
  let transferBufferMinutes = 0;

  switch (phase) {
    case 'walkingToTransit':
    case 'walkingTransfer':
      remainingWalkMeters = Math.max(0, toTransitTargetMeters) + option.walkFromStationMeters;
      remainingWaitMinutes = dynamicDeparture.waitMinutes;
      remainingRide = segment.rideMinutes;
      transferBufferMinutes = remainingTransferBufferMinutes;
      break;
    case 'waiting':
      remainingWalkMeters = option.walkFromStationMeters;
      remainingWaitMinutes = dynamicDeparture.waitMinutes;
      remainingRide = segment.rideMinutes;
      transferBufferMinutes = remainingTransferBufferMinutes;
      break;
    case 'riding':
      remainingWalkMeters = option.walkFromStationMeters;
      remainingRide = remainingRideMinutes(currentRideMinutes, phaseStartedAtMs, nowMs) +
        Math.max(0, segment.rideMinutes - currentRideMinutes);
      transferBufferMinutes = remainingTransferBufferMinutes;
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
    catchable: phase === 'walkingToTransit' || phase === 'walkingTransfer' || phase === 'waiting'
      ? dynamicDeparture.catchable
      : true,
    departureStatus: phase === 'walkingToTransit' || phase === 'walkingTransfer' || phase === 'waiting'
      ? dynamicDeparture.status
      : option.waitStatus,
  };
}

export const useNavigationStore = create<NavigationState>((set, get) => ({
  phase: 'idle',
  activeLegIndex: 0,
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
    const generation = ++navigationGeneration;
    const phase: NavigationPhase = 'walkingToTransit';
    const activeLegIndex = 0;
    const phaseStartedAtMs = Date.now();
    const speed = createWalkingSpeedState();
    const timing = calculateLiveTiming(
      phase,
      activeLegIndex,
      phaseStartedAtMs,
      option,
      destination,
      null,
      speed,
      phaseStartedAtMs
    );
    set({
      phase,
      activeLegIndex,
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

    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (generation !== navigationGeneration) return;
      if (permission.status !== 'granted') {
        set({ error: 'locationPermissionDenied' });
        return;
      }

      const nextSubscription = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.Balanced,
          timeInterval: 5_000,
          distanceInterval: 5,
        },
        (location) => {
          if (generation !== navigationGeneration) return;
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
          let activeLegIndex = current.activeLegIndex;
          let phaseStartedAtMs = current.phaseStartedAtMs || nowMs;
          const target = resolveNavigationTarget(
            { phase, activeLegIndex },
            current.option.itinerary.legs,
            current.destination
          );

          if (
            (phase === 'walkingToTransit' || phase === 'walkingTransfer') &&
            target &&
            haversineMeters(
              position.lat,
              position.lng,
              target.lat,
              target.lng
            ) <= 80
          ) {
            const progress = advanceNavigationProgress(
              { phase, activeLegIndex },
              current.option.itinerary.legs
            );
            phase = progress.phase;
            activeLegIndex = progress.activeLegIndex;
          }
          if (
            phase === 'walkingToDestination' &&
            target &&
            haversineMeters(
              position.lat,
              position.lng,
              target.lat,
              target.lng
            ) <= 45
          ) {
            const progress = advanceNavigationProgress(
              { phase, activeLegIndex },
              current.option.itinerary.legs
            );
            phase = progress.phase;
            activeLegIndex = progress.activeLegIndex;
          }

          const timing = calculateLiveTiming(
            phase,
            activeLegIndex,
            phaseStartedAtMs,
            current.option,
            current.destination,
            position,
            updatedSpeed,
            nowMs
          );
          set({
            phase,
            activeLegIndex,
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
      if (generation !== navigationGeneration) {
        nextSubscription.remove();
        return;
      }
      subscription = nextSubscription;
    } catch {
      if (generation !== navigationGeneration) return;
      subscription?.remove();
      subscription = null;
      set({ error: 'locationTrackingFailed' });
    }
  },

  stop: () => {
    navigationGeneration += 1;
    subscription?.remove();
    subscription = null;
    set({
      phase: 'idle',
      activeLegIndex: 0,
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
    const progress = advanceNavigationProgress(
      { phase: current.phase, activeLegIndex: current.activeLegIndex },
      current.option.itinerary.legs
    );
    const nowMs = Date.now();
    const phaseStartedAtMs = progress.phase === 'riding' || progress.phase === 'walkingTransfer'
      ? nowMs
      : current.phaseStartedAtMs ?? nowMs;
    const timing = calculateLiveTiming(
      progress.phase,
      progress.activeLegIndex,
      phaseStartedAtMs,
      current.option,
      current.destination,
      current.currentPosition,
      current.speed,
      nowMs
    );
    set({
      phase: progress.phase,
      activeLegIndex: progress.activeLegIndex,
      phaseStartedAtMs,
      liveArrival: timing.arrival,
      liveWaitMinutes: timing.waitMinutes,
      liveCatchable: timing.catchable,
      liveDepartureStatus: timing.departureStatus,
    });
  },
}));
