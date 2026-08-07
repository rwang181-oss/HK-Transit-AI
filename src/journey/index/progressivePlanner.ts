import type { JourneyPolicy } from '../model/types';
import type { ProviderId, TransitProvider } from '../providers/types';
import { selectDepartureEstimate } from '../realtime/departureSelector';
import { loadJourneyIndex } from './loader';
import { planFastJourney } from './fastPlanner';
import {
  refineJourneyOptions,
  type RefineJourneyDependencies,
} from './refinePlanner';
import type {
  IndexedJourneyOption,
  JourneyIndexBundle,
  JourneyPoint,
} from './types';

const DEFAULT_WAIT_MINUTES: Record<ProviderId, number> = {
  KMB: 8,
  CTB: 8,
  GMB: 10,
  MTR: 4,
};

export interface ProgressiveJourneySession {
  initial: Promise<IndexedJourneyOption[]>;
  refined: Promise<IndexedJourneyOption[]>;
}

export interface ProgressivePlannerDeps {
  loadIndex?: () => Promise<JourneyIndexBundle>;
  planFast?: (
    index: JourneyIndexBundle,
    from: JourneyPoint,
    to: JourneyPoint,
    policy: JourneyPolicy
  ) => IndexedJourneyOption[];
  refine?: (
    index: JourneyIndexBundle,
    initial: IndexedJourneyOption[],
    from: JourneyPoint,
    to: JourneyPoint,
    policy: JourneyPolicy,
    deps: RefineJourneyDependencies
  ) => Promise<IndexedJourneyOption[]>;
  refinementDeps?: RefineJourneyDependencies;
}

export interface ProductionRefinementOverrides {
  routeWalking?: RefineJourneyDependencies['routeWalking'];
  getProvider?: (providerId: ProviderId) => Promise<TransitProvider>;
  now?: () => number;
}

/**
 * Create Stage-2-only network adapters. Constructing these adapters performs no
 * import with provider topology side effects and no network request; walking
 * and ETA services are touched only after the Stage-1 promise has resolved.
 */
export function createProductionRefinementDeps(
  overrides: ProductionRefinementOverrides = {}
): RefineJourneyDependencies {
  const now = overrides.now || Date.now;
  const routeWalking: RefineJourneyDependencies['routeWalking'] =
    overrides.routeWalking ||
    (async (from, to) => {
      const { walkingRouter } = await import('../walking/walkingRouter');
      return walkingRouter.route(from, to);
    });

  const getProviderImpl =
    overrides.getProvider ||
    (async (providerId: ProviderId) => {
      const { getProvider } = await import('../providers');
      return getProvider(providerId);
    });

  const fetchDeparture: RefineJourneyDependencies['fetchDeparture'] = async (
    providerId,
    route,
    bound,
    stopId,
    walkMinutes
  ) => {
    const requestedAtMs = now();
    const fallbackHeadway = DEFAULT_WAIT_MINUTES[providerId];
    const fallback = () => {
      const selected = selectDepartureEstimate([], walkMinutes, fallbackHeadway);
      return {
        ...selected,
        status: 'unavailable' as const,
        departureAtMs: requestedAtMs + selected.minutes * 60_000,
      };
    };

    if (!stopId) return fallback();

    try {
      const provider = await getProviderImpl(providerId);
      const etaRows = await provider.fetchETA(stopId, route);
      const liveMinutes = etaRows
        .filter((row) => !row.bound || row.bound === bound)
        .map((row) => Math.ceil((new Date(row.eta).getTime() - requestedAtMs) / 60_000))
        .filter((minutes) => Number.isFinite(minutes) && minutes >= 0)
        .sort((a, b) => a - b);
      const selected = selectDepartureEstimate(liveMinutes, walkMinutes, fallbackHeadway);
      return {
        ...selected,
        departureAtMs: requestedAtMs + selected.minutes * 60_000,
      };
    } catch {
      return fallback();
    }
  };

  return { routeWalking, fetchDeparture };
}

export function createProgressiveJourneySession(
  from: JourneyPoint,
  to: JourneyPoint,
  policy: JourneyPolicy,
  deps: ProgressivePlannerDeps = {}
): ProgressiveJourneySession {
  const loadIndex = deps.loadIndex || (() => loadJourneyIndex());
  const planFast = deps.planFast || planFastJourney;
  const refine = deps.refine || refineJourneyOptions;
  const refinementDeps = deps.refinementDeps || createProductionRefinementDeps();

  const indexPromise = loadIndex();
  const initial = indexPromise.then((index) => planFast(index, from, to, policy));
  const refined = initial.then(async (initialOptions) => {
    // Give the consumer of `initial` a chance to render before Stage 2 starts.
    await Promise.resolve();
    const index = await indexPromise;
    return refine(index, initialOptions, from, to, policy, refinementDeps);
  });

  return { initial, refined };
}
