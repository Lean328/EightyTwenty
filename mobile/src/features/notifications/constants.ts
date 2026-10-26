import type { IconName } from '@/components/ui/Icon';
import type { NotificationCategory, NotificationKind } from '@/types';

/** Notification preference categories, in the order shown, with their descriptions. */
export const NOTIFICATION_CATEGORIES: { key: NotificationCategory; description: string }[] = [
  { key: 'Order updates', description: 'When your order is confirmed and ready' },
  { key: 'Bookings', description: 'Confirmations and reminders' },
  { key: 'Coffee card', description: 'New stamps and free coffees' },
  { key: 'Offers & news', description: 'What’s on at your café' },
  { key: 'Gift card activity', description: 'Balance changes and gifts' },
];

export const KIND_ICON: Record<NotificationKind, IconName> = {
  Order: 'bag',
  Loyalty: 'cupPlain',
  Booking: 'calendar',
  Offer: 'tag',
  'Gift card': 'gift',
};
