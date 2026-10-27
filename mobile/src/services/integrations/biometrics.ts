import * as LocalAuthentication from 'expo-local-authentication';
import { Platform } from 'react-native';
import { secureStorage } from './secureStorage';

const LOCK_KEY = 'eightytwenty.faceIdLock';

/**
 * Face ID / Touch ID ("Sign in with Face ID"). The session already survives restarts, so
 * signing in with Face ID means: when the app opens, unlock it with Face ID instead of the
 * password. The switch belongs to this phone (Keychain), not to the account.
 */
export const biometrics = {
  async available(): Promise<boolean> {
    if (Platform.OS === 'web') return false;
    return (await LocalAuthentication.hasHardwareAsync()) && (await LocalAuthentication.isEnrolledAsync());
  },
  async authenticate(promptMessage: string): Promise<boolean> {
    const result = await LocalAuthentication.authenticateAsync({ promptMessage, cancelLabel: 'Cancel' });
    return result.success;
  },
  async isLockOn(): Promise<boolean> {
    return (await secureStorage.get(LOCK_KEY)) === '1';
  },
  setLockOn(on: boolean): Promise<void> {
    return on ? secureStorage.set(LOCK_KEY, '1') : secureStorage.remove(LOCK_KEY);
  },
};
