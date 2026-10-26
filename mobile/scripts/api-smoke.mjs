#!/usr/bin/env node
/**
 * End-to-end check of the customer API the app uses, against a running backend.
 * Walks the whole app flow with a fresh account (sign up → profile → cafés and every menu →
 * order → coffee card → bookings → catering → feed → push → password → delete account) and
 * checks status codes, the field shapes in src/services/api/dto.ts and every enum value the
 * mappers look up. Prints one line per check; exits 1 on any failure.
 *
 *   npm run api:smoke                           # EXPO_PUBLIC_API_BASE_URL from .env, else localhost
 *   node scripts/api-smoke.mjs http://127.0.0.1:8000/api/v1/app
 *
 * It creates data (an account, a booking, an enquiry and — when the server runs with
 * PAYMENT_PROVIDER=demo — an order), so it refuses anything but a local/LAN server unless
 * --allow-remote is passed.
 */
import { readFileSync } from 'node:fs';

function envBase() {
  try {
    const line = readFileSync(new URL('../.env', import.meta.url), 'utf8').split(/\r?\n/).find((l) => l.startsWith('EXPO_PUBLIC_API_BASE_URL='));
    return line?.split('=')[1]?.trim();
  } catch {
    return undefined;
  }
}

const args = process.argv.slice(2);
const BASE = (args.find((a) => !a.startsWith('--')) ?? envBase() ?? 'http://127.0.0.1:8000/api/v1/app').replace(/\/+$/, '');
if (!/^https?:\/\/(localhost|127\.0\.0\.1|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(BASE) && !args.includes('--allow-remote')) {
  console.error(`Refusing to create test data on ${BASE}. Pass --allow-remote if you really mean it.`);
  process.exit(2);
}

let failures = 0;
const ok = (label) => console.log(`  ok   ${label}`);
const fail = (label, detail) => {
  failures += 1;
  console.log(`  FAIL ${label}\n       ${detail}`);
};

// --- shapes (src/services/api/dto.ts) and enums the mappers translate with lookup tables ---
const T = { s: 'string', n: 'number', b: 'boolean', o: 'object', a: 'array' };
const arr = (v) => (Array.isArray(v) ? v : []);
const typeOf = (v) => (v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v);
const SHAPES = {
  session: { customerId: 's', accessToken: 's', refreshToken: 's|null', expiresAt: 's|null' },
  customer: { id: 's', name: 's', email: 's', phone: 's', memberSince: 's' },
  preferences: { homeCafeId: 's', dietary: 'a', notifications: 'o', security: 'o', avatar: 'n' },
  address: { id: 's', label: 's', line: 's' },
  location: { id: 's', name: 's', subtitle: 's', area: 's', headline: 's', address: 's', phone: 's|null', email: 's|null', hoursLabel: 's', hoursShort: 's', weeklyHours: 'o|null', status: 's', fulfilmentMethods: 'a', note: 's', waitLabel: 's|null', imageUrl: 's|null', galleryUrls: 'a', externalOrderUrl: 's|null', bookingLabel: 's', flags: 'o' },
  category: { id: 's', name: 's', shortName: 's', note: 's' },
  menuItem: { id: 's', categoryId: 's', name: 's', description: 's', priceCents: 'n', dietary: 'a', imageUrl: 's|null', featured: 'b', modifierGroups: 'a' },
  modifierGroup: { id: 's', name: 's', required: 'b', maxSelections: 'n', options: 'a' },
  order: { id: 's', number: 's', locationId: 's', locationName: 's', method: 's', status: 's', createdAt: 's', timing: 'o', deliveryAddress: 's|null', tableNumber: 's|null', lines: 'a', totals: 'o', paymentLabel: 's', stampsEarned: 'n', rewardRedeemed: 'b', estimatedWait: 's' },
  loyaltyCard: { stamps: 'n', stampsPerReward: 'n', memberNumber: 's', eligibility: 's', rewardDescription: 's', walletPassAdded: 'b' },
  loyaltyActivity: { id: 's', type: 's', description: 's', locationName: 's', occurredAt: 's' },
  reservation: { id: 's', locationId: 's', date: 's', time: 's', guests: 'n', seating: 's', status: 's', createdAt: 's' },
  cateringPackage: { id: 's', name: 's', pricePerPersonCents: 'n', priceLabel: 's', unit: 's', imageUrl: 's|null', imagePosition: 's', blurb: 's', inclusions: 'a' },
  cateringEnquiry: { id: 's', packageId: 's', packageName: 's', guests: 'n|null', date: 's|null', occasion: 's', status: 's', createdAt: 's' },
  giftCard: { last4: 's', balanceCents: 'n' },
  giftActivity: { id: 's', kind: 's', description: 's', amountCents: 'n', occurredAt: 's' },
  notification: { id: 's', kind: 's', text: 's', createdAt: 's', unread: 'b' },
  offer: { id: 's', name: 's', tag: 's', line: 's', fine: 's', imageUrl: 's|null' },
  faq: { question: 's', answer: 's' },
};
const ENUMS = {
  method: ['pickup', 'delivery', 'dine_in'],
  locationStatus: ['open', 'coming_soon'],
  dietary: ['GF*', 'DF*', 'Gluten free', 'Dairy free', 'Vegan', 'Vegetarian'],
  prefDietary: ['gluten_free', 'dairy_free', 'vegan', 'vegetarian'],
  orderStatus: ['received', 'confirmed', 'preparing', 'ready', 'completed', 'declined'],
  loyaltyType: ['earn', 'redeem'],
  seating: ['indoor', 'outdoor'],
  reservationStatus: ['requested', 'confirmed', 'cancelled'],
  enquiryStatus: ['enquiry_sent', 'quoted', 'confirmed', 'closed'],
  giftKind: ['added', 'spent', 'sent'],
  notificationKind: ['order', 'loyalty', 'booking', 'offer', 'gift_card'],
  addressLabel: ['home', 'work', 'other'],
  weekday: ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'],
};

function shape(name, value, where) {
  const problems = [];
  if (typeOf(value) !== 'object') return [`${where}: expected an object, got ${typeOf(value)}`];
  for (const [key, spec] of Object.entries(SHAPES[name])) {
    const allowed = spec.split('|').map((t) => T[t] ?? t);
    if (!(key in value)) problems.push(`${where}.${key} missing`);
    else if (!allowed.includes(typeOf(value[key]))) problems.push(`${where}.${key} is ${typeOf(value[key])}, expected ${allowed.join(' or ')}`);
  }
  return problems;
}
const inEnum = (name, value, where) => (ENUMS[name].includes(value) ? [] : [`${where} = ${JSON.stringify(value)} is not one of ${ENUMS[name].join(', ')}`]);

function check(label, problems) {
  if (problems.length) fail(label, problems.slice(0, 6).join('\n       ') + (problems.length > 6 ? `\n       … ${problems.length - 6} more` : ''));
  else ok(label);
}

// --- HTTP ---
let token = null;
async function call(method, path, body, { expect = [200], auth = true, headers = {} } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: { Accept: 'application/json', ...(body !== undefined && { 'Content-Type': 'application/json' }), ...(auth && token && { Authorization: `Bearer ${token}` }), ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = text;
  }
  const expected = Array.isArray(expect) ? expect : [expect];
  if (!expected.includes(res.status)) {
    fail(`${method} ${path} → ${res.status}`, `expected ${expected.join('/')}: ${String(text).slice(0, 240)}`);
    return { status: res.status, json, bad: true };
  }
  if (res.status >= 400 && !(json && json.error && typeof json.error.code === 'string' && typeof json.error.message === 'string')) {
    fail(`${method} ${path} error body`, `errors must be {error: {code, message, fields}}: ${String(text).slice(0, 200)}`);
  }
  return { status: res.status, json };
}

const tomorrow = (() => {
  const d = new Date(Date.now() + 2 * 86400000);
  return d.toISOString().slice(0, 10);
})();

async function main() {
  console.log(`API smoke test against ${BASE}\n`);
  const email = `smoke-${Date.now()}@example.com`;
  const password = 'smoke-test-password-2026';

  console.log('Auth & account');
  const weak = await call('POST', '/auth/sign-up', { name: 'Smoke Test', phone: '0412 000 000', email, password: 'short' }, { expect: 422, auth: false });
  check('sign-up rejects a short password with fields.password', weak.json?.error?.fields?.password ? [] : ['no fields.password']);
  const signUp = await call('POST', '/auth/sign-up', { name: 'Smoke Test', phone: '0412 000 000', email, password }, { expect: 201, auth: false });
  check('sign-up session', shape('session', signUp.json, 'session'));
  token = signUp.json?.accessToken;
  const dupe = await call('POST', '/auth/sign-up', { name: 'Smoke Test', phone: '0412 000 000', email, password }, { expect: 409, auth: false });
  check('duplicate email → 409 fields.email=taken', dupe.json?.error?.fields?.email === 'taken' ? [] : ['missing taken']);
  const wrong = await call('POST', '/auth/sign-in', { email, password: 'wrong-password-123' }, { expect: 401, auth: false });
  check('wrong password → 401', wrong.json?.error?.code === 'UNAUTHORIZED' ? [] : ['code is not UNAUTHORIZED']);
  const signIn = await call('POST', '/auth/sign-in', { email, password }, { auth: false });
  check('sign-in session', shape('session', signIn.json, 'session'));
  const refreshed = await call('POST', '/auth/refresh', { refreshToken: signIn.json?.refreshToken }, { auth: false });
  check('refresh returns a new session', shape('session', refreshed.json, 'session'));
  token = refreshed.json?.accessToken ?? token;
  const reused = await call('POST', '/auth/refresh', { refreshToken: signIn.json?.refreshToken }, { expect: 401, auth: false });
  check('a used refresh token is refused', reused.status === 401 ? [] : ['reuse accepted']);
  await call('POST', '/auth/password-reset', { email }, { expect: 204, auth: false });
  ok('password reset → 204');
  const me = await call('GET', '/me');
  check('GET /me', shape('customer', me.json, 'me'));
  const patched = await call('PATCH', '/me', { name: 'Smoke Tester', phone: '0412 999 888' });
  check('PATCH /me', [...shape('customer', patched.json, 'me'), ...(patched.json?.name === 'Smoke Tester' ? [] : ['name not saved'])]);
  const prefs = await call('GET', '/me/preferences');
  check('GET preferences', [...shape('preferences', prefs.json, 'prefs'), ...(prefs.json?.dietary ?? []).flatMap((d, i) => inEnum('prefDietary', d, `dietary[${i}]`))]);
  const prefsPatch = await call('PATCH', '/me/preferences', { dietary: ['gluten_free', 'vegan'], notifications: { ...prefs.json?.notifications, offersAndNews: true }, avatar: 3 });
  check('PATCH preferences', JSON.stringify(prefsPatch.json?.dietary) === '["gluten_free","vegan"]' && prefsPatch.json?.avatar === 3 ? [] : ['not saved']);

  console.log('\nCafés, menu, content');
  const locations = arr((await call('GET', '/locations', undefined, { auth: false })).json);
  check(`GET /locations (${locations.length})`, [
    ...(locations.length ? [] : ['no cafés']),
    ...locations.flatMap((l, i) => [
      ...shape('location', l, `locations[${i}]`),
      ...inEnum('locationStatus', l.status, `${l.id}.status`),
      ...(l.fulfilmentMethods ?? []).flatMap((m) => inEnum('method', m, `${l.id}.fulfilmentMethods`)),
      ...(l.weeklyHours ? Object.keys(l.weeklyHours).flatMap((k) => inEnum('weekday', k, `${l.id}.weeklyHours`)) : []),
      ...(l.status === 'open' && !l.weeklyHours ? [`${l.id} is open without weeklyHours`] : []),
    ]),
  ]);
  const one = await call('GET', `/locations/${locations[0]?.id}`, undefined, { auth: false });
  check('GET one café', shape('location', one.json, 'location'));
  await call('GET', '/locations/no-such-cafe', undefined, { expect: 404, auth: false });
  ok('unknown café → 404');
  const categories = arr((await call('GET', '/menu/categories', undefined, { auth: false })).json);
  check(`GET categories (${categories.length})`, categories.flatMap((c, i) => shape('category', c, `categories[${i}]`)));
  const categoryIds = new Set(categories.map((c) => c.id));
  const menus = {};
  for (const l of locations) {
    const items = arr((await call('GET', `/locations/${l.id}/menu`, undefined, { auth: false })).json);
    menus[l.id] = items;
    check(`menu at ${l.id} (${items.length} items)`, [
      ...items.flatMap((m, i) => [
        ...shape('menuItem', m, `${l.id}[${i}]`),
        ...(categoryIds.has(m.categoryId) ? [] : [`${m.id}.categoryId ${m.categoryId} is not a category`]),
        ...(m.dietary ?? []).flatMap((d) => inEnum('dietary', d, `${m.id}.dietary`)),
        ...(Number.isInteger(m.priceCents) && m.priceCents >= 0 ? [] : [`${m.id}.priceCents ${m.priceCents}`]),
        ...(m.modifierGroups ?? []).flatMap((g, j) => [
          ...shape('modifierGroup', g, `${m.id}.groups[${j}]`),
          ...(g.options ?? []).flatMap((o, k) => (typeof o.name === 'string' && Number.isInteger(o.priceCents) ? [] : [`${m.id}.${g.id}.options[${k}]`])),
          ...(g.required && !g.options?.length ? [`${m.id}.${g.id} is required but has no options`] : []),
        ]),
      ]),
      ...(new Set(items.map((m) => m.id)).size === items.length ? [] : ['duplicate item ids']),
    ]);
  }
  const anyItem = Object.values(menus).flat()[0];
  check('GET one menu item', shape('menuItem', (await call('GET', `/menu/items/${anyItem?.id}`, undefined, { auth: false })).json, 'item'));
  const packages = arr((await call('GET', '/catering/packages', undefined, { auth: false })).json);
  check(`GET catering packages (${packages.length})`, packages.flatMap((p, i) => shape('cateringPackage', p, `packages[${i}]`)));
  const offers = arr((await call('GET', '/content/offers', undefined, { auth: false })).json);
  check(`GET offers (${offers.length})`, offers.flatMap((o, i) => shape('offer', o, `offers[${i}]`)));
  const faqs = arr((await call('GET', '/content/faqs', undefined, { auth: false })).json);
  check(`GET faqs (${faqs.length})`, faqs.flatMap((f, i) => shape('faq', f, `faqs[${i}]`)));

  console.log('\nFavourites & addresses');
  const fav = await call('PUT', `/me/favourites/${anyItem?.id}`);
  check('add favourite', fav.json?.itemIds?.includes(anyItem?.id) ? [] : ['not in itemIds']);
  const unfav = await call('DELETE', `/me/favourites/${anyItem?.id}`);
  check('remove favourite', unfav.json?.itemIds?.includes(anyItem?.id) ? ['still there'] : []);
  const address = await call('POST', '/me/addresses', { label: 'home', line: '1 Smoke St, Braddon ACT 2612' }, { expect: 201 });
  check('save address', [...shape('address', address.json, 'address'), ...inEnum('addressLabel', address.json?.label, 'address.label')]);
  await call('DELETE', `/me/addresses/${address.json?.id}`, undefined, { expect: 204 });
  ok('delete address → 204');

  console.log('\nOrdering');
  const cafe = locations.find((l) => l.status === 'open' && (menus[l.id] ?? []).some((m) => !m.modifierGroups.some((g) => g.required)));
  const plain = (menus[cafe?.id] ?? []).find((m) => !m.modifierGroups.some((g) => g.required));
  const withOptions = (menus[cafe?.id] ?? []).find((m) => m.modifierGroups.some((g) => g.required));
  const lines = [{ itemId: plain?.id, qty: 2, selections: {}, note: 'smoke test' }];
  if (withOptions) {
    const selections = Object.fromEntries(withOptions.modifierGroups.filter((g) => g.required).map((g) => [g.id, [g.options[0].name]]));
    lines.push({ itemId: withOptions.id, qty: 1, selections, note: '' });
  }
  const quoteBody = { locationId: cafe?.id, method: 'pickup', deliveryAddress: null, tableNumber: null, lines, payment: { choice: 'apple_pay' }, useGiftCard: false, useReward: false };
  const quote = await call('POST', '/orders/quote', quoteBody);
  check('quote', Number.isInteger(quote.json?.totals?.totalCents) ? [] : ['no totals.totalCents']);
  const missingOption = withOptions ? await call('POST', '/orders/quote', { ...quoteBody, lines: [{ itemId: withOptions.id, qty: 1, selections: {}, note: '' }] }, { expect: 422 }) : null;
  if (missingOption) check('a required option missing → 422', missingOption.json?.error?.code === 'VALIDATION' ? [] : ['not VALIDATION']);
  const orderBody = { ...quoteBody, timing: { type: 'asap' }, payment: { choice: 'apple_pay', token: `demo_applepay_${Date.now()}` }, contact: { name: 'Smoke Tester', phone: '0412 999 888' }, expectedTotalCents: quote.json?.totals?.totalCents };
  const priceChanged = await call('POST', '/orders', { ...orderBody, expectedTotalCents: 1 }, { expect: [409, 501], headers: { 'Idempotency-Key': `ord_smoke_bad_${Date.now()}` } });
  if (priceChanged.status === 409) check('wrong expected total → PRICE_CHANGED', priceChanged.json?.error?.code === 'PRICE_CHANGED' ? [] : ['code']);
  const key = `ord_smoke_${Date.now()}`;
  const order = await call('POST', '/orders', orderBody, { expect: [201, 501], headers: { 'Idempotency-Key': key } });
  let orderId = null;
  if (order.status === 501) {
    console.log('  note no payment provider on this server (501 NOT_IMPLEMENTED) — run it with PAYMENT_PROVIDER=demo to test orders');
  } else {
    orderId = order.json?.id;
    check('place order', [...shape('order', order.json, 'order'), ...inEnum('orderStatus', order.json?.status, 'order.status'), ...inEnum('method', order.json?.method, 'order.method')]);
    const replay = await call('POST', '/orders', { ...orderBody, payment: { choice: 'apple_pay', token: 'demo_applepay_retry' } }, { expect: 201, headers: { 'Idempotency-Key': key } });
    check('same Idempotency-Key replays the order (no double charge)', replay.json?.id === orderId ? [] : ['a second order was created']);
    check('GET order', shape('order', (await call('GET', `/orders/${orderId}`)).json, 'order'));
  }
  const history = await call('GET', '/me/orders?limit=5');
  check('order history page', [...(Array.isArray(history.json?.items) ? [] : ['no items']), ...(history.json?.items ?? []).flatMap((o, i) => shape('order', o, `orders[${i}]`)), ...('nextCursor' in (history.json ?? {}) ? [] : ['no nextCursor'])]);
  await call('GET', '/orders/00000000-0000-0000-0000-000000000000', undefined, { expect: 404 });
  ok('someone else’s / unknown order → 404');
  check('saved cards', Array.isArray((await call('GET', '/me/payment-methods')).json) ? [] : ['not a list']);

  console.log('\nCoffee card & gift card');
  const card = await call('GET', '/me/loyalty');
  check('coffee card', [...shape('loyaltyCard', card.json, 'card'), ...(/^8020 \d{4} \d{4}$/.test(card.json?.memberNumber ?? '') ? [] : ['memberNumber format'])]);
  const activity = await call('GET', '/me/loyalty/activity?limit=10');
  check('coffee card history', (activity.json?.items ?? []).flatMap((a, i) => [...shape('loyaltyActivity', a, `activity[${i}]`), ...inEnum('loyaltyType', a.type, `activity[${i}].type`)]));
  await call('GET', '/me/loyalty/wallet-pass', undefined, { expect: 404 });
  ok('wallet pass → 404 (the app shows "not available")');
  check('wallet pass added', (await call('POST', '/me/loyalty/wallet-pass/added')).json?.walletPassAdded === true ? [] : ['not true']);
  check('gift card', shape('giftCard', (await call('GET', '/me/gift-card')).json, 'gift'));
  const gifts = arr((await call('GET', '/me/gift-card/activity')).json);
  check('gift card activity', gifts.flatMap((g, i) => [...shape('giftActivity', g, `gifts[${i}]`), ...inEnum('giftKind', g.kind, `gifts[${i}].kind`)]));

  const giftKey = `gift_smoke_${Date.now()}`;
  const gift = await call('POST', '/gift-cards/send', { amountCents: 5000, recipientName: 'Smoke Friend', recipientEmail: 'friend@example.com', message: 'smoke test', paymentToken: `demo_applepay_${Date.now()}` }, { expect: [201, 501], headers: { 'Idempotency-Key': giftKey } });
  check(`send an eGift (${gift.status === 501 ? '501: no payment provider' : 'demo payment'})`, gift.status === 201 ? [...shape('giftActivity', gift.json, 'gift'), ...inEnum('giftKind', gift.json?.kind, 'gift.kind')] : []);
  const card501 = await call('POST', '/me/payment-methods', { sourceToken: 'tok_smoke' }, { expect: 501 });
  check('save a card → 501 NOT_IMPLEMENTED (needs a payment provider)', card501.json?.error?.code === 'NOT_IMPLEMENTED' ? [] : ['code']);
  await call('DELETE', '/me/payment-methods/none', undefined, { expect: 204 });
  ok('remove a card → 204');

  console.log('\nBookings & catering');
  const bookable = locations.find((l) => l.status === 'open' && l.weeklyHours && Object.values(l.weeklyHours).every(Boolean)) ?? cafe;
  const hours = bookable?.weeklyHours?.[ENUMS.weekday[new Date(`${tomorrow}T12:00:00`).getDay()]];
  const time = hours ? hours.open.replace(/^(\d\d):\d\d$/, (_, h) => `${String(Number(h) + 1).padStart(2, '0')}:00`) : '10:00';
  const reservation = await call('POST', '/reservations', { locationId: bookable?.id, date: tomorrow, time, guests: 2, seating: 'indoor', name: 'Smoke Tester', phone: '0412 999 888', email, notes: 'smoke test' }, { expect: 201 });
  check(`book a table at ${bookable?.id} ${tomorrow} ${time}`, [...shape('reservation', reservation.json, 'reservation'), ...inEnum('reservationStatus', reservation.json?.status, 'status'), ...inEnum('seating', reservation.json?.seating, 'seating')]);
  const badTime = await call('POST', '/reservations', { locationId: bookable?.id, date: tomorrow, time: '23:30', guests: 2, seating: 'indoor', name: 'Smoke Tester', phone: '0412 999 888', email, notes: '' }, { expect: 422 });
  check('booking outside opening hours → 422 fields.time', badTime.json?.error?.fields?.time ? [] : ['no fields.time']);
  const mine = arr((await call('GET', '/me/reservations')).json);
  check('my bookings', [...mine.flatMap((r, i) => shape('reservation', r, `bookings[${i}]`)), ...(mine.some((r) => r.id === reservation.json?.id) ? [] : ['new booking missing'])]);
  await call('DELETE', `/reservations/${reservation.json?.id}`, undefined, { expect: 204 });
  const after = arr((await call('GET', '/me/reservations')).json);
  check('cancel booking', after.find((r) => r.id === reservation.json?.id)?.status === 'cancelled' ? [] : ['not cancelled']);
  const enquiry = await call('POST', '/catering-enquiries', { packageId: packages[0]?.id, firstName: 'Smoke', lastName: 'Tester', email, phone: '0412 999 888', company: '', occasion: 'Team breakfast', date: tomorrow, time: '09:00', guests: 20, location: 'Smoke venue', dietary: ['Vegan'], notes: 'smoke test' }, { expect: 201 });
  check('catering enquiry', [...shape('cateringEnquiry', enquiry.json, 'enquiry'), ...inEnum('enquiryStatus', enquiry.json?.status, 'status')]);
  check('my enquiries', arr((await call('GET', '/me/catering-enquiries')).json).flatMap((e, i) => shape('cateringEnquiry', e, `enquiries[${i}]`)));

  console.log('\nNotifications & push');
  const feed = await call('GET', '/me/notifications');
  check(`feed (${feed.json?.items?.length ?? 0} items)`, [
    ...(Array.isArray(feed.json?.unseenIds) ? [] : ['no unseenIds']),
    ...(feed.json?.items ?? []).flatMap((n, i) => [...shape('notification', n, `feed[${i}]`), ...inEnum('notificationKind', n.kind, `feed[${i}].kind`)]),
  ]);
  for (const path of ['/me/notifications/seen', '/me/notifications/read-all']) await call('POST', path, undefined, { expect: 204 });
  ok('seen + read-all → 204');
  const pushToken = `ExponentPushToken[smoke-${Date.now()}]`;
  await call('POST', '/me/push-tokens', { token: pushToken, platform: 'ios' }, { expect: 204 });
  await call('POST', '/me/push-tokens', { token: 'not-a-token' }, { expect: 422 });
  await call('DELETE', `/me/push-tokens/${encodeURIComponent(pushToken)}`, undefined, { expect: 204 });
  ok('push token register / reject junk / remove');

  await call('POST', '/me/closure-request', undefined, { expect: 204 });
  ok('closure request (email to the team) → 204');

  console.log('\nPassword & account deletion');
  const badCurrent = await call('POST', '/me/password', { currentPassword: 'nope', newPassword: 'another-smoke-pass-2026' }, { expect: 422 });
  check('wrong current password → 422', badCurrent.json?.error?.fields?.currentPassword ? [] : ['no fields.currentPassword']);
  const changed = await call('POST', '/me/password', { currentPassword: password, newPassword: 'another-smoke-pass-2026' });
  check('change password returns a session', shape('session', changed.json, 'session'));
  token = changed.json?.accessToken ?? token;
  await call('DELETE', '/me', undefined, { expect: 204 });
  const gone = await call('POST', '/auth/sign-in', { email, password: 'another-smoke-pass-2026' }, { expect: 401, auth: false });
  check('deleted account cannot sign in', gone.status === 401 ? [] : ['still signs in']);
  await call('POST', '/auth/sign-out', { refreshToken: changed.json?.refreshToken }, { expect: 204, auth: false });
  ok('sign-out → 204');

  const asIndex = args.indexOf('--as');
  if (asIndex >= 0) await existingCustomer(args[asIndex + 1], args.includes('--password') ? args[args.indexOf('--password') + 1] : 'eightytwenty-demo');

  console.log(`\n${failures ? `${failures} check(s) FAILED` : 'All checks passed'}${orderId ? '' : ' (orders skipped: no payment provider)'}`);
  process.exit(failures ? 1 : 0);
}

/** Read-only pass over a customer with real history (seed data): every list, every page. */
async function existingCustomer(email, password) {
  console.log(`\nExisting customer ${email} (read only)`);
  token = null;
  const session = await call('POST', '/auth/sign-in', { email, password }, { auth: false });
  if (session.bad) return;
  token = session.json.accessToken;
  check('profile + preferences', [...shape('customer', (await call('GET', '/me')).json, 'me'), ...shape('preferences', (await call('GET', '/me/preferences')).json, 'prefs')]);
  const orders = [];
  for (let cursor = ''; ; ) {
    const page = (await call('GET', `/me/orders?limit=50${cursor ? `&cursor=${cursor}` : ''}`)).json;
    orders.push(...(page?.items ?? []));
    if (!page?.nextCursor) break;
    cursor = page.nextCursor;
  }
  check(`all ${orders.length} orders`, orders.flatMap((o, i) => [
    ...shape('order', o, `orders[${i}]`),
    ...inEnum('orderStatus', o.status, `${o.number}.status`),
    ...inEnum('method', o.method, `${o.number}.method`),
    ...(['asap', 'scheduled'].includes(o.timing?.type) ? [] : [`${o.number}.timing.type ${o.timing?.type}`]),
    ...(o.lines.length ? [] : [`${o.number} has no lines`]),
  ]));
  const activity = arr((await call('GET', '/me/loyalty/activity?limit=50')).json?.items);
  check(`coffee card history (${activity.length})`, activity.flatMap((a, i) => [...shape('loyaltyActivity', a, `activity[${i}]`), ...inEnum('loyaltyType', a.type, `activity[${i}].type`)]));
  const gifts = arr((await call('GET', '/me/gift-card/activity')).json);
  check(`gift card activity (${gifts.length})`, gifts.flatMap((g, i) => [...shape('giftActivity', g, `gifts[${i}]`), ...inEnum('giftKind', g.kind, `gifts[${i}].kind`)]));
  const feed = arr((await call('GET', '/me/notifications')).json?.items);
  check(`notifications (${feed.length})`, feed.flatMap((n, i) => [...shape('notification', n, `feed[${i}]`), ...inEnum('notificationKind', n.kind, `feed[${i}].kind`)]));
  const bookings = arr((await call('GET', '/me/reservations')).json);
  check(`bookings (${bookings.length})`, bookings.flatMap((r, i) => [...shape('reservation', r, `bookings[${i}]`), ...inEnum('reservationStatus', r.status, `bookings[${i}].status`), ...inEnum('seating', r.seating, `bookings[${i}].seating`)]));
  const enquiries = arr((await call('GET', '/me/catering-enquiries')).json);
  check(`catering enquiries (${enquiries.length})`, enquiries.flatMap((e, i) => [...shape('cateringEnquiry', e, `enquiries[${i}]`), ...inEnum('enquiryStatus', e.status, `enquiries[${i}].status`)]));
  const favourites = arr((await call('GET', '/me/favourites')).json?.itemIds);
  const missing = [];
  for (const id of favourites) if ((await call('GET', `/menu/items/${id}`, undefined, { expect: [200, 404], auth: false })).status !== 200) missing.push(id);
  check(`favourites (${favourites.length}) all still on the menu`, missing.map((id) => `${id} is gone`));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
