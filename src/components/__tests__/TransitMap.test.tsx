import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';

let mockPlatformOS = 'web';
const mockOpenURL = jest.fn(() => Promise.resolve());
const mockLoadLeaflet = jest.fn();
let resolveMockLeaflet: ((leaflet: unknown) => void) | null = null;
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
const markerInstances: Array<{
  addTo: jest.Mock;
  bindTooltip: jest.Mock;
  setIcon: jest.Mock;
  setLatLng: jest.Mock;
  unbindTooltip: jest.Mock;
}> = [];
const polylineInstances: Array<{
  addTo: jest.Mock;
  setLatLngs: jest.Mock;
  setStyle: jest.Mock;
}> = [];
const mockLeaflet = {
  divIcon: jest.fn(() => ({})),
  layerGroup: jest.fn(() => ({ addTo: addToMap })),
  map: jest.fn(() => mockMap),
  marker: jest.fn(() => {
    const marker = {
      addTo: jest.fn(),
      bindTooltip: jest.fn(),
      setIcon: jest.fn(),
      setLatLng: jest.fn(),
      unbindTooltip: jest.fn(),
    };
    markerInstances.push(marker);
    return marker;
  }),
  polyline: jest.fn(() => {
    const polyline = {
      addTo: jest.fn(),
      setLatLngs: jest.fn(),
      setStyle: jest.fn(),
    };
    polylineInstances.push(polyline);
    return polyline;
  }),
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

async function waitForLeafletLoader(timeoutMs = 1_000): Promise<void> {
  const startedAt = Date.now();
  while (!resolveMockLeaflet) {
    if (Date.now() - startedAt >= timeoutMs) {
      throw new Error('Timed out waiting for the Leaflet loader to start');
    }
    await new Promise<void>((resolve) => setTimeout(resolve, 5));
  }
}

async function finishLeafletInitialization(): Promise<void> {
  await waitForLeafletLoader();
  expect(mockLoadLeaflet).toHaveBeenCalledTimes(1);
  await act(async () => {
    resolveMockLeaflet!(mockLeaflet);
    await Promise.resolve();
  });
}

describe('TransitMap native destination safety', () => {
  beforeEach(() => {
    mockPlatformOS = 'ios';
    jest.clearAllMocks();
    markerInstances.length = 0;
    polylineInstances.length = 0;
  });

  it('never exposes the current-position marker as a native Apple Maps destination', async () => {
    let renderer: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        <TransitMap
          center={{ lat: 22.3, lng: 114.2 }}
          points={[{ id: 'current-location', lat: 22.3, lng: 114.2, kind: 'me', label: 'Me' }]}
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
    markerInstances.length = 0;
    polylineInstances.length = 0;
    for (const key of Object.keys(mapHandlers)) delete mapHandlers[key];
    resolveMockLeaflet = null;
    mockLoadLeaflet.mockImplementation(() => new Promise((resolve) => {
      resolveMockLeaflet = resolve;
    }));
  });

  it('moves a keyed marker without rebuilding the map, tiles, or unchanged route', async () => {
    const initial = { lat: 22.2819, lng: 114.1588 };
    const moved = { lat: 22.2825, lng: 114.1594 };
    const target = {
      id: 'target-stop',
      lat: 22.283,
      lng: 114.16,
      kind: 'stop' as const,
      label: 'Target',
    };
    const route = {
      id: 'walking-route',
      points: [initial, target],
      dashed: true,
    };
    let renderer: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(
        <TransitMap
          center={initial}
          points={[{ id: 'current-location', ...initial, kind: 'me' }, target]}
          paths={[route]}
          followPoint={initial}
          followZoom={17}
        />,
        { createNodeMock: () => ({}) }
      );
    });
    await finishLeafletInitialization();

    expect(mapHandlers.dragstart).toBeDefined();

    expect(markerInstances).toHaveLength(2);
    expect(polylineInstances).toHaveLength(1);
    const currentLocationMarker = markerInstances[0];
    const unchangedRoute = polylineInstances[0];

    await act(async () => {
      renderer!.update(
        <TransitMap
          center={moved}
          points={[{ id: 'current-location', ...moved, kind: 'me' }, target]}
          paths={[route]}
          followPoint={moved}
          followZoom={17}
        />
      );
    });

    expect(mockLeaflet.map).toHaveBeenCalledTimes(1);
    expect(mockLeaflet.tileLayer).toHaveBeenCalledTimes(1);
    expect(markerInstances).toHaveLength(2);
    expect(currentLocationMarker.setLatLng).toHaveBeenCalledTimes(1);
    expect(currentLocationMarker.setLatLng).toHaveBeenCalledWith([moved.lat, moved.lng]);
    expect(polylineInstances).toHaveLength(1);
    expect(unchangedRoute.setLatLngs).not.toHaveBeenCalled();
    expect(unchangedRoute.setStyle).not.toHaveBeenCalled();
    expect(mockMap.removeLayer).not.toHaveBeenCalled();

    const changedRoute = {
      ...route,
      points: [initial, moved, target],
    };
    await act(async () => {
      renderer!.update(
        <TransitMap
          center={moved}
          points={[{ id: 'current-location', ...moved, kind: 'me' }, target]}
          paths={[changedRoute]}
          followPoint={moved}
          followZoom={17}
        />
      );
    });
    expect(polylineInstances).toHaveLength(1);
    expect(unchangedRoute.setLatLngs).toHaveBeenCalledTimes(1);
    expect(unchangedRoute.setLatLngs).toHaveBeenCalledWith([
      [initial.lat, initial.lng],
      [moved.lat, moved.lng],
      [target.lat, target.lng],
    ]);
    act(() => renderer!.unmount());
  });

  it('recenter resumes following later GPS updates at the requested zoom', async () => {
    const initial = { lat: 22.2819, lng: 114.1588 };
    const whileDragged = { lat: 22.2821, lng: 114.159 };
    const moved = { lat: 22.2825, lng: 114.1594 };
    const target = { id: 'target-stop', lat: 22.283, lng: 114.16, kind: 'stop' as const, label: 'Target' };
    let renderer: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        <TransitMap
          center={initial}
          points={[{ id: 'current-location', ...initial, kind: 'me' }, target]}
          followPoint={initial}
          followZoom={17}
        />,
        { createNodeMock: () => ({}) }
      );
    });
    await finishLeafletInitialization();

    expect(mapHandlers.dragstart).toBeDefined();

    mockMap.setView.mockClear();
    act(() => mapHandlers.dragstart());
    await act(async () => {
      renderer!.update(
        <TransitMap
          center={whileDragged}
          points={[{ id: 'current-location', ...whileDragged, kind: 'me' }, target]}
          followPoint={whileDragged}
          followZoom={17}
        />
      );
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
          points={[{ id: 'current-location', ...moved, kind: 'me' }, target]}
          followPoint={moved}
          followZoom={17}
        />
      );
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
