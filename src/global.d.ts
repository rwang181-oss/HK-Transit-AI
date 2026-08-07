// Type declarations for modules without their own type definitions
declare module '*/src/data/kmb.json' {
  const value: {
    schemaVersion?: number;
    generatedAt?: string;
    stops?: Array<{
      stopId: string;
      name_en: string;
      name_tc: string;
      name_sc?: string;
      lat: number;
      lng: number;
    }>;
    routeStops?: Array<{
      route: string;
      bound: 'O' | 'I';
      seq: number;
      stopId: string;
    }>;
  };
  export default value;
}
