import {
  fetchAllRoutes,
  fetchAllStops,
  fetchRouteStops,
  fetchETA,
} from '../kmbAPI';

const mockFetch = jest.fn();
global.fetch = mockFetch as unknown as typeof fetch;

describe('kmbAPI', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  describe('fetchAllRoutes', () => {
    it('fetches and returns route data', async () => {
      const mockRoutes = [
        { route: '1A', orig_en: 'Star Ferry', dest_en: 'Kwun Tong' },
      ];
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: mockRoutes }),
      });

      const result = await fetchAllRoutes();
      expect(result).toEqual(mockRoutes);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://data.etabus.gov.hk/v1/transport/kmb/route/'
      );
    });

    it('throws on non-OK response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Server Error',
      });
      await expect(fetchAllRoutes()).rejects.toThrow('API error: 500');
    });

    it('throws on network failure', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));
      await expect(fetchAllRoutes()).rejects.toThrow('Network error');
    });
  });

  describe('fetchAllStops', () => {
    it('fetches and returns stop data', async () => {
      const mockStops = [
        { stop: 'ABC123', name_en: 'PolyU', lat: 22.3, long: 114.17 },
      ];
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: mockStops }),
      });

      const result = await fetchAllStops();
      expect(result).toEqual(mockStops);
    });
  });

  describe('fetchRouteStops', () => {
    it('fetches stops for a specific route and bound', async () => {
      const mockRouteStops = [
        { co: 'KMB', route: '1A', dir: 'O', seq: 1, stop: 'ABC123' },
      ];
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: mockRouteStops }),
      });

      const result = await fetchRouteStops('1A', 'O');
      expect(result).toEqual(mockRouteStops);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://data.etabus.gov.hk/v1/transport/kmb/route-stop/1A/outbound/1'
      );
    });
  });

  describe('fetchETA', () => {
    it('fetches ETA for a specific stop and route', async () => {
      const mockETA = [
        {
          co: 'KMB',
          route: '1A',
          dir: 'O',
          service_type: 1,
          seq: 5,
          dest_en: 'Kwun Tong',
          dest_tc: '觀塘',
          eta: '2026-08-05T10:30:00+08:00',
          eta_seq: 1,
          rmk_en: '',
          rmk_tc: '',
          data_timestamp: '2026-08-05T10:29:00+08:00',
        },
      ];
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: mockETA }),
      });

      const result = await fetchETA('ABC123', '1A');
      expect(result).toEqual(mockETA);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://data.etabus.gov.hk/v1/transport/kmb/eta/ABC123/1A/1'
      );
    });
  });
});
