/**
 * PROPOSED endpoint paths (relative to EXPO_PUBLIC_API_BASE_URL). Documented in
 * docs/API_CONTRACTS.md. Change paths here only — repositories reference these.
 */
const e = encodeURIComponent;

export const endpoints = {
  auth: {
    signIn: '/auth/sign-in',
    signUp: '/auth/sign-up',
    signOut: '/auth/sign-out',
    refresh: '/auth/refresh',
    passwordReset: '/auth/password-reset',
  },
  me: {
    profile: '/me',
    closureRequest: '/me/closure-request',
    preferences: '/me/preferences',
    favourites: '/me/favourites',
    favourite: (itemId: string) => `/me/favourites/${e(itemId)}`,
    addresses: '/me/addresses',
    address: (id: string) => `/me/addresses/${e(id)}`,
    orders: '/me/orders',
    paymentMethods: '/me/payment-methods',
    paymentMethod: (id: string) => `/me/payment-methods/${e(id)}`,
    loyalty: '/me/loyalty',
    loyaltyActivity: '/me/loyalty/activity',
    walletPass: '/me/loyalty/wallet-pass',
    walletPassAdded: '/me/loyalty/wallet-pass/added',
    reservations: '/me/reservations',
    cateringEnquiries: '/me/catering-enquiries',
    giftCard: '/me/gift-card',
    giftCardActivity: '/me/gift-card/activity',
    notifications: '/me/notifications',
    notificationsSeen: '/me/notifications/seen',
    notificationsReadAll: '/me/notifications/read-all',
  },
  locations: '/locations',
  location: (id: string) => `/locations/${e(id)}`,
  locationMenu: (id: string) => `/locations/${e(id)}/menu`,
  menuCategories: '/menu/categories',
  menuItem: (id: string) => `/menu/items/${e(id)}`,
  orders: '/orders',
  order: (id: string) => `/orders/${e(id)}`,
  reservations: '/reservations',
  reservation: (id: string) => `/reservations/${e(id)}`,
  cateringPackages: '/catering/packages',
  cateringEnquiries: '/catering-enquiries',
  giftCardsSend: '/gift-cards/send',
  offers: '/content/offers',
  faqs: '/content/faqs',
} as const;
