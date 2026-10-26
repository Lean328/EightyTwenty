import * as SecureStore from 'expo-secure-store';

/**
 * Secure key/value storage for auth tokens — iOS Keychain / Android Keystore via
 * expo-secure-store. The web build uses secureStorage.web.ts (localStorage, preview only).
 */
export const secureStorage = {
  get(key: string): Promise<string | null> {
    return SecureStore.getItemAsync(key);
  },
  set(key: string, value: string): Promise<void> {
    return SecureStore.setItemAsync(key, value, { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK });
  },
  remove(key: string): Promise<void> {
    return SecureStore.deleteItemAsync(key);
  },
};
