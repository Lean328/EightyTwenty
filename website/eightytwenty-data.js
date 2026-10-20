// Stable frontend data adapter for the public site.
// Loads live data from the BOS backend; falls back to the last good copy in localStorage,
// then to the bundled mock-data.js snapshot, so the site never renders empty.
import * as MOCK from './mock-data.js';
import { API_BASE } from './config.js';
export { preferredLocation, rememberLocation, phillipFirst } from './location-preference.js';

const CACHE_KEY = 'e82-bootstrap-v1';
const WAIT_MS = 4000; // Render free tier may be cold; don't block the page longer than this.

const DEFAULT_ORDER_RULES = {
  cardSurcharge: 0.0295,   // TapTouch payments config, all stores
  deliveryRate: 0.10,      // TapTouch delivery surcharge rate (config)
  slotMinutes: 5,
  notice: 'Once submitted, our kitchen gets straight to work, so orders cannot be changed or cancelled.',
  pickupInstructions: 'Pick up at counter'
};

const usable = d => d && [d.LOCATIONS, d.CATEGORIES, d.MENU, d.CATERING].every(a => Array.isArray(a) && a.length);

function readCache() {
  try { const d = JSON.parse(localStorage.getItem(CACHE_KEY)); return usable(d) ? d : null; } catch { return null; }
}

async function fetchBootstrap() {
  if (!API_BASE) return null;
  try {
    // no-cache = revalidate via ETag every load (cheap 304), so BOS price/stock changes show at once.
    const res = await fetch(API_BASE + '/api/v1/public/bootstrap', { cache: 'no-cache' });
    if (!res.ok) return null;
    const data = await res.json();
    if (!usable(data)) return null;
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(data)); } catch {}
    return data;
  } catch { return null; }
}

// If the API is slow, keep the request running so it refreshes the cache for the next visit.
const live = await Promise.race([fetchBootstrap(), new Promise(r => setTimeout(() => r(null), WAIT_MS))]);
const data = live || readCache() || MOCK;

export const SOURCE = live ? 'api' : data === MOCK ? 'mock' : 'cache';
export const LOCATIONS = data.LOCATIONS;
export const CATEGORIES = data.CATEGORIES;
export const MENU = data.MENU;
export const CATERING = data.CATERING;
export const ORDER_RULES = Object.assign({}, DEFAULT_ORDER_RULES, data.ORDER_RULES || {});

// POST a public form (booking / enquiry). Resolves { ok, data } and never throws.
export async function postForm(path, body) {
  if (!API_BASE) return { ok: false, data: null };
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15000);
  try {
    const res = await fetch(API_BASE + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: ctrl.signal
    });
    const json = await res.json().catch(() => null);
    return { ok: res.ok, data: json };
  } catch {
    return { ok: false, data: null };
  } finally {
    clearTimeout(timer);
  }
}
