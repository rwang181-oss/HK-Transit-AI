const mockFetch = jest.fn();
let api: typeof import('../kmbAPI');

describe('kmbAPI', () => {
  beforeEach(() => {
    jest.resetModules();
    mockFetch.mockReset();
    global.fetch = mockFetch as unknown as typeof fetch;
    api = require('../kmbAPI');
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

      const result = await api.fetchAllRoutes();
      expect(result).toEqual(mockRoutes);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://data.etabus.gov.hk/v1/transport/kmb/route/',
        expect.objectContaining({
          cache: 'default',
          headers: { Accept: 'application/json' },
          signal: expect.any(AbortSignal),
        })
      );
    });

    it('throws on non-OK response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Server Error',
      });
      await expect(api.fetchAllRoutes()).rejects.toThrow('API error: 500');
    });

    it('throws on network failure', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));
      await expect(api.fetchAllRoutes()).rejects.toThrow('Network error');
    });
  });

  describe('request cache', () => {
    it('reuses a successful route response within the cache lifetime', async () => {
      const mockRoutes = [
        { route: '1A', orig_en: 'Star Ferry', dest_en: 'Kwun Tong' },
      ];
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: mockRoutes }),
      });

      await expect(api.fetchAllRoutes()).resolves.toEqual(mockRoutes);
      await expect(api.fetchAllRoutes()).resolves.toEqual(mockRoutes);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });

  describe('fetchRouteStops', () => {
    it('fetches stops for a specific route and bound', async () => {
      const mockRouteStops = [
        { route: '1A', bound: 'O', service_type: '1', seq: 1, stop: 'ABC123' },
      ];
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: mockRouteStops }),
      });

      const result = await api.fetchRouteStops('1A', 'O');
      expect(result).toEqual(mockRouteStops);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://data.etabus.gov.hk/v1/transport/kmb/route-stop/1A/outbound/1',
        expect.objectContaining({
          cache: 'default',
          headers: { Accept: 'application/json' },
          signal: expect.any(AbortSignal),
        })
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

      const result = await api.fetchETA('ABC123', '1A');
      expect(result).toEqual(mockETA);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://data.etabus.gov.hk/v1/transport/kmb/eta/ABC123/1A/1',
        expect.objectContaining({
          cache: 'default',
          headers: { Accept: 'application/json' },
          signal: expect.any(AbortSignal),
        })
      );
    });
  });
});
