const endpoint = "https://byluoipdunralsurwebt.supabase.co/functions/v1/women-store-bridge/orders/attribution";
const prefix = "women.order.attribution.v2:";
const lifetime = 24 * 60 * 60 * 1000;
const fields = ["source", "medium", "campaign", "content", "term", "adset", "ad", "landing", "fbp", "fbc"];
const active = new Map();

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function orderPayload(value) {
  if (!isRecord(value) || typeof value.idempotencyKey !== "string" ||
    !/^[A-Za-z0-9_-]{16,128}$/.test(value.idempotencyKey) ||
    typeof value.publicOrderCode !== "string" || !/^ORD-[23456789ABCDEFGHJKMNPQRSTVWXYZ]{8}$/.test(value.publicOrderCode) ||
    !isRecord(value.params)) return null;
  const params = {};
  for (const name of fields) {
    const raw = value.params[name];
    if (typeof raw !== "string") continue;
    const text = raw.trim();
    if (!text || /[\x00-\x1f\x7f<>]/.test(text)) continue;
    if (name === "fbp" && !/^fb\.\d{1,4}\.\d{13}\.\d{1,40}$/.test(text)) continue;
    if (name === "fbc" && !/^fb\.\d{1,4}\.\d{13}\.[A-Za-z0-9_-]{1,512}$/.test(text)) continue;
    if (name !== "fbp" && name !== "fbc" && text.length > 120) continue;
    params[name] = text;
  }
  return Object.keys(params).length ? { idempotencyKey: value.idempotencyKey, publicOrderCode: value.publicOrderCode, params } : null;
}

function pendingOrders() {
  const pending = [];
  const now = Date.now();
  for (const key of Object.keys(localStorage).filter(key => key.startsWith(prefix))) {
    const saved = localStorage.getItem(key);
    let record;
    try { record = JSON.parse(saved); } catch { /* Corrupt records are discarded below. */ }
    const payload = orderPayload(record);
    if (payload && key === prefix + payload.publicOrderCode &&
      Number.isFinite(record.queuedAt) && record.queuedAt > now - lifetime && record.queuedAt <= now) {
      pending.push({ key, saved, payload, queuedAt: record.queuedAt });
    } else localStorage.removeItem(key);
  }
  pending.sort((a, b) => b.queuedAt - a.queuedAt);
  for (const item of pending.splice(5)) localStorage.removeItem(item.key);
  return pending;
}

function keepCopy(key, payload) {
  try {
    const prior = pendingOrders().find(item => item.key === key && item.payload.idempotencyKey === payload.idempotencyKey);
    if (prior) return prior;
    const saved = JSON.stringify({ ...payload, queuedAt: Date.now() });
    localStorage.setItem(key, saved);
    pendingOrders();
    return { key, saved, payload };
  } catch { return { key, saved: null, payload }; }
}

function beacon(body) {
  try { navigator.sendBeacon?.(endpoint, body); } catch { /* A best-effort fallback for a missing local copy. */ }
}

async function send({ key, saved, payload }) {
  if (active.has(key)) return;
  const body = JSON.stringify(payload);
  active.set(key, { body, saved });
  try {
    // A string uses text/plain. No CORS preflight needs to survive the page exit.
    const reply = await fetch(endpoint, { method: "POST", mode: "cors", credentials: "omit", keepalive: true, body });
    if (!reply.ok) return;
    const { outcome } = await reply.json();
    if (saved && (outcome === "saved" || outcome === "duplicate") && localStorage.getItem(key) === saved) {
      localStorage.removeItem(key);
    }
  } catch { if (!saved) beacon(body); }
  finally { active.delete(key); }
}

export function recordOrderAttribution(publicOrderCode, idempotencyKey) {
  let ad;
  let meta;
  try { ad = JSON.parse(sessionStorage.getItem("women.ad.params.v1") || "null"); } catch { /* No campaign data available. */ }
  try { meta = /** @type {any} */ (window).womenMetaIds?.(); } catch { /* No Meta browser IDs available. */ }
  const params = { ...(isRecord(ad) && ad), ...(isRecord(meta) && meta) };
  const payload = orderPayload({ publicOrderCode, idempotencyKey, params });
  if (payload) void send(keepCopy(prefix + publicOrderCode, payload));
}

function retry() {
  try { for (const item of pendingOrders()) void send(item); }
  catch { /* Checkout works with storage disabled. */ }
}

if (typeof window !== "undefined" && window === window.top) {
  retry();
  window.addEventListener("pageshow", event => { if (event.persisted) retry(); });
  window.addEventListener("online", retry);
  window.addEventListener("pagehide", () => {
    for (const { body, saved } of active.values()) if (!saved) beacon(body);
  });
}
