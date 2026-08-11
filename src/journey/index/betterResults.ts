import type { JourneyPolicy } from '../model/types';
import { applyJourneyPolicy } from '../planner/routePolicies';
import { getRouteServiceKey } from '../providers/types';
import type { IndexedJourneyOption } from './types';

const MIN_TIME_IMPROVEMENT_MINUTES = 5;
const MIN_WALKING_IMPROVEMENT_METERS = 300;

export function journeyServiceSignature(option: Pick<IndexedJourneyOption, 'itinerary'>): string {
  return option.itinerary.legs
    .filter((leg) => leg.kind === 'ride')
    .map((leg) => getRouteServiceKey(leg.provider, leg.route, leg.bound, leg.routeVariant))
    .join('>');
}

function bestTransferCount(options: IndexedJourneyOption[]): number {
  if (!options.length) return Infinity;
  return Math.min(...options.map((option) => option.itinerary.transfers));
}

export function hasMeaningfullyBetterResults(
  current: IndexedJourneyOption[],
  refined: IndexedJourneyOption[],
  policy: JourneyPolicy
): boolean {
  if (!refined.length) return false;
  if (!current.length) return true;

  const currentHasDirect = current.some((option) => option.itinerary.isDirect);
  const refinedHasDirect = refined.some((option) => option.itinerary.isDirect);
  if (!currentHasDirect && refinedHasDirect) return true;

  const currentTransfers = bestTransferCount(current);
  const refinedTransfers = bestTransferCount(refined);
  if (refinedTransfers < currentTransfers) return true;

  const currentRanked = applyJourneyPolicy([...current], policy);
  const refinedRanked = applyJourneyPolicy([...refined], policy);
  const currentBest = currentRanked[0];
  const refinedBest = refinedRanked[0];
  if (!currentBest || !refinedBest) return false;

  if (
    refinedBest.itinerary.transfers === currentBest.itinerary.transfers &&
    currentBest.totalMinutes - refinedBest.totalMinutes >= MIN_TIME_IMPROVEMENT_MINUTES
  ) {
    return true;
  }

  if (
    policy === 'lessWalking' &&
    refinedBest.itinerary.transfers <= currentBest.itinerary.transfers &&
    currentBest.walkingMeters - refinedBest.walkingMeters >= MIN_WALKING_IMPROVEMENT_METERS
  ) {
    return true;
  }

  // IDs are deliberately ignored. Service signatures make the comparison
  // deterministic across refreshed objects while tiny ETA drift stays below
  // the explicit thresholds above.
  const currentSignatures = currentRanked.map(journeyServiceSignature).join('|');
  const refinedSignatures = refinedRanked.map(journeyServiceSignature).join('|');
  if (currentSignatures === refinedSignatures) return false;

  return false;
}
