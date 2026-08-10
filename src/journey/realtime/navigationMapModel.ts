import type { Coordinate } from '../model/types';
import type { WalkingRoute } from '../walking/walkingRouter';
import type { NavigationPhase, NavigationTarget } from './navigationProgress';

export interface NavigationMapPoint extends Coordinate {
  kind: 'me' | 'stop' | 'end';
  label: string;
}

export interface NavigationMapPath {
  id: 'live-walking-route' | 'journey-context-route';
  points: Coordinate[];
  dashed: boolean;
}

export interface NavigationMapModel {
  points: NavigationMapPoint[];
  paths: NavigationMapPath[];
  routeSource: WalkingRoute['source'] | null;
  center: Coordinate | null;
}

export interface NavigationMapModelInput {
  phase: NavigationPhase;
  currentPosition: Coordinate | null;
  target: NavigationTarget | null;
  liveRoute: WalkingRoute | null;
  optionGeometry: Coordinate[];
  currentPositionLabel: string;
}

function isValidPoint(point: Coordinate | null | undefined): point is Coordinate {
  return Boolean(point)
    && Number.isFinite(point?.lat)
    && Number.isFinite(point?.lng)
    && point!.lat >= -90
    && point!.lat <= 90
    && point!.lng >= -180
    && point!.lng <= 180;
}

function isWalkingPhase(phase: NavigationPhase): boolean {
  return phase === 'walkingToTransit'
    || phase === 'walkingTransfer'
    || phase === 'walkingToDestination';
}

export function buildNavigationMapModel(input: NavigationMapModelInput): NavigationMapModel {
  const currentPosition = isValidPoint(input.currentPosition) ? input.currentPosition : null;
  const target = isValidPoint(input.target) ? input.target : null;
  const optionGeometry = input.optionGeometry.filter(isValidPoint);
  const points: NavigationMapPoint[] = [];

  if (currentPosition) {
    points.push({
      ...currentPosition,
      kind: 'me',
      label: input.currentPositionLabel,
    });
  }
  if (target) {
    points.push({
      lat: target.lat,
      lng: target.lng,
      kind: target.kind,
      label: target.name,
    });
  }

  const walkingRoute = isWalkingPhase(input.phase)
    && input.liveRoute
    && input.liveRoute.geometry.filter(isValidPoint).length >= 2
      ? input.liveRoute
      : null;
  const paths: NavigationMapPath[] = [];
  if (walkingRoute) {
    paths.push({
      id: 'live-walking-route',
      points: walkingRoute.geometry.filter(isValidPoint),
      dashed: walkingRoute.source === 'estimated',
    });
  } else if (
    (input.phase === 'waiting' || input.phase === 'riding')
    && optionGeometry.length >= 2
  ) {
    paths.push({
      id: 'journey-context-route',
      points: optionGeometry,
      dashed: false,
    });
  }

  return {
    points,
    paths,
    routeSource: walkingRoute?.source ?? null,
    center: currentPosition
      ? { lat: currentPosition.lat, lng: currentPosition.lng }
      : target
        ? { lat: target.lat, lng: target.lng }
        : optionGeometry[0] ?? null,
  };
}
