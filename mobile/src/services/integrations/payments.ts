import { Platform } from 'react-native';
import { config } from '@/constants/config';
import type { CardBrand, CardTokenResult, Money } from '@/types';
import { AppError } from '@/services/errors';

/**
 * Payment provider boundary: turns the customer's card or Apple Pay into a single-use token
 * for the backend, which charges it (backend/apps/orders/payments.py). Raw card numbers never
 * reach the EightyTwenty backend.
 *
 *  - Square (release builds): Square's own card entry sheet and Apple Pay sheet via the
 *    In-App Payments SDK (react-native-square-in-app-payments). Native code, so it needs an
 *    EAS / development build; Expo Go does not carry it.
 *  - Demo (Expo Go, dev, mock data): simulates success, takes no payment.
 *  - Unavailable: a release build without EXPO_PUBLIC_SQUARE_APPLICATION_ID.
 */
export interface PaymentProvider {
  readonly isDemo: boolean;
  /** True when the app draws its own card fields (demo); Square opens its own sheet instead. */
  readonly cardEntryInApp: boolean;
  isApplePayAvailable(): Promise<boolean>;
  /** Presents the Apple Pay sheet and returns a single-use payment token. */
  requestApplePay(params: { amount: Money; label: string }): Promise<{ token: string }>;
  /** Card token: from the demo fields (`input`) or from the provider's secure card sheet. */
  tokenizeCard(input?: DemoCardInput): Promise<CardTokenResult>;
}

/** Only used by the demo provider; production card entry happens inside the provider SDK. */
export interface DemoCardInput {
  number: string;
  expiry: string;
}

const cancelled = () => new AppError('CANCELLED', 'Payment cancelled.');

export function cardBrandFromNumber(digits: string): CardBrand {
  const d = digits[0];
  return d === '4' ? 'Visa' : d === '5' ? 'Mastercard' : d === '3' ? 'Amex' : 'Card';
}

/**
 * DEMO PROVIDER — simulates success without contacting any payment service.
 * The card number is reduced to brand + last four immediately and discarded.
 */
export const demoPaymentProvider: PaymentProvider = {
  isDemo: true,
  cardEntryInApp: true,
  async isApplePayAvailable() {
    return true;
  },
  async requestApplePay() {
    await new Promise((r) => setTimeout(r, 300));
    return { token: `demo_applepay_${Date.now()}` };
  },
  async tokenizeCard(input) {
    const digits = (input?.number ?? '').replace(/\D/g, '');
    const expiry = input?.expiry ?? '';
    if (digits.length < 12 || !/^\d{2}\s*\/\s*\d{2}$/.test(expiry.trim())) {
      throw new AppError('VALIDATION', 'Check the card number and expiry.');
    }
    return { token: `demo_card_${Date.now()}`, brand: cardBrandFromNumber(digits), last4: digits.slice(-4), expiry: expiry.replace(/\s/g, '') };
  },
};

/** No card payments in this build (release without a Square application ID). */
export const unavailablePaymentProvider: PaymentProvider = {
  isDemo: false,
  cardEntryInApp: false,
  async isApplePayAvailable() {
    return false;
  },
  async requestApplePay() {
    throw new AppError('NOT_IMPLEMENTED', 'Apple Pay isn’t available in this version of the app.');
  },
  async tokenizeCard() {
    throw new AppError('NOT_IMPLEMENTED', 'Card payments aren’t available in this version of the app.');
  },
};

type SquareSdk = typeof import('react-native-square-in-app-payments');

/** The SDK's native module, or null where it is not compiled in (Expo Go, web, Jest). */
function loadSquare(): SquareSdk | null {
  if (Platform.OS === 'web') return null;
  try {
    // Loaded lazily: importing it where the native module is missing (Expo Go) throws.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('react-native-square-in-app-payments') as SquareSdk;
  } catch {
    return null;
  }
}

// Square's Brand enum (VISA = 1…); native layers may also hand back the name.
const SQUARE_BRANDS: Record<string, CardBrand> = { 1: 'Visa', 2: 'Mastercard', 3: 'Amex', VISA: 'Visa', MASTERCARD: 'Mastercard', AMERICAN_EXPRESS: 'Amex' };

export function squareProvider(sdk: SquareSdk, applicationId: string, merchantId: string): PaymentProvider {
  let ready: Promise<void> | null = null;
  const init = () =>
    (ready ??= (async () => {
      sdk.SQIPCore.setSquareApplicationId(applicationId);
      if (Platform.OS === 'ios' && merchantId) sdk.SQIPApplePay.initializeApplePay(merchantId);
    })());

  return {
    isDemo: false,
    cardEntryInApp: false,
    async isApplePayAvailable() {
      if (Platform.OS !== 'ios' || !merchantId) return false;
      await init();
      return sdk.SQIPApplePay.canUseApplePay().catch(() => false);
    },
    async requestApplePay({ amount, label }) {
      await init();
      return new Promise((resolve, reject) => {
        let token: string | null = null;
        void sdk.SQIPApplePay.requestApplePayNonce(
          { price: amount.toFixed(2), summaryLabel: label, countryCode: 'AU', currencyCode: 'AUD', paymentType: sdk.PaymentType.PaymentTypeFinal },
          (details) => {
            token = details.nonce ?? null;
            // The order is placed right after; the sheet closes as soon as the card is authorised.
            sdk.SQIPApplePay.completeApplePayAuthorization(!!token);
          },
          (error) => reject(new AppError('PAYMENT_DECLINED', error?.message || 'Apple Pay didn’t go through. Please try again.')),
          () => (token ? resolve({ token }) : reject(cancelled())),
        ).catch(() => reject(new AppError('PAYMENT_DECLINED', 'Apple Pay didn’t go through. Please try again.')));
      });
    },
    async tokenizeCard() {
      await init();
      return new Promise((resolve, reject) => {
        sdk.SQIPCardEntry.startCardEntryFlow(
          { collectPostalCode: false },
          (details) => {
            const card = details.card;
            sdk.SQIPCardEntry.completeCardEntry(() =>
              details.nonce
                ? resolve({
                    token: details.nonce,
                    brand: SQUARE_BRANDS[String(card?.brand)] ?? 'Card',
                    last4: card?.lastFourDigits ?? '',
                    expiry: card?.expirationMonth && card.expirationYear ? `${String(card.expirationMonth).padStart(2, '0')}/${String(card.expirationYear).slice(-2)}` : '',
                  })
                : reject(new AppError('PAYMENT_DECLINED', 'Check your card details and try again.')),
            );
          },
          () => reject(cancelled()),
        );
      });
    },
  };
}

function chooseProvider(): PaymentProvider {
  const { applicationId, applePayMerchantId } = config.square;
  const sdk = applicationId ? loadSquare() : null;
  if (sdk && applicationId) return squareProvider(sdk, applicationId, applePayMerchantId);
  // Expo Go, dev servers and the client's mock mode keep the prototype's demo payments.
  if (__DEV__ || config.dataSource === 'mock') return demoPaymentProvider;
  return unavailablePaymentProvider;
}

export const paymentProvider: PaymentProvider = chooseProvider();
