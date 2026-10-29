/**
 * PROPOSED wire format for the EightyTwenty customer API (see docs/API_CONTRACTS.md).
 * These are the shapes the HTTP repositories expect — not a description of an
 * existing service. Conventions: camelCase JSON, money as integer cents,
 * timestamps ISO-8601 with offset, enums in snake_case.
 */

export type MethodDTO = 'pickup' | 'delivery' | 'dine_in';
export type WeekdayKeyDTO = 'sun' | 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat';

export interface SessionDTO {
  customerId: string;
  accessToken: string;
  refreshToken: string | null;
  expiresAt: string | null;
}

export interface CustomerDTO {
  id: string;
  name: string;
  email: string;
  phone: string;
  memberSince: string;
}

export interface PreferencesDTO {
  homeCafeId: string;
  dietary: ('gluten_free' | 'dairy_free' | 'vegan' | 'vegetarian')[];
  notifications: { orderUpdates: boolean; bookings: boolean; coffeeCard: boolean; offersAndNews: boolean; giftCardActivity: boolean };
  security: { biometricSignIn: boolean; useLocation: boolean; rememberOrderSettings: boolean };
  avatar: number;
}

export interface AddressDTO {
  id: string;
  label: 'home' | 'work' | 'other';
  line: string;
}

export interface LocationDTO {
  id: string;
  name: string;
  subtitle: string;
  area: string;
  headline: string;
  address: string;
  phone: string | null;
  email: string | null;
  hoursLabel: string;
  hoursShort: string;
  weeklyHours: Record<WeekdayKeyDTO, { open: string; close: string } | null> | null;
  status: 'open' | 'coming_soon';
  fulfilmentMethods: MethodDTO[];
  note: string;
  waitLabel: string | null;
  imageUrl: string | null;
  galleryUrls: string[];
  externalOrderUrl: string | null;
  bookingLabel: string;
  flags: { flagship?: boolean; limitedMenu?: boolean; glutenFree?: boolean };
  /** Optional (27/10/2026): café position, null until set in BOS. */
  latitude?: number | null;
  longitude?: number | null;
}

export interface MenuCategoryDTO {
  id: string;
  name: string;
  shortName: string;
  note: string;
}

export interface ModifierGroupDTO {
  id: string;
  name: string;
  required: boolean;
  maxSelections: number;
  options: { name: string; priceCents: number }[];
}

export interface MenuItemDTO {
  id: string;
  categoryId: string;
  name: string;
  description: string;
  priceCents: number;
  dietary: ('GF*' | 'DF*' | 'Gluten free' | 'Dairy free' | 'Vegan' | 'Vegetarian')[];
  imageUrl: string | null;
  featured: boolean;
  modifierGroups: ModifierGroupDTO[];
}

export interface OrderTotalsDTO {
  subtotalCents: number;
  deliveryCents: number;
  rewardCents: number;
  surchargeCents: number;
  giftCardCents: number;
  totalCents: number;
}

export interface OrderDTO {
  id: string;
  number: string;
  locationId: string;
  locationName: string;
  method: MethodDTO;
  status: 'received' | 'confirmed' | 'preparing' | 'ready' | 'completed' | 'declined';
  createdAt: string;
  timing: { type: 'asap' } | { type: 'scheduled'; time: string };
  deliveryAddress: string | null;
  tableNumber: string | null;
  lines: { itemId: string; name: string; qty: number; unitPriceCents: number; selections: Record<string, string[]>; modifiersLabel: string; note: string }[];
  totals: OrderTotalsDTO;
  paymentLabel: string;
  stampsEarned: number;
  rewardRedeemed: boolean;
  estimatedWait: string;
}

export interface PageDTO<T> {
  items: T[];
  nextCursor: string | null;
}

export interface SavedCardDTO {
  id: string;
  brand: 'visa' | 'mastercard' | 'amex' | 'jcb' | 'other';
  last4: string;
  expMonth: number;
  expYear: number;
}

export interface LoyaltyCardDTO {
  stamps: number;
  stampsPerReward: number;
  memberNumber: string;
  eligibility: string;
  rewardDescription: string;
  walletPassAdded: boolean;
  /** Optional (added 27/10/2026): the server can issue an Apple Wallet pass. */
  walletPassAvailable?: boolean;
  /** Optional (added 29/10/2026): free coffees ready (they add up); `stamps` stays capped at 9. */
  rewards?: number;
  /** Optional (added 29/10/2026): stamps towards the next free coffee. */
  progressStamps?: number;
}

export interface LoyaltyActivityDTO {
  id: string;
  type: 'earn' | 'redeem';
  description: string;
  locationName: string;
  occurredAt: string;
}

export interface ReservationDTO {
  id: string;
  locationId: string;
  date: string;
  time: string;
  guests: number;
  seating: 'indoor' | 'outdoor';
  status: 'requested' | 'confirmed' | 'cancelled';
  createdAt: string;
}

export interface CateringPackageDTO {
  id: string;
  name: string;
  pricePerPersonCents: number;
  priceLabel: string;
  unit: string;
  imageUrl: string | null;
  imagePosition: string;
  blurb: string;
  inclusions: string[];
}

export interface CateringEnquiryDTO {
  id: string;
  packageId: string;
  packageName: string;
  guests: number | null;
  date: string | null;
  occasion: string;
  status: 'enquiry_sent' | 'quoted' | 'confirmed' | 'closed';
  createdAt: string;
}

export interface GiftCardDTO {
  last4: string;
  balanceCents: number;
}

export interface GiftCardActivityDTO {
  id: string;
  kind: 'added' | 'spent' | 'sent';
  description: string;
  amountCents: number;
  occurredAt: string;
}

export interface NotificationDTO {
  id: string;
  kind: 'order' | 'loyalty' | 'booking' | 'offer' | 'gift_card';
  text: string;
  createdAt: string;
  unread: boolean;
  /** App screen a tap opens (e.g. /orders/<id>); empty or missing: pick one by kind. */
  url?: string | null;
}

export interface NotificationFeedDTO {
  items: NotificationDTO[];
  unseenIds: string[];
}

export interface OfferDTO {
  id: string;
  name: string;
  tag: string;
  line: string;
  fine: string;
  imageUrl: string | null;
}

export interface FaqDTO {
  question: string;
  answer: string;
}
