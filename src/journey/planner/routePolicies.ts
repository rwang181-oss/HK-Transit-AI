import type { JourneyPolicy } from '@/src/journey/model/types';

export interface PolicyOption {
  totalMinutes: number;
  walkingMeters: number;
  waitMin: number;
  itinerary: {
    transfers: number;
    isDirect: boolean;
  };
}

function compareRecommended(a: PolicyOption, b: PolicyOption): number {
  if (a.itinerary.isDirect !== b.itinerary.isDirect) {
    const direct = a.itinerary.isDirect ? a : b;
    const transfer = a.itinerary.isDirect ? b : a;
    const directWins = direct.totalMinutes <= transfer.totalMinutes + 15;
    if (directWins) return a.itinerary.isDirect ? -1 : 1;
    return a.itinerary.isDirect ? 1 : -1;
  }

  if (a.itinerary.transfers !== b.itinerary.transfers) {
    return a.itinerary.transfers - b.itinerary.transfers;
  }
  if (a.totalMinutes !== b.totalMinutes) return a.totalMinutes - b.totalMinutes;
  if (a.walkingMeters !== b.walkingMeters) return a.walkingMeters - b.walkingMeters;
  return a.waitMin - b.waitMin;
}

export function applyJourneyPolicy<T extends PolicyOption>(
  options: T[],
  policy: JourneyPolicy
): T[] {
  const visible = policy === 'oneTransfer'
    ? options.filter((option) => option.itinerary.transfers <= 1)
    : [...options];

  return visible.sort((a, b) => {
    switch (policy) {
      case 'direct':
        if (a.itinerary.isDirect !== b.itinerary.isDirect) {
          return a.itinerary.isDirect ? -1 : 1;
        }
        return compareRecommended(a, b);
      case 'fastest':
        return (
          a.totalMinutes - b.totalMinutes ||
          a.itinerary.transfers - b.itinerary.transfers ||
          a.walkingMeters - b.walkingMeters
        );
      case 'lessWalking':
        return (
          a.walkingMeters - b.walkingMeters ||
          a.itinerary.transfers - b.itinerary.transfers ||
          a.totalMinutes - b.totalMinutes
        );
      case 'oneTransfer':
      case 'recommended':
      default:
        return compareRecommended(a, b);
    }
  });
}
