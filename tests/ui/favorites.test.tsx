import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';

const mockRouter = { push: jest.fn() };
const mockState = {
  favoriteRoutes: [{
    provider: 'KMB',
    route: '1A',
    bound: 'O',
    routeVariant: 'serviceType=2',
    stopId: 'KMB-42',
    dest_en: 'Wan Chai',
    dest_tc: '灣仔',
    stopNameEn: 'Central',
    stopNameTc: '中環',
    serviceType: 2,
  }],
  favoriteStops: [],
};

jest.mock('react-native', () => {
  const ReactModule = jest.requireActual('react');
  const host = (name: string) => ReactModule.forwardRef((props: any, ref: any) =>
    ReactModule.createElement(name, { ...props, ref }, props.children));
  return {
    Pressable: host('Pressable'), ScrollView: host('ScrollView'), Text: host('Text'), View: host('View'),
    Platform: { OS: 'web', select: (values: Record<string, unknown>) => values.web ?? values.default },
    StyleSheet: { create: (styles: any) => styles },
  };
});

jest.mock('expo-router', () => ({ useRouter: () => mockRouter }));
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } }) }));
jest.mock('@/src/stores/favoriteStore', () => ({ useFavoriteStore: (selector: (state: typeof mockState) => unknown) => selector(mockState) }));
jest.mock('@/src/stores/etaStore', () => ({ useETAStore: (selector: (state: { etaCache: Record<string, []> }) => unknown) => selector({ etaCache: {} }) }));
jest.mock('@/src/components/RouteCard', () => ({
  RouteCard: ({ onPress }: { onPress: () => void }) => {
    const ReactModule = jest.requireActual('react');
    return ReactModule.createElement('RouteCard', { onPress });
  },
}));

import { RouteCard } from '@/src/components/RouteCard';
import FavoritesScreen from '../../app/(tabs)/favorites';

describe('FavoritesScreen', () => {
  it('preserves a migrated KMB service type when opening shared route detail', () => {
    let renderer: TestRenderer.ReactTestRenderer;
    act(() => { renderer = TestRenderer.create(<FavoritesScreen />); });

    act(() => { renderer!.root.findByType(RouteCard).props.onPress(); });

    expect(mockRouter.push).toHaveBeenCalledWith(
      '/route-detail?provider=KMB&route=1A&bound=O&stopId=KMB-42&variant=serviceType%3D2'
    );
    act(() => renderer!.unmount());
  });
});
