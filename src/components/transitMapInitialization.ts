export interface MapPoint {
  id: string;
  lat: number;
  lng: number;
  label?: string;
  kind?: 'start' | 'end' | 'stop' | 'me';
}

export interface MapPath {
  id: string;
  points: Array<{ lat: number; lng: number }>;
  color?: string;
  dashed?: boolean;
}

export interface TransitMapInitializationInput {
  center: { lat: number; lng: number };
  points: MapPoint[];
  paths: MapPath[];
  followPoint: { lat: number; lng: number } | null;
  followZoom: number | undefined;
}

export interface TransitMapInitializationValue {
  mapCenter: { lat: number; lng: number };
  mapZoom: number;
  points: MapPoint[];
  paths: MapPath[];
  shouldFitBounds: boolean;
}

export function createTransitMapInitialization(initial: TransitMapInitializationInput) {
  let latest = initial;
  return {
    update(next: TransitMapInitializationInput): void {
      latest = next;
    },
    consume(): TransitMapInitializationValue {
      return {
        mapCenter: latest.followPoint ?? latest.center,
        mapZoom: latest.followPoint ? latest.followZoom ?? 16 : 15,
        points: latest.points,
        paths: latest.paths,
        shouldFitBounds: !latest.followPoint,
      };
    },
  };
}
