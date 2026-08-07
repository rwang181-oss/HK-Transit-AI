// Jest setup — mock AsyncStorage for all tests
jest.mock('@react-native-async-storage/async-storage', () => {
  const store = {};
  return {
    __esModule: true,
    default: {
      getItem: jest.fn((key) => Promise.resolve(store[key] || null)),
      setItem: jest.fn((key, value) => {
        store[key] = String(value);
        return Promise.resolve();
      }),
      removeItem: jest.fn((key) => {
        delete store[key];
        return Promise.resolve();
      }),
      clear: jest.fn(() => Promise.resolve()),
      getAllKeys: jest.fn(() => Promise.resolve(Object.keys(store))),
    },
  };
});
