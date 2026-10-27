import * as ExpoLinking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { Linking, Platform } from 'react-native';
import { config } from '@/constants/config';
import { colors } from '@/theme';

/**
 * Apple Wallet boundary — storing and presenting the loyalty pass (separate from Apple Pay).
 *
 * Real passes come from the backend (apps/loyalty/wallet.py): GET /me/loyalty/wallet-pass
 * returns a short-lived link to a small "adding your coffee card" page. The app opens it in an
 * in-app browser sheet; the page hands the .pkpass to Wallet ("Add to Apple Wallet"), then shows
 * "Back to the app", whose link closes the sheet (nothing is left behind in Safari). The pass
 * updates itself through Apple's web service. The mock only records the pass as added.
 * Google Wallet would need a separate Loyalty Class/Object integration.
 */
export interface WalletPassService {
  readonly isDemo: boolean;
  isSupported(): boolean;
  /** The link "Back to the app" opens: this screen again, so the app stays where it was. */
  returnUrl(path: string): string;
  /** Opens the "Add to Wallet" page; resolves once it is closed. */
  addPass(pageUrl: string | null): Promise<'added' | 'closed' | 'unavailable'>;
}

const BACK_MARKER = 'walletAdded=1';

export const walletPassService: WalletPassService = {
  isDemo: config.dataSource === 'mock',
  isSupported() {
    return Platform.OS === 'ios' || Platform.OS === 'web';
  },
  returnUrl(path) {
    return ExpoLinking.createURL(path || '/', { queryParams: { walletAdded: '1' } });
  },
  async addPass(pageUrl) {
    // DEMO: with mock data, simulate success. Against a real backend, no URL means passes
    // aren't issued yet — never pretend one was added.
    if (!pageUrl) return config.dataSource === 'mock' ? 'added' : 'unavailable';
    if (Platform.OS === 'web') {
      await Linking.openURL(pageUrl);
      return 'closed';
    }
    const back = Linking.addEventListener('url', (event) => {
      if (event.url.includes(BACK_MARKER)) WebBrowser.dismissBrowser();
    });
    try {
      await WebBrowser.openBrowserAsync(pageUrl, {
        presentationStyle: WebBrowser.WebBrowserPresentationStyle.PAGE_SHEET,
        controlsColor: colors.espresso,
        dismissButtonStyle: 'done',
      });
    } finally {
      back.remove();
    }
    return 'closed';
  },
};
