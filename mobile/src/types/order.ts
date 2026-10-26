import type { ID, ISODateTime, ImageSource, Money, TimeOfDay } from './common';
import type { FulfilmentMethod } from './location';
import type { ModifierSelections } from './menu';

/** A line in the local cart. `unitPrice` is a snapshot including modifiers. */
export interface CartLine {
  key: string;
  itemId: ID;
  name: string;
  image: ImageSource | null;
  qty: number;
  selections: ModifierSelections;
  note: string;
  unitPrice: Money;
  modifiersLabel: string;
  /** Earns a coffee stamp / can be the free coffee (see domain/loyalty.ts). */
  isCoffee: boolean;
}

export type OrderTiming = { type: 'asap' } | { type: 'scheduled'; time: TimeOfDay };

/** How/where the customer wants the order — chosen in the "How would you like it?" sheet. */
export interface OrderContext {
  locationId: ID;
  method: FulfilmentMethod;
  timing: OrderTiming;
  deliveryAddress: string;
  tableNumber: string;
}

export type PaymentChoice = 'apple_pay' | 'saved_card' | 'new_card';

export interface OrderTotals {
  subtotal: Money;
  delivery: Money;
  /** Discount from the free-coffee reward (cheapest coffee). */
  reward: Money;
  surcharge: Money;
  /** Amount covered by gift card balance. */
  giftCard: Money;
  total: Money;
}

export type OrderStatus = 'received' | 'confirmed' | 'preparing' | 'ready' | 'completed' | 'declined';

export interface OrderLine {
  itemId: ID;
  name: string;
  qty: number;
  unitPrice: Money;
  selections: ModifierSelections;
  modifiersLabel: string;
  note: string;
}

export interface Order {
  id: ID;
  /** Customer-facing number, e.g. "#8020-4417". */
  number: string;
  locationId: ID;
  locationName: string;
  method: FulfilmentMethod;
  status: OrderStatus;
  createdAt: ISODateTime;
  timing: OrderTiming;
  deliveryAddress: string | null;
  tableNumber: string | null;
  lines: OrderLine[];
  totals: OrderTotals;
  /** e.g. "Apple Pay", "Visa ·· 4021 + gift card" */
  paymentLabel: string;
  stampsEarned: number;
  rewardRedeemed: boolean;
  /** Typical wait shown on the status screen, e.g. "20–25 min". */
  estimatedWait: string;
}

export interface CreateOrderLine {
  itemId: ID;
  qty: number;
  selections: ModifierSelections;
  note: string;
}

export interface CreateOrderRequest {
  locationId: ID;
  method: FulfilmentMethod;
  timing: OrderTiming;
  deliveryAddress?: string;
  tableNumber?: string;
  lines: CreateOrderLine[];
  payment: {
    choice: PaymentChoice;
    /** Saved payment method id when choice = saved_card. */
    paymentMethodId?: ID;
    /**
     * Single-use token from the payment provider (Apple Pay / Square card entry).
     * The app never sends raw card numbers to the EightyTwenty backend.
     */
    token?: string;
  };
  useGiftCard: boolean;
  useReward: boolean;
  contact: { name: string; phone: string };
  /** Client-side total shown at confirmation; the server must recompute and may reject mismatches. */
  expectedTotal: Money;
}
