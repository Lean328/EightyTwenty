export type * from './common';
export type * from './location';
export type * from './menu';
export type * from './order';
export type * from './loyalty';
export type * from './reservation';
export type * from './catering';
export type * from './customer';
export type * from './payment';
export type * from './giftCard';
export type * from './content';

/** Authenticated session. Tokens are stored in the device keychain/keystore. */
export interface Session {
  customerId: string;
  accessToken: string;
  refreshToken: string | null;
  /** ISO timestamp; `null` when the token doesn't expire (mock). */
  expiresAt: string | null;
  /** True when issued by the local mock provider — never treat as real auth. */
  isDemo: boolean;
}
