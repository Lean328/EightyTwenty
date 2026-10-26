import { Linking, Platform } from 'react-native';
import { config } from '@/constants/config';

/**
 * Apple Wallet boundary — storing and presenting the loyalty pass (separate from Apple Pay).
 *
 * STATUS: MOCK. The "Add" action in the Wallet sheet records the pass as added via the
 * loyalty repository; no .pkpass is generated or installed.
 * Production requires: an Apple Pass Type ID + signing certificate on the backend, a
 * signed .pkpass per member (GET /me/loyalty/wallet-pass), the PassKit web service for
 * stamp updates, and either opening the .pkpass URL or a native PassKit module.
 * Google Wallet would need a separate Loyalty Class/Object integration.
 */
export interface WalletPassService {
  readonly isDemo: boolean;
  isSupported(): boolean;
  /** Opens the system "Add to Wallet" flow for a signed pass URL. */
  addPass(passUrl: string | null): Promise<'added' | 'unavailable'>;
}

export const walletPassService: WalletPassService = {
  isDemo: true,
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
