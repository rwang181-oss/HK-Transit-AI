export type ProviderId = 'KMB' | 'CTB' | 'GMB' | 'MTR';

export interface Route {
  route: string; // "1A" / "1" / "26" / "EAL"
  bound: 'O' | 'I';
  orig_en: string;
  orig_tc: string;
  dest_en: string;
  dest_tc: string;
  provider: ProviderId;
}

export interface Stop {
  stopId: string; // provider-specific id
  name_en: string;
  name_tc: string;
  name_sc?: string; // simplified chinese, when available
  lat: number;
  lng: number;
  provider: ProviderId;
}

export interface RouteStopLink {
  route: string;
  bound: 'O' | 'I';
  seq: number;
  stopId: string;
  provider: ProviderId;
}

export interface ETA {
  route: string;
  bound: 'O' | 'I';
  stopId: string;
  eta: string; // ISO timestamp
  provider: ProviderId;
}

export interface TransitProvider {
  id: ProviderId;
  fetchRoutes(): Promise<Route[]>;
  fetchStops(): Promise<Stop[]>;
  fetchRouteStops(route: string, bound: 'O' | 'I'): Promise<RouteStopLink[]>;
  fetchETA(stopId: string, route: string): Promise<ETA[]>;
}
