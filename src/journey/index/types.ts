import type { ProviderId } from '@/src/journey/providers/types';
import type {
  ComfortMetrics,
  JourneyArrivalWindow,
  JourneyGeometryPoint,
  JourneyMode,
  JourneyPolicy,
} from '@/src/journey/model/types';

export interface IndexedServiceRef {
  routeKey: string;
  seq: number;
}

export interface IndexedHubMember {
  provider: ProviderId;
  stopId: string;
}

export interface IndexedHub {
  id: string;
  name_en: string;
  name_tc: string;
  name_sc: string;
  lat: number;
  lng: number;
  members: IndexedHubMember[];
  services: IndexedServiceRef[];
}

export interface IndexedRoute {
  routeKey: string;
  provider: ProviderId;
  route: string;
  bound: 'O' | 'I';
  hubs: string[];
  cumulativeMinutes: number[];
}

/**
 * Compact transfer-point representation. At runtime the planner reads the
 * services available at hubId instead of downloading every route-pair
 * combination for busy interchanges.
 */
export interface IndexedTransferPoint {
  hubId: string;
  seq: number;
}

export interface JourneyIndexMeta {
  schemaVersion: 1;
  generatedAt: string;
  hubCount: number;
  routeCount: number;
  cellCount: number;
  transferPointCount?: number;
}

export interface JourneyIndexBundle {
  meta: JourneyIndexMeta;
  hubs: IndexedHub[];
  hubById: Map<string, IndexedHub>;
  cells: Record<string, string[]>;
  routes: Record<string, IndexedRoute>;
  routeNeighbors: Record<string, IndexedTransferPoint[]>;
}

export interface IndexedJourneyLeg {
  provider: ProviderId;
  route: string;
  bound: 'O' | 'I';
  fromHubId: string;
  toHubId: string;
  fromName: string;
  toName: string;
  minutes: number;
  kind: 'ride' | 'transfer';
}

/**
 * Passenger-facing route object that remains structurally compatible with the
 * existing result cards and navigation store while avoiding the legacy graph.
 */
export interface IndexedJourneyOption {
  id: string;
  totalMinutes: number;
  walkingMinutes: number;
  walkingMeters: number;
  walkingSource: 'estimated' | 'routed';
  rideMinutes: number;
  transferMinutes: number;
  transferWaitMinutes: number;
  walkToStationMin: number;
  walkToStationMeters: number;
  walkFromStationMin: number;
  walkFromStationMeters: number;
  waitMin: number;
  waitStatus: 'estimated' | 'live' | 'unavailable';
  catchable: boolean;
  nextBusMin: number;
  departureAtMs: number;
  fallbackHeadwayMinutes: number;
  itinerary: {
    totalMinutes: number;
    transfers: number;
    isDirect: boolean;
    legs: IndexedJourneyLeg[];
  };
  boardStopId: string;
  boardProvider: ProviderId;
  boardRoute: string;
  boardBound: 'O' | 'I';
  boardHub: IndexedHub;
  alightHub: IndexedHub;
  geometry: JourneyGeometryPoint[];
  comfortMetrics: ComfortMetrics;
  comfortScores: Record<JourneyMode, number>;
  arrivalWindow: JourneyArrivalWindow;
  notes: Array<'approximateWalkingGeometry' | 'estimatedComfort' | 'estimatedWait'>;
}

export interface JourneyPoint {
  lat: number;
  lng: number;
  name: string;
}

export interface FastPlannerStats {
  nearbyHubChecks: number;
  transferExpansions: number;
}

export interface FastPlannerOptions {
  maxResults?: number;
  maxHubCandidates?: number;
  maxTransferExpansions?: number;
  onStats?: (stats: FastPlannerStats) => void;
}

export type ProgressiveJourneyPolicy = JourneyPolicy;
