import type { Stop, ProviderId } from '@/src/journey/providers/types';

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

/** Remove stop codes like (WT916), AA6591, and collapse whitespace. */
export function cleanStopName(name: string): string {
  return (name || '')
    .replace(/[（(][A-Za-z]{1,3}\d{3,4}[)）]/g, ' ') // (WT916)
    .replace(/\b[A-Za-z]{1,3}\d{3,4}\b/g, ' ') // AA6591
    .replace(/\s+/g, ' ')
    .trim();
}

/** Normalize a stop name into a merge key. */
export function normalizeName(name: string): string {
  return cleanStopName(name)
    .toLowerCase()
    .replace(/[（(].*?[)）]/g, ' ') // strip parenthetical qualifiers
    .replace(/\b(terminus|station|bus stop|public transport interchange|stop)\b/g, ' ')
    .replace(/[站總站巴士公共運輸交匯處]/g, ' ')
    .replace(/[^a-z0-9一-鿿 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Pick the first non-empty value, else fall back to the current. */
function firstNonEmpty(candidates: (string | undefined)[], current: string): string {
  return candidates.find((c) => c && c.trim().length > 0)?.trim() || current;
}

/**
 * Merge stops from all providers into hubs.
 * Primary key: normalized name (handles 紅磡站 MTR vs 紅磡站 bus).
 * Stops sharing a normalized name collapse into one hub.
 * Names are cleaned of stop codes and kept in en/tc/sc variants.
 */
export function mergeStops(providerStops: Stop[]): StopHub[] {
  const hubs: StopHub[] = [];
  const nameIndex = new Map<string, StopHub>();

  for (const s of providerStops) {
    const norm = normalizeName(`${s.name_en} ${s.name_tc}`);
    if (!norm) continue;
    const cleanEn = cleanStopName(s.name_en);
    const cleanTc = cleanStopName(s.name_tc);
    const cleanSc = cleanStopName((s as any).name_sc);

    const existing = nameIndex.get(norm);
    if (existing) {
      // best-effort: prefer a non-empty name variant from any member
      existing.name_en = firstNonEmpty([cleanEn], existing.name_en);
      existing.name_tc = firstNonEmpty([cleanTc], existing.name_tc);
      existing.name_sc = firstNonEmpty([cleanSc], existing.name_sc);
      if (!existing.lat && s.lat) {
        existing.lat = s.lat;
        existing.lng = s.lng;
      }
      if (
        !existing.members.some(
          (m) => m.provider === s.provider && m.stopId === s.stopId
        )
      ) {
        existing.members.push({ provider: s.provider, stopId: s.stopId });
      }
      continue;
    }

    const hub: StopHub = {
      id: `hub-${hubs.length}`,
      name_en: cleanEn,
      name_tc: cleanTc,
      name_sc: cleanSc,
      lat: s.lat,
      lng: s.lng,
      members: [{ provider: s.provider, stopId: s.stopId }],
    };
    hubs.push(hub);
    nameIndex.set(norm, hub);
  }

  return hubs;
}

/** Build provider→stop lookup and hub membership indexes for the graph builder. */
export function buildLookups(hubs: StopHub[]) {
  const memberToHub = new Map<string, StopHub>();
  for (const hub of hubs) {
    for (const m of hub.members) {
      memberToHub.set(`${m.provider}:${m.stopId}`, hub);
    }
  }
  return memberToHub;
}
