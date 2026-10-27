import type {
  AppNotification,
  CardBrand,
  CateringEnquiry,
  CateringPackage,
  Customer,
  CustomerPreferences,
  DietaryPreference,
  FulfilmentMethod,
  GiftCard,
  GiftCardActivity,
  ImageSource,
  Location,
  LoyaltyActivity,
  LoyaltyCard,
  MenuCategory,
  MenuItem,
  NotificationKind,
  Offer,
  Order,
  Reservation,
  SavedAddress,
  SavedCard,
  Session,
  Weekday,
  WeeklyHours,
} from '@/types';
import type * as D from './dto';

/** Backend response → domain model. Keep all wire-format knowledge in this file. */
export const cents = (c: number) => Math.round(c) / 100;
export const toCents = (amount: number) => Math.round(amount * 100);
const img = (url: string | null | undefined): ImageSource | null => (url ? { uri: url } : null);

export const methodFromDto: Record<D.MethodDTO, FulfilmentMethod> = { pickup: 'Pickup', delivery: 'Delivery', dine_in: 'Dine In' };
export const methodToDto: Record<FulfilmentMethod, D.MethodDTO> = { Pickup: 'pickup', Delivery: 'delivery', 'Dine In': 'dine_in' };

const DIET_FROM: Record<D.PreferencesDTO['dietary'][number], DietaryPreference> = { gluten_free: 'Gluten free', dairy_free: 'Dairy free', vegan: 'Vegan', vegetarian: 'Vegetarian' };
const DIET_TO = Object.fromEntries(Object.entries(DIET_FROM).map(([k, v]) => [v, k])) as Record<DietaryPreference, D.PreferencesDTO['dietary'][number]>;
const WEEKDAY_KEYS: D.WeekdayKeyDTO[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

export function sessionFromDto(dto: D.SessionDTO): Session {
  return { ...dto, isDemo: false };
}

export function customerFromDto(dto: D.CustomerDTO): Customer {
  return { ...dto };
}

export function preferencesFromDto(dto: D.PreferencesDTO): CustomerPreferences {
  return {
    homeCafeId: dto.homeCafeId,
    dietary: dto.dietary.map((d) => DIET_FROM[d]),
    notifications: {
      'Order updates': dto.notifications.orderUpdates,
      Bookings: dto.notifications.bookings,
      'Coffee card': dto.notifications.coffeeCard,
      'Offers & news': dto.notifications.offersAndNews,
      'Gift card activity': dto.notifications.giftCardActivity,
    },
    security: dto.security,
    avatar: dto.avatar,
  };
}

export function preferencesToDto(p: Partial<CustomerPreferences>): Partial<D.PreferencesDTO> {
  return {
    ...(p.homeCafeId !== undefined && { homeCafeId: p.homeCafeId }),
    ...(p.dietary && { dietary: p.dietary.map((d) => DIET_TO[d]) }),
    ...(p.notifications && {
      notifications: {
        orderUpdates: p.notifications['Order updates'],
        bookings: p.notifications.Bookings,
        coffeeCard: p.notifications['Coffee card'],
        offersAndNews: p.notifications['Offers & news'],
        giftCardActivity: p.notifications['Gift card activity'],
      },
    }),
    ...(p.security && { security: p.security }),
    ...(p.avatar !== undefined && { avatar: p.avatar }),
  };
}

export function addressFromDto(dto: D.AddressDTO): SavedAddress {
  return { id: dto.id, line: dto.line, label: dto.label === 'home' ? 'Home' : dto.label === 'work' ? 'Work' : 'Other' };
}

export function locationFromDto(dto: D.LocationDTO): Location {
  let weeklyHours: WeeklyHours | null = null;
  if (dto.weeklyHours) {
    weeklyHours = {} as WeeklyHours;
    WEEKDAY_KEYS.forEach((k, i) => {
      weeklyHours![i as Weekday] = dto.weeklyHours![k] ?? null;
    });
  }
  return {
    id: dto.id,
    name: dto.name,
    subtitle: dto.subtitle,
    area: dto.area,
    headline: dto.headline,
    address: dto.address,
    phone: dto.phone,
    email: dto.email,
    hoursLabel: dto.hoursLabel,
    hoursShort: dto.hoursShort,
    weeklyHours,
    status: dto.status === 'coming_soon' ? 'comingSoon' : 'open',
    methods: dto.fulfilmentMethods.map((m) => methodFromDto[m]),
    note: dto.note,
    waitLabel: dto.waitLabel,
    image: img(dto.imageUrl),
    gallery: dto.galleryUrls.map((u) => ({ uri: u })),
    externalOrderUrl: dto.externalOrderUrl,
    bookingLabel: dto.bookingLabel,
    flags: dto.flags,
  };
}

export function categoryFromDto(dto: D.MenuCategoryDTO): MenuCategory {
  return { ...dto };
}

export function menuItemFromDto(dto: D.MenuItemDTO): MenuItem {
  return {
    id: dto.id,
    categoryId: dto.categoryId,
    name: dto.name,
    description: dto.description,
    price: cents(dto.priceCents),
    dietary: dto.dietary,
    image: img(dto.imageUrl),
    featured: dto.featured,
    modifierGroups: dto.modifierGroups.map((g) => ({
      id: g.id,
      name: g.name,
      required: g.required,
      maxSelections: g.maxSelections,
      options: g.options.map((o) => ({ name: o.name, price: cents(o.priceCents) })),
    })),
  };
}

export function orderFromDto(dto: D.OrderDTO): Order {
  return {
    id: dto.id,
    number: dto.number,
    locationId: dto.locationId,
    locationName: dto.locationName,
    method: methodFromDto[dto.method],
    status: dto.status,
    createdAt: dto.createdAt,
    timing: dto.timing,
    deliveryAddress: dto.deliveryAddress,
    tableNumber: dto.tableNumber,
    lines: dto.lines.map((l) => ({ itemId: l.itemId, name: l.name, qty: l.qty, unitPrice: cents(l.unitPriceCents), selections: l.selections, modifiersLabel: l.modifiersLabel, note: l.note })),
    totals: {
      subtotal: cents(dto.totals.subtotalCents),
      delivery: cents(dto.totals.deliveryCents),
      reward: cents(dto.totals.rewardCents),
      surcharge: cents(dto.totals.surchargeCents),
      giftCard: cents(dto.totals.giftCardCents),
      total: cents(dto.totals.totalCents),
    },
    paymentLabel: dto.paymentLabel,
    stampsEarned: dto.stampsEarned,
    rewardRedeemed: dto.rewardRedeemed,
    estimatedWait: dto.estimatedWait,
  };
}

const BRAND: Record<D.SavedCardDTO['brand'], CardBrand> = { visa: 'Visa', mastercard: 'Mastercard', amex: 'Amex', jcb: 'JCB', other: 'Card' };

export function savedCardFromDto(dto: D.SavedCardDTO): SavedCard {
  return { id: dto.id, brand: BRAND[dto.brand], last4: dto.last4, expiry: `${String(dto.expMonth).padStart(2, '0')}/${String(dto.expYear % 100).padStart(2, '0')}` };
}

export function loyaltyCardFromDto(dto: D.LoyaltyCardDTO): LoyaltyCard {
  return { ...dto };
}

export function loyaltyActivityFromDto(dto: D.LoyaltyActivityDTO): LoyaltyActivity {
  return { ...dto };
}

export function reservationFromDto(dto: D.ReservationDTO): Reservation {
  return {
    id: dto.id,
    locationId: dto.locationId,
    date: dto.date,
    time: dto.time,
    guests: dto.guests,
    seating: dto.seating === 'outdoor' ? 'Outdoor' : 'Indoor',
    status: dto.status === 'confirmed' ? 'Confirmed' : dto.status === 'cancelled' ? 'Cancelled' : 'Requested',
    createdAt: dto.createdAt,
  };
}

export function cateringPackageFromDto(dto: D.CateringPackageDTO): CateringPackage {
  return {
    id: dto.id,
    name: dto.name,
    pricePerPerson: cents(dto.pricePerPersonCents),
    priceLabel: dto.priceLabel,
    unit: dto.unit,
    image: img(dto.imageUrl),
    imagePosition: dto.imagePosition,
    blurb: dto.blurb,
    inclusions: dto.inclusions,
  };
}

const ENQUIRY_STATUS: Record<D.CateringEnquiryDTO['status'], CateringEnquiry['status']> = { enquiry_sent: 'Enquiry sent', quoted: 'Quoted', confirmed: 'Confirmed', closed: 'Closed' };

export function cateringEnquiryFromDto(dto: D.CateringEnquiryDTO): CateringEnquiry {
  return { ...dto, status: ENQUIRY_STATUS[dto.status] };
}

export function giftCardFromDto(dto: D.GiftCardDTO): GiftCard {
  return { last4: dto.last4, balance: cents(dto.balanceCents) };
}

export function giftActivityFromDto(dto: D.GiftCardActivityDTO): GiftCardActivity {
  return { id: dto.id, kind: dto.kind, description: dto.description, amount: cents(dto.amountCents), occurredAt: dto.occurredAt };
}

const KIND: Record<D.NotificationDTO['kind'], NotificationKind> = { order: 'Order', loyalty: 'Loyalty', booking: 'Booking', offer: 'Offer', gift_card: 'Gift card' };

export function notificationFromDto(dto: D.NotificationDTO): AppNotification {
  return { id: dto.id, kind: KIND[dto.kind], text: dto.text, createdAt: dto.createdAt, unread: dto.unread, ...(dto.url ? { url: dto.url } : {}) };
}

export function offerFromDto(dto: D.OfferDTO): Offer {
  return { id: dto.id, name: dto.name, tag: dto.tag, line: dto.line, fine: dto.fine, image: img(dto.imageUrl) };
}
