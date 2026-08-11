import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';

let mockNavigationState: any;

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

jest.mock('@/src/components/LiveJourneyPanel', () => {
  const ReactModule = jest.requireActual('react');
  return { LiveJourneyPanel: () => ReactModule.createElement('LiveJourneyPanel') };
});

import { Text } from 'react-native';
import { NavigationModal } from '../NavigationModal';

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
});
