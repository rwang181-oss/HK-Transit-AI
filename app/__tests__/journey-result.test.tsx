import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';

const mockStopNavigation = jest.fn();
const mockPending = new Promise<never>(() => undefined);

jest.mock('react-native', () => {
  const ReactModule = jest.requireActual('react');
  const host = (name: string) => ReactModule.forwardRef((props: any, ref: any) =>
    ReactModule.createElement(name, { ...props, ref }, props.children));
  return {
    ActivityIndicator: host('ActivityIndicator'), Pressable: host('Pressable'),
    SafeAreaView: host('SafeAreaView'), ScrollView: host('ScrollView'),
    Text: host('Text'), View: host('View'),
    Platform: { OS: 'web', select: (values: Record<string, unknown>) => values.web ?? values.default },
    StyleSheet: { create: (styles: any) => styles, hairlineWidth: 1 },
  };
});
jest.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  useRouter: () => ({ back: jest.fn(), push: jest.fn() }),
  useLocalSearchParams: () => ({
    fromLat: '22.28', fromLng: '114.15', fromName: 'Start',
    toLat: '22.30', toLng: '114.17', toName: 'End',
  }),
}));
jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } }),
}));
jest.mock('@/src/stores/navigationStore', () => ({
  useNavigationStore: (selector: (state: any) => unknown) => selector({
    start: jest.fn(), stop: mockStopNavigation, phase: 'tracking', error: null,
  }),
}));
jest.mock('@/src/journey/index/progressivePlanner', () => ({
  createProgressiveJourneySession: () => ({ initial: mockPending, refined: mockPending }),
}));
jest.mock('@/src/journey/planner/routePolicies', () => ({ applyJourneyPolicy: (rows: unknown[]) => rows }));
jest.mock('@/src/journey/index/betterResults', () => ({ hasMeaningfullyBetterResults: () => false }));
jest.mock('@/src/components/TransitMap', () => ({ TransitMap: () => null }));
jest.mock('@/src/components/JourneyModeChips', () => ({ JourneyModeChips: () => null }));
jest.mock('@/src/components/JourneyOptionCard', () => ({ JourneyOptionCard: () => null }));
jest.mock('@/src/components/NavigationModal', () => ({ NavigationModal: () => null }));

import JourneyResultScreen from '../journey/result';

describe('JourneyResultScreen navigation ownership', () => {
  it('stops foreground navigation when its owning result page unmounts', () => {
    let renderer: TestRenderer.ReactTestRenderer;
    act(() => { renderer = TestRenderer.create(<JourneyResultScreen />); });
    expect(mockStopNavigation).not.toHaveBeenCalled();

    act(() => renderer!.unmount());

    expect(mockStopNavigation).toHaveBeenCalledTimes(1);
  });
});
