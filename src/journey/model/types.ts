import type { ProviderId } from '@/src/journey/providers/types';

export type JourneyMode = 'recommended' | 'fastest' | 'shade' | 'rain' | 'indoor';
export type JourneyPolicy = 'recommended' | 'direct' | 'oneTransfer' | 'fastest' | 'lessWalking';
export type ConfidenceLevel = 'live' | 'estimated' | 'unavailable';

export interface Coordinate {
  lat: number;
  lng: number;
}

export interface JourneyGeometryPoint extends Coordinate {
  kind?: 'start' | 'walk' | 'stop' | 'end';
  label?: string;
}

export interface RideMinutesByProvider extends Partial<Record<ProviderId, number>> {}

export interface ComfortRouteInput {
  id: string;
  totalMinutes: number;
  walkingMinutes: number;
  walkingMeters: number;
  waitMinutes: number;
  transfers: number;
  rideMinutesByProvider: RideMinutesByProvider;
}

export interface WeatherSnapshot {
  rainIntensity: 'none' | 'light' | 'moderate' | 'heavy';
  temperatureC: number | null;
  uvIndex: number | null;
  isDaylight: boolean;
  updatedAt?: string;
  source?: 'HKO' | 'fallback';
}

export interface ComfortMetrics {
  outdoorExposureMinutes: number;
  indoorTransitMinutes: number;
  walkingBurden: 'low' | 'medium' | 'high';
  weatherPenalty: number;
  score: number;
  confidence: 'estimated';
  reasons: string[];
}

export interface JourneyArrivalWindow {
  estimatedArrivalMs: number;
  earliestArrivalMs: number;
  latestArrivalMs: number;
  remainingMinutes: number;
  confidence: 'live' | 'estimated';
}
