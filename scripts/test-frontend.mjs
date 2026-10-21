// No package installation/build needed: node --test scripts/test-frontend.mjs
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { preferredLocation, rememberLocation, phillipFirst } from '../website/location-preference.js';

const cafes = [{ id: 'braddon' }, { id: 'phillip' }, { id: 'kingston' }];
const originalWindow = globalThis.window;
afterEach(() => { globalThis.window = originalWindow; });
function storage(saved) {
  const values = new Map(saved ? [['e82-location-v1', saved]] : []);
  globalThis.window = { localStorage: {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  } };
  return values;
}

test('new visitors start at Phillip without recording a fabricated choice', () => {
  const values = storage();
  assert.equal(preferredLocation(cafes), 'phillip');
  assert.equal(values.size, 0);
});
test('explicit café choice survives a new visit and takes priority over preview props', () => {
  storage();
  rememberLocation('kingston');
  assert.equal(preferredLocation(cafes, 'phillip'), 'kingston');
});
test('stale or malformed preferences fall back to a real café', () => {
  for (const saved of ['removed-cafe', '{broken-json}', '']) {
    storage(saved);
    assert.equal(preferredLocation(cafes), 'phillip');
  }
  assert.equal(preferredLocation([{ id: 'kingston' }]), 'kingston');
});
test('storage denied or unavailable never prevents ordering or booking', () => {
  globalThis.window = { get localStorage() { throw new Error('blocked'); } };
  assert.doesNotThrow(() => rememberLocation('braddon'));
  assert.equal(preferredLocation(cafes), 'phillip');
  globalThis.window = undefined;
  assert.equal(preferredLocation(cafes), 'phillip');
});
test('valid preview defaults work only without a remembered choice', () => {
  storage();
  assert.equal(preferredLocation(cafes, 'kingston'), 'kingston');
  assert.equal(preferredLocation(cafes, 'missing'), 'phillip');
});
test('Phillip leads every list while source and other café order stay intact', () => {
  const before = cafes.map(cafe => cafe.id);
  assert.deepEqual(phillipFirst(cafes).map(cafe => cafe.id), ['phillip', 'braddon', 'kingston']);
  assert.deepEqual(cafes.map(cafe => cafe.id), before);
});

const html = readFileSync(new URL('../website/index.html', import.meta.url), 'utf8');
const source = html.match(/<script type="text\/x-dc"[^>]*>([\s\S]*?)<\/script>/)[1];
test('the complete embedded customer app remains valid JavaScript', () => {
  assert.doesNotThrow(() => new vm.Script(source));
});
test('remove only the landing introduction; retain featured location and site animations', () => {
  assert.ok(!html.includes('home-phillip-title'));
  assert.ok(html.includes('featuredPhillip.address'));
  for (const feature of ['data-cafe-track', 'data-reveal', 'bkSubmit', 'submitEnquiry', 'placeOrder']) {
    assert.ok(html.includes(feature), feature);
  }
});
test('booking payload still goes through the existing public API', async () => {
  let request;
  const context = vm.createContext({
    DCLogic: class {
      setState(patch, callback) {
        Object.assign(this.state, typeof patch === 'function' ? patch(this.state) : patch);
        callback?.();
      }
    },
    window: { innerWidth: 1440, scrollTo() {} },
  });
  const Component = new vm.Script(source + '\nComponent;').runInContext(context);
  const app = new Component();
  app.D = { LOCATIONS: cafes, postForm: async (path, body) => {
    request = { path, body }; return { ok: true, data: { reference: 'test-only-reference' } };
  } };
  app.state.bk = { loc: 'phillip', size: '3', date: '2026-11-10', time: '10:00',
    name: ' Test Guest ', phone: '0400000000', email: 'guest@example.com', seat: 'Indoor', notes: 'Coeliac' };
  app.bkSubmit();
  await Promise.resolve();
  assert.equal(request.path, '/api/v1/public/bookings');
  assert.equal(request.body.location, 'phillip');
  assert.equal(request.body.party_size, 3);
  assert.equal(request.body.name, 'Test Guest');
  assert.equal(request.body.notes, 'Table: Indoor\nCoeliac');
  assert.equal(app.state.bkRef, 'test-only-reference');
  assert.equal(app.state.bkSending, false);
});

test('a café selected while bootstrap is loading is not overwritten by a saved default', async () => {
  let resolveData;
  let remembered;
  const context = vm.createContext({
    DCLogic: class { setState(patch, callback) {
      Object.assign(this.state, typeof patch === 'function' ? patch(this.state) : patch);
      callback?.();
    } },
    window: { innerWidth: 1440, scrollTo() {}, addEventListener() {} },
    location: { hash: '' },
    requestAnimationFrame() {}, setTimeout() {},
    loadData: () => new Promise(resolve => { resolveData = resolve; }),
    loadAccount: async () => ({ handleAccountLink: async () => '', restoreSession: async () => null }),
  });
  const isolatedSource = source.replace(/import\(new URL\('account\.js[^\n]+?\)\.href\)/, 'loadAccount()')
    .replace(/import\(new URL\([^\n]+?\)\.href\)/, 'loadData()');
  const Component = new vm.Script(isolatedSource + '\nComponent;').runInContext(context);
  const app = new Component();
  app.hydrateImages = app.observeReveals = () => {};
  app.componentDidMount();
  app.go('reserve', { bk: { ...app.state.bk, loc: 'phillip' } })();
  resolveData({ LOCATIONS: cafes, preferredLocation: () => 'kingston',
    rememberLocation: id => { remembered = id; } });
  await Promise.resolve();
  assert.equal(app.state.bk.loc, 'phillip');
  assert.equal(app.state.locId, 'phillip');
  assert.equal(remembered, 'phillip');
});

// Customer accounts: website/account.js talks to /api/v1/auth and /api/v1/me (fetch is faked).
const saved = new Map();
globalThis.location = { hostname: 'site.example', pathname: '/', search: '', replace(url) { this.replaced = url; } };
globalThis.history = { replaceState(state, title, url) { location.pathname = url; location.search = ''; } };
globalThis.localStorage = { getItem: key => saved.get(key) ?? null, setItem: (key, value) => saved.set(key, value),
  removeItem: key => saved.delete(key) };
const account = await import('../website/account.js');
function fakeApi(routes) {
  const calls = [];
  globalThis.fetch = async (url, init) => {
    const path = url.replace(/^https?:\/\/[^/]+/, '');
    const call = { path, method: init.method, auth: init.headers.Authorization, body: init.body && JSON.parse(init.body) };
    calls.push(call);
    const [status, data] = routes[path](call, calls);
    return { ok: status < 400, status, json: async () => data };
  };
  return calls;
}
const tokens = n => ({ access: 'access-' + n, refresh: 'refresh-' + n });
const profile = { email: 'guest@example.com', first_name: 'Test', last_name: 'Guest', phone: '0400000000' };

test('signing in stores only the refresh token and loads the profile with the access token', async () => {
  saved.clear();
  const calls = fakeApi({ '/api/v1/auth/login': () => [200, tokens(1)], '/api/v1/me': () => [200, profile] });
  const res = await account.signIn('guest@example.com', 'correct-horse-1');
  assert.equal(res.ok, true);
  assert.equal(res.data.first_name, 'Test');
  assert.deepEqual(calls[0].body, { email: 'guest@example.com', password: 'correct-horse-1' });
  assert.equal(calls[1].auth, 'Bearer access-1');
  assert.equal(saved.get('e82-refresh-v1'), 'refresh-1');
});
test('a returning visitor is restored with one refresh even when asked twice at once', async () => {
  saved.clear(); saved.set('e82-refresh-v1', 'refresh-1');
  const calls = fakeApi({ '/api/v1/auth/refresh': () => [200, tokens(2)], '/api/v1/me': () => [200, profile] });
  const [a, b] = await Promise.all([account.restoreSession(), account.restoreSession()]);
  assert.equal(a.email, 'guest@example.com');
  assert.equal(b.email, 'guest@example.com');
  assert.equal(calls.filter(c => c.path === '/api/v1/auth/refresh').length, 1);
  assert.equal(saved.get('e82-refresh-v1'), 'refresh-2');
});
test('an expired session is forgotten; a network failure keeps it for next time', async () => {
  saved.clear(); saved.set('e82-refresh-v1', 'stale');
  fakeApi({ '/api/v1/auth/refresh': () => [401, { error: { code: 'token_not_valid' } }] });
  assert.equal(await account.restoreSession(), null);
  assert.equal(saved.has('e82-refresh-v1'), false);
  saved.set('e82-refresh-v1', 'still-good');
  globalThis.fetch = async () => { throw new TypeError('offline'); };
  assert.equal(await account.restoreSession(), null);
  assert.equal(saved.get('e82-refresh-v1'), 'still-good');
});
test('sign-up sends the honeypot and the API field errors reach the form', async () => {
  saved.clear();
  const calls = fakeApi({ '/api/v1/auth/register': () => [400, { error: { code: 'invalid', message: 'Please check the submitted fields.',
    fields: { email: ['This email is already registered.'], non_field_errors: ['This password is too common.'] } } }] });
  const res = await account.signUp({ email: 'guest@example.com', password: 'password12', first_name: 'Test', last_name: 'Guest', phone: '' });
  assert.equal(calls[0].body.website, '');
  const errors = account.errorsOf(res);
  assert.equal(errors.email, 'This email is already registered.');
  assert.equal(errors.non_field_errors, 'This password is too common.');
  assert.equal(account.errorsOf({ status: 401, data: null }).message, 'Email or password is incorrect.');
  assert.match(account.errorsOf({ status: 0, data: null }).message, /reach EightyTwenty/);
});
test('logging out revokes the refresh token on the server and forgets it', async () => {
  saved.clear();
  fakeApi({ '/api/v1/auth/login': () => [200, tokens(3)], '/api/v1/me': () => [200, profile] });
  await account.signIn('guest@example.com', 'correct-horse-1');
  const calls = fakeApi({ '/api/v1/auth/logout': () => [204, null] });
  await account.signOut();
  assert.deepEqual(calls[0].body, { refresh: 'refresh-3' });
  assert.equal(calls[0].auth, 'Bearer access-3');
  assert.equal(saved.has('e82-refresh-v1'), false);
});
test('email links: reset opens the API password page, verification is confirmed on the site', async () => {
  location.pathname = '/reset-password'; location.search = '?uid=MQ&token=abc';
  assert.equal(await account.handleAccountLink(), '');
  assert.equal(location.replaced, 'https://eightytwenty-api.onrender.com/account/reset-password?uid=MQ&token=abc');
  location.pathname = '/verify-email'; location.search = '?uid=MQ&token=abc';
  const calls = fakeApi({ '/api/v1/auth/verify-email': () => [200, { message: 'Email verified.' }] });
  assert.match(await account.handleAccountLink(), /verified/);
  assert.deepEqual(calls[0].body, { uid: 'MQ', token: 'abc' });
  assert.equal(location.pathname, '/');
  assert.equal(await account.handleAccountLink(), '');
});

function mountWithAccount(api) {
  const context = vm.createContext({
    DCLogic: class { setState(patch, callback) {
      Object.assign(this.state, typeof patch === 'function' ? patch(this.state) : patch);
      callback?.();
    } },
    window: { innerWidth: 1440, scrollTo() {} }, document: { querySelector: () => null },
  });
  const app = new (new vm.Script(source + '\nComponent;').runInContext(context))();
  app.A = api; app._account = Promise.resolve(api);
  return app;
}
const settle = () => new Promise(resolve => setImmediate(resolve));
test('the login form signs in through the account API and opens the real profile', async () => {
  const seen = [];
  const app = mountWithAccount({ signIn: async (email, password) => { seen.push([email, password]); return { ok: true, status: 200, data: profile }; } });
  app.state.au = { email: ' Guest@Example.com ', password: 'correct-horse-1' };
  app.auSubmit('login')({ preventDefault() {} });
  await settle();
  assert.deepEqual(seen, [['guest@example.com', 'correct-horse-1']]);
  assert.equal(app.state.signedIn, true);
  assert.deepEqual({ ...app.state.user }, { name: 'Test Guest', email: 'guest@example.com', phone: '0400000000' });
  assert.equal(app.state.view, 'account');
  assert.equal(app.state.auBusy, null);
});
test('a rejected login stays signed out and says why', async () => {
  const app = mountWithAccount({ signIn: async () => ({ ok: false, status: 401, data: null }),
    errorsOf: () => ({ message: 'Email or password is incorrect.' }) });
  app.state.au = { email: 'guest@example.com', password: 'wrong-password' };
  app.auSubmit('login')({ preventDefault() {} });
  await settle();
  assert.notEqual(app.state.signedIn, true);
  assert.equal(app.state.auSrv.login, 'Email or password is incorrect.');
  assert.equal(app.state.auBusy, null);
});
test('my bookings come from the API; a signed-in booking carries the token, a stale one books as guest', async () => {
  saved.clear();
  fakeApi({ '/api/v1/auth/login': () => [200, tokens(4)], '/api/v1/me': () => [200, profile] });
  await account.signIn('guest@example.com', 'correct-horse-1');
  let calls = fakeApi({ '/api/v1/me/bookings?page_size=20': () => [200, { count: 1, results: [{ reference: 'BK-1', location: 'phillip', status: 'confirmed' }] }],
    '/api/v1/public/bookings': () => [201, { reference: 'BK-2', status: 'requested' }] });
  assert.equal((await account.myBookings())[0].reference, 'BK-1');
  const booked = await account.bookAsCustomer({ location: 'phillip' });
  assert.equal(booked.data.reference, 'BK-2');
  assert.equal(calls.at(-1).auth, 'Bearer access-4');
  calls = fakeApi({ '/api/v1/public/bookings': call => call.auth ? [401, null] : [201, { reference: 'BK-3' }],
    '/api/v1/auth/refresh': () => [401, null] });
  assert.equal((await account.bookAsCustomer({ location: 'phillip' })).data.reference, 'BK-3');
  assert.equal(calls.at(-1).auth, undefined);
});
test('the reservations tab lists the account bookings from the API', async () => {
  const app = mountWithAccount({ myBookings: async () => [{ reference: 'BK-1', location: 'phillip', date: '2026-11-10', time: '09:30:00', party_size: 3, status: 'confirmed', notes: 'Table: Outdoor\nHigh chair' }] });
  app.D = { LOCATIONS: [{ id: 'phillip', name: 'Phillip', booking: 'Phillip - 100% Gluten Free' }] };
  app.loadMyBookings();
  await settle();
  const [row] = app.bookingRows();
  assert.equal(row.cafe, 'Phillip - 100% Gluten Free');
  assert.match(row.when, /9:30 am$/);
  assert.equal(row.size, 3);
  assert.equal(row.seat, ' · Outdoor');
  assert.equal(row.status, 'Confirmed');
});
test('saving the profile sends name and phone to the API, never the email', async () => {
  let sent;
  const app = mountWithAccount({ updateProfile: async fields => { sent = fields; return { ok: true, status: 200, data: { ...profile, ...fields } }; } });
  app.state.user = { name: 'Test  Guest Smith', email: 'guest@example.com', phone: '0411 111 111' };
  app.saveProfile();
  await settle();
  assert.deepEqual({ ...sent }, { first_name: 'Test', last_name: 'Guest Smith', phone: '0411 111 111' });
  assert.equal(app.state.profileMsg, 'Changes saved.');
});
