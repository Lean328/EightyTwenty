/**
 * Repository contracts — the only way screens and hooks reach data.
 *
 * Two implementations exist for every contract:
 *   - src/services/mock/repositories  (local simulated backend, default)
 *   - src/services/api/repositories   (HTTP, see docs/API_CONTRACTS.md)
 * The active set is chosen by EXPO_PUBLIC_DATA_SOURCE in src/repositories/createRepositories.ts.
 *
 * All methods reject with `AppError` (src/services/errors.ts) on failure.
 * Methods that act on "the customer" use the signed-in session.
 */
import type {
  AppNotification,
  CardTokenResult,
  CateringEnquiry,
  CateringEnquiryRequest,
  CateringPackage,
  CreateOrderRequest,
  Customer,
  CustomerPreferences,
  CustomerUpdate,
  Faq,
  GiftCard,
  GiftCardActivity,
  ID,
  Location,
  LoyaltyActivity,
  LoyaltyCard,
  MenuCategory,
  MenuItem,
  Offer,
  Order,
  Page,
  PageRequest,
  Reservation,
  ReservationRequest,
  SavedAddress,
  SavedCard,
  SendGiftCardRequest,
  Session,
} from '@/types';

/** Options for requests that charge money. */
export interface MutationOptions {
  /**
   * Reuse the same key when retrying after a network failure or timeout so the server
   * returns the original result instead of charging twice (see API_CONTRACTS → Idempotency).
   */
  idempotencyKey?: string;
}

export interface SignInRequest {
  email: string;
  password: string;
}

export interface SignUpRequest {
  name: string;
  phone: string;
  email: string;
  password: string;
}

export interface AuthRepository {
  signIn(request: SignInRequest): Promise<Session>;
  signUp(request: SignUpRequest): Promise<Session>;
  /** Revokes the refresh token server-side. Local session is cleared regardless. */
  signOut(session: Session): Promise<void>;
  /** Exchanges a refresh token for a new session. Rejects with SESSION_EXPIRED when invalid. */
  refresh(refreshToken: string): Promise<Session>;
  requestPasswordReset(email: string): Promise<void>;
  /** Changes the password; the server signs out every other session and returns a new one. */
  changePassword(currentPassword: string, newPassword: string): Promise<Session>;
}

export interface CustomerRepository {
  getProfile(): Promise<Customer>;
  updateProfile(update: CustomerUpdate): Promise<Customer>;
  /** Account closure is handled by the team (prototype: "Contact us to close your account"). */
  requestAccountClosure(): Promise<void>;
  /** Deletes the account and its personal data straight away; every session is signed out. */
  deleteAccount(): Promise<void>;
}

export interface PreferencesRepository {
  getPreferences(): Promise<CustomerPreferences>;
  updatePreferences(patch: Partial<CustomerPreferences>): Promise<CustomerPreferences>;
  getFavourites(): Promise<ID[]>;
  setFavourite(itemId: ID, favourite: boolean): Promise<ID[]>;
  getAddresses(): Promise<SavedAddress[]>;
  addAddress(address: Omit<SavedAddress, 'id'>): Promise<SavedAddress>;
  removeAddress(id: ID): Promise<void>;
}

export interface LocationRepository {
  getLocations(): Promise<Location[]>;
  getLocation(id: ID): Promise<Location>;
}

export interface MenuRepository {
  getCategories(): Promise<MenuCategory[]>;
  /** Menu available at a café (the source data has one shared menu; see BACKEND_HANDOFF). */
  getMenuItems(locationId: ID): Promise<MenuItem[]>;
  getItemById(id: ID): Promise<MenuItem>;
}

export interface OrderRepository {
  /** Server prices the order, charges payment, applies gift card / reward, awards stamps. */
  createOrder(request: CreateOrderRequest, options?: MutationOptions): Promise<Order>;
  getOrder(id: ID): Promise<Order>;
  getOrderHistory(page?: PageRequest): Promise<Page<Order>>;
}

export interface PaymentRepository {
  getPaymentMethods(): Promise<SavedCard[]>;
  /** Saves a card that was tokenised by the payment provider. Never receives raw card numbers. */
  addCard(card: CardTokenResult): Promise<SavedCard>;
  removePaymentMethod(id: ID): Promise<void>;
}

export interface LoyaltyRepository {
  getCard(): Promise<LoyaltyCard>;
  getActivity(page?: PageRequest): Promise<Page<LoyaltyActivity>>;
  /** URL of a signed .pkpass for this member, or null when Wallet passes aren't issued yet. */
  getWalletPassUrl(): Promise<string | null>;
  markWalletPassAdded(): Promise<LoyaltyCard>;
}

export interface ReservationRepository {
  getReservations(): Promise<Reservation[]>;
  /** Creates a booking *request*; the café confirms by email. No real-time availability. */
  createReservation(request: ReservationRequest): Promise<Reservation>;
  cancelReservation(id: ID): Promise<void>;
}

export interface CateringRepository {
  getPackages(): Promise<CateringPackage[]>;
  getEnquiries(): Promise<CateringEnquiry[]>;
  createEnquiry(request: CateringEnquiryRequest): Promise<CateringEnquiry>;
}

export interface GiftCardRepository {
  getGiftCard(): Promise<GiftCard>;
  getActivity(): Promise<GiftCardActivity[]>;
  sendGiftCard(request: SendGiftCardRequest, options?: MutationOptions): Promise<GiftCardActivity>;
}

export interface NotificationFeed {
  items: AppNotification[];
  /** Unread notifications that arrived since the feed was last opened (drives the bell badge). */
  unseen: AppNotification[];
}

export interface NotificationRepository {
  getFeed(): Promise<NotificationFeed>;
  /** Called when the feed is opened — clears the badge but keeps unread dots. */
  markSeen(): Promise<void>;
  markAllRead(): Promise<void>;
  clearAll(): Promise<void>;
  /** Sends this phone's Expo push token so feed items are also pushed (customer toggles apply). */
  registerPushToken(token: string, platform: 'ios' | 'android'): Promise<void>;
  /** Stops pushes to this phone (called before signing out). */
  removePushToken(token: string): Promise<void>;
}

export interface ContentRepository {
  getOffers(): Promise<Offer[]>;
  getFaqs(): Promise<Faq[]>;
}

export interface Repositories {
  auth: AuthRepository;
  customer: CustomerRepository;
  preferences: PreferencesRepository;
  locations: LocationRepository;
  menu: MenuRepository;
  orders: OrderRepository;
  payments: PaymentRepository;
  loyalty: LoyaltyRepository;
  reservations: ReservationRepository;
  catering: CateringRepository;
  giftCards: GiftCardRepository;
  notifications: NotificationRepository;
  content: ContentRepository;
}
