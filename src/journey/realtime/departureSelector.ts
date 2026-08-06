export interface DepartureSelection {
  minutes: number;
  status: 'live' | 'estimated' | 'unavailable';
  catchable: boolean;
}

/**
 * Pick the first live departure the user can reasonably reach. When every
 * currently published departure is too soon, use a transparent next-service
 * estimate instead of ranking an impossible departure as the fastest option.
 */
export function selectDepartureEstimate(
  liveMinutes: number[],
  walkToMinutes: number,
  fallbackHeadwayMinutes: number
): DepartureSelection {
  const valid = liveMinutes
    .filter((minutes) => Number.isFinite(minutes) && minutes >= 0)
    .sort((a, b) => a - b);
  if (!valid.length) {
    return {
      minutes:
        Math.ceil(Math.max(0, walkToMinutes)) +
        Math.max(1, Math.ceil(fallbackHeadwayMinutes)),
      status: 'estimated',
      catchable: true,
    };
  }

  const boardingBuffer = Math.ceil(Math.max(0, walkToMinutes) + 1);
  const reachable = valid.find((minutes) => minutes >= boardingBuffer);
  if (reachable != null) {
    return { minutes: reachable, status: 'live', catchable: true };
  }

  return {
    minutes: Math.ceil(Math.max(0, walkToMinutes)) + Math.max(1, Math.ceil(fallbackHeadwayMinutes)),
    status: 'estimated',
    catchable: false,
  };
}
