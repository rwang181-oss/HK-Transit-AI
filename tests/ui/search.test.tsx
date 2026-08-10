import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';

const mockState = {
  entries: [],
  errors: { MTR: 'offline' },
  load: jest.fn(() => Promise.resolve()),
  loaded: true,
  query: '999',
  setQuery: jest.fn(),
};

jest.mock('react-native', () => {
  const ReactModule = jest.requireActual('react');
  const host = (name: string) => ReactModule.forwardRef((props: any, ref: any) =>
    ReactModule.createElement(name, { ...props, ref }, props.children));
  return {
    Pressable: host('Pressable'),
    ScrollView: host('ScrollView'),
    Text: host('Text'),
    TextInput: host('TextInput'),
    View: host('View'),
    Platform: {
      OS: 'web',
      select: (values: Record<string, unknown>) => values.web ?? values.default,
    },
    StyleSheet: { create: (styles: any) => styles },
  };
});

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn() }),
}));

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'en' },
  }),
}));

jest.mock('@/src/stores/routeCatalogStore', () => ({
  useRouteCatalogStore: (selector: (state: typeof mockState) => unknown) => selector(mockState),
}));

import { Text } from 'react-native';
import SearchScreen from '../../app/(tabs)/search';

describe('SearchScreen partial provider state', () => {
  it('shows the partial-data warning alongside an empty search result', () => {
    let renderer: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(<SearchScreen />);
    });

    const text = renderer!.root.findAllByType(Text)
      .flatMap((node) => Array.isArray(node.props.children) ? node.props.children : [node.props.children]);
    expect(text).toContain('search.noResults');
    expect(text).toContain('search.partialData');
    act(() => renderer!.unmount());
  });
});
