import { screenForNotification, screenForPush } from '@/features/notifications/pushRoutes';

describe('screenForPush', () => {
  it('opens the url the server sent (an order opens its status screen)', () => {
    expect(screenForPush({ kind: 'order', url: '/orders/9f1c' })).toBe('/orders/9f1c');
  });

  it('falls back to a screen per kind, then to the feed', () => {
    expect(screenForPush({ kind: 'loyalty' })).toBe('/loyalty');
    expect(screenForPush({ kind: 'booking' })).toEqual({ pathname: '/account/activity', params: { segment: 'reservations' } });
    expect(screenForPush({ kind: 'offer' })).toBe('/offers');
    expect(screenForPush({})).toBe('/notifications');
    expect(screenForPush({ url: 'https://example.com' })).toBe('/notifications');
  });
});

describe('screenForNotification (a tap in the in-app feed)', () => {
  it('opens the same screen as the push would', () => {
    expect(screenForNotification({ kind: 'Order', url: '/orders/9f1c' })).toBe('/orders/9f1c');
    expect(screenForNotification({ kind: 'Order' })).toEqual({ pathname: '/account/activity', params: { segment: 'orders' } });
    expect(screenForNotification({ kind: 'Gift card' })).toBe('/account/gift-cards');
  });
});
