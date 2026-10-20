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
  });
  const isolatedSource = source.replace(/import\(new URL\([^\n]+?\)\.href\)/, 'loadData()');
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
