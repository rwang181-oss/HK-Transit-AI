import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';

let mockNavigationState: any;
let mockLocationState: any;

jest.mock('react-native', () => {
  const ReactModule = jest.requireActual('react');
  const host = (name: string) => ReactModule.forwardRef((props: any, ref: any) =>
    ReactModule.createElement(name, { ...props, ref }, props.children));
  return {
    ActivityIndicator: host('ActivityIndicator'),
    Modal: host('Modal'),
    Pressable: host('Pressable'),
    SafeAreaView: host('SafeAreaView'),
    ScrollView: host('ScrollView'),
    Text: host('Text'),
    View: host('View'),
    Platform: { OS: 'ios' },
    Linking: { openURL: jest.fn(() => Promise.resolve()) },
    StyleSheet: { create: (styles: any) => styles, hairlineWidth: 1 },
  };
});

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

jest.mock('@/src/stores/navigationStore', () => ({
  useNavigationStore: () => mockNavigationState,
}));

jest.mock('@/src/stores/locationStore', () => ({
  useLocationStore: () => mockLocationState,
  isUsableLocationSample: (sample: any) => Boolean(
    sample
    && Date.now() - sample.timestampMs >= 0
    && Date.now() - sample.timestampMs <= 60_000
    && typeof sample.accuracyMeters === 'number'
    && sample.accuracyMeters <= 100
  ),
}));

jest.mock('@/src/journey/walking/walkingRouter', () => ({
  walkingRouter: { route: jest.fn(() => new Promise(() => undefined)) },
}));

jest.mock('@/src/components/LiveJourneyPanel', () => {
  const ReactModule = jest.requireActual('react');
  return { LiveJourneyPanel: () => ReactModule.createElement('LiveJourneyPanel') };
});

import { Text } from 'react-native';
import { NavigationModal } from '../NavigationModal';
import { TransitMap } from '../TransitMap';

function optionWithTarget(lat: number, lng: number) {
  return {
    itinerary: {
      legs: [{
        provider: 'KMB', route: '1', bound: 'O', kind: 'ride', minutes: 10,
        fromHubId: 'A', toHubId: 'B', fromName: 'Station A', toName: 'Station B',
        fromLat: lat, fromLng: lng, toLat: 22.31, toLng: 114.21,
      }],
    },
    geometry: [{ lat: 22.29, lng: 114.19 }, { lat: 22.31, lng: 114.21 }],
  };
}

function renderedText(renderer: TestRenderer.ReactTestRenderer): string[] {
  return renderer.root.findAllByType(Text)
    .flatMap((node) => Array.isArray(node.props.children) ? node.props.children : [node.props.children])
    .filter((value): value is string => typeof value === 'string');
}

describe('NavigationModal map availability', () => {
  beforeEach(() => {
    mockNavigationState = {
      option: optionWithTarget(22.3, 114.2),
      destination: { lat: 22.32, lng: 114.22, name: 'End' },
      phase: 'walkingToTransit',
      activeLegIndex: 0,
      currentPosition: null,
      error: null,
      retryLocation: jest.fn(() => mockLocationState.retryTracking()),
    };
    mockLocationState = {
      latestSample: null,
      status: 'locating',
      error: null,
      requestError: null,
      retryTracking: jest.fn(() => Promise.resolve(null)),
    };
  });

  it('does not render a map when the active target coordinates are invalid', () => {
    mockNavigationState.option = optionWithTarget(0, 0);
    mockNavigationState.currentPosition = { lat: 22.3, lng: 114.2 };
    let renderer: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        <NavigationModal visible starting={false} onClose={() => undefined} />
      );
    });

    const text = renderedText(renderer!);
    expect(text).toContain('navigation.targetUnavailable');
    expect(text).not.toContain('journey.nativeMapTitle');
    act(() => renderer!.unmount());
  });

  it('shows the location error instead of an indefinite locating state', () => {
    mockNavigationState.error = 'locationPermissionDenied';
    mockLocationState.status = 'denied';
    mockLocationState.error = 'denied';
    let renderer: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        <NavigationModal visible starting={false} onClose={() => undefined} />
      );
    });

    const text = renderedText(renderer!);
    expect(text).toContain('navigation.errors.locationPermissionDenied');
    expect(text).not.toContain('navigation.locating');
    act(() => renderer!.unmount());
  });

  it('shows accuracy and update state from the shared location sample', () => {
    mockNavigationState.currentPosition = { lat: 22.3, lng: 114.2 };
    mockLocationState.status = 'tracking';
    mockLocationState.latestSample = {
      position: { lat: 22.3, lng: 114.2 },
      accuracyMeters: 12.4,
      speedMps: 1.1,
      timestampMs: Date.now() - 4_000,
    };
    let renderer: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        <NavigationModal visible starting={false} onClose={() => undefined} />
      );
    });

    const text = renderedText(renderer!);
    expect(text).toContain('navigation.locationTracking');
    expect(text).toContain('navigation.locationAccuracy');
    expect(text).toContain('navigation.locationUpdated');
    act(() => renderer!.unmount());
  });

  it('does not let a stale retained sample drive a new live journey', () => {
    mockLocationState.status = 'tracking';
    mockLocationState.latestSample = {
      position: { lat: 22.45, lng: 114.35 },
      accuracyMeters: 12,
      speedMps: 1,
      timestampMs: Date.now() - 61_000,
    };
    let renderer: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        <NavigationModal visible starting={false} onClose={() => undefined} />
      );
    });

    const map = renderer!.root.findByType(TransitMap);
    expect(map.props.followPoint).toBeNull();
    expect(map.props.points).not.toContainEqual(expect.objectContaining({ id: 'current-location' }));
    const text = renderedText(renderer!);
    expect(text).not.toContain('navigation.locationAccuracy');
    expect(text).not.toContain('navigation.locationUpdated');
    act(() => renderer!.unmount());
  });

  it('retries through the shared location lifecycle after a live tracking error', async () => {
    mockLocationState.status = 'timedOut';
    mockLocationState.error = 'timedOut';
    mockLocationState.requestError = 'timedOut';
    let renderer: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        <NavigationModal visible starting={false} onClose={() => undefined} />
      );
    });

    const retry = renderer!.root.findByProps({ accessibilityLabel: 'common.retry' });
    await act(async () => {
      retry.props.onPress();
      retry.props.onPress();
      await mockNavigationState.retryLocation.mock.results[0].value;
    });
    expect(mockNavigationState.retryLocation).toHaveBeenCalledTimes(1);
    expect(mockLocationState.retryTracking).toHaveBeenCalledTimes(1);
    act(() => renderer!.unmount());
  });

  it('shows pending after retry and exposes only the final success or error state', async () => {
    mockNavigationState.error = 'locationTimedOut';
    mockLocationState.status = 'timedOut';
    mockLocationState.error = 'timedOut';
    mockLocationState.requestError = 'timedOut';
    let settleRetry!: () => void;
    mockNavigationState.retryLocation = jest.fn(() => new Promise<void>((resolve) => {
      settleRetry = resolve;
    }));
    let renderer: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        <NavigationModal visible starting={false} onClose={() => undefined} />
      );
    });

    const retry = renderer!.root.findByProps({ accessibilityLabel: 'common.retry' });
    act(() => retry.props.onPress());
    expect(mockNavigationState.retryLocation).toHaveBeenCalledTimes(1);
    expect(renderer!.root.findAllByProps({ accessibilityLabel: 'common.retry' })).toHaveLength(0);
    expect(renderedText(renderer!)).toContain('navigation.locating');

    mockNavigationState.error = null;
    mockLocationState.status = 'tracking';
    mockLocationState.error = null;
    mockLocationState.requestError = null;
    mockNavigationState.currentPosition = { lat: 22.3, lng: 114.2 };
    mockLocationState.latestSample = {
      position: mockNavigationState.currentPosition,
      accuracyMeters: 8,
      speedMps: 1,
      timestampMs: Date.now(),
    };
    await act(async () => {
      settleRetry();
      await mockNavigationState.retryLocation.mock.results[0].value;
      renderer!.update(
        <NavigationModal visible starting={false} onClose={() => undefined} />
      );
    });
    expect(renderedText(renderer!)).toContain('navigation.locationTracking');
    expect(renderer!.root.findAllByProps({ accessibilityLabel: 'common.retry' })).toHaveLength(0);

    mockNavigationState.error = null;
    mockLocationState.status = 'failed';
    mockLocationState.error = null;
    mockLocationState.requestError = 'failed';
    act(() => {
      renderer!.update(
        <NavigationModal visible starting={false} onClose={() => undefined} />
      );
    });
    expect(renderedText(renderer!)).toContain('location.errors.failed');
    expect(renderer!.root.findByProps({ accessibilityLabel: 'common.retry' })).toBeDefined();
    act(() => renderer!.unmount());
  });
});
