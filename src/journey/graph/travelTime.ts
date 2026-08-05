import type { ProviderId } from '@/src/journey/providers/types';

// Average in-vehicle speed + stop dwell + route circuity factor.
// Circuity accounts for the fact that a route rarely runs straight
// between two stops (real distances are longer than haversine).
const MODE_SPEED: Record<
  ProviderId,
  { kmh: number; dwell: number; circuity: number }
> = {
  KMB: { kmh: 20, dwell: 0.6, circuity: 1.45 },
  CTB: { kmh: 20, dwell: 0.6, circuity: 1.45 },
  GMB: { kmh: 25, dwell: 0.5, circuity: 1.35 },
  MTR: { kmh: 35, dwell: 1.0, circuity: 1.12 },
};

const WALK_SPEED_M_PER_MIN = 80; // ~4.8 km/h

export function haversineMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6_371_000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/** Estimated in-vehicle time (minutes) for a ride leg. */
export function estimateLegMinutes(
  from: { lat: number; lng: number },
  to: { lat: number; lng: number },
  provider: ProviderId
): number {
  const meters = haversineMeters(from.lat, from.lng, to.lat, to.lng);
  const km = meters / 1000;
  const { kmh, dwell, circuity } = MODE_SPEED[provider];
  return Math.max(1.0, ((km * circuity) / kmh) * 60 + dwell);
}

/** Estimated walking time (minutes) for a transfer. */
export function estimateWalkMinutes(distanceMeters: number): number {
  return Math.max(1.5, distanceMeters / WALK_SPEED_M_PER_MIN);
}
