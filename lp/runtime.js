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
const VARIANT_KEY = "women.lp.variant.v1"; // bucket is chosen before paint by the inline #lp-ab script
const ORDER_KEY = "women.lp.order.key.v1"; // one attempt = one key, kept until the server confirms an order
const PURCHASE_SEEN_KEY = "women.meta.purchase.sent.v1"; // same dedupe list as js/commerce.js
const ANALYTICS_SRC = "/js/analytics.js?v=lp-20261025";
const THUMBS = "/assets/catalog-thumbs/";
const MAX_QTY = 10;
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
  // GA4 + Meta Pixel (~380 KB) wait until the page is idle so they never compete with the photo or the first tap.
  const idle = () => ("requestIdleCallback" in window ? requestIdleCallback(() => loadAnalytics(), { timeout: 3500 }) : setTimeout(loadAnalytics, 1500));
  if (document.readyState === "complete") idle(); else addEventListener("load", idle, { once: true });
}
/** GA4 event + the matching Meta standard event, public product codes only (never buyer data or the order code). */
function funnel(/** @type {string} */ name, /** @type {Record<string, any>} */ fields, eventId = "") {
  emit(() => {
    const w = /** @type {any} */ (window);
    if (typeof w.gtag === "function") w.gtag("event", name, fields);
    const metaName = /** @type {Record<string,string>} */ ({ view_item: "ViewContent", begin_checkout: "InitiateCheckout", purchase: "Purchase" })[name];
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
  const $ = (/** @type {string} */ s) => /** @type {HTMLElement} */ (document.querySelector(s));
  const bucket = document.documentElement.dataset.v === "b" ? "b" : "a";
  const variantId = page.id + ":" + bucket; // the ONE value used for the user property and every event parameter
  const form = /** @type {HTMLFormElement} */ ($("#lpForm"));
  const cta = /** @type {HTMLButtonElement} */ ($("#lpOrder"));
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
  let quoting = false;
  let quoteError = false; // the status line shows a quote problem that the next good quote may clear
  let started = false;

  const sizeText = () => {
    if (!product.options.length) return "مقاس واحد";
    if (!variant) return "اختاري المقاس";
    return product.options.map((/** @type {any} */ o, /** @type {number} */ i) => o.values.find((/** @type {any} */ x) => x.position === chosen[i])?.value || "").join(" · ");
  };
  const lineNow = () => (product && variant?.purchasable === true
    ? { publicCode: product.publicCode, structureVersion: product.structureVersion, selection: variant.selection, quantity: qty } : null);

  /** Paints price, quantity, totals and the sticky bar from the verified product and the last server quote only. */
  const paint = () => {
    const unit = product ? priceLabel(product, variant) : "—";
    $("#lpPrice").textContent = unit;
    $("#lpQty").textContent = new Intl.NumberFormat("ar-EG").format(qty);
    /** @type {HTMLButtonElement} */ ($("#lpQtyDown")).disabled = qty <= 1;
    /** @type {HTMLButtonElement} */ ($("#lpQtyUp")).disabled = qty >= MAX_QTY;
    const unitMinor = variant && okMinor(variant.unitPrice?.amountMinor) ? variant.unitPrice.amountMinor : null;
    const sub = minorOf(quote?.merchandiseSubtotal) ?? (unitMinor === null ? null : unitMinor * qty);
    const ship = minorOf(quote?.shippingTotal), total = minorOf(quote?.grandTotal);
    $("#lpSub").textContent = sub === null ? "—" : egp(sub) + " ج";
    $("#lpShip").textContent = ship !== null ? (ship === 0 ? "مجاني" : egp(ship) + " ج") : !region.value ? "اختاري المحافظة" : quoting ? "بنحسب…" : "—";
    $("#lpTotal").textContent = total === null ? "—" : egp(total) + " ج";
    $("#lpBarPrice").textContent = total !== null ? egp(total) + " ج" : unit === "—" ? "—" : unit + " ج";
    if (choiceEl && product) choiceEl.textContent = total !== null ? "الإجمالي شامل الشحن" : (current.name ? current.name + " · " : "") + sizeText();
  };

  /** Server quote for the current line and governorate; a newer change always wins over a slower answer. */
  const requote = async () => {
    const mine = ++quoteTicket;
    quote = null;
    const line = lineNow();
    quoting = !!(line && region.value);
    paint();
    if (!quoting) return;
    try {
      const q = await api("/checkout/quote", "POST", { lines: [line], deliveryRegionKey: region.value });
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

  const unavailable = (/** @type {string} */ text) => { product = null; variant = null; quote = null; paint(); cta.disabled = true; cta.textContent = "غير متاح حاليًا"; say(text, true); };
  const choose = () => {
    variant = chosen.every(x => x >= 0) ? findVariant(product, chosen) : null;
    cta.disabled = false; cta.textContent = ctaText;
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
    current = c; product = null; variant = null; quote = null; cta.disabled = true; say("");
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

  // Colour pills are pre-rendered in the HTML; choosing one swaps the photos and verifies that colour's own product.
  const viewed = new Set([page.code]);
  document.querySelectorAll("#lpColors .chip").forEach(btn => btn.addEventListener("click", () => {
    const c = colors.find(x => x.code === btn.getAttribute("data-code"));
    if (!c || c === current || busy) return;
    document.querySelectorAll("#lpColors .chip").forEach(b => b.setAttribute("aria-pressed", String(b === btn)));
    const nameEl = document.getElementById("lpColorName"); if (nameEl) nameEl.textContent = c.name;
    const pic = document.getElementById("lpHero");
    if (pic && c.hero) {
      const [avif, webp] = pic.querySelectorAll("source");
      if (avif) avif.setAttribute("srcset", c.hero.avif);
      if (webp) webp.setAttribute("srcset", c.hero.webp);
      const img = pic.querySelector("img"); if (img) { img.src = c.hero.src; img.alt = c.alt || ""; }
    }
    const gallery = document.getElementById("lpGallery");
    if (gallery) gallery.replaceChildren(...(c.gallery || []).map(src => Object.assign(document.createElement("img"), { src, alt: c.alt || "", width: 480, height: 600, loading: "lazy", decoding: "async" })));
    if (!viewed.has(c.code)) { viewed.add(c.code); void recordView(c.code); }
    void show(c);
  }));

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
    funnel("begin_checkout", { currency: "EGP", lp_id: page.id, lp_variant: variantId, items: [{ item_id: product.publicCode, quantity: qty }] });
  });

  const done = (/** @type {string} */ code, /** @type {any} */ q, /** @type {Line} */ line) => {
    forgetOrderKey();
    if (firstReport(code)) {
      const value = (minorOf(q.merchandiseSubtotal) ?? 0) / 100;
      funnel("purchase", { currency: "EGP", value, shipping: (minorOf(q.shippingTotal) ?? 0) / 100, transaction_id: hex(16),
        lp_id: page.id, lp_variant: variantId, items: [{ item_id: line.publicCode, quantity: line.quantity }] }, hex(16));
      void loadAnalytics(); // the conversion goes out even if the customer leaves right away
    }
    $("#lpDoneCode").textContent = code;
    const total = minorOf(q.grandTotal);
    $("#lpDoneText").textContent = (total !== null ? "هتدفعي " + egp(total) + " ج عند الاستلام. " : "") + "هنكلمك على رقمك لتأكيد الطلب قبل الشحن.";
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
    const line = lineNow();
    if (!line || !lineOk(line)) { say("اختاري المقاس الأول.", true); holder.scrollIntoView({ behavior: "smooth", block: "center" }); return; }
    const values = { name: fieldEl("name").value, phone: fieldEl("phone").value, region: region.value, address: fieldEl("address").value };
    const errors = checkBuyer(values);
    for (const n of fieldNames) markField(n, errors[n] || "");
    const firstBad = fieldNames.find(n => errors[n]);
    if (firstBad) { say(FIELD_HELP, true); fieldEl(firstBad).focus(); return; }
    if (!quote) { await requote(); if (!quote) return; }
    const q = quote;
    busy = true; cta.disabled = true; cta.textContent = "بنسجل طلبك…"; say("بنسجل طلبك…");
    const label = region.selectedOptions[0]?.textContent || "";
    const payload = {
      idempotencyKey: orderKey(), lines: [line], deliveryRegionKey: region.value, paymentMethod: "cod",
      // The governorate is the "area" line of the delivery address; the free text is the street address.
      buyer: { name: values.name.trim(), phone: /** @type {string} */ (egMobile(values.phone)), area: label, address: values.address.trim(), notes: "" },
      confirmedMerchandiseSubtotalPiastres: minorOf(q.merchandiseSubtotal),
      confirmedShippingTotalPiastres: minorOf(q.shippingTotal),
      confirmedGrandTotalPiastres: minorOf(q.grandTotal),
    };
    try {
      const reply = await api("/orders", "POST", payload, 20000);
      if (!ORDER_CODE.test(reply.publicOrderCode)) throw Object.assign(new Error("write_unconfirmed"), { status: 503 });
      done(reply.publicOrderCode, q, line);
      return;
    } catch (err) {
      const error = /** @type {any} */ (err), data = error?.data || {};
      if (error?.message === "idempotency_conflict" && ORDER_CODE.test(data.publicOrderCode)) { done(data.publicOrderCode, data.grandTotal ? { ...q, grandTotal: data.grandTotal } : q, line); return; }
      if (error?.message === "order_cancelled") { forgetOrderKey(); say("الطلب السابق اتلغى من المتجر. تقدري تأكدي طلب جديد.", true); }
      else if (error?.message === "checkout_changed") { say("السعر أو الشحن اتغير. راجعي الإجمالي الجديد وأكّدي تاني.", true); void requote(); }
      else if (error?.message === "checkout_not_purchasable" || error?.message === "unavailable" || error?.message === "selection_changed") {
        cache.delete(current.code);
        void show(current).then(() => say("الكمية أو المقاس ده مش متاح دلوقتي. غيّري الاختيار وأكّدي تاني.", true));
      } else if (error?.message === "invalid_request" && data.fields && typeof data.fields === "object") {
        const map = /** @type {Record<string,string>} */ ({ name: "name", phone: "phone", area: "region", address: "address" });
        for (const [k, problem] of Object.entries(data.fields)) if (map[k]) markField(map[k], problem === "too_long" ? "النص طويل، اختصريه." : "راجعي الخانة دي.");
        say("راجعي البيانات المظللة.", true);
      } else if (error?.message === "rate_limited") say("محاولات كتير ورا بعض. استني دقيقة وجرّبي تاني.", true);
      // Unknown outcome (timeout, network, 5xx): the SAME key is reused on retry, so the server returns the same order.
      else say("مش متأكدين إن الطلب اتسجل بسبب الاتصال. اضغطي «تأكيد الطلب» تاني، مش هيتكرر.", true);
    } finally { busy = false; }
    cta.disabled = !product; cta.textContent = product ? ctaText : "غير متاح حاليًا";
  });

  if (!(await show(colors[0]))) return;
  funnel("view_item", { currency: "EGP", items: [{ item_id: product.publicCode, item_name: String(product.title || "").slice(0, 100) }] });
  await regionsReady;
}

if (typeof document !== "undefined") {
  try { localStorage.setItem(VARIANT_KEY, document.documentElement.dataset.v === "b" ? "b" : "a"); } catch { /* private mode */ }
  void init();
}
