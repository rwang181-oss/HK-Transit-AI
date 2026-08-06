import type { Stop, ProviderId } from '@/src/journey/providers/types';
import { haversineMeters } from './travelTime';

export interface StopHubMember {
  provider: ProviderId;
  stopId: string;
}

export interface StopHub {
  id: string;
  name_en: string;
  name_tc: string;
  name_sc: string;
  lat: number;
  lng: number;
  members: StopHubMember[];
}

const MAX_SAME_NAME_MERGE_DISTANCE_M = 350;
const GEO_CELL_DEGREES = 0.005;

/** Remove stop codes like (WT916), AA6591, and collapse whitespace. */
export function cleanStopName(name: string): string {
  return (name || '')
    .replace(/[（(][A-Za-z]{1,3}\d{3,4}[)）]/g, ' ')
    .replace(/\b[A-Za-z]{1,3}\d{3,4}\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Normalize a stop name into a multilingual merge key. */
export function normalizeName(name: string): string {
  return cleanStopName(name)
    .toLowerCase()
    .replace(/[（(].*?[)）]/g, ' ')
    .replace(/\b(terminus|station|bus stop|public transport interchange|stop)\b/g, ' ')
    .replace(/[站總巴士公共運輸交匯處]/g, ' ')
    .replace(/[^a-z0-9一-鿿 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function firstNonEmpty(candidates: (string | undefined)[], current: string): string {
  return candidates.find((c) => c && c.trim().length > 0)?.trim() || current;
}

function hasCoordinates(value: { lat: number; lng: number }): boolean {
  return Number.isFinite(value.lat) && Number.isFinite(value.lng) && value.lat !== 0 && value.lng !== 0;
}

function stableHash(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

function hubKey(normalizedName: string, stop: Stop): string {
  if (!hasCoordinates(stop)) return normalizedName;
  const gx = Math.floor(stop.lng / GEO_CELL_DEGREES);
  const gy = Math.floor(stop.lat / GEO_CELL_DEGREES);
  return `${normalizedName}:${gx}:${gy}`;
}

function canMerge(existing: StopHub, stop: Stop): boolean {
  if (!hasCoordinates(existing) || !hasCoordinates(stop)) return true;
  return haversineMeters(existing.lat, existing.lng, stop.lat, stop.lng) <= MAX_SAME_NAME_MERGE_DISTANCE_M;
}

/**
 * Merge equivalent provider stops while protecting against distant stops that
 * happen to share a name. IDs are deterministic across input ordering within
 * the same geographic cell, which keeps saved references stable after refresh.
 */
export function mergeStops(providerStops: Stop[]): StopHub[] {
  const hubs: StopHub[] = [];
  const nameIndex = new Map<string, StopHub[]>();

  for (const s of providerStops) {
    const norm = normalizeName(`${s.name_en} ${s.name_tc}`);
    if (!norm) continue;
    const cleanEn = cleanStopName(s.name_en);
    const cleanTc = cleanStopName(s.name_tc);
    const cleanSc = cleanStopName(s.name_sc || '');
    const candidates = nameIndex.get(norm) || [];
    const existing = candidates.find((hub) => canMerge(hub, s));

    if (existing) {
      existing.name_en = firstNonEmpty([cleanEn], existing.name_en);
      existing.name_tc = firstNonEmpty([cleanTc], existing.name_tc);
      existing.name_sc = firstNonEmpty([cleanSc], existing.name_sc);
      if (!hasCoordinates(existing) && hasCoordinates(s)) {
        existing.lat = s.lat;
        existing.lng = s.lng;
      }
      if (!existing.members.some((m) => m.provider === s.provider && m.stopId === s.stopId)) {
        existing.members.push({ provider: s.provider, stopId: s.stopId });
        existing.members.sort((a, b) => `${a.provider}:${a.stopId}`.localeCompare(`${b.provider}:${b.stopId}`));
      }
      continue;
    }

    const key = hubKey(norm, s);
    const hub: StopHub = {
      id: `hub-${stableHash(key)}`,
      name_en: cleanEn,
      name_tc: cleanTc,
      name_sc: cleanSc,
      lat: s.lat,
      lng: s.lng,
      members: [{ provider: s.provider, stopId: s.stopId }],
    };
    hubs.push(hub);
    candidates.push(hub);
    nameIndex.set(norm, candidates);
  }

  return hubs.sort((a, b) => a.id.localeCompare(b.id));
}

export function buildLookups(hubs: StopHub[]) {
  const memberToHub = new Map<string, StopHub>();
  for (const hub of hubs) {
    for (const m of hub.members) memberToHub.set(`${m.provider}:${m.stopId}`, hub);
  }
  return memberToHub;
}
