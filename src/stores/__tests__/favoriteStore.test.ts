jest.mock('@/src/database', () => ({
  storage: {
    getItem: jest.fn(async () => null),
    setItem: jest.fn(async () => undefined),
    removeItem: jest.fn(async () => undefined),
  },
}));

import type { FavoritePersistedStateV1, FavoriteRoute } from '../favoriteStore';
import { useFavoriteStore } from '../favoriteStore';

const legacyRoute: FavoritePersistedStateV1['favoriteRoutes'][number] = {
  route: '1A',
  bound: 'O' as const,
  dest_en: 'Star Ferry',
  dest_tc: '天星碼頭',
  stopId: 'KMB-123',
  stopNameEn: 'Central',
  stopNameTc: '中環',
  serviceType: 1,
};

function hasFavoriteRoutes(value: unknown): value is { favoriteRoutes: FavoriteRoute[] } {
  return Boolean(value && typeof value === 'object' && Array.isArray((value as { favoriteRoutes?: unknown }).favoriteRoutes));
}

describe('favorite route persistence', () => {
  beforeEach(() => {
    useFavoriteStore.setState({ favoriteRoutes: [] });
  });

  it('migrates a version-1 KMB service-type variant without losing its detail identity', async () => {
    const options = useFavoriteStore.persist.getOptions();
    expect(options.version).toBe(3);
    const migrate = options.migrate;
    expect(migrate).toEqual(expect.any(Function));

    const serviceTypeTwo = { ...legacyRoute, serviceType: 2 };
    const persistedV1: FavoritePersistedStateV1 = { favoriteRoutes: [serviceTypeTwo], favoriteStops: [] };
    const migrated = await migrate!(persistedV1, 1);
    expect(hasFavoriteRoutes(migrated)).toBe(true);
    if (!hasFavoriteRoutes(migrated)) throw new Error('migration must return saved routes');
    expect(migrated.favoriteRoutes).toEqual([{
      ...serviceTypeTwo,
      provider: 'KMB',
      routeVariant: 'serviceType=2',
    }]);
  });

  it('keeps routes from different providers as distinct saved-route identities', () => {
    const state = useFavoriteStore.getState();
    const kmbFavorite: FavoriteRoute = { ...legacyRoute, provider: 'KMB' };
    const ctbFavorite: FavoriteRoute = { ...legacyRoute, provider: 'CTB' };
    state.addRoute(kmbFavorite);
    state.addRoute(ctbFavorite);

    expect(useFavoriteStore.getState().favoriteRoutes).toHaveLength(2);
    expect(useFavoriteStore.getState().isRouteFavorited(ctbFavorite)).toBe(true);
  });

  it('normalizes newly saved KMB service-type variants into the route identity', () => {
    const serviceTypeTwo: FavoriteRoute = {
      ...legacyRoute,
      provider: 'KMB',
      serviceType: 2,
    };
    useFavoriteStore.getState().addRoute(serviceTypeTwo);

    expect(useFavoriteStore.getState().favoriteRoutes[0].routeVariant).toBe('serviceType=2');
    expect(useFavoriteStore.getState().isRouteFavorited(serviceTypeTwo)).toBe(true);
  });
});
