// @ts-check
/* SELECT SHOP WOMEN — shared runtime for static product landing pages (/lp/<code>/).
 * The page HTML is pre-rendered from the public catalog (tooling/build-lp.mjs) so the photo, title and price
 * paint without JS. This script only re-checks live price/availability, renders size choices, and hands the
 * chosen line to the EXISTING cart + /checkout/ (server-quoted price and shipping, idempotent orders).
 * No order is ever placed from here. Text is always set with textContent.
 */
const API = "https://byluoipdunralsurwebt.supabase.co/functions/v1/women-checkout";
const VIEWS_API = "https://byluoipdunralsurwebt.supabase.co/functions/v1/women-product-views";
const CART_KEY = "women.cart.v1"; // same key and line shape as js/commerce.js
const VIEW_KEY = "women.anonymous-product-views.v1";
const VARIANT_KEY = "women.lp.variant.v1"; // bucket is chosen before paint by the inline #lp-ab script

/** @typedef {{optionPosition:number, valuePosition:number}} Pick */
/** @typedef {{publicCode:string, structureVersion:number, quantity:number, selection:Pick[]}} Line */

export const validCode = (/** @type {unknown} */ x) => typeof x === "string" && /^SS-\d{4,19}$/.test(x);

/** @returns {line is Line} */
export function lineOk(/** @type {any} */ line) {
  return !!line && validCode(line.publicCode) && Number.isInteger(line.structureVersion) && line.structureVersion > 0
    && Number.isInteger(line.quantity) && line.quantity >= 1 && line.quantity <= 99
    && Array.isArray(line.selection) && line.selection.length <= 100
    && line.selection.every((/** @type {any} */ v) => Number.isInteger(v.optionPosition) && Number.isInteger(v.valuePosition)
      && v.optionPosition >= 0 && v.valuePosition >= 0);
}

const lineKey = (/** @type {Line} */ x) => x.publicCode + "@" + x.structureVersion + ":" + x.selection.map(y => y.optionPosition + "." + y.valuePosition).join(",");

/** Same merge rule as the product page: one line per variant address, quantity capped at 99, max 50 lines. */
export function mergeLine(/** @type {unknown[]} */ lines, /** @type {Line} */ line) {
  const out = lines.filter(lineOk).slice(0, 50);
  const pos = out.findIndex(x => lineKey(x) === lineKey(line));
  if (pos >= 0) out[pos] = { ...out[pos], quantity: Math.min(99, out[pos].quantity + line.quantity) };
  else out.push(line);
  return out.slice(0, 50);
}

/** The variant whose selection matches the chosen value position for every option. */
export function findVariant(/** @type {any} */ product, /** @type {number[]} */ values) {
  return (product.variants || []).find((/** @type {any} */ v) => v.selection.length === values.length
    && v.selection.every((/** @type {Pick} */ s, /** @type {number} */ i) => s.valuePosition === values[i]));
}

/** Option values that have at least one purchasable variant (others render disabled). */
export function sellableValues(/** @type {any} */ product, /** @type {number} */ optionIndex) {
  const set = new Set();
  for (const v of product.variants || []) if (v.purchasable === true) set.add(v.selection[optionIndex]?.valuePosition);
  return set;
}

export const egp = (/** @type {number} */ minor) => new Intl.NumberFormat("ar-EG").format(minor / 100);

function track(/** @type {string} */ name, /** @type {Record<string, unknown>} */ fields) {
  try { const w = /** @type {any} */ (window); if (typeof w.gtag === "function") w.gtag("event", name, fields); } catch { /* optional */ }
}

async function recordView(/** @type {string} */ code) {
  // Mirrors js/commerce.js: anonymous, deduplicated per browser key on the server; never blocks the page.
  try {
    if (/** @type {any} */ (navigator).globalPrivacyControl === true || navigator.doNotTrack === "1") return;
    let key = localStorage.getItem(VIEW_KEY);
    if (!/^[0-9a-f]{64}$/.test(key || "")) {
      key = Array.from(crypto.getRandomValues(new Uint8Array(32)), b => b.toString(16).padStart(2, "0")).join("");
      localStorage.setItem(VIEW_KEY, key);
    }
    await fetch(VIEWS_API, { method: "POST", mode: "cors", credentials: "omit", keepalive: true,
      headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code, visitorKey: key }) });
  } catch { /* never blocks shopping */ }
}

async function api(/** @type {string} */ path, method = "GET", /** @type {unknown} */ body = null) {
  /** @type {RequestInit} */
  const opts = { method, cache: "no-store", headers: { Accept: "application/json" }, signal: AbortSignal.timeout(12000) };
  if (body !== null) { opts.headers = { Accept: "application/json", "Content-Type": "application/json" }; opts.body = JSON.stringify(body); }
  const r = await fetch(API + path, opts);
  let data = {}; try { data = await r.json(); } catch { /* empty */ }
  if (!r.ok) throw Object.assign(new Error(String(/** @type {any} */ (data).error || "service_unavailable")), { status: r.status });
  return /** @type {any} */ (data);
}

function loadAnalyticsLater() {
  // GA4 + Meta Pixel (~380 KB) wait until the page is idle so they never compete with the photo or the first tap.
  const go = () => { const s = document.createElement("script"); s.src = "/js/analytics.js?v=lp-20261025"; document.head.append(s); };
  const idle = () => ("requestIdleCallback" in window ? requestIdleCallback(go, { timeout: 3500 }) : setTimeout(go, 1500));
  if (document.readyState === "complete") idle(); else addEventListener("load", idle, { once: true });
}

function lazyVideo() {
  // The video file is requested only after the visitor taps play.
  document.querySelectorAll("[data-lp-video]").forEach(btn => btn.addEventListener("click", () => {
    const src = btn.getAttribute("data-lp-video") || "";
    if (!/^(\/|https:\/\/byluoipdunralsurwebt\.supabase\.co\/storage\/v1\/object\/public\/)/.test(src)) return;
    const v = document.createElement("video");
    Object.assign(v, { src, controls: true, autoplay: true, playsInline: true, preload: "auto" });
    v.className = "lp-video";
    btn.replaceWith(v);
  }, { once: true }));
}

async function init() {
  const dataEl = document.getElementById("lp-data");
  if (!dataEl) return;
  const page = JSON.parse(dataEl.textContent || "{}");
  if (!validCode(page.code)) return;
  const $ = (/** @type {string} */ s) => /** @type {HTMLElement} */ (document.querySelector(s));
  const variant = document.documentElement.dataset.v || "a";
  const cta = /** @type {HTMLButtonElement} */ ($("#lpOrder"));
  const status = $("#lpStatus");
  const say = (/** @type {string} */ t, error = false) => { status.textContent = t; status.dataset.error = String(error); };

  try { const w = /** @type {any} */ (window); w.dataLayer = w.dataLayer || []; w.gtag = w.gtag || function () { w.dataLayer.push(arguments); };
    w.gtag("set", "user_properties", { lp_variant: page.id + ":" + variant }); } catch { /* optional */ }
  loadAnalyticsLater();
  lazyVideo();
  track("lp_view", { lp_id: page.id, lp_variant: variant, item_id: page.code });
  void recordView(page.code);

  let product;
  try { ({ product } = await api("/product/" + encodeURIComponent(page.code))); }
  catch { say("مش قادرين نتأكد من التوفر دلوقتي. جرّبي تاني بعد شوية.", true); return; }
  if (!product || !Array.isArray(product.variants) || !Array.isArray(product.options)) { say("القطعة دي مش متاحة دلوقتي.", true); return; }

  const holder = $("#lpOptions");
  /** @type {number[]} */
  const chosen = product.options.map(() => -1);
  const priceEl = $("#lpPrice");
  const refresh = () => {
    const v = chosen.every(x => x >= 0) ? findVariant(product, chosen) : null;
    const minor = v?.unitPrice?.amountMinor ?? product.price?.minAmountMinor;
    if (Number.isSafeInteger(minor) && minor > 0) priceEl.textContent = egp(minor); // live price always replaces the build-time one
    cta.disabled = product.purchasable !== true;
    cta.textContent = product.purchasable === true ? "اطلبي دلوقتي" : "غير متاح حاليًا";
    return v;
  };
  product.options.forEach((/** @type {any} */ o, /** @type {number} */ i) => {
    const ok = sellableValues(product, i);
    const box = document.createElement("fieldset");
    box.className = "lp-opt";
    const legend = document.createElement("legend"); legend.textContent = o.name || "المقاس"; box.append(legend);
    for (const val of o.values) {
      const label = document.createElement("label");
      const input = document.createElement("input");
      Object.assign(input, { type: "radio", name: "opt" + i, value: String(val.position), disabled: !ok.has(val.position) });
      input.addEventListener("change", () => { chosen[i] = val.position; say(""); refresh(); });
      const span = document.createElement("span"); span.textContent = val.value;
      label.append(input, span); box.append(label);
    }
    holder.append(box);
  });
  // A single sellable value per option is pre-selected so one-size pieces need one tap.
  product.options.forEach((/** @type {any} */ _, /** @type {number} */ i) => {
    const ok = [...sellableValues(product, i)];
    if (ok.length === 1) { chosen[i] = ok[0]; const r = /** @type {HTMLInputElement|null} */ (holder.querySelector(`input[name="opt${i}"][value="${ok[0]}"]`)); if (r) r.checked = true; }
  });
  refresh();

  cta.addEventListener("click", async () => {
    const v = refresh();
    if (!v || v.purchasable !== true) { say("اختاري المقاس الأول.", true); holder.scrollIntoView({ behavior: "smooth", block: "center" }); return; }
    /** @type {Line} */
    const line = { publicCode: product.publicCode, structureVersion: product.structureVersion, selection: v.selection, quantity: 1 };
    cta.disabled = true; say("بنجهز طلبك…");
    try {
      await api("/cart/add", "POST", line); // server re-validates the variant address; nothing is ordered here
      let lines = [];
      try { lines = JSON.parse(localStorage.getItem(CART_KEY) || "[]"); } catch { /* corrupt cart = empty */ }
      localStorage.setItem(CART_KEY, JSON.stringify(mergeLine(Array.isArray(lines) ? lines : [], line)));
      track("lp_order_click", { lp_id: page.id, lp_variant: variant, item_id: product.publicCode });
      track("add_to_cart", { currency: "EGP", value: (v.unitPrice?.amountMinor || 0) / 100, items: [{ item_id: product.publicCode, quantity: 1 }] });
      location.href = "/checkout/";
    } catch (e) {
      cta.disabled = false;
      say(/** @type {any} */ (e)?.message === "unavailable" ? "المقاس ده خلص، اختاري مقاس تاني." : "حصلت مشكلة اتصال، جرّبي تاني.", true);
    }
  });
}

if (typeof document !== "undefined") {
  try { localStorage.setItem(VARIANT_KEY, document.documentElement.dataset.v || "a"); } catch { /* private mode */ }
  void init();
}
