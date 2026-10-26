import { MOCK_ORDER_STAGE_INTERVAL_MS } from '@/constants/business';
import type { RepositoryContext } from '@/repositories/context';
import type { Repositories } from '@/repositories/contracts';
import { AppError } from '@/services/errors';
import { createMockRepositories, resetMockDatabase } from '@/services/mock';
import { DEMO_CUSTOMER_ID, DEMO_EMAIL } from '@/services/mock/fixtures/demoCustomer';
import type { CreateOrderRequest, Session } from '@/types';
import { addDays, toISODate } from '@/utils/datetime';

/** Test harness: a mutable session the repositories read, like the session store. */
function harness() {
  let session: Session | null = null;
  const ctx: RepositoryContext = {
    getSession: () => session,
    onSessionRefreshed: (s) => (session = s),
    onSessionExpired: () => (session = null),
  };
  const repos = createMockRepositories(ctx);
  return {
    repos,
    setSession: (s: Session | null) => (session = s),
    async signInDemo(r: Repositories = repos) {
      session = await r.auth.signIn({ email: DEMO_EMAIL, password: 'any-demo-password' });
      return session;
    },
  };
}

/** Flat White (5 + 0.5) + Smashed Avo (15) for pickup at Braddon = $20.50 with Apple Pay. */
function pickupOrder(overrides: Partial<CreateOrderRequest> = {}): CreateOrderRequest {
  return {
    locationId: 'braddon',
    method: 'Pickup',
    timing: { type: 'asap' },
    lines: [
      { itemId: 'hotcoffee', qty: 1, selections: { drink: ['Flat White'] }, note: '' },
      { itemId: 'smashed', qty: 1, selections: {}, note: '' },
    ],
    payment: { choice: 'apple_pay', token: 'demo-token' },
    useGiftCard: false,
    useReward: false,
    contact: { name: 'Sophie Nguyen', phone: '0400 123 456' },
    expectedTotal: 20.5,
    ...overrides,
  };
}

async function rejectionOf(p: Promise<unknown>): Promise<AppError> {
  try {
    await p;
  } catch (e) {
    expect(e).toBeInstanceOf(AppError);
    return e as AppError;
  }
  throw new Error('expected the promise to reject');
}

beforeEach(async () => {
  await resetMockDatabase();
  jest.restoreAllMocks();
});

describe('mock auth', () => {
  it('validates email and password shape', async () => {
    const { repos } = harness();
    expect((await rejectionOf(repos.auth.signIn({ email: 'nope', password: 'longenough' }))).fieldErrors).toEqual({ email: 'invalid' });
    expect((await rejectionOf(repos.auth.signIn({ email: 'a@b.co', password: '123' }))).fieldErrors).toEqual({ password: 'too_short' });
  });

  it('unknown emails open the demo account; sessions are flagged as demo', async () => {
    const { repos } = harness();
    const s = await repos.auth.signIn({ email: 'someone@example.com', password: 'whatever1' });
    expect(s).toMatchObject({ customerId: DEMO_CUSTOMER_ID, isDemo: true });
  });

  it('sign up creates an empty account, and the email then signs in to it', async () => {
    const h = harness();
    const s = await h.repos.auth.signUp({ name: ' Alex Chen ', phone: '0412 345 678', email: 'Alex@Example.com', password: 'secret12' });
    expect(s.customerId).not.toBe(DEMO_CUSTOMER_ID);
    h.setSession(s);
    expect(await h.repos.customer.getProfile()).toMatchObject({ name: 'Alex Chen', email: 'Alex@Example.com' });
    expect((await h.repos.loyalty.getCard()).stamps).toBe(0);
    expect((await h.repos.orders.getOrderHistory()).items).toEqual([]);
    expect(await h.repos.reservations.getReservations()).toEqual([]);
    expect((await h.repos.giftCards.getGiftCard()).balance).toBe(0);

    const again = await h.repos.auth.signIn({ email: 'alex@example.com', password: 'secret12' });
    expect(again.customerId).toBe(s.customerId);
  });

  it('rejects a duplicate sign up with CONFLICT', async () => {
    const { repos } = harness();
    const e = await rejectionOf(repos.auth.signUp({ name: 'Sophie', phone: '0400 123 456', email: DEMO_EMAIL, password: 'secret12' }));
    expect(e.code).toBe('CONFLICT');
    expect(e.fieldErrors).toEqual({ email: 'taken' });
  });

  it('refresh fails with SESSION_EXPIRED for unknown accounts', async () => {
    const { repos } = harness();
    expect((await rejectionOf(repos.auth.refresh('demo-refresh.cus_missing'))).code).toBe('SESSION_EXPIRED');
    expect((await repos.auth.refresh(`demo-refresh.${DEMO_CUSTOMER_ID}`)).customerId).toBe(DEMO_CUSTOMER_ID);
  });

  it('password reset is reported as not connected rather than faked', async () => {
    const { repos } = harness();
    expect((await rejectionOf(repos.auth.requestPasswordReset(DEMO_EMAIL))).code).toBe('NOT_IMPLEMENTED');
  });

  it('customer data requires a session', async () => {
    const { repos } = harness();
    expect((await rejectionOf(repos.customer.getProfile())).code).toBe('UNAUTHORIZED');
  });
});

describe('mock orders', () => {
  it('prices on the server, awards a stamp and appears in history and loyalty activity', async () => {
    const h = harness();
    await h.signInDemo();
    const order = await h.repos.orders.createOrder(pickupOrder());

    expect(order).toMatchObject({ status: 'received', locationName: 'Braddon', paymentLabel: 'Apple Pay', stampsEarned: 1, rewardRedeemed: false });
    expect(order.totals).toEqual({ subtotal: 20.5, delivery: 0, reward: 0, surcharge: 0, giftCard: 0, total: 20.5 });
    expect(order.lines[0]).toMatchObject({ name: 'Milk Based Coffee', unitPrice: 5.5, modifiersLabel: 'Flat White' });

    expect((await h.repos.loyalty.getCard()).stamps).toBe(7);
    expect((await h.repos.loyalty.getActivity()).items[0]).toMatchObject({ type: 'earn', description: `+1 stamp · order ${order.number}` });
    expect((await h.repos.orders.getOrderHistory()).items[0]!.id).toBe(order.id);
  });

  it('rejects a stale client total with PRICE_CHANGED and no side effects', async () => {
    const h = harness();
    await h.signInDemo();
    const before = (await h.repos.orders.getOrderHistory()).items.length;
    const e = await rejectionOf(h.repos.orders.createOrder(pickupOrder({ expectedTotal: 19 })));
    expect(e.code).toBe('PRICE_CHANGED');
    expect(e.message).toContain('$20.50');
    expect((await h.repos.loyalty.getCard()).stamps).toBe(6);
    expect((await h.repos.orders.getOrderHistory()).items).toHaveLength(before);
  });

  it('enforces café, method and option rules', async () => {
    const h = harness();
    await h.signInDemo();
    expect((await rejectionOf(h.repos.orders.createOrder(pickupOrder({ locationId: 'akuna' })))).code).toBe('LOCATION_UNAVAILABLE');
    expect((await rejectionOf(h.repos.orders.createOrder(pickupOrder({ locationId: 'phillip', method: 'Dine In', tableNumber: '4' })))).code).toBe('VALIDATION');
    expect((await rejectionOf(h.repos.orders.createOrder(pickupOrder({ method: 'Delivery', deliveryAddress: ' ' })))).fieldErrors).toEqual({ deliveryAddress: 'required' });
    expect((await rejectionOf(h.repos.orders.createOrder(pickupOrder({ method: 'Dine In' })))).fieldErrors).toEqual({ tableNumber: 'required' });
    const missingDrink = pickupOrder({ lines: [{ itemId: 'hotcoffee', qty: 1, selections: {}, note: '' }], expectedTotal: 5 });
    expect((await rejectionOf(h.repos.orders.createOrder(missingDrink))).message).toBe('Choose options for Milk Based Coffee.');
  });

  it('needs payment proof: a provider token or one of the customer’s saved cards', async () => {
    const h = harness();
    await h.signInDemo();
    expect((await rejectionOf(h.repos.orders.createOrder(pickupOrder({ payment: { choice: 'new_card' }, expectedTotal: 21.1 })))).code).toBe('PAYMENT_DECLINED');
    const unknownCard = pickupOrder({ payment: { choice: 'saved_card', paymentMethodId: 'pm_other' }, expectedTotal: 21.1 });
    expect((await rejectionOf(h.repos.orders.createOrder(unknownCard))).fieldErrors).toEqual({ paymentMethodId: 'invalid' });
    const saved = await h.repos.orders.createOrder(pickupOrder({ payment: { choice: 'saved_card', paymentMethodId: 'pm_demo_visa' }, expectedTotal: 21.1 }));
    expect(saved.paymentLabel).toBe('Visa ·· 4021');
    expect(saved.totals.surcharge).toBe(0.6);
  });

  it('replays the original order for a repeated idempotency key (no double charge)', async () => {
    const h = harness();
    await h.signInDemo();
    const first = await h.repos.orders.createOrder(pickupOrder(), { idempotencyKey: 'idem-1' });
    const retry = await h.repos.orders.createOrder(pickupOrder(), { idempotencyKey: 'idem-1' });
    expect(retry.id).toBe(first.id);
    expect((await h.repos.loyalty.getCard()).stamps).toBe(7);
    const other = await h.repos.orders.createOrder(pickupOrder(), { idempotencyKey: 'idem-2' });
    expect(other.id).not.toBe(first.id);
    expect((await h.repos.loyalty.getCard()).stamps).toBe(8);
  });

  it('spends the gift card balance and records it', async () => {
    const h = harness();
    await h.signInDemo();
    const order = await h.repos.orders.createOrder(pickupOrder({ useGiftCard: true, expectedTotal: 0 }));
    expect(order.totals).toMatchObject({ giftCard: 20.5, total: 0 });
    expect(order.paymentLabel).toBe('Gift card');
    expect((await h.repos.giftCards.getGiftCard()).balance).toBe(22);
    expect((await h.repos.giftCards.getActivity())[0]).toMatchObject({ kind: 'spent', amount: 20.5 });
  });

  it('advances the live status over time', async () => {
    const h = harness();
    await h.signInDemo();
    const order = await h.repos.orders.createOrder(pickupOrder());
    const created = new Date(order.createdAt).getTime();
    const at = (stages: number) => jest.spyOn(Date, 'now').mockReturnValue(created + stages * MOCK_ORDER_STAGE_INTERVAL_MS + 1);

    at(1);
    expect((await h.repos.orders.getOrder(order.id)).status).toBe('confirmed');
    at(3);
    expect((await h.repos.orders.getOrder(order.id)).status).toBe('ready');
    at(10);
    expect((await h.repos.orders.getOrder(order.id)).status).toBe('completed');
    expect((await rejectionOf(h.repos.orders.getOrder('ord_missing'))).code).toBe('NOT_FOUND');
  });

  it('a declined order (EXPO_PUBLIC_MOCK_ORDER_OUTCOME=declined) has no side effects', async () => {
    process.env.EXPO_PUBLIC_MOCK_ORDER_OUTCOME = 'declined';
    try {
      let mock!: typeof import('@/services/mock');
      jest.isolateModules(() => {
        mock = require('@/services/mock');
      });
      let session: Session | null = null;
      const repos = mock.createMockRepositories({ getSession: () => session, onSessionRefreshed: () => {}, onSessionExpired: () => {} });
      session = await repos.auth.signIn({ email: DEMO_EMAIL, password: 'any-demo-password' });
      const order = await repos.orders.createOrder(pickupOrder({ useGiftCard: true, expectedTotal: 0 }));
      expect(order).toMatchObject({ status: 'declined', stampsEarned: 0, rewardRedeemed: false });
      expect((await repos.loyalty.getCard()).stamps).toBe(6);
      expect((await repos.giftCards.getGiftCard()).balance).toBe(42.5);
    } finally {
      delete process.env.EXPO_PUBLIC_MOCK_ORDER_OUTCOME;
    }
  });
});

describe('mock account data', () => {
  it('profile edits persist and re-index the sign-in email', async () => {
    const h = harness();
    await h.signInDemo();
    const updated = await h.repos.customer.updateProfile({ name: 'Sophie N', email: 'sophie.new@example.com' });
    expect(updated).toMatchObject({ name: 'Sophie N', email: 'sophie.new@example.com' });
    expect((await h.repos.auth.signIn({ email: 'sophie.new@example.com', password: 'whatever1' })).customerId).toBe(DEMO_CUSTOMER_ID);
    expect((await rejectionOf(h.repos.customer.updateProfile({ name: '  ' }))).fieldErrors).toEqual({ name: 'required' });
  });

  it('an email can only belong to one account', async () => {
    const h = harness();
    const alex = await h.repos.auth.signUp({ name: 'Alex', phone: '0412 345 678', email: 'alex@example.com', password: 'secret12' });
    await h.signInDemo();
    const e = await rejectionOf(h.repos.customer.updateProfile({ email: 'ALEX@example.com' }));
    expect(e).toMatchObject({ code: 'CONFLICT', fieldErrors: { email: 'taken' } });
    expect((await h.repos.auth.signIn({ email: 'alex@example.com', password: 'secret12' })).customerId).toBe(alex.customerId);
  });

  it('returned objects are copies, not live references into the store', async () => {
    const h = harness();
    await h.signInDemo();
    const profile = await h.repos.customer.getProfile();
    profile.name = 'Mutated';
    expect((await h.repos.customer.getProfile()).name).toBe('Sophie Nguyen');
  });

  it('reservation requests are re-validated and can be cancelled', async () => {
    const h = harness();
    await h.signInDemo();
    const date = toISODate(addDays(new Date(), 7));
    const req = { locationId: 'braddon', date, time: '10:00', guests: 2, seating: 'Indoor' as const, name: 'Sophie', phone: '0400 123 456', email: 'sophie@example.com', notes: '' };

    const created = await h.repos.reservations.createReservation(req);
    expect(created).toMatchObject({ status: 'Requested', locationId: 'braddon', guests: 2 });
    expect((await h.repos.reservations.getReservations())[0]!.id).toBe(created.id);

    expect((await rejectionOf(h.repos.reservations.createReservation({ ...req, time: '16:00' }))).message).toBe('Café is closed at this time');
    expect((await rejectionOf(h.repos.reservations.createReservation({ ...req, email: 'bad' }))).fieldErrors).toEqual({ email: 'invalid' });
    expect((await rejectionOf(h.repos.reservations.createReservation({ ...req, locationId: 'akuna' }))).code).toBe('LOCATION_UNAVAILABLE');
    expect((await rejectionOf(h.repos.reservations.createReservation({ ...req, date: toISODate(new Date()) }))).fieldErrors).toEqual({ date: 'invalid' });

    await h.repos.reservations.cancelReservation(created.id);
    expect((await h.repos.reservations.getReservations()).some((r) => r.id === created.id)).toBe(false);
  });

  it('catering enquiries are validated and listed', async () => {
    const h = harness();
    await h.signInDemo();
    const req = { packageId: 'Breakfast', firstName: 'Sophie', lastName: 'Nguyen', email: 's@example.com', phone: '0400 123 456', company: '', occasion: ' ', date: null, time: null, guests: 20, location: '', dietary: [], notes: 'Team breakfast' };
    expect((await rejectionOf(h.repos.catering.createEnquiry({ ...req, notes: '' }))).fieldErrors).toEqual({ notes: 'invalid' });
    const enquiry = await h.repos.catering.createEnquiry(req);
    expect(enquiry).toMatchObject({ packageId: 'Breakfast', occasion: 'Catering', status: 'Enquiry sent', guests: 20 });
    expect((await h.repos.catering.getEnquiries())[0]!.id).toBe(enquiry.id);
  });

  it('gift cards need a payment token, are logged, and replay on a repeated key', async () => {
    const h = harness();
    await h.signInDemo();
    const req = { amount: 50, recipientName: 'Ben', recipientEmail: 'ben@example.com', message: '', paymentToken: '' };
    expect((await rejectionOf(h.repos.giftCards.sendGiftCard(req))).code).toBe('PAYMENT_DECLINED');
    const sent = await h.repos.giftCards.sendGiftCard({ ...req, paymentToken: 'demo-token' }, { idempotencyKey: 'gift-1' });
    expect(sent).toMatchObject({ kind: 'sent', description: 'Sent to Ben', amount: 50 });
    const retry = await h.repos.giftCards.sendGiftCard({ ...req, paymentToken: 'demo-token-2' }, { idempotencyKey: 'gift-1' });
    expect(retry.id).toBe(sent.id);
    expect((await h.repos.giftCards.getActivity()).filter((a) => a.kind === 'sent')).toHaveLength(1);
  });

  it('saved cards hold display data only', async () => {
    const h = harness();
    await h.signInDemo();
    const card = await h.repos.payments.addCard({ token: 'tok_demo', brand: 'Mastercard', last4: '1234', expiry: '12/29' });
    expect(Object.keys(card).sort()).toEqual(['brand', 'expiry', 'id', 'last4']);
    await h.repos.payments.removePaymentMethod(card.id);
    expect((await h.repos.payments.getPaymentMethods()).some((c) => c.id === card.id)).toBe(false);
  });

  it('notification feed: seen clears the badge, read clears dots, clear empties', async () => {
    const h = harness();
    await h.signInDemo();
    const feed = await h.repos.notifications.getFeed();
    expect(feed.unseen.length).toBeGreaterThan(0);
    await h.repos.notifications.markSeen();
    const seen = await h.repos.notifications.getFeed();
    expect(seen.unseen).toEqual([]);
    expect(seen.items.some((n) => n.unread)).toBe(true);
    await h.repos.notifications.markAllRead();
    expect((await h.repos.notifications.getFeed()).items.some((n) => n.unread)).toBe(false);
    await h.repos.notifications.clearAll();
    expect((await h.repos.notifications.getFeed()).items).toEqual([]);
  });

  it('wallet pass: no signed pass is issued by the mock, the added flag is recorded', async () => {
    const h = harness();
    await h.signInDemo();
    expect(await h.repos.loyalty.getWalletPassUrl()).toBeNull();
    expect((await h.repos.loyalty.markWalletPassAdded()).walletPassAdded).toBe(true);
  });
});
