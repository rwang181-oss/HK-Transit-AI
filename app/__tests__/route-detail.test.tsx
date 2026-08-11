import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';

const mockLoadRouteDirection = jest.fn();
const mockLoadStopEta = jest.fn();
const mockProvider = { id: 'CTB', fetchRoutes: jest.fn() };
const mockScrollTo = jest.fn();

jest.mock('react-native', () => {
  const ReactModule = jest.requireActual('react');
  const host = (name: string) => ReactModule.forwardRef((props: any, ref: any) =>
    ReactModule.createElement(name, { ...props, ref }, props.children));
  const ScrollView = ReactModule.forwardRef((props: any, ref: any) => {
    ReactModule.useImperativeHandle(ref, () => ({ scrollTo: mockScrollTo }));
    return ReactModule.createElement('ScrollView', props, props.children);
  });
  return {
    Pressable: host('Pressable'), ScrollView, Text: host('Text'), View: host('View'),
    Platform: { OS: 'web', select: (values: Record<string, unknown>) => values.web ?? values.default },
    StyleSheet: { create: (styles: any) => styles },
  };
});

jest.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  useLocalSearchParams: () => ({ provider: 'CTB', route: '8P', bound: 'I', variant: 'weekday', stopId: 'CTB-42' }),
}));
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } }) }));
jest.mock('@/src/journey/providers', () => ({ getProvider: jest.fn(async () => mockProvider) }));
jest.mock('@/src/journey/search/routeDetails', () => ({
  loadRouteDirection: (...args: unknown[]) => mockLoadRouteDirection(...args),
  loadStopEta: (...args: unknown[]) => mockLoadStopEta(...args),
  filterStopEtaByBound: (etas: any[], bound: string) => etas.filter((eta) => eta.bound === bound),
  getRouteStopStateKey: (provider: string, route: string, bound: string, stopId: string, variant?: string) =>
    [provider, route, bound, variant, stopId].filter(Boolean).join(':'),
}));

import { Pressable } from 'react-native';
import RouteDetailScreen from '../route-detail';

function renderedText(node: TestRenderer.ReactTestRendererJSON | TestRenderer.ReactTestRendererJSON[] | string | null): string {
  if (typeof node === 'string') return node;
  if (Array.isArray(node)) return node.map(renderedText).join('');
  return node ? (node.children ?? []).map(renderedText).join('') : '';
}

describe('RouteDetailScreen', () => {
  beforeEach(() => {
    mockScrollTo.mockClear();
    mockLoadRouteDirection.mockReset().mockResolvedValue([{
      link: { stopId: 'CTB-42', seq: 3 },
      stop: { stopId: 'CTB-42', name_en: 'Central', name_tc: '中環' },
    }]);
    mockLoadStopEta.mockReset().mockResolvedValue([{ route: '8P', bound: 'I', stopId: 'CTB-42', eta: '2026-08-11T10:00:00.000Z', provider: 'CTB' }]);
  });

  it('auto-expands the saved stop and loads its ETA', async () => {
    let renderer: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(<RouteDetailScreen />);
      for (let index = 0; index < 6; index += 1) await Promise.resolve();
    });

    expect(mockLoadRouteDirection).toHaveBeenCalledWith(mockProvider, '8P', 'I', 'weekday');
    expect(mockLoadStopEta).toHaveBeenCalledWith(mockProvider, 'CTB-42', '8P', 'weekday');
    await act(async () => {
      for (let index = 0; index < 3; index += 1) await Promise.resolve();
    });
    expect(renderedText(renderer!.toJSON())).toContain('eta.nextBus');

    const savedStop = renderer!.root.findAllByType(Pressable).find((node) => node.props.onLayout);
    expect(savedStop).toBeDefined();
    act(() => savedStop!.props.onLayout({ nativeEvent: { layout: { y: 180 } } }));
    expect(mockScrollTo).toHaveBeenCalledWith({ y: 180, animated: true });
    act(() => renderer!.unmount());
  });

  it('clears a stop ETA error when a retry succeeds', async () => {
    mockLoadStopEta
      .mockRejectedValueOnce(new Error('temporary ETA failure'))
      .mockResolvedValueOnce([{
        route: '8P', bound: 'I', stopId: 'CTB-42', eta: '2026-08-11T10:00:00.000Z', provider: 'CTB',
      }]);
    let renderer: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(<RouteDetailScreen />);
      for (let index = 0; index < 6; index += 1) await Promise.resolve();
    });
    expect(renderedText(renderer!.toJSON())).toContain('eta.loadError');

    const stop = renderer!.root.findByType(Pressable);
    act(() => stop.props.onPress());
    await act(async () => {
      await stop.props.onPress();
    });

    expect(mockLoadStopEta).toHaveBeenCalledTimes(2);
    expect(renderedText(renderer!.toJSON())).toContain('eta.nextBus');
    expect(renderedText(renderer!.toJSON())).not.toContain('eta.loadError');
    act(() => renderer!.unmount());
  });
});
