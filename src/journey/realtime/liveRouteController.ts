import { haversineMeters } from '../graph/travelTime';
import type { Coordinate } from '../model/types';
import type { WalkingRoute } from '../walking/walkingRouter';
import type { NavigationPhase, NavigationTarget } from './navigationProgress';

export type LiveWalkingRoute = (
  from: Coordinate,
  to: Coordinate
) => Promise<WalkingRoute>;

export interface LiveRouteUpdate {
  phase: NavigationPhase;
  position: Coordinate | null;
  target: NavigationTarget | null;
}

export interface LiveRouteControllerOptions {
  thresholdMeters?: number;
}

interface PendingRoute {
  generation: number;
  position: Coordinate;
  target: NavigationTarget;
}

const DEFAULT_THRESHOLD_METERS = 25;

function isWalkingPhase(phase: NavigationPhase): boolean {
  return phase === 'walkingToTransit'
    || phase === 'walkingTransfer'
    || phase === 'walkingToDestination';
}

function isValidPoint(point: Coordinate | null): point is Coordinate {
  return point !== null
    && Number.isFinite(point.lat)
    && Number.isFinite(point.lng)
    && point.lat >= -90
    && point.lat <= 90
    && point.lng >= -180
    && point.lng <= 180;
}

function keyFor(phase: NavigationPhase, target: NavigationTarget): string {
  return [phase, target.kind, target.id, target.lat, target.lng].join(':');
}

export function createLiveRouteController(
  route: LiveWalkingRoute,
  onResult: (result: WalkingRoute) => void,
  options: LiveRouteControllerOptions = {}
) {
  const configuredThreshold = options.thresholdMeters ?? DEFAULT_THRESHOLD_METERS;
  const thresholdMeters = Number.isFinite(configuredThreshold)
    ? Math.max(0, configuredThreshold)
    : DEFAULT_THRESHOLD_METERS;
  let running = false;
  let queued: PendingRoute | null = null;
  let lastRequestedOrigin: Coordinate | null = null;
  let lastTargetKey: string | null = null;
  let generation = 0;

  const run = async (request: PendingRoute): Promise<void> => {
    running = true;
    try {
      const result = await route(request.position, {
        lat: request.target.lat,
        lng: request.target.lng,
      });
      if (request.generation === generation) onResult(result);
    } catch {
      // The walking router normally returns an estimated route on failure.
      // A rejected custom route must not block the next queued update.
    } finally {
      running = false;
      const next = queued;
      queued = null;
      if (next) void run(next);
    }
  };

  const invalidate = (): void => {
    generation += 1;
    queued = null;
    lastRequestedOrigin = null;
    lastTargetKey = null;
  };

  return {
    update(input: LiveRouteUpdate): void {
      if (
        !isWalkingPhase(input.phase)
        || !isValidPoint(input.position)
        || !input.target
        || !isValidPoint(input.target)
      ) {
        invalidate();
        return;
      }

      const targetKey = keyFor(input.phase, input.target);
      const contextChanged = targetKey !== lastTargetKey;
      const movedEnough = !lastRequestedOrigin || haversineMeters(
        lastRequestedOrigin.lat,
        lastRequestedOrigin.lng,
        input.position.lat,
        input.position.lng
      ) >= thresholdMeters;
      if (!contextChanged && !movedEnough) return;

      const request: PendingRoute = {
        generation: ++generation,
        position: { ...input.position },
        target: { ...input.target },
      };
      lastRequestedOrigin = request.position;
      lastTargetKey = targetKey;
      if (running) queued = request;
      else void run(request);
    },

    reset(): void {
      invalidate();
    },
  };
}
