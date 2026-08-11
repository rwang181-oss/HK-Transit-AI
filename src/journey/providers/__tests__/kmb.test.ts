const mockFetchRouteStops = jest.fn();
const mockFetchETA = jest.fn();

jest.mock('@/src/services/kmbAPI', () => ({
  fetchAllRoutes: jest.fn(),
  fetchAllStops: jest.fn(),
  fetchRouteStops: (...args: unknown[]) => mockFetchRouteStops(...args),
  fetchETA: (...args: unknown[]) => mockFetchETA(...args),
}));

import { kmbProvider } from '../kmb';

describe('KMB provider service variants', () => {
  beforeEach(() => {
    mockFetchRouteStops.mockReset().mockResolvedValue([]);
    mockFetchETA.mockReset().mockResolvedValue([]);
  });

  it('uses the explicit service-type variant for route stops and ETA', async () => {
    await kmbProvider.fetchRouteStops('1A', 'O', 'serviceType=2');
    await kmbProvider.fetchETA('KMB-42', '1A', 'serviceType=2');

    expect(mockFetchRouteStops).toHaveBeenCalledWith('1A', 'O', 2);
    expect(mockFetchETA).toHaveBeenCalledWith('KMB-42', '1A', 2);
  });
});
