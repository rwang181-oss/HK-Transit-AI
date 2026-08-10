import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';

let mockPlatformOS = 'web';
const mockOpenURL = jest.fn(() => Promise.resolve());
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
