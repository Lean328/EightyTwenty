import type { ID } from './common';

export type CardBrand = 'Visa' | 'Mastercard' | 'Amex' | 'JCB' | 'Card';

/**
 * A tokenised card stored by the payment provider (Square).
 * Only display data lives in the app: brand, last four digits and expiry.
 */
export interface SavedCard {
  id: ID;
  brand: CardBrand;
  last4: string;
  /** MM/YY */
  expiry: string;
}

/**
 * Result of the provider's secure card-entry UI.
 * DEMO: the mock derives this locally; production must use Square In-App Payments.
 */
export interface CardTokenResult {
  token: string;
  brand: CardBrand;
  last4: string;
  expiry: string;
}
