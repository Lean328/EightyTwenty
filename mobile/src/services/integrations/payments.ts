import type { CardBrand, CardTokenResult, Money } from '@/types';
import { AppError } from '@/services/errors';

/**
 * Payment provider boundary (Square per the source copy: "eGift cards are issued and
 * redeemed through Square").
 *
 * STATUS: UI DEMONSTRATION ONLY. No payment is taken anywhere in this app.
 *  - Apple Pay requires: Apple Merchant ID, payment processing certificate, the Apple Pay
 *    entitlement in a development/production build, and a native module
 *    (e.g. Square In-App Payments SDK or Stripe/Adyen equivalent). Not available in Expo Go.
 *  - Card entry must use the provider's PCI-compliant UI, which returns a single-use token.
 *    Raw card numbers must never be sent to the EightyTwenty backend or stored in the app.
 * See docs/BACKEND_HANDOFF.md → "Payments".
 */
export interface PaymentProvider {
  readonly isDemo: boolean;
  isApplePayAvailable(): Promise<boolean>;
  /** Presents the Apple Pay sheet and returns a single-use payment token. */
  requestApplePay(params: { amount: Money; label: string }): Promise<{ token: string }>;
  /** Tokenises card details entered in the provider's secure UI. */
  tokenizeCard(input: DemoCardInput): Promise<CardTokenResult>;
}

/** Only used by the demo provider; production card entry happens inside the provider SDK. */
export interface DemoCardInput {
  number: string;
  expiry: string;
}

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
  async isApplePayAvailable() {
    return true;
  },
  async requestApplePay() {
    await new Promise((r) => setTimeout(r, 300));
    return { token: `demo_applepay_${Date.now()}` };
  },
  async tokenizeCard({ number, expiry }) {
    const digits = number.replace(/\D/g, '');
    if (digits.length < 12 || !/^\d{2}\s*\/\s*\d{2}$/.test(expiry.trim())) {
      throw new AppError('VALIDATION', 'Check the card number and expiry.');
    }
    return { token: `demo_card_${Date.now()}`, brand: cardBrandFromNumber(digits), last4: digits.slice(-4), expiry: expiry.replace(/\s/g, '') };
  },
};

export const paymentProvider: PaymentProvider = demoPaymentProvider;
