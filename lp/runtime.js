// @ts-check
/* SELECT SHOP WOMEN — shared runtime for one-page direct-order landing pages.
 *   /lp/<id>/      pre-rendered from the public catalog (tooling/build-lp.mjs): photo, title and price paint without JS.
 *   /lp/?p=SS-…    the automatic page for ANY public product: the same layout filled from the live product read.
 * The order form is part of the page. Every number the customer confirms comes from the server quote
 * (/checkout/quote) and the order is created by the existing COD endpoint (/orders) with ONE idempotency key per
 * attempt, reused on every retry, so a double tap, a timeout or a reload never creates a second order.
 * Text is always set with textContent.
 */
const API = "https://byluoipdunralsurwebt.supabase.co/functions/v1/women-checkout";
const VIEWS_API = "https://byluoipdunralsurwebt.supabase.co/functions/v1/women-product-views";
const VIEW_KEY = "women.anonymous-product-views.v1";
const BAG_KEY = "women.cart.v1"; // same first-party cart as js/commerce.js
const VARIANT_KEY = "women.lp.variant.v1"; // bucket is chosen before paint by the inline #lp-ab script
const ORDER_KEY = "women.lp.order.key.v1"; // one attempt = one key, kept until the server confirms an order
const PURCHASE_SEEN_KEY = "women.meta.purchase.sent.v1"; // same dedupe list as js/commerce.js
const ANALYTICS_SRC = "/js/analytics.js?v=lp-20261030";
const THUMBS = "/assets/catalog-thumbs/";
const MAX_QTY = 10;
// Legacy single-colour LP URLs must resolve to the verified shared-model chooser.
// Keep the original SKU as ?color= to honour old ad links without altering orders or stock.
const SHARED_MODEL_URLS = new Map([
  ["SS-1008", "/lp/ss-1008/"], ["SS-1009", "/lp/ss-1008/"],
  ["SS-1037", "/lp/ballon-suit/"], ["SS-1035", "/lp/ballon-suit/"],
  ["SS-1036", "/lp/ballon-suit/"], ["SS-1038", "/lp/ballon-suit/"],
  ["SS-1039", "/lp/ballon-suit/"], ["SS-1040", "/lp/ballon-suit/"],
  ["SS-1010", "/lp/ballon-suit/"],
]);
const ORDER_CODE = /^ORD-[23456789ABCDEFGHJKMNPQRSTVWXYZ]{8}$/;
const MEDIA = /^https:\/\/byluoipdunralsurwebt\.supabase\.co\/storage\/v1\/object\/public\/product-media\/media\/([0-9a-f]{32}\.(?:jpg|png|webp))$/;

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
const okMinor = (/** @type {unknown} */ m) => typeof m === "number" && Number.isSafeInteger(m) && m > 0;
const minorOf = (/** @type {any} */ m) => m && m.currency === "EGP" && Number.isSafeInteger(m.amountMinor) && m.amountMinor >= 0 ? m.amountMinor : null;

/** The one price text both displays show: the chosen variant's price, else the product minimum ("من" when sizes
 *  cost differently), else "—" when no verified EGP price exists. */
export function priceLabel(/** @type {any} */ product, /** @type {any} */ variant) {
  if (variant && variant.unitPrice?.currency === "EGP" && okMinor(variant.unitPrice.amountMinor)) return egp(variant.unitPrice.amountMinor);
  const p = product?.price;
  if (!p || p.currency !== "EGP" || !okMinor(p.minAmountMinor)) return "—";
  return (okMinor(p.maxAmountMinor) && p.maxAmountMinor > p.minAmountMinor ? "من " : "") + egp(p.minAmountMinor);
}

/** Egyptian mobile as the server stores it (01XXXXXXXXX); Arabic/Persian digits, spaces and +20 accepted. */
export function egMobile(/** @type {string} */ raw) {
  const d = String(raw).replace(/[٠-٩]/g, c => String(c.charCodeAt(0) - 0x660)).replace(/[۰-۹]/g, c => String(c.charCodeAt(0) - 0x6f0))
    .replace(/[\s\-().]/g, "");
  const m = /^(?:\+20|0020|20)?0?(1[0125]\d{8})$/.exec(d);
  return m ? "0" + m[1] : null;
}

/** First problem per customer field (the server re-validates; this only gives instant help). */
export function checkBuyer(/** @type {{name:string, phone:string, region:string, address:string}} */ f) {
  /** @type {Record<string,string>} */
  const errors = {};
  if (f.name.trim().length < 2) errors.name = "اكتبي اسمك";
  if (!egMobile(f.phone)) errors.phone = "اكتبي رقم موبايل مصري صحيح، زي 01012345678";
  if (!f.region) errors.region = "اختاري المحافظة";
  if (f.address.trim().length < 5) errors.address = "اكتبي العنوان بالتفصيل";
  return errors;
}

/** Photo URLs for the automatic page: checked-in thumbnails when the catalog build has them, else the original. */
export function photoSet(/** @type {string} */ url, /** @type {Set<string>} */ local) {
  const file = MEDIA.exec(url)?.[1];
  if (!file) return null;
  if (!local.has(file)) return { src: url, srcset: "", small: url };
  const f = THUMBS + encodeURIComponent(file);
  return { src: f + ".webp", srcset: `${f}.w400.webp 400w, ${f}.webp 559w`, small: f + ".w400.webp" };
}

/* Analytics: every GA4 / Meta call waits in this queue until /js/analytics.js has run (it defines gtag config and
 * window.womenMetaEvent), then the queue is flushed exactly once. Nothing is sent twice and nothing blocks ordering. */
/** @type {(() => void)[]} */
const queue = [];
let flushed = false;
/** @type {Promise<void>|null} */
let analyticsLoaded = null;
const safe = (/** @type {() => void} */ fn) => { try { fn(); } catch { /* analytics never breaks the page */ } };
function emit(/** @type {() => void} */ fn) { if (flushed) safe(fn); else queue.push(fn); }
function loadAnalytics() {
  if (!analyticsLoaded) {
    analyticsLoaded = new Promise(resolve => {
      const s = document.createElement("script");
      s.src = ANALYTICS_SRC;
      s.onload = s.onerror = () => resolve();
      document.head.append(s);
    }).then(() => { flushed = true; queue.splice(0).forEach(safe); });
  }
  return analyticsLoaded;
}
function loadAnalyticsWhenIdle() {
  // GA4 + Meta Pixel (~380 KB) start right after the load event (the photo is in by then), not at idle time:
  // an idle wait of up to 3.5 s dropped the PageView (Meta "Landing Page View") of visitors who left early.
  const start = () => setTimeout(loadAnalytics, 0);
  if (document.readyState === "complete") start(); else addEventListener("load", start, { once: true });
}
/** GA4 event + the matching Meta standard event, public product codes only (never buyer data or the order code). */
function funnel(/** @type {string} */ name, /** @type {Record<string, any>} */ fields, eventId = "") {
  emit(() => {
    const w = /** @type {any} */ (window);
    if (typeof w.gtag === "function") w.gtag("event", name, fields);
    const metaName = /** @type {Record<string,string>} */ ({ view_item: "ViewContent", add_to_cart: "AddToCart", begin_checkout: "InitiateCheckout", purchase: "Purchase" })[name];
    if (metaName && typeof w.womenMetaEvent === "function") w.womenMetaEvent(metaName, fields, eventId || undefined);
  });
}

async function recordView(/** @type {string} */ code) {
  // Mirrors js/commerce.js: anonymous, deduplicated per browser key on the server; never blocks the page.
  try {
    if (/** @type {any} */ (navigator).globalPrivacyControl === true || navigator.doNotTrack === "1") return;
    let key = localStorage.getItem(VIEW_KEY);
    if (!/^[0-9a-f]{64}$/.test(key || "")) {
      key = hex(32);
      localStorage.setItem(VIEW_KEY, key);
    }
    await fetch(VIEWS_API, { method: "POST", mode: "cors", credentials: "omit", keepalive: true,
      headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code, visitorKey: key }) });
  } catch { /* never blocks shopping */ }
}

const hex = (/** @type {number} */ bytes) => Array.from(crypto.getRandomValues(new Uint8Array(bytes)), b => b.toString(16).padStart(2, "0")).join("");
// Older in-app browsers (Facebook / Instagram on old Android WebViews) have no AbortSignal.timeout.
const timeout = (/** @type {number} */ ms) => (typeof AbortSignal.timeout === "function" ? AbortSignal.timeout(ms) : undefined);

async function parse(/** @type {Promise<Response>} */ pending) {
  const r = await pending;
  let data = {}; try { data = await r.json(); } catch { /* empty */ }
  if (!r.ok) throw Object.assign(new Error(String(/** @type {any} */ (data).error || "service_unavailable")), { status: r.status, data });
  return /** @type {any} */ (data);
}
function api(/** @type {string} */ path, method = "GET", /** @type {unknown} */ body = null, ms = 12000) {
  /** @type {RequestInit} */
  const opts = { method, cache: "no-store", headers: { Accept: "application/json" }, signal: timeout(ms) };
  if (body !== null) { opts.headers = { Accept: "application/json", "Content-Type": "application/json" }; opts.body = JSON.stringify(body); }
  return parse(fetch(API + path, opts));
}
/** A request the inline head script already started (so it overlaps the module download), or a fresh one. */
function early(/** @type {"product"|"regions"} */ which, /** @type {string} */ path) {
  const w = /** @type {any} */ (window).__lp;
  const pending = w && w[which] && (which === "regions" || path === "/product/" + w.code) ? w[which] : null;
  if (pending) w[which] = null; // used once; a later read is a fresh request
  if (!pending) return api(path);
  return Promise.race([parse(pending), new Promise((_, no) => setTimeout(() => no(new Error("timeout")), 12000))]);
}
/** Public reads get one quick retry on a network or server hiccup (flaky in-app browsers); a 404 is final. */
async function read(/** @type {"product"|"regions"} */ which, /** @type {string} */ path) {
  try { return await early(which, path); }
  catch (e) {
    const s = /** @type {any} */ (e)?.status;
    if (s && s < 500 && s !== 429) throw e;
    await new Promise(r => setTimeout(r, 600));
    return api(path);
  }
}

function orderKey() {
  // Kept in sessionStorage so a reload or an unknown outcome retries with the same key; memory if storage is blocked.
  let k = orderKey.mem;
  try { k = sessionStorage.getItem(ORDER_KEY) || k; } catch { /* private mode */ }
  if (!/^[0-9a-f]{32}$/.test(k || "")) k = hex(16);
  orderKey.mem = k;
  try { sessionStorage.setItem(ORDER_KEY, k); } catch { /* private mode */ }
  return k;
}
orderKey.mem = "";
function forgetOrderKey() { orderKey.mem = ""; try { sessionStorage.removeItem(ORDER_KEY); } catch { /* private mode */ } }

/** True the first time this browser reports a confirmed order code (a replay of the same order is not a 2nd sale). */
function firstReport(/** @type {string} */ code) {
  try {
    const seen = JSON.parse(localStorage.getItem(PURCHASE_SEEN_KEY) || "[]");
    if (!Array.isArray(seen) || seen.includes(code)) return false;
    localStorage.setItem(PURCHASE_SEEN_KEY, JSON.stringify([...seen, code].slice(-500)));
    return true;
  } catch { return false; } // fail closed: no dedupe storage, no conversion event
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

/** Automatic page: fill the pre-rendered layout from the live product (title, photos, description). */
function fillFromProduct(/** @type {any} */ p) {
  const title = String(p.title || "").trim().slice(0, 200);
  document.title = title + " · SELECT SHOP WOMEN";
  /** @type {HTMLElement} */ (document.getElementById("lpTitle")).textContent = title;
  const local = new Set(Array.isArray(/** @type {any} */ (window).SELECT_THUMBNAILS) ? /** @type {any} */ (window).SELECT_THUMBNAILS : []);
  const media = (p.media || []).filter((/** @type {any} */ m) => MEDIA.test(m?.url || ""))
    .sort((/** @type {any} */ a, /** @type {any} */ b) => Number(b.isPrimary === true) - Number(a.isPrimary === true) || a.position - b.position).slice(0, 4);
  const img = /** @type {HTMLImageElement} */ (document.querySelector("#lpHero img"));
  const hero = media[0] && photoSet(media[0].url, local);
  if (hero) {
    img.fetchPriority = "high";
    if (hero.srcset) { img.srcset = hero.srcset; img.sizes = "(min-width: 900px) 560px, 100vw"; }
    img.src = hero.src; img.alt = title;
  }
  /** @type {HTMLElement} */ (document.getElementById("lpGallery")).replaceChildren(...media.slice(1).map((/** @type {any} */ m) =>
    Object.assign(document.createElement("img"), { src: photoSet(m.url, local)?.small || "", alt: title, width: 320, height: 400, loading: "lazy", decoding: "async" })));
  const lines = String(p.description || "").split("\n").map(l => l.trim()).filter(Boolean).slice(0, 6);
  /** @type {HTMLElement} */ (document.getElementById("lpDesc")).textContent = lines[0] || "";
  /** @type {HTMLElement} */ (document.getElementById("lpMore")).replaceChildren(...lines.slice(1).map(l => Object.assign(document.createElement("p"), { textContent: l })));
}

async function init() {
  const dataEl = document.getElementById("lp-data");
  if (!dataEl) return;
  const page = JSON.parse(dataEl.textContent || "{}");
  if (page.auto) {
    // /lp/?p=SS-1008 (and the older ?code=) open the automatic page; anything else goes to the storefront.
    const q = new URLSearchParams(location.search);
    page.code = String(q.get("p") || q.get("code") || "").trim().toUpperCase();
    page.id = "p-" + page.code.toLowerCase();
    if (!validCode(page.code)) { location.replace("/"); return; }
  }
  if (!validCode(page.code) || !/^[a-z0-9-]{3,40}$/.test(page.id || "")) return;
  // An old /lp/ss-1009/ (or /lp/?p=SS-1009) is a single-colour page.
  // Redirect it to the shared model without losing the chosen SKU or ad attribution.
  if (!Array.isArray(page.colors) || page.colors.length < 2) {
    const modelUrl = SHARED_MODEL_URLS.get(page.code);
    if (modelUrl && location.pathname !== modelUrl) {
      const params = new URLSearchParams(location.search);
      params.delete("p"); params.delete("code");
      params.set("color", page.code);
      location.replace(modelUrl + "?" + params.toString());
      return;
    }
  }
  const $ = (/** @type {string} */ s) => /** @type {HTMLElement} */ (document.querySelector(s));
  const bucket = document.documentElement.dataset.v === "b" ? "b" : "a";
  const variantId = page.id + ":" + bucket; // the ONE value used for the user property and every event parameter
  const form = /** @type {HTMLFormElement} */ ($("#lpForm"));
  const cta = /** @type {HTMLButtonElement} */ ($("#lpOrder"));
  const cartBtn = /** @type {HTMLButtonElement} */ ($("#lpAddCart"));
  const region = /** @type {HTMLSelectElement} */ (form.elements.namedItem("region"));
  const status = $("#lpStatus");
  const say = (/** @type {string} */ t, error = false) => { status.textContent = t; status.dataset.error = String(error); };
  const ctaText = "تأكيد الطلب";

  emit(() => { const w = /** @type {any} */ (window); if (typeof w.gtag === "function") w.gtag("set", "user_properties", { lp_variant: variantId }); });
  funnel("lp_view", { lp_id: page.id, lp_variant: variantId, item_id: page.code });
  loadAnalyticsWhenIdle();
  lazyVideo();
  void recordView(page.code);

  // One page = one model. Each colour is its own real product (public code); the default colour is pre-rendered.
  /** @type {{code:string,name:string,alt?:string,hero?:{avif:string,webp:string,src:string},gallery?:string[]}[]} */
  const colors = Array.isArray(page.colors) && page.colors.length ? page.colors.filter((/** @type {any} */ c) => validCode(c?.code)) : [{ code: page.code, name: "" }];
  const holder = $("#lpOptions");
  const choiceEl = document.getElementById("lpBarChoice");
  /** @type {Map<string, Promise<any>>} */
  const cache = new Map();
  const load = (/** @type {string} */ code) => {
    if (!cache.has(code)) cache.set(code, read("product", "/product/" + encodeURIComponent(code)).then(d => d.product).catch(e => { cache.delete(code); throw e; }));
    return /** @type {Promise<any>} */ (cache.get(code));
  };
  /** @type {any} */
  let product = null;
  /** @type {any} */
  let variant = null;
  /** @type {number[]} */
  let chosen = [];
  let current = colors[0];
  let qty = 1;
  let ticket = 0; // a newer colour tap always wins over a slower earlier response
  /** @type {any} */
  let quote = null; // the last server quote the customer saw: its totals are what the order confirms
  let quoteTicket = 0;
  let busy = false;
  let cartBusy = false;
  let quoting = false;
  let quoteError = false; // the status line shows a quote problem that the next good quote may clear
  let started = false;

  const sizeText = () => {
    if (!product.options.length) return "مقاس واحد";
    if (!variant) return "اختاري المقاس";
    return product.options.map((/** @type {any} */ o, /** @type {number} */ i) => o.values.find((/** @type {any} */ x) => x.position === chosen[i])?.value || "").join(" · ");
  };
  // GA4 item_variant: the chosen option values (e.g. "M"), never customer data.
  const variantLabel = () => (!product?.options.length ? "one_size" : variant ? sizeText().replace(/ · /g, "/").slice(0, 100) : undefined);
  const lineNow = () => (product && variant?.purchasable === true
    ? { publicCode: product.publicCode, structureVersion: product.structureVersion, selection: variant.selection, quantity: qty } : null);
  // Buyers ordering several colours must send one verified line per REAL SKU, not
  // "quantity 2" against one ambiguous colour. Single-colour checkout is unchanged.
  let mixMode = false;
  let mixBusy = false;
  /** @type {Map<string,{product:any,variant:any,quantity:number}>} */
  const mixEntries = new Map();
  const mixBox = document.createElement("section");
  mixBox.id = "lpMix";
  mixBox.className = "lp-mix";
  mixBox.hidden = colors.length < 2;
  const mixToggle = document.createElement("button");
  mixToggle.type = "button"; mixToggle.id = "lpMixToggle";
  mixToggle.textContent = "عايزة أكتر من لون؟ حددي كمية كل لون";
  mixToggle.setAttribute("aria-expanded", "false");
  const mixRows = document.createElement("div");
  mixRows.id = "lpMixRows"; mixRows.hidden = true;
  mixRows.setAttribute("aria-label", "عدد القطع من كل لون");
  const mixHint = document.createElement("p");
  mixHint.id = "lpMixHint";
  mixHint.textContent = "كل لون هيتسجل في نفس الأوردر بالعدد اللي تختاريه.";
  mixHint.hidden = true;
  mixBox.append(mixToggle, mixHint, mixRows);
  // Lightweight CSS is attached only on model pages with multiple colours.
  if (colors.length > 1) {
    const style = document.createElement("style");
    style.id = "lpMixStyle";
    style.textContent = `
      #lpMix{border:1px solid var(--line);padding:14px;background:var(--bg);margin:6px 0}
      #lpMix [hidden]{display:none!important}
      #lpMixToggle{background:var(--accent,#303c2d);color:#fff;border:0;min-height:44px;padding:10px 12px;width:100%;font:600 14px var(--f);cursor:pointer}
      #lpMixHint{font-size:13px;margin:10px 0;color:var(--muted)}
      #lpMixRows{display:grid;gap:10px;margin-top:12px}
      #lpMixRows .lp-mix-row{display:flex;align-items:center;justify-content:space-between;gap:8px;border-bottom:1px solid var(--line);padding:5px 0 10px}
      #lpMixRows .lp-mix-color{display:flex;align-items:center;gap:8px;font-size:14px;font-weight:600;min-width:0}
      #lpMixRows .lp-mix-color i{display:block;width:18px;height:18px;flex:none;border:1px solid #777}
      #lpMixRows .lp-mix-step{display:flex;align-items:center;gap:6px;flex:none}
      #lpMixRows button{min-width:44px;min-height:44px;border:1px solid var(--line);background:var(--paper,#eeece5);font:600 20px var(--f);color:var(--ink)}
      #lpMixRows button:disabled{opacity:.35}
      #lpMixRows output{min-width:27px;text-align:center;font-weight:600}
    `;
    document.head.append(style);
  }
  if (colors.length > 1) form.querySelector(".qty")?.before(mixBox);
  const singleQtyBox = form.querySelector(".qty");
  const itemLine = (/** @type {{product:any,variant:any,quantity:number}} */ e) => ({
    publicCode: e.product.publicCode, structureVersion: e.product.structureVersion,
    selection: e.variant.selection, quantity: e.quantity,
  });
  const currentLines = () => mixMode
    ? [...mixEntries.values()].filter(e => e.quantity > 0).map(itemLine).filter(lineOk)
    : (lineNow() ? [/** @type {Line} */ (lineNow())] : []);
  const mixCount = () => [...mixEntries.values()].reduce((sum, e) => sum + e.quantity, 0);
  const repaintMix = () => {
    if (!mixMode) return;
    mixRows.replaceChildren();
    for (const color of colors) {
      const entry = mixEntries.get(color.code);
      const count = entry?.quantity || 0;
      const row = document.createElement("div"); row.className = "lp-mix-row";
      const name = document.createElement("span"); name.className = "lp-mix-color";
      const swatch = document.createElement("i"); swatch.style.backgroundColor = color.hex || "#aaa";
      name.append(swatch, document.createTextNode(color.name || color.code));
      const controls = document.createElement("span"); controls.className = "lp-mix-step";
      for (const delta of [-1, 1]) {
        const btn = document.createElement("button");
        btn.type = "button"; btn.textContent = delta > 0 ? "+" : "−";
        btn.dataset.mixCode = color.code; btn.dataset.delta = String(delta);
        btn.setAttribute("aria-label", (delta > 0 ? "زوّدي " : "قلّلي ") + (color.name || color.code));
        btn.disabled = mixBusy || busy || (delta < 0 && count === 0) ||
          (delta > 0 && (mixCount() >= MAX_QTY || count >= MAX_QTY));
        controls.append(btn);
        if (delta < 0) {
          const amount = document.createElement("output");
          amount.dataset.mixCount = color.code;
          amount.textContent = new Intl.NumberFormat("ar-EG").format(count);
          controls.append(amount);
        }
      }
      row.append(name, controls);
      mixRows.append(row);
    }
    mixToggle.textContent = "الرجوع لطلب لون واحد";
    cta.disabled = busy || mixBusy || currentLines().length === 0;
  };

  // Only public/versioned selectors go into the same first-party cart as js/commerce.js.
  const cartKey = (/** @type {Line} */ line) => line.publicCode + '@' + line.structureVersion + ':' +
    line.selection.map(s => s.optionPosition + '.' + s.valuePosition).join(',');
  const readBag = () => {
    const raw = JSON.parse(localStorage.getItem(BAG_KEY) || '[]');
    if (!Array.isArray(raw)) throw new Error('invalid_bag');
    return raw.filter(lineOk).slice(0, 50);
  };
  const refreshCartCount = () => {
    try { $("#lpCartCount").textContent = String(readBag().reduce((n,l)=>n+l.quantity,0)); }
    catch { $("#lpCartCount").textContent = '0'; }
  };
  refreshCartCount();
  cartBtn.addEventListener("click", async () => {
    if (cartBusy || busy) return;
    const line = lineNow();
    if (!line || !lineOk(line)) { say('اختاري اللون والمقاس الأول.', true); return; }
    cartBusy = true; cartBtn.disabled = true; cartBtn.textContent = 'بنضيف…';
    try {
      // Server validates options and availability. It does not create an order.
      await api('/cart/add', 'POST', line);
      const lines = readBag();
      const index = lines.findIndex(x => cartKey(x) === cartKey(line));
      if (index < 0 && lines.length >= 50) throw new Error('cart_full');
      if (index >= 0) {
        if (lines[index].quantity + line.quantity > 99) throw new Error('cart_full');
        lines[index].quantity += line.quantity;
      } else lines.push(line);
      localStorage.setItem(BAG_KEY, JSON.stringify(lines));
      refreshCartCount();
      funnel('add_to_cart', { currency: 'EGP',
        ...(okMinor(variant.unitPrice?.amountMinor) ? { value: variant.unitPrice.amountMinor * line.quantity / 100 } : {}),
        items: [{ item_id: line.publicCode, item_variant: variantLabel(), quantity: line.quantity }] });
      say('اتضافت للشنطة ✓ كمّلي تسوق أو افتحي الشنطة من فوق.');
    } catch (e) {
      say(/** @type {any} */ (e)?.message === 'cart_full' ? 'الشنطة وصلت للحد الأقصى. افتحي الشنطة لتعديلها.' :
        'مش قادرين نضيف للشنطة دلوقتي. تقدري تطلبي مباشرة من نفس الصفحة.', true);
    } finally {
      cartBusy = false; cartBtn.textContent = 'أضيفي للشنطة'; cartBtn.disabled = !lineNow() || busy;
    }
  });

  /** Paints price, quantity, totals and the sticky bar from the verified product and the last server quote only. */
  const paint = () => {
    const unit = product ? priceLabel(product, variant) : "—";
    $("#lpPrice").textContent = unit;
    $("#lpQty").textContent = new Intl.NumberFormat("ar-EG").format(qty);
    /** @type {HTMLButtonElement} */ ($("#lpQtyDown")).disabled = qty <= 1;
    /** @type {HTMLButtonElement} */ ($("#lpQtyUp")).disabled = qty >= MAX_QTY;
    const unitMinor = variant && okMinor(variant.unitPrice?.amountMinor) ? variant.unitPrice.amountMinor : null;
    const mixedSubtotal = [...mixEntries.values()].reduce((sum, e) =>
      sum + e.variant.unitPrice.amountMinor * e.quantity, 0);
    const sub = minorOf(quote?.merchandiseSubtotal) ??
      (mixMode ? (currentLines().length ? mixedSubtotal : null) : (unitMinor === null ? null : unitMinor * qty));
    const ship = minorOf(quote?.shippingTotal), total = minorOf(quote?.grandTotal);
    $("#lpSub").textContent = sub === null ? "—" : egp(sub) + " ج";
    $("#lpShip").textContent = ship !== null ? (ship === 0 ? "مجاني" : egp(ship) + " ج") : !region.value ? "اختاري المحافظة" : quoting ? "بنحسب…" : "—";
    $("#lpTotal").textContent = total === null ? "—" : egp(total) + " ج";
    $("#lpBarPrice").textContent = total !== null ? egp(total) + " ج" : unit === "—" ? "—" : unit + " ج";
    if (choiceEl && product) choiceEl.textContent = mixMode
      ? (currentLines().length ? currentLines().map(l =>
          (colors.find(c => c.code === l.publicCode)?.name || l.publicCode) + " × " + l.quantity).join("، ") : "حددي عدد كل لون")
      : total !== null ? "الإجمالي شامل الشحن" : (current.name ? current.name + " · " : "") + sizeText();
    repaintMix();
  };

  /** Server quote for the current line and governorate; a newer change always wins over a slower answer. */
  const requote = async () => {
    const mine = ++quoteTicket;
    quote = null;
    const lines = currentLines();
    quoting = !!(lines.length && region.value);
    paint();
    if (!quoting) return;
    try {
      const q = await api("/checkout/quote", "POST", { lines, deliveryRegionKey: region.value });
      if (mine !== quoteTicket) return;
      if (q.purchasable !== true || minorOf(q.grandTotal) === null) { quoteError = true; say("مش متاح التوصيل للمحافظة دي أو الكمية دي حاليًا.", true); return; }
      quote = q;
      if (quoteError) { quoteError = false; say(""); }
    } catch (e) {
      if (mine !== quoteTicket) return;
      quoteError = true;
      say(/** @type {any} */ (e)?.message === "checkout_not_purchasable" ? "الكمية دي مش متاحة حاليًا، قللي العدد أو اختاري مقاس تاني." : "مش قادرين نحسب الشحن دلوقتي. جرّبي تاني.", true);
    } finally { if (mine === quoteTicket) { quoting = false; paint(); } }
  };

  const unavailable = (/** @type {string} */ text) => { product = null; variant = null; quote = null; paint(); cta.disabled = true; cartBtn.disabled = true; cta.textContent = "غير متاح حاليًا"; say(text, true); };
  const choose = () => {
    variant = chosen.every(x => x >= 0) ? findVariant(product, chosen) : null;
    cta.disabled = mixMode ? currentLines().length === 0 : false;
    cta.textContent = ctaText;
    cartBtn.disabled = mixMode || !lineNow() || cartBusy;
    void requote();
  };
  const renderOptions = () => {
    holder.replaceChildren();
    chosen = product.options.map(() => -1);
    if (!product.options.length) {
      const box = document.createElement("div"); box.className = "lp-opt";
      const one = document.createElement("span"); one.className = "one"; one.textContent = "مقاس واحد";
      box.append(one); holder.append(box);
      return;
    }
    product.options.forEach((/** @type {any} */ o, /** @type {number} */ i) => {
      const ok = sellableValues(product, i);
      const box = document.createElement("fieldset");
      box.className = "lp-opt";
      const legend = document.createElement("legend"); legend.textContent = o.name || "المقاس"; box.append(legend);
      for (const val of o.values) {
        const label = document.createElement("label");
        const input = document.createElement("input");
        Object.assign(input, { type: "radio", name: "opt" + i, value: String(val.position), disabled: !ok.has(val.position) });
        input.addEventListener("change", () => { chosen[i] = val.position; say(""); choose(); });
        const span = document.createElement("span"); span.textContent = val.value;
        label.append(input, span); box.append(label);
      }
      holder.append(box);
    });
    // A single sellable value per option is pre-selected so one-size pieces need no tap.
    product.options.forEach((/** @type {any} */ _, /** @type {number} */ i) => {
      const ok = [...sellableValues(product, i)];
      if (ok.length === 1) { chosen[i] = ok[0]; const r = /** @type {HTMLInputElement|null} */ (holder.querySelector(`input[name="opt${i}"][value="${ok[0]}"]`)); if (r) r.checked = true; }
    });
  };
  const show = async (/** @type {typeof colors[number]} */ c) => {
    const mine = ++ticket;
    current = c; product = null; variant = null; quote = null; cta.disabled = true; cartBtn.disabled = true; say("");
    let p;
    try { p = await load(c.code); }
    catch (e) {
      // A missing product is unavailable; a network failure leaves no verified price either, so neither is shown.
      if (mine === ticket) unavailable(/** @type {any} */ (e)?.status === 404 ? "القطعة دي مش متاحة دلوقتي." : "مش قادرين نتأكد من السعر والتوفر دلوقتي. جرّبي تاني بعد شوية.");
      return false;
    }
    if (mine !== ticket) return false;
    if (!p || p.publicCode !== c.code || !Array.isArray(p.variants) || !Array.isArray(p.options)) { unavailable("القطعة دي مش متاحة دلوقتي."); return false; }
    if (page.auto) fillFromProduct(p);
    if (p.purchasable !== true || priceLabel(p, null) === "—") { unavailable(colors.length > 1 ? "اللون ده خلص حاليًا، اختاري لون تاني." : "القطعة دي خلصت حاليًا."); return false; }
    product = p; renderOptions(); choose();
    return true;
  };

  // Same real colour picker appears beside the photo AND at the start of the
  // direct order form. Either set of pills updates both selections and media.
  const applyColour = (/** @type {typeof colors[number]} */ c) => {
    document.querySelectorAll("#lpColors .chip, #lpFormColors .chip")
      .forEach(btn => btn.setAttribute("aria-pressed", String(btn.getAttribute("data-code") === c.code)));
    for (const id of ["lpColorName", "lpFormColorName"]) {
      const label = document.getElementById(id);
      if (label) label.textContent = c.name;
    }
    const pic = document.getElementById("lpHero");
    if (pic && c.hero) {
      const [avif, webp] = pic.querySelectorAll("source");
      if (avif) avif.setAttribute("srcset", c.hero.avif);
      if (webp) webp.setAttribute("srcset", c.hero.webp);
      const img = pic.querySelector("img");
      if (img) { img.src = c.hero.src; img.alt = c.alt || ""; }
    }
    const gallery = document.getElementById("lpGallery");
    if (gallery && c.hero) gallery.replaceChildren(...(c.gallery || []).map(src =>
      Object.assign(document.createElement("img"), { src, alt: c.alt || "", width: 480, height: 600, loading: "lazy", decoding: "async" })));
  };
  const viewed = new Set([page.code]);
  document.querySelectorAll("#lpColors .chip, #lpFormColors .chip").forEach(btn => btn.addEventListener("click", () => {
    const c = colors.find(x => x.code === btn.getAttribute("data-code"));
    if (!c || c === current || busy) return;
    applyColour(c);
    if (!viewed.has(c.code)) { viewed.add(c.code); void recordView(c.code); }
    void show(c);
  }));

  // The normal +/- remains a single-colour quantity. Explicit mixed-colour
  // mode gives every colour its own count (zero means not ordered).
  mixToggle.addEventListener("click", () => {
    if (busy || mixBusy || !product) return;
    if (!mixMode) {
      if (!variant || product.options.length) {
        say("اختاري مقاس القطعة الأول، أو استخدمي الشنطة للمنتجات بمقاسات مختلفة.", true);
        return;
      }
      mixEntries.clear();
      mixEntries.set(product.publicCode, { product, variant, quantity: qty });
      mixMode = true;
      mixRows.hidden = false; mixHint.hidden = false;
      mixToggle.setAttribute("aria-expanded", "true");
    } else {
      mixMode = false;
      mixRows.hidden = true; mixHint.hidden = true;
      mixToggle.textContent = "عايزة أكتر من لون؟ حددي كمية كل لون";
      mixToggle.setAttribute("aria-expanded", "false");
    }
    if (singleQtyBox) singleQtyBox.style.display = mixMode ? "none" : "";
    cartBtn.hidden = mixMode; // the direct COD form handles all selected colours
    say("");
    void requote();
  });
  mixRows.addEventListener("click", async event => {
    const btn = /** @type {HTMLElement|null} */ (event.target instanceof Element ?
      event.target.closest("button[data-mix-code]") : null);
    if (!btn || !mixMode || mixBusy || busy) return;
    const code = btn.dataset.mixCode || "";
    const delta = Number(btn.dataset.delta);
    const currentCount = mixEntries.get(code)?.quantity || 0;
    if (delta !== 1 && delta !== -1) return;
    if (delta < 0 && currentCount < 1) return;
    if (delta > 0 && mixCount() >= MAX_QTY) {
      say("أقصى كمية في الطلب الواحد ١٠ قطع من كل الألوان مع بعض.", true);
      return;
    }
    if (delta > 0 && !mixEntries.has(code)) {
      mixBusy = true;
      repaintMix();
      try {
        // Each extra colour has an independent real SKU; accept only a
        // verified purchasable one-size variant before including it in quote.
        const p = await load(code);
        const v = p?.options?.length === 0 ? findVariant(p, []) : null;
        if (!p || p.publicCode !== code || p.purchasable !== true ||
            v?.purchasable !== true || !okMinor(v.unitPrice?.amountMinor)) {
          say("اللون ده مش متاح حاليًا أو ليه مقاسات مختلفة. اختاري لون تاني.", true);
          return;
        }
        mixEntries.set(code, { product: p, variant: v, quantity: 0 });
      } catch {
        say("مش قادرين نتأكد من توفر اللون ده دلوقتي. جرّبي تاني.", true);
        return;
      } finally {
        mixBusy = false;
        repaintMix();
      }
    }
    if (!mixMode || busy) return;
    const entry = mixEntries.get(code);
    if (!entry) return;
    entry.quantity = Math.max(0, Math.min(MAX_QTY, entry.quantity + delta));
    if (entry.quantity === 0) mixEntries.delete(code);
    say("");
    void requote();
  });

  // Governorates load next to the product; the form works as soon as both are in.
  const regionsReady = read("regions", "/regions").then(d => {
    for (const r of Array.isArray(d.regions) ? d.regions : []) {
      if (typeof r?.key !== "string" || typeof r?.label !== "string") continue;
      region.append(Object.assign(document.createElement("option"), { value: r.key, textContent: r.label }));
    }
  }).catch(() => say("مش قادرين نحمّل المحافظات دلوقتي. حدّثي الصفحة.", true));
  region.addEventListener("change", () => void requote());
  form.querySelectorAll("[data-q]").forEach(b => b.addEventListener("click", () => {
    const next = Math.min(MAX_QTY, Math.max(1, qty + Number(b.getAttribute("data-q"))));
    if (next !== qty && !busy) { qty = next; void requote(); }
  }));

  // Field help: errors show next to the field and clear as soon as the customer edits it.
  const fieldNames = ["name", "phone", "region", "address"];
  const fieldEl = (/** @type {string} */ n) => /** @type {HTMLInputElement} */ (form.elements.namedItem(n));
  const markField = (/** @type {string} */ n, /** @type {string} */ text) => {
    const el = fieldEl(n), out = document.getElementById("lpErr-" + n);
    if (text) el.setAttribute("aria-invalid", "true"); else el.removeAttribute("aria-invalid");
    if (out) out.textContent = text;
  };
  const FIELD_HELP = "كمّلي البيانات المطلوبة.";
  for (const n of fieldNames) fieldEl(n).addEventListener(n === "region" ? "change" : "input", () => {
    markField(n, "");
    if (status.textContent === FIELD_HELP && !form.querySelector("[aria-invalid=true]")) say(""); // all fixed: drop the stale hint
  });

  // begin_checkout / InitiateCheckout = the first real interaction with the order form, once per page view.
  form.addEventListener("focusin", () => {
    if (started || !product) return;
    started = true;
    funnel("begin_checkout", { currency: "EGP", lp_id: page.id, lp_variant: variantId,
      items: currentLines().map(l => ({ item_id: l.publicCode,
        item_variant: mixMode ? "one_size" : variantLabel(), quantity: l.quantity })) });
  });

  const done = (/** @type {string} */ code, /** @type {any} */ q, /** @type {Line[]} */ lines) => {
    forgetOrderKey();
    if (firstReport(code)) {
      const value = (minorOf(q.merchandiseSubtotal) ?? 0) / 100;
      funnel("purchase", { currency: "EGP", value, shipping: (minorOf(q.shippingTotal) ?? 0) / 100, transaction_id: hex(16),
        lp_id: page.id, lp_variant: variantId,
        items: lines.map(l => ({ item_id: l.publicCode,
          item_variant: lines.length > 1 ? "one_size" : variantLabel(), quantity: l.quantity })) }, hex(16));
      void loadAnalytics(); // the conversion goes out even if the customer leaves right away
    }
    $("#lpDoneCode").textContent = code;
    const total = minorOf(q.grandTotal);
    const summary = lines.map(l =>
      (colors.find(c => c.code === l.publicCode)?.name || l.publicCode) + " × " +
      new Intl.NumberFormat("ar-EG").format(l.quantity)).join("، ");
    $("#lpDoneText").textContent = (total !== null ? "هتدفعي " + egp(total) + " ج عند الاستلام. " : "") +
      (summary ? "الألوان المطلوبة: " + summary + ". " : "") +
      "طلبك قيد المراجعة، والتوافر وميعاد الشحن بيتأكدوا قبل التأكيد النهائي.";
    form.hidden = true;
    /** @type {HTMLElement} */ (cta.closest(".bar")).hidden = true;
    say("");
    const box = $("#lpDone");
    box.hidden = false;
    box.focus();
    box.scrollIntoView({ block: "center" });
  };

  form.addEventListener("submit", async e => {
    e.preventDefault();
    if (busy || !product) return;
    const lines = currentLines();
    if (!lines.length || !lines.every(lineOk) || mixBusy) {
      say(mixMode ? "اختاري لون واحد على الأقل وحددي عدد القطع." : "اختاري المقاس الأول.", true);
      (mixMode ? mixBox : holder).scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    const intent = JSON.stringify(lines);
    const values = { name: fieldEl("name").value, phone: fieldEl("phone").value, region: region.value, address: fieldEl("address").value };
    const errors = checkBuyer(values);
    for (const n of fieldNames) markField(n, errors[n] || "");
    const firstBad = fieldNames.find(n => errors[n]);
    if (firstBad) { say(FIELD_HELP, true); fieldEl(firstBad).focus(); return; }
    if (!quote) { await requote(); if (!quote) return; }
    if (JSON.stringify(currentLines()) !== intent) {
      say("الكميات اتغيرت. راجعي الألوان وأكّدي تاني.", true);
      return;
    }
    const q = quote;
    busy = true; cta.disabled = true; cartBtn.disabled = true; cta.textContent = "بنسجل طلبك…"; say("بنسجل طلبك…");
    const label = region.selectedOptions[0]?.textContent || "";
    const payload = {
      idempotencyKey: orderKey(), lines, deliveryRegionKey: region.value, paymentMethod: "cod",
      // The governorate is the "area" line of the delivery address; the free text is the street address.
      buyer: { name: values.name.trim(), phone: /** @type {string} */ (egMobile(values.phone)), area: label, address: values.address.trim(), notes: "" },
      confirmedMerchandiseSubtotalPiastres: minorOf(q.merchandiseSubtotal),
      confirmedShippingTotalPiastres: minorOf(q.shippingTotal),
      confirmedGrandTotalPiastres: minorOf(q.grandTotal),
    };
    try {
      const reply = await api("/orders", "POST", payload, 20000);
      if (!ORDER_CODE.test(reply.publicOrderCode)) throw Object.assign(new Error("write_unconfirmed"), { status: 503 });
      done(reply.publicOrderCode, q, lines);
      return;
    } catch (err) {
      const error = /** @type {any} */ (err), data = error?.data || {};
      if (error?.message === "idempotency_conflict" && ORDER_CODE.test(data.publicOrderCode)) { done(data.publicOrderCode, data.grandTotal ? { ...q, grandTotal: data.grandTotal } : q, lines); return; }
      if (error?.message === "order_cancelled") { forgetOrderKey(); say("الطلب السابق اتلغى من المتجر. تقدري تأكدي طلب جديد.", true); }
      else if (error?.message === "checkout_changed") {
        say("السعر أو الشحن اتغير. راجعي الإجمالي الجديد وأكّدي تاني.", true);
        // Same total after a fresh quote = the server refused for stock (fewer units left than asked), not price.
        const before = minorOf(q.grandTotal);
        void requote().then(() => { if (quote && minorOf(quote.grandTotal) === before) say("الكمية المطلوبة أكبر من المتاح دلوقتي. قلّلي العدد وأكّدي تاني.", true); });
      }
      else if (error?.message === "checkout_not_purchasable" || error?.message === "unavailable" || error?.message === "selection_changed") {
        cache.delete(current.code);
        void show(current).then(() => say("الكمية أو المقاس ده مش متاح دلوقتي. غيّري الاختيار وأكّدي تاني.", true));
      } else if (error?.message === "invalid_request" && data.fields && typeof data.fields === "object") {
        const map = /** @type {Record<string,string>} */ ({ name: "name", phone: "phone", area: "region", address: "address" });
        for (const [k, problem] of Object.entries(data.fields)) if (map[k]) markField(map[k], problem === "too_long" ? "النص طويل، اختصريه." : "راجعي الخانة دي.");
        say("راجعي البيانات المظللة.", true);
      } else if (error?.message === "rate_limited") say("محاولات كتير ورا بعض. استني دقيقة وجرّبي تاني.", true);
      // Order taking switched off by the store, or the server could not verify the request: nothing was saved.
      else if (error?.message === "orders_not_enabled" || error?.message === "source_unavailable") say("استقبال الطلبات متوقف مؤقتًا، ومفيش طلب اتسجل. جرّبي تاني بعد شوية.", true);
      // Unknown outcome (timeout, network, 5xx): the SAME key is reused on retry, so the server returns the same order.
      else say("مش متأكدين إن الطلب اتسجل بسبب الاتصال. اضغطي «تأكيد الطلب» تاني، مش هيتكرر.", true);
    } finally { busy = false; }
    cta.disabled = !product || (mixMode && !currentLines().length);
    cartBtn.disabled = mixMode || !lineNow() || cartBusy;
    cta.textContent = product ? ctaText : "غير متاح حاليًا";
  });

  const requestedColour = new URLSearchParams(location.search).get("color");
  const initialColour = colors.find(c => c.code === requestedColour) || colors[0];
  if (initialColour !== colors[0]) applyColour(initialColour);
  if (!(await show(initialColour))) return;
  funnel("view_item", { currency: "EGP", items: [{ item_id: product.publicCode, item_name: String(product.title || "").slice(0, 100) }] });
  await regionsReady;
}

if (typeof document !== "undefined") {
  try { localStorage.setItem(VARIANT_KEY, document.documentElement.dataset.v === "b" ? "b" : "a"); } catch { /* private mode */ }
  void init();
}
