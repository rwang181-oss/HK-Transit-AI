import type { ETA } from '@/src/services/kmbAPI';

export function formatMinutesLeft(etaTimestamp: string): number {
  const diff = new Date(etaTimestamp).getTime() - Date.now();
  return Math.max(0, Math.floor(diff / 60_000));
}

export function formatDistance(meters: number): string {
  if (meters < 1000) {
    return `${Math.round(meters)} m`;
  }
  return `${(meters / 1000).toFixed(1)} km`;
}

export function getETADisplay(eta: ETA): { minutes: number; text: string } {
  const minutes = formatMinutesLeft(eta.eta);
  if (minutes === 0) {
    return { minutes: 0, text: 'Arriving' };
  }
  return { minutes, text: `${minutes} min` };
}
