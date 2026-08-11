import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';

const mockRemoveRoute = jest.fn();
const mockAddRoute = jest.fn();
const mockIsRouteFavorited = jest.fn((identity: { serviceType?: number }) => identity.serviceType === 2);
let mockScreenOptions: { headerRight: () => React.ReactElement } | null = null;

jest.mock('react-native', () => {
  const ReactModule = jest.requireActual('react');
  const host = (name: string) => ReactModule.forwardRef((props: any, ref: any) =>
    ReactModule.createElement(name, { ...props, ref }, props.children));
  return {
    RefreshControl: host('RefreshControl'), ScrollView: host('ScrollView'),
    Text: host('Text'), View: host('View'),
    Platform: { OS: 'web', select: (values: Record<string, unknown>) => values.web ?? values.default },
    StyleSheet: { create: (styles: any) => styles, hairlineWidth: 1 },
  };
});
jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ routeId: '1A', bound: 'O', stopId: 'KMB-42', serviceType: '2' }),
  Stack: {
    Screen: (props: { options: { headerRight: () => React.ReactElement } }) => {
      mockScreenOptions = props.options;
      return null;
    },
  },
}));
jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } }),
}));
jest.mock('@/src/stores/routeStore', () => ({
  useRouteStore: () => ({
    getStopsForRoute: jest.fn(async () => [{
      route: '1A', bound: 'O', service_type: '2', seq: 1, stop: 'KMB-42',
    }]),
    getStopById: () => ({ stop: 'KMB-42', name_en: 'Central', name_tc: '中環' }),
    routes: [{ route: '1A', bound: 'O', dest_en: 'Star Ferry', dest_tc: '天星碼頭' }],
  }),
}));
jest.mock('@/src/stores/etaStore', () => ({
  useETAStore: () => ({
    etaCache: {}, fetchETAForStop: jest.fn(), startAutoRefresh: jest.fn(),
    stopAutoRefresh: jest.fn(), loading: false,
  }),
}));
jest.mock('@/src/stores/favoriteStore', () => ({
  useFavoriteStore: () => ({
    addRoute: mockAddRoute, removeRoute: mockRemoveRoute,
    addStop: jest.fn(), removeStop: jest.fn(),
    isRouteFavorited: mockIsRouteFavorited, isStopFavorited: jest.fn(() => false),
  }),
}));
jest.mock('@/src/components/StopItem', () => ({ StopItem: () => null }));

import { Text } from 'react-native';
import ETAScreen from '../eta/[routeId]';

describe('legacy KMB ETA route favorite identity', () => {
  it('shows and removes a saved service-type-2 route', async () => {
    let renderer: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(<ETAScreen />);
      await Promise.resolve();
    });
    if (!mockScreenOptions) throw new Error('header options were not rendered');

    let header: TestRenderer.ReactTestRenderer;
    act(() => { header = TestRenderer.create(mockScreenOptions!.headerRight()); });
    const favoriteButton = header!.root.findByType(Text);
    expect(favoriteButton.props.children).toBe('★');

    act(() => favoriteButton.props.onPress());
    expect(mockRemoveRoute).toHaveBeenCalledWith({
      provider: 'KMB', route: '1A', bound: 'O', stopId: 'KMB-42', serviceType: 2,
    });
    expect(mockAddRoute).not.toHaveBeenCalled();
    act(() => header!.unmount());
    act(() => renderer!.unmount());
  });
});
