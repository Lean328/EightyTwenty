import type { Href } from 'expo-router';
import { queryKeys } from '@/repositories/queryKeys';
import type { PushData } from '@/services/integrations/push';
import type { AppNotification, NotificationKind } from '@/types';

/** Where a tapped push opens when it carries no url, by feed kind. */
const SCREEN_FOR_KIND: Record<string, Href> = {
  order: { pathname: '/account/activity', params: { segment: 'orders' } },
  loyalty: '/loyalty',
  booking: { pathname: '/account/activity', params: { segment: 'reservations' } },
  gift_card: '/account/gift-cards',
  offer: '/offers',
};

/** Data a push may have changed, by feed kind (the feed itself always refreshes). */
export const STALE_FOR_KIND: Record<string, readonly (readonly string[])[]> = {
  order: [queryKeys.orders, queryKeys.loyalty, queryKeys.giftCard],
  loyalty: [queryKeys.loyalty],
  booking: [queryKeys.reservations],
  gift_card: [queryKeys.giftCard],
  offer: [queryKeys.offers],
};

export function screenForPush(data: PushData): Href {
  if (data.url && data.url.startsWith('/')) return data.url as Href;
  return SCREEN_FOR_KIND[data.kind ?? ''] ?? '/notifications';
}

const KIND_OF_LABEL: Record<NotificationKind, string> = { Order: 'order', Loyalty: 'loyalty', Booking: 'booking', Offer: 'offer', 'Gift card': 'gift_card' };

/** Where a tapped line in the in-app feed opens: the same screen as its push. */
export function screenForNotification(n: Pick<AppNotification, 'kind' | 'url'>): Href {
  return screenForPush({ kind: KIND_OF_LABEL[n.kind], url: n.url });
}
