// Customer accounts for the public site, backed by the BOS API (/api/v1/auth, /api/v1/me).
// Access token stays in memory; the rotating refresh token is kept in localStorage so a
// customer stays signed in across visits (bearer JSON API, see docs/API_GUIDE.md).
import { API_BASE } from './config.js';

const REFRESH_KEY = 'e82-refresh-v1';
let access = '';
let refreshing = null;

const stored = () => { try { return localStorage.getItem(REFRESH_KEY) || ''; } catch { return ''; } };
const store = token => { try { token ? localStorage.setItem(REFRESH_KEY, token) : localStorage.removeItem(REFRESH_KEY); } catch {} };
const keep = tokens => { access = tokens.access; store(tokens.refresh); };

// Resolves { ok, status, data } and never throws; status 0 = network error or timeout.
async function call(path, { method = 'GET', body, auth } = {}) {
  if (!API_BASE) return { ok:false, status:0, data:null };
  const headers = { 'Content-Type':'application/json' };
  if (auth && access) headers.Authorization = 'Bearer ' + access;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15000);
  try {
    const res = await fetch(API_BASE + path, { method, headers, body: body ? JSON.stringify(body) : undefined, signal: ctrl.signal });
    const data = res.status === 204 ? null : await res.json().catch(() => null);
    return { ok: res.ok, status: res.status, data };
  } catch {
    return { ok:false, status:0, data:null };
  } finally {
    clearTimeout(timer);
  }
}

// One refresh at a time: the server rotates refresh tokens and rejects a replayed one.
function refresh() {
  if (!stored()) return Promise.resolve(false);
  refreshing = refreshing || call('/api/v1/auth/refresh', { method:'POST', body:{ refresh:stored() } }).then(res => {
    refreshing = null;
    if (res.ok) keep(res.data);
    else if (res.status === 400 || res.status === 401) store('');
    return res.ok;
  });
  return refreshing;
}

async function authed(path, opts) {
  const res = await call(path, Object.assign({ auth:true }, opts));
  return res.status === 401 && await refresh() ? call(path, Object.assign({ auth:true }, opts)) : res;
}

const first = v => Array.isArray(v) ? first(v[0]) : v && typeof v === 'object' ? first(Object.values(v)[0]) : String(v || '');

// { field: message } from an API error, plus `message` for the whole form.
export function errorsOf(res) {
  const err = (res.data && res.data.error) || {};
  const out = {};
  Object.entries(err.fields && !Array.isArray(err.fields) ? err.fields : {}).forEach(([k, v]) => { out[k] = first(v); });
  out.message = res.status === 0 ? 'We couldn’t reach EightyTwenty. Check your connection and try again.'
    : res.status === 429 ? 'Too many attempts. Please wait a minute and try again.'
    : res.status === 401 ? 'Email or password is incorrect.'
    : err.message || 'Something went wrong. Please try again.';
  return out;
}

export async function restoreSession() {
  if (!await refresh()) return null;
  const res = await authed('/api/v1/me');
  return res.ok ? res.data : null;
}

export async function signIn(email, password) {
  const res = await call('/api/v1/auth/login', { method:'POST', body:{ email, password } });
  if (!res.ok) return res;
  keep(res.data);
  return authed('/api/v1/me');
}

export async function signUp(fields) {
  const res = await call('/api/v1/auth/register', { method:'POST', body: Object.assign({ website:'' }, fields) });
  return res.ok ? signIn(fields.email, fields.password) : res;
}

export const updateProfile = fields => authed('/api/v1/me', { method:'PATCH', body:fields });

export async function signOut() {
  const body = () => ({ refresh:stored() });
  if (stored()) {
    const res = await call('/api/v1/auth/logout', { method:'POST', body:body(), auth:true });
    if (res.status === 401 && await refresh()) await call('/api/v1/auth/logout', { method:'POST', body:body(), auth:true });
  }
  access = '';
  store('');
}

export const requestPasswordReset = email => call('/api/v1/auth/password/reset', { method:'POST', body:{ email, website:'' } });

// Email links point at {CLIENT_BASE_URL}/verify-email and /reset-password (backend accounts.services).
// Reset uses the API's own password page; verification is confirmed here. Resolves a toast message or ''.
export async function handleAccountLink() {
  const path = location.pathname.replace(/\/+$/, '');
  const q = new URLSearchParams(location.search);
  if (path === '/reset-password' && API_BASE) { location.replace(API_BASE + '/account/reset-password' + location.search); return ''; }
  if (path !== '/verify-email') return '';
  history.replaceState(null, '', '/');
  const res = await call('/api/v1/auth/verify-email', { method:'POST', body:{ uid:q.get('uid') || '', token:q.get('token') || '' } });
  return res.ok ? 'Thanks — your email is verified.' : 'This verification link is invalid or has expired.';
}
