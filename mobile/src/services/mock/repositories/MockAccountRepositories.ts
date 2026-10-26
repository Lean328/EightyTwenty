import { LOYALTY_RULES } from '@/constants/business';
import { isComingSoon } from '@/domain/hours';
import { checkBookingTime, validateReservation } from '@/domain/reservations';
import { LOYALTY_PROGRAMME } from '../fixtures/content';
import type {
  GiftCardRepository,
  LoyaltyRepository,
  MutationOptions,
  NotificationFeed,
  NotificationRepository,
  PaymentRepository,
  ReservationRepository,
} from '@/repositories/contracts';
import { AppError } from '@/services/errors';
import type {
  CardTokenResult,
  GiftCard,
  GiftCardActivity,
  ID,
  LoyaltyActivity,
  LoyaltyCard,
  Page,
  PageRequest,
  Reservation,
  ReservationRequest,
  SavedCard,
  SendGiftCardRequest,
} from '@/types';
import { toISODate } from '@/utils/datetime';
import { localId } from '@/utils/id';
import { isEmail } from '@/utils/validation';
import { findLocation } from '../catalog';
import type { MockCustomerRecord } from '../types';
import { clone, MockRepository, nowIso, paginate } from './shared';

export class MockPaymentRepository extends MockRepository implements PaymentRepository {
  async getPaymentMethods(): Promise<SavedCard[]> {
    return clone((await this.me()).cards);
  }

  /** Receives only tokenised display data (brand, last4, expiry) — never a card number. */
  async addCard(card: CardTokenResult): Promise<SavedCard> {
    const me = await this.me();
    const saved: SavedCard = { id: localId('pm_'), brand: card.brand, last4: card.last4, expiry: card.expiry };
    me.cards.push(saved);
    this.commit();
    return clone(saved);
  }

  async removePaymentMethod(id: ID): Promise<void> {
    const me = await this.me();
    me.cards = me.cards.filter((c) => c.id !== id);
    this.commit();
  }
}

function toCard(me: MockCustomerRecord): LoyaltyCard {
  return {
    stamps: me.loyalty.stamps,
    stampsPerReward: LOYALTY_RULES.stampsPerReward,
    memberNumber: me.loyalty.memberNumber,
    eligibility: LOYALTY_PROGRAMME.eligibility,
    rewardDescription: LOYALTY_PROGRAMME.reward,
    walletPassAdded: me.loyalty.walletPassAdded,
  };
}

export class MockLoyaltyRepository extends MockRepository implements LoyaltyRepository {
  async getCard(): Promise<LoyaltyCard> {
    return toCard(await this.me());
  }

  async getActivity(page?: PageRequest): Promise<Page<LoyaltyActivity>> {
    return clone(paginate((await this.me()).loyalty.activity, page));
  }

  /** TODO(backend): return a signed .pkpass URL (Apple Pass Type ID certificate required). */
  async getWalletPassUrl(): Promise<string | null> {
    await this.me();
    return null;
  }

  async markWalletPassAdded(): Promise<LoyaltyCard> {
    const me = await this.me();
    me.loyalty.walletPassAdded = true;
    this.commit();
    return toCard(me);
  }
}

export class MockReservationRepository extends MockRepository implements ReservationRepository {
  async getReservations(): Promise<Reservation[]> {
    return clone((await this.me()).reservations);
  }

  async createReservation(req: ReservationRequest): Promise<Reservation> {
    const me = await this.me();
    const loc = findLocation(req.locationId);
    if (!loc || isComingSoon(loc)) throw new AppError('LOCATION_UNAVAILABLE', 'Bookings open when hours are confirmed.');
    // Server-side re-validation: opening hours, last booking, 12 hours' notice, contact details.
    if (!req.date || req.date <= toISODate(new Date())) throw new AppError('VALIDATION', 'Choose a date from tomorrow onwards.', { fieldErrors: { date: 'invalid' } });
    const timeCheck = checkBookingTime(loc, req.date, req.time);
    const invalid = Object.keys(validateReservation({ ...req, guests: String(req.guests) }, timeCheck.ok));
    if (invalid.length) {
      throw new AppError('VALIDATION', timeCheck.message || 'Please check the highlighted fields.', { fieldErrors: Object.fromEntries(invalid.map((f) => [f, 'invalid'])) });
    }
    const reservation: Reservation = {
      id: localId('res_'),
      locationId: loc.id,
      date: req.date,
      time: req.time,
      guests: req.guests,
      seating: req.seating,
      status: 'Requested',
      createdAt: nowIso(),
    };
    me.reservations.unshift(reservation);
    this.commit();
    return clone(reservation);
  }

  /** Prototype behaviour: a cancelled request disappears from the list. */
  async cancelReservation(id: ID): Promise<void> {
    const me = await this.me();
    me.reservations = me.reservations.filter((r) => r.id !== id);
    this.commit();
  }
}

export class MockGiftCardRepository extends MockRepository implements GiftCardRepository {
  async getGiftCard(): Promise<GiftCard> {
    return clone((await this.me()).giftCard);
  }

  async getActivity(): Promise<GiftCardActivity[]> {
    return clone((await this.me()).giftActivity);
  }

  async sendGiftCard(req: SendGiftCardRequest, options: MutationOptions = {}): Promise<GiftCardActivity> {
    const me = await this.me();
    const replayId = options.idempotencyKey ? me.idempotency?.[options.idempotencyKey] : undefined;
    const replay = replayId ? me.giftActivity.find((a) => a.id === replayId) : undefined;
    if (replay) return clone(replay);
    if (!req.recipientName.trim() || !isEmail(req.recipientEmail)) throw new AppError('VALIDATION', 'Add their name and a valid email.');
    if (!req.paymentToken) throw new AppError('PAYMENT_DECLINED', 'Payment was not completed.');
    const entry: GiftCardActivity = { id: localId('ga_'), kind: 'sent', description: `Sent to ${req.recipientName.trim()}`, amount: req.amount, occurredAt: nowIso() };
    me.giftActivity.unshift(entry);
    if (options.idempotencyKey) me.idempotency = { ...me.idempotency, [options.idempotencyKey]: entry.id };
    this.commit();
    return clone(entry);
  }
}

export class MockNotificationRepository extends MockRepository implements NotificationRepository {
  async getFeed(): Promise<NotificationFeed> {
    const me = await this.me();
    const seen = me.notificationsSeenAt ? new Date(me.notificationsSeenAt).getTime() : 0;
    const items = [...me.notifications].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return clone({ items, unseen: items.filter((n) => n.unread && new Date(n.createdAt).getTime() > seen) });
  }

  async markSeen(): Promise<void> {
    const me = await this.me();
    me.notificationsSeenAt = nowIso();
    this.commit();
  }

  async markAllRead(): Promise<void> {
    const me = await this.me();
    me.notifications = me.notifications.map((n) => ({ ...n, unread: false }));
    this.commit();
  }

  async clearAll(): Promise<void> {
    const me = await this.me();
    me.notifications = [];
    this.commit();
  }

  /** The mock has no push server: tokens are accepted and dropped. */
  async registerPushToken(): Promise<void> {}

  async removePushToken(): Promise<void> {}
}
