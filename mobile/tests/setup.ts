/* Jest setup: deterministic mock backend, native module mocks. */
process.env.EXPO_PUBLIC_DATA_SOURCE = 'mock';
process.env.EXPO_PUBLIC_MOCK_LATENCY_MS = '0';
process.env.EXPO_PUBLIC_MOCK_PERSIST = 'false';

jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
// Reanimated 4 runs on react-native-worklets; both ship Jest mocks.
jest.mock('react-native-worklets', () => require('react-native-worklets/src/mock'));
jest.mock('react-native-reanimated', () => require('react-native-reanimated/mock'));
jest.mock('expo-secure-store', () => {
  const store = new Map<string, string>();
  return {
    AFTER_FIRST_UNLOCK: 0,
    getItemAsync: jest.fn(async (k: string) => store.get(k) ?? null),
    setItemAsync: jest.fn(async (k: string, v: string) => void store.set(k, v)),
    deleteItemAsync: jest.fn(async (k: string) => void store.delete(k)),
  };
});
