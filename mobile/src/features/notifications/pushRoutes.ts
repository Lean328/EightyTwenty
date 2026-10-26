import type { Href } from 'expo-router';
import { queryKeys } from '@/repositories/queryKeys';
import type { PushData } from '@/services/integrations/push';

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
