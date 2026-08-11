import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';

const mockSearchAny = jest.fn(async () => []);
const mockRouter = { push: jest.fn() };
const mockMapPickerState = { pending: null, setPending: jest.fn() };
let mockPosition: { lat: number; lng: number } | null = {
  lat: 22.2819,
  lng: 114.1588,
};
let mockRequestError: string | null = null;
const mockLocationState = {
  get position() { return mockPosition; },
  loading: false,
  status: 'idle',
  get requestError() { return mockRequestError; },
  requestPermission: jest.fn(async () => false),
  getPosition: jest.fn(async () => undefined),
  locateOnce: jest.fn(async () => undefined),
  retryLocate: jest.fn(async () => undefined),
};
const mockWeatherState = {
  weather: {
    temperatureC: null,
    uvIndex: null,
    rainIntensity: 'none',
  },
  refresh: jest.fn(async () => undefined),
};

jest.mock('react-native', () => {
  const ReactModule = jest.requireActual('react');
  const host = (name: string) => ReactModule.forwardRef((props: any, ref: any) =>
    ReactModule.createElement(name, { ...props, ref }, props.children));
  return {
    ActivityIndicator: host('ActivityIndicator'),
    Pressable: host('Pressable'),
    SafeAreaView: host('SafeAreaView'),
    ScrollView: host('ScrollView'),
    Text: host('Text'),
    TextInput: host('TextInput'),
    View: host('View'),
    Platform: {
      OS: 'web',
      select: (choices: Record<string, unknown>) => choices.web ?? choices.default,
    },
    StyleSheet: { create: (styles: any) => styles, hairlineWidth: 1 },
  };
});

jest.mock('expo-router', () => ({
  useRouter: () => mockRouter,
}));

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'zh-HK' },
  }),
}));

jest.mock('@/src/stores/journeyStore', () => ({
  useJourneyStore: (selector: (state: any) => unknown) => selector({ searchAny: mockSearchAny }),
}));

jest.mock('@/src/stores/mapPickerStore', () => ({
  useMapPickerStore: (selector: (state: any) => unknown) => selector(mockMapPickerState),
}));

jest.mock('@/src/stores/locationStore', () => {
  const useLocationStore = Object.assign(
    () => mockLocationState,
    { getState: () => mockLocationState },
  );
  return { useLocationStore };
});

jest.mock('@/src/stores/weatherStore', () => ({
  useWeatherStore: () => mockWeatherState,
}));

jest.mock('@/src/utils/i18n', () => ({
  changeLanguage: jest.fn(async () => undefined),
}));

import { TextInput } from 'react-native';
import JourneyScreen from '../(tabs)/index';

describe('JourneyScreen origin input', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockPosition = { lat: 22.2819, lng: 114.1588 };
    mockRequestError = null;
    mockLocationState.requestPermission.mockClear();
    mockLocationState.locateOnce.mockReset();
    mockLocationState.locateOnce.mockResolvedValue({
      position: { lat: 22.2819, lng: 114.1588 },
      accuracyMeters: 8,
      speedMps: null,
      timestampMs: Date.now(),
    } as never);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('keeps a manual origin edit instead of restoring My Location', () => {
    let renderer: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(<JourneyScreen />);
    });

    expect(renderer!.root.findAllByType(TextInput)[0].props.value).toBe('');

    act(() => {
      renderer!.root.findAllByType(TextInput)[0].props.onChangeText('Central');
    });

    expect(renderer!.root.findAllByType(TextInput)[0].props.value).toBe('Central');
    act(() => renderer!.unmount());
  });

  it('keeps an intentional empty origin when GPS arrives after manual editing', () => {
    mockPosition = null;
    let renderer: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(<JourneyScreen />);
    });

    act(() => {
      renderer!.root.findAllByType(TextInput)[0].props.onChangeText('Central');
      renderer!.root.findAllByType(TextInput)[0].props.onChangeText('');
    });
    expect(renderer!.root.findAllByType(TextInput)[0].props.value).toBe('');

    mockPosition = { lat: 22.2819, lng: 114.1588 };
    act(() => {
      renderer!.update(<JourneyScreen />);
    });

    expect(renderer!.root.findAllByType(TextInput)[0].props.value).toBe('');
    act(() => renderer!.unmount());
  });

  it('does not request location until the user taps My location', () => {
    let renderer: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(<JourneyScreen />);
      jest.runOnlyPendingTimers();
    });

    expect(mockLocationState.requestPermission).not.toHaveBeenCalled();
    expect(mockLocationState.locateOnce).not.toHaveBeenCalled();

    const locationButton = renderer!.root.findAll((node) =>
      node.props.accessibilityLabel === 'journey.myLocation'
    )[0];
    act(() => {
      void locationButton.props.onPress();
    });
    expect(mockLocationState.locateOnce).toHaveBeenCalledTimes(1);
    act(() => renderer!.unmount());
  });

  it('does not reuse a retained global position when a new My location request fails', async () => {
    mockPosition = { lat: 22.2819, lng: 114.1588 };
    mockLocationState.locateOnce.mockResolvedValueOnce(null as never);
    let renderer: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(<JourneyScreen />);
    });
    await act(async () => {
      renderer!.root.findAllByType(TextInput)[0].props.onChangeText('Central');
      const locationButton = renderer!.root.findAll((node) =>
        node.props.accessibilityLabel === 'journey.myLocation'
      )[0];
      await locationButton.props.onPress();
    });
    expect(renderer!.root.findAllByType(TextInput)[0].props.value).toBe('Central');
    act(() => renderer!.unmount());
  });

  it('shows a recoverable one-shot error even while shared tracking remains available', () => {
    mockRequestError = 'timedOut';
    let renderer: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(<JourneyScreen />);
    });
    const errorCopy = renderer!.root.findAll((node) =>
      node.props.children === 'location.errors.timedOut'
    );
    expect(errorCopy.length).toBeGreaterThan(0);
    act(() => renderer!.unmount());
  });
});
