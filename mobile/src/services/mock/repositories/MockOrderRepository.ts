import { config } from '@/constants/config';
import { LOYALTY_RULES, MOCK_ORDER_STAGE_INTERVAL_MS, ORDER_RULES } from '@/constants/business';
import { isComingSoon } from '@/domain/hours';
import { isCoffeeItem, stampsAfterOrder } from '@/domain/loyalty';
import { computeTotals, hasMissingRequired, modifiersLabel, unitPrice } from '@/domain/pricing';
import type { MutationOptions, OrderRepository } from '@/repositories/contracts';
import { AppError } from '@/services/errors';
import type { CreateOrderRequest, ID, Order, OrderLine, OrderStatus, Page, PageRequest } from '@/types';
import { formatMoney } from '@/utils/format';
import { localId } from '@/utils/id';
import { findLocation, findMenuItem } from '../catalog';
import type { MockCustomerRecord } from '../types';
import { clone, MockRepository, nowIso, paginate } from './shared';

const LIVE_SEQUENCE: OrderStatus[] = ['received', 'confirmed', 'preparing', 'ready', 'completed'];

/**
 * Simulated live status: advances one stage every 4.2 s from creation (the prototype's
 * ticker), so polling the order shows Received → Confirmed → Preparing → Ready → Completed.
 */
function withLiveStatus(order: Order, now = Date.now()): Order {
  if (order.status === 'declined' || order.status === 'completed') return order;
  const stage = Math.min(4, Math.floor((now - new Date(order.createdAt).getTime()) / MOCK_ORDER_STAGE_INTERVAL_MS));
  return { ...order, status: LIVE_SEQUENCE[stage]! };
}

export class MockOrderRepository extends MockRepository implements OrderRepository {
  async createOrder(req: CreateOrderRequest, options: MutationOptions = {}): Promise<Order> {
    const me = await this.me();
    const replayId = options.idempotencyKey ? me.idempotency?.[options.idempotencyKey] : undefined;
    const replay = replayId ? me.orders.find((o) => o.id === replayId) : undefined;
    if (replay) return clone(withLiveStatus(replay));
    const location = findLocation(req.locationId);
    if (!location || isComingSoon(location)) throw new AppError('LOCATION_UNAVAILABLE', 'This café isn’t taking orders yet.');
    if (!location.methods.includes(req.method)) throw new AppError('VALIDATION', `${req.method} isn’t offered at ${location.name}.`);
    if (req.method === 'Delivery' && !req.deliveryAddress?.trim()) throw new AppError('VALIDATION', 'Add a delivery address first.', { fieldErrors: { deliveryAddress: 'required' } });
    if (req.method === 'Dine In' && !req.tableNumber?.trim()) throw new AppError('VALIDATION', 'Add your table number first.', { fieldErrors: { tableNumber: 'required' } });
    if (!req.lines.length) throw new AppError('VALIDATION', 'Your order is empty.');

    // Server-side pricing from the catalogue — never trust client prices.
    const lines: (OrderLine & { isCoffee: boolean })[] = req.lines.map((l) => {
      const item = findMenuItem(l.itemId);
      if (!item) throw new AppError('VALIDATION', 'An item in your order is no longer available.');
      if (hasMissingRequired(item, l.selections)) throw new AppError('VALIDATION', `Choose options for ${item.name}.`);
      return { itemId: item.id, name: item.name, qty: l.qty, unitPrice: unitPrice(item, l.selections), selections: l.selections, modifiersLabel: modifiersLabel(item, l.selections), note: l.note, isCoffee: isCoffeeItem(item) };
    });

    const totals = computeTotals({
      lines,
      method: req.method,
      payment: req.payment.choice,
      stamps: me.loyalty.stamps,
      stampsPerReward: LOYALTY_RULES.stampsPerReward,
      useReward: req.useReward,
      useGiftCard: req.useGiftCard,
      giftCardBalance: me.giftCard.balance,
    });
    if (Math.abs(totals.total - req.expectedTotal) > 0.009) {
      throw new AppError('PRICE_CHANGED', `Your total changed to ${formatMoney(totals.total)}. Please review your order.`, { status: 409 });
    }

    // Payment proof: a provider token (Apple Pay / new card) or one of the customer's saved cards.
    const card = req.payment.choice === 'saved_card' ? me.cards.find((c) => c.id === req.payment.paymentMethodId) : undefined;
    if (req.payment.choice === 'saved_card' && !card) throw new AppError('VALIDATION', 'Choose a saved card.', { fieldErrors: { paymentMethodId: 'invalid' } });
    if (totals.total > 0 && req.payment.choice !== 'saved_card' && !req.payment.token) throw new AppError('PAYMENT_DECLINED', 'Payment was not completed.');

    const declined = config.mock.orderOutcome === 'declined';
    const rewardRedeemed = totals.reward > 0;
    const payName = req.payment.choice === 'apple_pay' ? 'Apple Pay' : req.payment.choice === 'saved_card' && card ? `${card.brand} ·· ${card.last4}` : 'Card';
    const outcome = declined
      ? { stamps: me.loyalty.stamps, earned: 0 }
      : stampsAfterOrder({ stamps: me.loyalty.stamps, stampsPerReward: LOYALTY_RULES.stampsPerReward, coffeeCount: totals.coffeeCount, rewardRedeemed });

    const order: Order = {
      id: localId('ord_'),
      number: '#8020-' + String(Math.floor(1000 + Math.random() * 9000)),
      locationId: location.id,
      locationName: location.name,
      method: req.method,
      status: declined ? 'declined' : 'received',
      createdAt: nowIso(),
      timing: req.timing,
      deliveryAddress: req.method === 'Delivery' ? req.deliveryAddress!.trim() : null,
      tableNumber: req.method === 'Dine In' ? req.tableNumber!.trim() : null,
      lines: lines.map(({ isCoffee: _isCoffee, ...l }) => l),
      totals: { subtotal: totals.subtotal, delivery: totals.delivery, reward: totals.reward, surcharge: totals.surcharge, giftCard: totals.giftCard, total: totals.total },
      paymentLabel: totals.giftCard && totals.total === 0 ? 'Gift card' : payName + (totals.giftCard ? ' + gift card' : ''),
      stampsEarned: outcome.earned,
      rewardRedeemed: !declined && rewardRedeemed,
      estimatedWait: location.waitLabel ?? ORDER_RULES.defaultWait,
    };

    if (!declined) this.applySideEffects(me, order, location.name);
    me.orders.unshift(order);
    if (options.idempotencyKey) me.idempotency = { ...me.idempotency, [options.idempotencyKey]: order.id };
    this.commit();
    return clone(order);
  }

  /** Loyalty stamps, reward redemption and gift card spend — only for accepted orders. */
  private applySideEffects(me: MockCustomerRecord, order: Order, locationName: string) {
    const at = order.createdAt;
    if (order.rewardRedeemed) {
      me.loyalty.stamps = 0;
      me.loyalty.activity.unshift({ id: localId('la_'), type: 'redeem', description: 'Free coffee redeemed', locationName, occurredAt: at });
    }
    if (order.stampsEarned) {
      me.loyalty.stamps = Math.min(LOYALTY_RULES.stampsPerReward, me.loyalty.stamps + order.stampsEarned);
      me.loyalty.activity.unshift({
        id: localId('la_'),
        type: 'earn',
        description: `+${order.stampsEarned} ${order.stampsEarned === 1 ? 'stamp' : 'stamps'} · order ${order.number}`,
        locationName,
        occurredAt: at,
      });
    }
    if (order.totals.giftCard) {
      me.giftCard.balance = Math.max(0, Math.round((me.giftCard.balance - order.totals.giftCard) * 100) / 100);
      me.giftActivity.unshift({ id: localId('ga_'), kind: 'spent', description: `Used on order ${order.number}`, amount: order.totals.giftCard, occurredAt: at });
    }
  }

  async getOrder(id: ID): Promise<Order> {
    const me = await this.me();
    const order = me.orders.find((o) => o.id === id);
    if (!order) throw new AppError('NOT_FOUND', 'Order not found.', { status: 404 });
    const live = withLiveStatus(order);
    if (live.status !== order.status) {
      Object.assign(order, { status: live.status });
      this.commit();
    }
    return clone(live);
  }

  async getOrderHistory(page?: PageRequest): Promise<Page<Order>> {
    const me = await this.me();
    return clone(paginate(me.orders.map((o) => withLiveStatus(o)), page));
  }
}
