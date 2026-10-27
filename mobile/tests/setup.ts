/* Jest setup: deterministic mock backend, native module mocks. */
process.env.EXPO_PUBLIC_DATA_SOURCE = 'mock';
process.env.EXPO_PUBLIC_MOCK_LATENCY_MS = '0';
process.env.EXPO_PUBLIC_MOCK_PERSIST = 'false';

jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
// Reanimated 4 runs on react-native-worklets; both ship Jest mocks.
jest.mock('react-native-worklets', () => require('react-native-worklets/src/mock'));
// Reanimated 4.7 (SDK 58): its native initializer calls setCSSEventHandler, which JSReanimated
// (used under Jest) throws on. Make that one call a no-op so the mock can load.
jest.mock('react-native-reanimated/src/css/native/proxy', () => ({
  ...jest.requireActual('react-native-reanimated/src/css/native/proxy'),
  setCSSEventHandler: () => {},
}));
jest.mock('react-native-reanimated', () => require('react-native-reanimated/mock'));
// Push needs a device; tests only need the module to load.
jest.mock('expo-notifications', () => ({
  setNotificationHandler: jest.fn(),
  AndroidImportance: { HIGH: 4 },
  DEFAULT_ACTION_IDENTIFIER: 'expo.modules.notifications.actions.DEFAULT',
  addNotificationReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
  addNotificationResponseReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
  getLastNotificationResponse: jest.fn(() => null),
  clearLastNotificationResponse: jest.fn(),
  getPermissionsAsync: jest.fn(async () => ({ status: 'denied' })),
  requestPermissionsAsync: jest.fn(async () => ({ status: 'denied' })),
  setNotificationChannelAsync: jest.fn(async () => null),
  getExpoPushTokenAsync: jest.fn(async () => ({ data: 'ExponentPushToken[test]' })),
}));
jest.mock('expo-location', () => ({
  Accuracy: { Balanced: 3 },
  getForegroundPermissionsAsync: jest.fn(async () => ({ granted: false })),
  requestForegroundPermissionsAsync: jest.fn(async () => ({ granted: true })),
  getLastKnownPositionAsync: jest.fn(async () => null),
  getCurrentPositionAsync: jest.fn(async () => ({ coords: { latitude: -35.28, longitude: 149.13 } })),
}));
jest.mock('expo-local-authentication', () => ({
  hasHardwareAsync: jest.fn(async () => true),
  isEnrolledAsync: jest.fn(async () => true),
  authenticateAsync: jest.fn(async () => ({ success: true })),
}));
jest.mock('expo-secure-store', () => {
  const store = new Map<string, string>();
  return {
    AFTER_FIRST_UNLOCK: 0,
    getItemAsync: jest.fn(async (k: string) => store.get(k) ?? null),
    setItemAsync: jest.fn(async (k: string, v: string) => void store.set(k, v)),
    deleteItemAsync: jest.fn(async (k: string) => void store.delete(k)),
  };
});
