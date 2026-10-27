/**
 * Runtime configuration from EXPO_PUBLIC_* environment variables (see .env.example).
 *
 * EXPO_PUBLIC_ values are inlined into the JavaScript bundle at build time and are
 * readable by anyone with the app — never put secrets here.
 */
import Constants from 'expo-constants';
import { Platform } from 'react-native';

export type DataSource = 'mock' | 'api';

/**
 * Dev convenience: `http://127.0.0.1:8000/...` in .env means "the backend on this computer".
 * On a phone (Expo Go) 127.0.0.1 is the phone itself, so swap in the computer's LAN IP that
 * Metro is served from (hostUri, e.g. "192.168.1.18:8081"). Web and real URLs are untouched.
 */
export function resolveDevApiUrl(url: string, platform: string, hostUri: string | null | undefined): string {
  const match = /^(https?:\/\/)(localhost|127\.0\.0\.1|0\.0\.0\.0)(?=[:/]|$)/.exec(url);
  const lanHost = hostUri?.split(':')[0];
  if (!match || platform === 'web' || !lanHost || !/^\d{1,3}(\.\d{1,3}){3}$/.test(lanHost)) return url;
  return match[1] + lanHost + url.slice(match[0].length);
}

function readNumber(value: string | undefined, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) && value !== undefined && value !== '' ? n : fallback;
}

function readBool(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value === '') return fallback;
  return value === 'true' || value === '1';
}

const dataSource: DataSource = process.env.EXPO_PUBLIC_DATA_SOURCE === 'api' ? 'api' : 'mock';

export const config = {
  dataSource,
  api: {
    baseUrl: resolveDevApiUrl((process.env.EXPO_PUBLIC_API_BASE_URL ?? '').replace(/\/+$/, ''), Platform.OS, __DEV__ ? Constants.expoConfig?.hostUri : null),
    timeoutMs: readNumber(process.env.EXPO_PUBLIC_API_TIMEOUT_MS, 15000),
  },
  /**
   * Square In-App Payments (card entry + Apple Pay). Both IDs are public by design; the access
   * token that moves money lives only on the backend. Empty application ID = no card payments
   * in a release build (dev builds and Expo Go use the demo provider).
   */
  square: {
    applicationId: process.env.EXPO_PUBLIC_SQUARE_APPLICATION_ID ?? '',
    applePayMerchantId: process.env.EXPO_PUBLIC_APPLE_PAY_MERCHANT_ID ?? '',
  },
  /**
   * Prototype features that need something not connected yet. The client's mock mode keeps
   * them; against the real API they stay hidden (a button that does nothing is an App Store
   * rejection) until switched on here.
   *  - walletPasses: Apple Wallet pass — needs a Pass Type ID + signing on the backend.
   *  - nearestCafe: "Use my location" — needs café coordinates in BOS and expo-location.
   *  - giftCardSales: sending an eGift — needs a payment provider and Square issuing the card.
   *  - savedCards: saving a card for later — needs Square's Cards API on the backend.
   */
  features: {
    walletPasses: dataSource === 'mock' || readBool(process.env.EXPO_PUBLIC_WALLET_PASSES, false),
    nearestCafe: dataSource === 'mock' || readBool(process.env.EXPO_PUBLIC_NEAREST_CAFE, false),
    giftCardSales: dataSource === 'mock' || readBool(process.env.EXPO_PUBLIC_GIFT_CARD_SALES, false),
    savedCards: dataSource === 'mock' || readBool(process.env.EXPO_PUBLIC_SAVED_CARDS, false),
  },
  /** Customer website (privacy policy, terms). */
  websiteUrl: (process.env.EXPO_PUBLIC_WEBSITE_URL || 'https://eightytwenty.pages.dev').replace(/\/+$/, ''),
  mock: {
    latencyMs: readNumber(process.env.EXPO_PUBLIC_MOCK_LATENCY_MS, 350),
    /** Persist simulated data across app restarts (AsyncStorage). */
    persist: readBool(process.env.EXPO_PUBLIC_MOCK_PERSIST, true),
    /** `declined` demonstrates the "We couldn't take this one" order outcome. */
    orderOutcome: process.env.EXPO_PUBLIC_MOCK_ORDER_OUTCOME === 'declined' ? 'declined' : 'normal',
  },
} as const;

export function assertApiConfigured(): void {
  if (config.dataSource === 'api' && !config.api.baseUrl) {
    throw new Error('EXPO_PUBLIC_DATA_SOURCE=api requires EXPO_PUBLIC_API_BASE_URL to be set.');
  }
}
