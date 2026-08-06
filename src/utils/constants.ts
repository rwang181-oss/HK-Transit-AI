export const API_BASE_URL = 'https://data.etabus.gov.hk/v1/transport/kmb';
export const ETA_REFRESH_INTERVAL = 30_000;

export const COLORS = {
  hkRed: '#C41230',
  ink: '#102A43',
  jade: '#0F766E',
  sky: '#EAF4FF',
  warm: '#FFF5E8',
  bgSystem: '#F4F6F8',
  bgCard: '#FFFFFF',
  bgRaised: '#F8FAFC',
  textPrimary: '#17202A',
  textSecondary: '#667085',
  textTertiary: '#98A2B3',
  border: '#E4E7EC',
  etaUrgent: '#16A34A',
  etaWarning: '#D97706',
  rain: '#2563EB',
  shade: '#7C3AED',
  indoor: '#0F766E',
  fastest: '#C41230',
} as const;

export const DEFAULT_ROUTES = ['1A', '6', '8', '40', '101'];
