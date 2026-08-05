/**
 * Address → coordinates via Nominatim (OpenStreetMap).
 * NOTE: do NOT pass countrycodes=hk — it breaks Hong Kong results.
 */

export interface GeoPoint {
  lat: number;
  lng: number;
  name: string;
}

interface NominatimResult {
  lat: string;
  lon: string;
  display_name: string;
}

export async function geocodeAddress(query: string): Promise<GeoPoint[]> {
  const q = query.trim();
  if (!q) return [];
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=3`;
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'HKTransit/1.0 (hk-transit-ai)' },
    });
    if (!res.ok) return [];
    const data = (await res.json()) as NominatimResult[];
    return data.map((d) => ({
      lat: parseFloat(d.lat),
      lng: parseFloat(d.lon),
      name: d.display_name.split(',').slice(0, 2).join(',').trim(),
    }));
  } catch {
    return [];
  }
}
