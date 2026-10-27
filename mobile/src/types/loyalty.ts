import type { ID, ISODateTime } from './common';

export interface LoyaltyCard {
  /** Stamps currently on the card (0…stampsPerReward). */
  stamps: number;
  /** Stamps needed for a reward — 9 (the 10th coffee is free). */
  stampsPerReward: number;
  /** Number printed under the barcode, scanned at the counter. */
  memberNumber: string;
  eligibility: string;
  rewardDescription: string;
  /** Whether the Wallet pass has been added on this account. */
  walletPassAdded: boolean;
  /** The server can issue an Apple Wallet pass (its certificates are set up). */
  walletPassAvailable?: boolean;
}

export type LoyaltyActivityType = 'earn' | 'redeem';

export interface LoyaltyActivity {
  id: ID;
  type: LoyaltyActivityType;
  /** e.g. "+1 stamp · Flat White", "Free coffee redeemed" */
  description: string;
  locationName: string;
  occurredAt: ISODateTime;
}
