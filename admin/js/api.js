// Auth (Supabase Auth REST) + Admin API (Edge Function women-admin).
// Production admin requires an authenticated Owner/Staff session for all privileged calls.
import { CONFIG } from './config.js';

const KEY = 'wa.session';
const EXPIRED = 'wa:session-expired';
let session = null;

// The tab's sessionStorage is the single source of truth for the session. Every read goes through sync(), so a
// second copy of this module (e.g. a cached or differently-versioned URL) can never act on a stale token.
function sync() {
  try { session = JSON.parse(sessionStorage.getItem(KEY) || 'null'); } catch { session = null; }
}
function load() {
  // Retire older demo mode and long-lived browser storage.
  // No preview account may survive a deployment or impersonate an Owner.
  try { sessionStorage.removeItem('wa.mode'); } catch { /* ignore */ }
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
  sync();
}
function persist() {
  try { session ? sessionStorage.setItem(KEY, JSON.stringify(session)) : sessionStorage.removeItem(KEY); } catch { /* ignore */ }
}
load();

export const mode = () => 'live';

const authHeaders = () => ({ apikey: CONFIG.publishableKey, 'Content-Type': 'application/json' });

async function authFetch(path, body, method = 'POST', bearer) {
  const res = await fetch(`${CONFIG.supabaseUrl}/auth/v1/${path}`, {
    method, headers: { ...authHeaders(), ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null; try { data = await res.json(); } catch { /* empty */ }
  return { ok: res.ok, status: res.status, data };
}
function keep(data) {
  session = { access_token: data.access_token, refresh_token: data.refresh_token,
    expires_at: Date.now() + (Number(data.expires_in) || 3600) * 1000, email: data.user?.email || session?.email || '' };
  persist();
}

export async function signIn(email, password) {
  try {
    const r = await authFetch('token?grant_type=password', { email, password });
    if (!r.ok) return { ok: false, reason: 'wrong' };
    keep(r.data); return { ok: true };
  } catch { return { ok: false, reason: 'network' }; }
}
export async function signOut() {
  sync();
  const tok = session?.access_token; session = null; persist();
  if (tok) authFetch('logout', null, 'POST', tok).catch(() => null);
}
export async function requestReset(email) {
  try { await authFetch(`recover?redirect_to=${encodeURIComponent(CONFIG.appUrl)}`, { email }); } catch { /* same answer either way */ }
  return { ok: true };
}
// Invitation / recovery links come back as #access_token=…&type=invite|recovery
export function consumeAuthHash() {
  const h = new URLSearchParams(location.hash.replace(/^#/, ''));
  const tok = h.get('access_token'), type = h.get('type');
  if (!tok || !['invite', 'recovery', 'signup', 'magiclink'].includes(type || '')) return null;
  keep({ access_token: tok, refresh_token: h.get('refresh_token'), expires_in: h.get('expires_in') });
  history.replaceState(null, '', location.pathname + location.search);
  return type;
}
export async function setPassword(password) {
  sync();
  const r = await authFetch('user', { password }, 'PUT', session?.access_token);
  return r.ok ? { ok: true } : { ok: false, reason: r.status === 422 ? 'weak' : 'expired' };
}
// One refresh at a time: parallel requests near expiry share it instead of spending the refresh token twice.
let refreshing = null;
async function fresh() {
  sync();
  if (!session) return null;
  if (session.expires_at - Date.now() > 60_000) return session.access_token;
  if (!session.refresh_token) return null;
  if (!refreshing) {
    const token = session.refresh_token;
    refreshing = authFetch('token?grant_type=refresh_token', { refresh_token: token })
      .then((r) => {
        sync();
        // A sign-out or new sign-in may have replaced this session while refresh was in flight.
        // Never resurrect a revoked session with a late successful refresh response.
        if (session?.refresh_token !== token) return;
        if (r.ok) keep(r.data);
        else { session = null; persist(); }
      })
      .catch(() => null)
      .finally(() => { refreshing = null; });
  }
  await refreshing;
  sync();
  return session && session.expires_at - Date.now() > 0 ? session.access_token : null;
}
export const hasSession = () => !!session;
export const sessionEmail = () => { sync(); return session?.email || ''; };

// Broadcast, so the shell reacts whichever copy of this module saw the expiry.
const onExpired = () => dispatchEvent(new Event(EXPIRED));
export function onSessionExpired(fn) { addEventListener(EXPIRED, fn); }

async function post(path, body, isForm = false) {
  const tok = await fresh();
  if (!tok) { onExpired(); return { outcome: 'unauthorized' }; }
  let res;
  try {
    res = await fetch(`${CONFIG.api}${path}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tok}`, apikey: CONFIG.publishableKey, ...(isForm ? {} : { 'Content-Type': 'application/json' }) },
      body: isForm ? body : JSON.stringify(body),
    });
  } catch { return { outcome: 'network' }; }
  let data; try { data = await res.json(); } catch { data = { outcome: 'server_error' }; }
  if (res.status === 401) onExpired();
  return data;
}

// Every JSON operation: the database decides whether this user may do it.
export const call = (op, args = {}) => post('/call', { op, args });
export const uploadProductImage = (form) => post('/media/upload', form, true);
export const deleteProductImage = (code, mediaId) => post('/media/delete', { code, media_id: mediaId });
export const uploadStorefrontImage = (form) => post('/storefront/upload', form, true);
export const uploadStoreAsset = (form) => post('/settings/asset', form, true);
export const inviteStaff = (email, permissions) => post('/users/invite', { email, permissions });

export function mediaUrl(pathOrUrl) {
  if (!pathOrUrl) return null;
  if (/^(https:|blob:|data:)/.test(pathOrUrl)) return pathOrUrl;
  return CONFIG.storagePublic + String(pathOrUrl).replace(/^\/+/, '');
}
