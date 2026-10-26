import type { ID, ISODateTime, Money } from './common';

export interface GiftCard {
  last4: string;
  balance: Money;
}

/** added = credited to this card, spent = used on an order, sent = an eGift bought for someone else. */
export type GiftCardActivityKind = 'added' | 'spent' | 'sent';

export interface GiftCardActivity {
  id: ID;
  kind: GiftCardActivityKind;
  description: string;
  /** Always positive; `kind` gives the direction. */
  amount: Money;
  occurredAt: ISODateTime;
}

export interface SendGiftCardRequest {
  amount: Money;
  recipientName: string;
  recipientEmail: string;
  message: string;
  /** Apple Pay token from the payment integration. */
  paymentToken: string;
}
