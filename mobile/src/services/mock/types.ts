import type {
  AppNotification,
  CateringEnquiry,
  Customer,
  CustomerPreferences,
  GiftCard,
  GiftCardActivity,
  ID,
  ISODateTime,
  LoyaltyActivity,
  Order,
  Reservation,
  SavedAddress,
  SavedCard,
} from '@/types';

/**
 * Shape of the simulated backend's per-customer data. Persisted to AsyncStorage as JSON,
 * so it must only hold plain data (image references are resolved from the catalogue).
 * Passwords are never stored — the mock accepts any valid-looking password.
 */
export interface MockCustomerRecord {
  profile: Customer;
  preferences: CustomerPreferences;
  favourites: ID[];
  addresses: SavedAddress[];
  cards: SavedCard[];
  loyalty: {
    stamps: number;
    memberNumber: string;
    walletPassAdded: boolean;
    activity: LoyaltyActivity[];
  };
  orders: Order[];
  reservations: Reservation[];
  enquiries: CateringEnquiry[];
  giftCard: GiftCard;
  giftActivity: GiftCardActivity[];
  notifications: AppNotification[];
  notificationsSeenAt: ISODateTime | null;
  /** Idempotency-Key → id of the order / gift activity it created (simulates server replay). */
  idempotency?: Record<string, ID>;
}

export interface MockDbState {
  /** Bump when the record shape changes; older persisted data is discarded. */
  version: number;
  customers: Record<ID, MockCustomerRecord>;
  /** lower-cased email → customer id */
  emailIndex: Record<string, ID>;
}
