export const API_BASE_URL = 'https://data.etabus.gov.hk/v1/transport/kmb';

export const ETA_REFRESH_INTERVAL = 30_000; // 30 seconds

export const COLORS = {
  hkRed: '#C41230',
  bgSystem: '#F2F2F7',
  bgCard: '#FFFFFF',
  textPrimary: '#1C1C1E',
  textSecondary: '#8E8E93',
  etaUrgent: '#34C759',
  etaWarning: '#FF9500',
} as const;

export const DEFAULT_ROUTES = ['1A', '6', '8', '40', '101'];
