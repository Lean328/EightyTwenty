import type { TabKey } from '@/store/ui';

/**
 * Route behaviour for the app stack (names are file paths under app/(app)/).
 *
 * The approved prototype has ONE navigation history with a floating tab bar:
 *  - `owner`: which tab is highlighted while the screen is on top. Screens without an
 *    owner (Gift cards) keep the highlight of the screen below them.
 *  - `tabs`:  whether the floating tab bar is shown (hidden on cart, checkout, order
 *    status, reserve, catering and edit profile — the prototype's NO_TABS).
 *  - `mini`:  whether the floating "View cart" bar may appear (prototype MINI).
 */
export interface RouteMeta {
  owner?: TabKey;
  tabs: boolean;
  mini: boolean;
}

export const TAB_ROUTES: Record<TabKey, string> = {
  home: '(tabs)/index',
  menu: '(tabs)/menu',
  loyalty: '(tabs)/loyalty',
  profile: '(tabs)/profile',
};

export const TAB_ORDER: TabKey[] = ['home', 'menu', 'loyalty', 'profile'];

export const ROUTE_META: Record<string, RouteMeta> = {
  '(tabs)/index': { owner: 'home', tabs: true, mini: true },
  '(tabs)/menu': { owner: 'menu', tabs: true, mini: true },
  '(tabs)/loyalty': { owner: 'loyalty', tabs: true, mini: true },
  '(tabs)/profile': { owner: 'profile', tabs: true, mini: true },

  'cafes/index': { owner: 'home', tabs: true, mini: true },
  'cafes/[id]': { owner: 'home', tabs: true, mini: true },
  offers: { owner: 'home', tabs: true, mini: true },
  'notifications/index': { owner: 'home', tabs: true, mini: true },
  'notifications/settings': { owner: 'profile', tabs: true, mini: false },

  cart: { owner: 'menu', tabs: false, mini: false },
  checkout: { owner: 'menu', tabs: false, mini: false },
  'orders/[id]': { owner: 'menu', tabs: false, mini: false },
  reserve: { owner: 'menu', tabs: false, mini: false },
  catering: { owner: 'menu', tabs: false, mini: false },

  'account/edit': { owner: 'profile', tabs: false, mini: false },
  'account/activity': { owner: 'profile', tabs: true, mini: false },
  'account/payment-methods': { owner: 'profile', tabs: true, mini: false },
  'account/gift-cards': { tabs: true, mini: false },
  'account/preferences': { owner: 'profile', tabs: true, mini: false },
  'account/favourites': { owner: 'profile', tabs: true, mini: true },
  'account/help': { owner: 'profile', tabs: true, mini: false },
  'account/privacy': { owner: 'profile', tabs: true, mini: false },
};

const FALLBACK: RouteMeta = { tabs: false, mini: false };

export function metaFor(routeName: string | undefined): RouteMeta {
  return (routeName && ROUTE_META[routeName]) || FALLBACK;
}

/** Highlighted tab: the nearest owner walking down the history from the top. */
export function activeTab(routeNames: string[]): TabKey {
  for (let i = routeNames.length - 1; i >= 0; i--) {
    const owner = ROUTE_META[routeNames[i]!]?.owner;
    if (owner) return owner;
  }
  return 'home';
}
