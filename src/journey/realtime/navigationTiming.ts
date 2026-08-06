export type DynamicDepartureStatus = 'live' | 'estimated';

export interface DynamicDepartureInput {
  nowMs: number;
  departureAtMs: number;
  walkMinutes: number;
  fallbackHeadwayMinutes: number;
}

export interface DynamicDepartureEstimate {
  departureAtMs: number;
  waitMinutes: number;
  catchable: boolean;
  status: DynamicDepartureStatus;
}

const MIN_HEADWAY_MINUTES = 2;
const BOARDING_BUFFER_MINUTES = 0.75;


/** Convert time-until-departure into actual waiting time after the access walk. */
export function waitAfterWalking(
  departureInMinutes: number,
  walkMinutes: number
): number {
  return Math.max(0, departureInMinutes - Math.max(0, walkMinutes));
}

/**
 * Re-evaluate whether the user can still reach the selected departure.
 * When it has become unreachable, roll forward by a transparent provider
 * headway estimate instead of pretending the missed vehicle is still usable.
 */
export function estimateDynamicDeparture(
  input: DynamicDepartureInput
): DynamicDepartureEstimate {
  const nowMs = Number.isFinite(input.nowMs) ? input.nowMs : Date.now();
  const walkMinutes = Math.max(0, input.walkMinutes);
  const headwayMinutes = Math.max(MIN_HEADWAY_MINUTES, input.fallbackHeadwayMinutes);
  const readyAtMs = nowMs + (walkMinutes + BOARDING_BUFFER_MINUTES) * 60_000;
  const baseDepartureAtMs = Math.max(nowMs, input.departureAtMs);

  if (baseDepartureAtMs >= readyAtMs) {
    return {
      departureAtMs: baseDepartureAtMs,
      waitMinutes: Math.max(0, (baseDepartureAtMs - nowMs) / 60_000 - walkMinutes),
      catchable: true,
      status: 'live',
    };
  }

  const headwayMs = headwayMinutes * 60_000;
  const missedByMs = readyAtMs - baseDepartureAtMs;
  const cycles = Math.max(1, Math.ceil(missedByMs / headwayMs));
  const nextDepartureAtMs = baseDepartureAtMs + cycles * headwayMs;

  return {
    departureAtMs: nextDepartureAtMs,
    waitMinutes: Math.max(0, (nextDepartureAtMs - nowMs) / 60_000 - walkMinutes),
    catchable: false,
    status: 'estimated',
  };
}

/** Return the remaining in-vehicle estimate after time spent in the riding phase. */
export function remainingRideMinutes(
  plannedRideMinutes: number,
  phaseStartedAtMs: number,
  nowMs: number
): number {
  const elapsedMinutes = Math.max(0, nowMs - phaseStartedAtMs) / 60_000;
  return Math.max(0, plannedRideMinutes - elapsedMinutes);
}
