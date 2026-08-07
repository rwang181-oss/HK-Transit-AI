import type { JourneyPolicy } from '../model/types';
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

const FALLBACK_REFINEMENT_DEPS: RefineJourneyDependencies = {
  routeWalking: async () => {
    throw new Error('Walking enrichment unavailable');
  },
  fetchDeparture: async () => {
    throw new Error('ETA enrichment unavailable');
  },
};

export function createProgressiveJourneySession(
  from: JourneyPoint,
  to: JourneyPoint,
  policy: JourneyPolicy,
  deps: ProgressivePlannerDeps = {}
): ProgressiveJourneySession {
  const loadIndex = deps.loadIndex || (() => loadJourneyIndex());
  const planFast = deps.planFast || planFastJourney;
  const refine = deps.refine || refineJourneyOptions;
  const refinementDeps = deps.refinementDeps || FALLBACK_REFINEMENT_DEPS;

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
