import { Linking, Platform } from 'react-native';
import { config } from '@/constants/config';

/**
 * Apple Wallet boundary — storing and presenting the loyalty pass (separate from Apple Pay).
 *
 * Real passes come from the backend (apps/loyalty/wallet.py): GET /me/loyalty/wallet-pass
 * returns a short-lived .pkpass link; opening it shows iOS's "Add to Apple Wallet" sheet, and the
 * pass updates itself through Apple's web service. The mock only records the pass as added.
 * Google Wallet would need a separate Loyalty Class/Object integration.
 */
export interface WalletPassService {
  readonly isDemo: boolean;
  isSupported(): boolean;
  /** Opens the system "Add to Wallet" flow for a signed pass URL. */
  addPass(passUrl: string | null): Promise<'added' | 'unavailable'>;
}

export const walletPassService: WalletPassService = {
  isDemo: config.dataSource === 'mock',
  isSupported() {
    return Platform.OS === 'ios' || Platform.OS === 'web';
  },
  async addPass(passUrl) {
    // DEMO: with mock data, simulate success. Against a real backend, no pass URL means
    // passes aren't issued yet — never pretend one was added.
    if (!passUrl) return config.dataSource === 'mock' ? 'added' : 'unavailable';
    await Linking.openURL(passUrl);
    return 'added';
  },
};
