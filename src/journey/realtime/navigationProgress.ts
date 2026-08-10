export type NavigationPhase =
  | 'idle'
  | 'walkingToTransit'
  | 'walkingTransfer'
  | 'waiting'
  | 'riding'
  | 'walkingToDestination'
  | 'arrived';

export interface NavigationProgress {
  phase: NavigationPhase;
  activeLegIndex: number;
}

export interface NavigationTarget {
  id: string;
  name: string;
  lat: number;
  lng: number;
  kind: 'stop' | 'end';
}

export interface RemainingNavigationSegments {
  rideMinutes: number;
  transferMinutes: number;
  transferCount: number;
  accessTransferMinutes: number;
}

interface NavigationLeg {
  kind: 'ride' | 'transfer';
  fromHubId: string;
  toHubId: string;
  fromName: string;
  toName: string;
  fromLat: number;
  fromLng: number;
  toLat: number;
  toLng: number;
  minutes: number;
}

interface DestinationTarget {
  lat: number;
  lng: number;
  name: string;
}

function rideLegs(legs: NavigationLeg[]): NavigationLeg[] {
  return legs.filter((leg) => leg.kind === 'ride');
}

function validCoordinates(lat: number, lng: number): boolean {
  return Number.isFinite(lat) && Number.isFinite(lng) && lat !== 0 && lng !== 0;
}

export function resolveRemainingNavigationSegments(
  progress: NavigationProgress,
  legs: NavigationLeg[]
): RemainingNavigationSegments {
  const rides = rideLegs(legs);
  const activeRide = rides[progress.activeLegIndex];
  if (!activeRide) {
    return { rideMinutes: 0, transferMinutes: 0, transferCount: 0, accessTransferMinutes: 0 };
  }
  const activeRawIndex = legs.indexOf(activeRide);
  const previousRide = rides[progress.activeLegIndex - 1];
  const previousRawIndex = previousRide ? legs.indexOf(previousRide) : -1;
  const minutes = (value: number) => Number.isFinite(value) ? Math.max(0, value) : 0;
  return {
    rideMinutes: rides
      .slice(progress.activeLegIndex)
      .reduce((sum, leg) => sum + minutes(leg.minutes), 0),
    transferMinutes: legs
      .slice(activeRawIndex + 1)
      .filter((leg) => leg.kind === 'transfer')
      .reduce((sum, leg) => sum + minutes(leg.minutes), 0),
    transferCount: Math.max(0, rides.length - progress.activeLegIndex - 1),
    accessTransferMinutes: previousRawIndex >= 0
      ? legs
          .slice(previousRawIndex + 1, activeRawIndex)
          .filter((leg) => leg.kind === 'transfer')
          .reduce((sum, leg) => sum + minutes(leg.minutes), 0)
      : 0,
  };
}

export function advanceNavigationProgress(
  progress: NavigationProgress,
  legs: NavigationLeg[]
): NavigationProgress {
  switch (progress.phase) {
    case 'walkingToTransit':
    case 'walkingTransfer':
      return { ...progress, phase: 'waiting' };
    case 'waiting':
      return { ...progress, phase: 'riding' };
    case 'riding': {
      const nextLegIndex = progress.activeLegIndex + 1;
      return nextLegIndex < rideLegs(legs).length
        ? { phase: 'walkingTransfer', activeLegIndex: nextLegIndex }
        : { ...progress, phase: 'walkingToDestination' };
    }
    case 'walkingToDestination':
      return { ...progress, phase: 'arrived' };
    default:
      return progress;
  }
}

export function resolveNavigationTarget(
  progress: NavigationProgress,
  legs: NavigationLeg[],
  destination: DestinationTarget
): NavigationTarget | null {
  if (progress.phase === 'walkingToDestination' || progress.phase === 'arrived') {
    if (!validCoordinates(destination.lat, destination.lng)) return null;
    return {
      id: 'destination',
      name: destination.name,
      lat: destination.lat,
      lng: destination.lng,
      kind: 'end',
    };
  }

  const leg = rideLegs(legs)[progress.activeLegIndex];
  if (!leg || progress.phase === 'idle') return null;
  const usesOrigin =
    progress.phase === 'walkingToTransit' ||
    progress.phase === 'walkingTransfer' ||
    progress.phase === 'waiting';
  const lat = usesOrigin ? leg.fromLat : leg.toLat;
  const lng = usesOrigin ? leg.fromLng : leg.toLng;
  if (!validCoordinates(lat, lng)) return null;
  return {
    id: usesOrigin ? leg.fromHubId : leg.toHubId,
    name: usesOrigin ? leg.fromName : leg.toName,
    lat,
    lng,
    kind: 'stop',
  };
}
