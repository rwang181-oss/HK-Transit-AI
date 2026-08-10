import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';

let mockPlatformOS = 'web';
const mockOpenURL = jest.fn(() => Promise.resolve());
const mockLoadLeaflet = jest.fn();
const mapHandlers: Record<string, () => void> = {};
const mockMap = {
  fitBounds: jest.fn(),
  getZoom: jest.fn(() => 15),
  invalidateSize: jest.fn(),
  on: jest.fn((event: string, handler: () => void) => {
    mapHandlers[event] = handler;
  }),
  remove: jest.fn(),
  removeLayer: jest.fn(),
  setView: jest.fn(),
  whenReady: jest.fn((handler: () => void) => handler()),
};
const addToMap = jest.fn();
const mockLeaflet = {
  divIcon: jest.fn(() => ({})),
  layerGroup: jest.fn(() => ({ addTo: addToMap })),
  map: jest.fn(() => mockMap),
  marker: jest.fn(() => ({
    addTo: jest.fn(),
    bindTooltip: jest.fn(),
  })),
  polyline: jest.fn(() => ({ addTo: jest.fn() })),
  tileLayer: jest.fn(() => ({ addTo: jest.fn() })),
};

jest.mock('@/src/components/loadLeaflet', () => ({
  loadLeaflet: () => mockLoadLeaflet(),
}), { virtual: true });

jest.mock('react-native', () => {
  const ReactModule = jest.requireActual('react');
  const host = (name: string) => ReactModule.forwardRef((props: any, ref: any) =>
    ReactModule.createElement(name, { ...props, ref }, props.children));
  return {
    ActivityIndicator: host('ActivityIndicator'),
    Pressable: host('Pressable'),
    Text: host('Text'),
    View: host('View'),
    Platform: {
      get OS() { return mockPlatformOS; },
    },
    Linking: { openURL: mockOpenURL },
    StyleSheet: { create: (styles: any) => styles },
  };
});

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

import { Pressable } from 'react-native';
import { TransitMap } from '../TransitMap';

function flushPromises() {
  return new Promise((resolve) => setImmediate(resolve));
}

describe('TransitMap native destination safety', () => {
  beforeEach(() => {
    mockPlatformOS = 'ios';
    jest.clearAllMocks();
  });

  it('never exposes the current-position marker as a native Apple Maps destination', () => {
    let renderer: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        <TransitMap
          center={{ lat: 22.3, lng: 114.2 }}
          points={[{ lat: 22.3, lng: 114.2, kind: 'me', label: 'Me' }]}
        />
      );
    });

    expect(renderer!.root.findAllByType(Pressable)).toHaveLength(0);
    expect(mockOpenURL).not.toHaveBeenCalled();
    act(() => renderer!.unmount());
  });
});

describe('TransitMap web GPS following', () => {
  beforeEach(() => {
    mockPlatformOS = 'web';
    jest.clearAllMocks();
    for (const key of Object.keys(mapHandlers)) delete mapHandlers[key];
    mockLoadLeaflet.mockResolvedValue(mockLeaflet);
  });

  it('recenter resumes following later GPS updates at the requested zoom', async () => {
    const initial = { lat: 22.2819, lng: 114.1588 };
    const whileDragged = { lat: 22.2821, lng: 114.159 };
    const moved = { lat: 22.2825, lng: 114.1594 };
    const target = { lat: 22.283, lng: 114.16, kind: 'stop' as const, label: 'Target' };
    let renderer: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(
        <TransitMap
          center={initial}
          points={[{ ...initial, kind: 'me' }, target]}
          followPoint={initial}
          followZoom={17}
        />,
        { createNodeMock: () => ({}) }
      );
      await flushPromises();
    });

    mockMap.setView.mockClear();
    act(() => mapHandlers.dragstart());
    await act(async () => {
      renderer!.update(
        <TransitMap
          center={whileDragged}
          points={[{ ...whileDragged, kind: 'me' }, target]}
          followPoint={whileDragged}
          followZoom={17}
        />
      );
      await flushPromises();
    });
    expect(mockMap.setView).not.toHaveBeenCalled();

    const recenterButton = renderer!.root.findByProps({ accessibilityLabel: 'navigation.recenter' });
    act(() => {
      recenterButton.props.onPress();
    });
    expect(mockMap.setView).toHaveBeenLastCalledWith(
      [whileDragged.lat, whileDragged.lng],
      17,
      { animate: false }
    );
    expect(renderer!.root.findAllByProps({ accessibilityLabel: 'navigation.recenter' })).toHaveLength(0);

    mockMap.setView.mockClear();
    await act(async () => {
      renderer!.update(
        <TransitMap
          center={moved}
          points={[{ ...moved, kind: 'me' }, target]}
          followPoint={moved}
          followZoom={17}
        />
      );
      await flushPromises();
    });
    expect(mockMap.setView).toHaveBeenCalledWith(
      [moved.lat, moved.lng],
      17,
      { animate: false }
    );
    expect(renderer!.root.findAllByProps({ accessibilityLabel: 'navigation.recenter' })).toHaveLength(0);
    act(() => renderer!.unmount());
  });
});
