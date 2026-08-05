import type { Stop, ProviderId } from '@/src/journey/providers/types';

export interface StopHubMember {
  provider: ProviderId;
  stopId: string;
}

export interface StopHub {
  id: string;
  name_en: string;
  name_tc: string;
  lat: number;
  lng: number;
  members: StopHubMember[];
}

/** Normalize a stop name into a merge key. */
export function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[（(].*?[)）]/g, ' ') // strip parenthetical qualifiers
    .replace(/\b(terminus|station|bus stop|public transport interchange|stop)\b/g, ' ')
    .replace(/[站總站巴士公共運輸交匯處]/g, ' ')
    .replace(/[^a-z0-9一-鿿 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Merge stops from all providers into hubs.
 * Primary key: normalized name (handles 紅磡站 MTR vs 紅磡站 bus).
 * Stops sharing a normalized name collapse into one hub.
 */
export function mergeStops(providerStops: Stop[]): StopHub[] {
  const hubs: StopHub[] = [];
  const nameIndex = new Map<string, StopHub>();

  for (const s of providerStops) {
    const norm = normalizeName(`${s.name_en} ${s.name_tc}`);
    if (!norm) continue;
    const existing = nameIndex.get(norm);
    if (existing) {
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
      name_en: s.name_en,
      name_tc: s.name_tc,
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
