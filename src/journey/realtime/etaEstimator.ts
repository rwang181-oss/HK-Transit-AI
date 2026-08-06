import type { JourneyArrivalWindow } from '@/src/journey/model/types';

export interface WalkingSpeedState {
  speedMps: number;
  acceptedSamples: number;
  lastTimestampMs: number | null;
}

export interface WalkingSpeedSample {
  speedMps: number | null;
  accuracyMeters: number | null;
  timestampMs: number;
}

const DEFAULT_SPEED_MPS = 1.25;
const MIN_WALKING_SPEED_MPS = 0.45;
const MAX_WALKING_SPEED_MPS = 2.8;
const MAX_ACCURACY_METERS = 65;
const SMOOTHING_ALPHA = 0.32;

export function createWalkingSpeedState(initialSpeedMps = DEFAULT_SPEED_MPS): WalkingSpeedState {
  return {
    speedMps: Math.min(MAX_WALKING_SPEED_MPS, Math.max(MIN_WALKING_SPEED_MPS, initialSpeedMps)),
    acceptedSamples: 0,
    lastTimestampMs: null,
  };
}

export function updateWalkingSpeed(
  state: WalkingSpeedState,
  sample: WalkingSpeedSample
): WalkingSpeedState {
  const speed = sample.speedMps;
  const accuracy = sample.accuracyMeters;
  const valid =
    speed != null &&
    Number.isFinite(speed) &&
    speed >= MIN_WALKING_SPEED_MPS &&
    speed <= MAX_WALKING_SPEED_MPS &&
    (accuracy == null || accuracy <= MAX_ACCURACY_METERS) &&
    (state.lastTimestampMs == null || sample.timestampMs > state.lastTimestampMs);

  if (!valid) return state;

  return {
    speedMps: state.speedMps * (1 - SMOOTHING_ALPHA) + speed * SMOOTHING_ALPHA,
    acceptedSamples: state.acceptedSamples + 1,
    lastTimestampMs: sample.timestampMs,
  };
}

export function estimateRemainingWalkMinutes(
  remainingMeters: number,
  walkingSpeedMps: number
): number {
  if (remainingMeters <= 0) return 0;
  const bounded = Math.min(MAX_WALKING_SPEED_MPS, Math.max(MIN_WALKING_SPEED_MPS, walkingSpeedMps));
  return remainingMeters / bounded / 60;
}

export interface RecalculateJourneyEtaInput {
  nowMs: number;
  remainingWalkMeters: number;
  walkingSpeedMps: number;
  remainingWaitMinutes: number;
  remainingRideMinutes: number;
  transferBufferMinutes: number;
  hasLiveSpeed?: boolean;
}

export function recalculateJourneyEta(input: RecalculateJourneyEtaInput): JourneyArrivalWindow {
  const walkingMinutes = estimateRemainingWalkMinutes(
    Math.max(0, input.remainingWalkMeters),
    input.walkingSpeedMps
  );
  const remainingMinutes = Math.max(
    0,
    walkingMinutes +
      Math.max(0, input.remainingWaitMinutes) +
      Math.max(0, input.remainingRideMinutes) +
      Math.max(0, input.transferBufferMinutes)
  );
  const uncertainty = Math.max(2, Math.min(12, remainingMinutes * (input.hasLiveSpeed ? 0.12 : 0.2)));
  const estimatedArrivalMs = input.nowMs + remainingMinutes * 60_000;

  return {
    remainingMinutes: Math.round(remainingMinutes),
    estimatedArrivalMs,
    earliestArrivalMs: estimatedArrivalMs - uncertainty * 60_000,
    latestArrivalMs: estimatedArrivalMs + uncertainty * 60_000,
    confidence: input.hasLiveSpeed ? 'live' : 'estimated',
  };
}
