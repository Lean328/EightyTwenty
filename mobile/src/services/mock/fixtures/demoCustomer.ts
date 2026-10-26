import { LOYALTY_RULES } from '@/constants/business';
import { modifiersLabel, unitPrice } from '@/domain/pricing';
import type { CustomerPreferences, ModifierSelections, Order, Reservation } from '@/types';
import { nextWeekday, toISODate } from '@/utils/datetime';
import { findLocation, findMenuItem } from '../catalog';
import type { MockCustomerRecord } from '../types';

/**
 * DEMO FIXTURE — the "Sophie Nguyen" demo account from the design export (app-data.js
 * USER, LOYALTY, PAST_ORDERS, NOTIFICATIONS, GIFT and the prototype's initial state).
 * Timestamps reproduce the export's labels ("Today · 8:12 am", "Mon 5 Oct · 7:48 am")
 * relative to the export date, Thursday 8 October 2026 (Canberra, AEDT +11:00).
 *
 * Note: app-data.js lists `homeCafe: 'braddon'`, but the approved prototype opens on
 * Phillip; Phillip is used so the app matches the approved screens.
 */
export const DEMO_CUSTOMER_ID = 'cus_demo_sophie';
export const DEMO_EMAIL = 'sophie.n@example.com';

const T = (local: string) => `${local}:00+11:00`;

export const DEFAULT_PREFERENCES: CustomerPreferences = {
  homeCafeId: 'phillip',
  dietary: [],
  notifications: {
    'Order updates': true,
    Bookings: true,
    'Coffee card': true,
    'Offers & news': false,
    'Gift card activity': true,
  },
  security: { biometricSignIn: true, useLocation: true, rememberOrderSettings: true },
  avatar: 0,
};

function seedOrder(params: {
  id: string;
  number: string;
  locationId: string;
  createdAt: string;
  lines: { itemId: string; qty: number; sel?: ModifierSelections }[];
}): Order {
  const lines = params.lines.map((l) => {
    const item = findMenuItem(l.itemId)!;
    const sel = l.sel ?? {};
    return { itemId: item.id, name: item.name, qty: l.qty, unitPrice: unitPrice(item, sel), selections: sel, modifiersLabel: modifiersLabel(item, sel), note: '' };
  });
  const subtotal = lines.reduce((a, l) => a + l.unitPrice * l.qty, 0);
  const loc = findLocation(params.locationId)!;
  return {
    id: params.id,
    number: params.number,
    locationId: loc.id,
    locationName: loc.name,
    method: 'Pickup',
    status: 'completed',
    createdAt: params.createdAt,
    timing: { type: 'asap' },
    deliveryAddress: null,
    tableNumber: null,
    lines,
    totals: { subtotal, delivery: 0, reward: 0, surcharge: 0, giftCard: 0, total: subtotal },
    paymentLabel: '', // not recorded in the export
    stampsEarned: 0, // not recorded in the export
    rewardRedeemed: false,
    estimatedWait: loc.waitLabel ?? '15–20 min',
  };
}

/** The prototype seeds one confirmed booking: next Sunday, 9:30 am, Phillip, 2 guests. */
function seedBooking(now: Date): Reservation {
  return {
    id: 'res_seed',
    locationId: 'phillip',
    date: toISODate(nextWeekday(now, 0)),
    time: '09:30',
    guests: 2,
    seating: 'Indoor',
    status: 'Confirmed',
    createdAt: T('2026-10-05T10:00'),
  };
}

export function createDemoCustomer(now: Date = new Date()): MockCustomerRecord {
  return {
    profile: { id: DEMO_CUSTOMER_ID, name: 'Sophie Nguyen', email: DEMO_EMAIL, phone: '0400 123 456', memberSince: '2024-03-01' },
    preferences: { ...DEFAULT_PREFERENCES, dietary: ['Gluten free'] },
    favourites: ['smashed', 'icedlatte'],
    addresses: [],
    // DEMO FIXTURE: display data of a tokenised card (brand, last four, expiry) — not a real card.
    cards: [{ id: 'pm_demo_visa', brand: 'Visa', last4: '4021', expiry: '08/28' }],
    loyalty: {
      stamps: 6,
      memberNumber: '8020 0624 1188',
      walletPassAdded: false,
      activity: [
        { id: 'la1', type: 'earn', description: '+1 stamp · Flat White', locationName: 'Braddon', occurredAt: T('2026-10-08T08:12') },
        { id: 'la2', type: 'earn', description: '+1 stamp · Magic', locationName: 'Braddon', occurredAt: T('2026-10-05T07:48') },
        { id: 'la3', type: 'earn', description: '+1 stamp · Iced Latte', locationName: 'Phillip', occurredAt: T('2026-10-03T09:30') },
        { id: 'la4', type: 'earn', description: '+1 stamp · Flat White', locationName: 'Braddon', occurredAt: T('2026-10-02T08:05') },
        { id: 'la5', type: 'earn', description: '+1 stamp · Long Black', locationName: 'Civic', occurredAt: T('2026-09-29T08:16') },
        { id: 'la6', type: 'redeem', description: 'Free coffee redeemed', locationName: 'Braddon', occurredAt: T('2026-09-28T08:02') },
      ],
    },
    orders: [
      seedOrder({ id: 'o1', number: '#8020-4417', locationId: 'braddon', createdAt: T('2026-10-05T07:48'), lines: [{ itemId: 'hotcoffee', qty: 1, sel: { drink: ['Flat White'] } }, { itemId: 'smashed', qty: 1 }] }),
      seedOrder({ id: 'o2', number: '#8020-4160', locationId: 'phillip', createdAt: T('2026-10-03T09:31'), lines: [{ itemId: 'icedlatte', qty: 1 }, { itemId: 'japanese', qty: 1 }] }),
    ],
    reservations: [seedBooking(now)],
    enquiries: [],
    giftCard: { last4: '8020', balance: 42.5 },
    giftActivity: [{ id: 'ga1', kind: 'added', description: 'Added to your balance', amount: 25, occurredAt: T('2026-10-01T12:00') }],
    notifications: [
      { id: 'n1', kind: 'Order', text: 'Order #8020-4417 is ready at the Braddon counter.', createdAt: T('2026-10-08T08:14'), unread: true },
      { id: 'n2', kind: 'Loyalty', text: 'Stamp added — 3 more until your free coffee.', createdAt: T('2026-10-07T08:20'), unread: true },
      { id: 'n3', kind: 'Booking', text: 'Your table for 2 at Phillip is set for Sunday, 9:30 am.', createdAt: T('2026-10-05T10:00'), unread: false },
      { id: 'n4', kind: 'Offer', text: 'Keep Cups: buy a keep cup in store and the next two coffees are on us.', createdAt: T('2026-10-01T09:00'), unread: false },
      { id: 'n5', kind: 'Gift card', text: '$25 was added to your gift card balance.', createdAt: T('2026-10-01T12:00'), unread: false },
    ],
    notificationsSeenAt: null,
  };
}

/** A brand-new account created through Sign up: empty history, empty card. */
export function createNewCustomer(params: { id: string; name: string; email: string; phone: string; now?: Date }): MockCustomerRecord {
  const now = params.now ?? new Date();
  const digits = params.id.replace(/\D/g, '').padStart(8, '0');
  return {
    profile: { id: params.id, name: params.name, email: params.email, phone: params.phone, memberSince: toISODate(now) },
    preferences: { ...DEFAULT_PREFERENCES },
    favourites: [],
    addresses: [],
    cards: [],
    loyalty: { stamps: 0, memberNumber: `8020 ${digits.slice(-8, -4)} ${digits.slice(-4)}`, walletPassAdded: false, activity: [] },
    orders: [],
    reservations: [],
    enquiries: [],
    giftCard: { last4: digits.slice(-4), balance: 0 },
    giftActivity: [],
    notifications: [],
    notificationsSeenAt: null,
  };
}

export const STAMPS_PER_REWARD = LOYALTY_RULES.stampsPerReward;
