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
const ATTRIBUTION_KEY = "women.lp.attribution.v1"; // read by js/commerce.js to tag the purchase event
const ANALYTICS_SRC = "/js/analytics.js?v=lp-20261025";
const EARLY_CLICK_WAIT_MS = 800;

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
const okMinor = (/** @type {unknown} */ m) => typeof m === "number" && Number.isSafeInteger(m) && m > 0;

/** The one price text both displays show: the chosen variant's price, else the product minimum ("من" when sizes
 *  cost differently), else "—" when no verified EGP price exists. */
export function priceLabel(/** @type {any} */ product, /** @type {any} */ variant) {
  if (variant && variant.unitPrice?.currency === "EGP" && okMinor(variant.unitPrice.amountMinor)) return egp(variant.unitPrice.amountMinor);
  const p = product?.price;
  if (!p || p.currency !== "EGP" || !okMinor(p.minAmountMinor)) return "—";
  return (okMinor(p.maxAmountMinor) && p.maxAmountMinor > p.minAmountMinor ? "من " : "") + egp(p.minAmountMinor);
}

/* Analytics: every GA4 / Meta call waits in this queue until /js/analytics.js has run (it defines gtag config and
 * window.womenMetaEvent), then the queue is flushed exactly once. Nothing is sent twice and nothing blocks shopping. */
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
/** Mirrors gaEvent() in js/commerce.js: GA4 event + the matching Meta standard event, public product codes only. */
function funnel(/** @type {string} */ name, /** @type {Record<string, any>} */ fields) {
  emit(() => {
    const w = /** @type {any} */ (window);
    if (typeof w.gtag === "function") w.gtag("event", name, fields);
    const metaName = /** @type {Record<string,string>} */ ({ view_item: "ViewContent", add_to_cart: "AddToCart" })[name];
    if (metaName && typeof w.womenMetaEvent === "function") w.womenMetaEvent(metaName, fields);
  });
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
  if (!validCode(page.code) || !/^[a-z0-9-]{3,40}$/.test(page.id || "")) return;
  const $ = (/** @type {string} */ s) => /** @type {HTMLElement} */ (document.querySelector(s));
  const bucket = document.documentElement.dataset.v === "b" ? "b" : "a";
  const variantId = page.id + ":" + bucket; // the ONE value used for the user property and every event parameter
  const cta = /** @type {HTMLButtonElement} */ ($("#lpOrder"));
  const status = $("#lpStatus");
  const say = (/** @type {string} */ t, error = false) => { status.textContent = t; status.dataset.error = String(error); };
  const setPrice = (/** @type {string} */ text) => { $("#lpPrice").textContent = text; $("#lpBarPrice").textContent = text === "—" ? "—" : text + " ج"; };
  const unavailable = (/** @type {string} */ text) => { setPrice("—"); cta.disabled = true; cta.textContent = "غير متاح حاليًا"; say(text, true); };

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
    if (!cache.has(code)) cache.set(code, api("/product/" + encodeURIComponent(code)).then(d => d.product).catch(e => { cache.delete(code); throw e; }));
    return /** @type {Promise<any>} */ (cache.get(code));
  };
  /** @type {any} */
  let product = null;
  /** @type {number[]} */
  let chosen = [];
  let current = colors[0];
  let ticket = 0; // a newer colour tap always wins over a slower earlier response

  const sizeText = (/** @type {any} */ v) => {
    if (!product.options.length) return "مقاس واحد";
    if (!v) return "اختاري المقاس";
    return product.options.map((/** @type {any} */ o, /** @type {number} */ i) => o.values.find((/** @type {any} */ x) => x.position === chosen[i])?.value || "").join(" · ");
  };
  const refresh = () => {
    if (!product) return null;
    const v = chosen.every(x => x >= 0) ? findVariant(product, chosen) : null;
    setPrice(priceLabel(product, v)); // live, verified price: always the same text in the page and the sticky bar
    if (choiceEl) choiceEl.textContent = (current.name ? current.name + " · " : "") + sizeText(v);
    cta.disabled = false;
    cta.textContent = "اطلبي دلوقتي";
    return v;
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
  };
  const show = async (/** @type {typeof colors[number]} */ c) => {
    const mine = ++ticket;
    current = c; product = null; cta.disabled = true; say("");
    let p;
    try { p = await load(c.code); }
    catch (e) {
      // A missing product is unavailable; a network failure leaves no verified price either, so neither is shown.
      if (mine === ticket) unavailable(/** @type {any} */ (e)?.status === 404 ? "القطعة دي مش متاحة دلوقتي." : "مش قادرين نتأكد من السعر والتوفر دلوقتي. جرّبي تاني بعد شوية.");
      return false;
    }
    if (mine !== ticket) return false;
    if (!p || p.publicCode !== c.code || !Array.isArray(p.variants) || !Array.isArray(p.options)) { unavailable("القطعة دي مش متاحة دلوقتي."); return false; }
    if (p.purchasable !== true || priceLabel(p, null) === "—") { unavailable(colors.length > 1 ? "اللون ده خلص حاليًا، اختاري لون تاني." : "القطعة دي خلصت حاليًا."); return false; }
    product = p; renderOptions(); refresh();
    return true;
  };

  // Colour pills are pre-rendered in the HTML; choosing one swaps the photos and verifies that colour's own product.
  const viewed = new Set([page.code]);
  document.querySelectorAll("#lpColors .chip").forEach(btn => btn.addEventListener("click", () => {
    const c = colors.find(x => x.code === btn.getAttribute("data-code"));
    if (!c || c === current) return;
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

  if (!(await show(colors[0]))) return;
  funnel("view_item", { currency: "EGP", items: [{ item_id: product.publicCode, item_name: String(product.title || "").slice(0, 100) }] });

  cta.addEventListener("click", async () => {
    if (!product) return;
    const v = refresh();
    if (!v || v.purchasable !== true) { say("اختاري المقاس الأول.", true); holder.scrollIntoView({ behavior: "smooth", block: "center" }); return; }
    const p = product;
    /** @type {Line} */
    const line = { publicCode: p.publicCode, structureVersion: p.structureVersion, selection: v.selection, quantity: 1 };
    cta.disabled = true; say("بنجهز طلبك…");
    try {
      await api("/cart/add", "POST", line); // server re-validates the variant address; nothing is ordered here
    } catch (e) {
      cta.disabled = false;
      say(/** @type {any} */ (e)?.message === "unavailable" ? "المقاس ده خلص، اختاري مقاس تاني." : "حصلت مشكلة اتصال، جرّبي تاني.", true);
      return; // rejected: no cart change and no AddToCart event
    }
    let lines = [];
    try { lines = JSON.parse(localStorage.getItem(CART_KEY) || "[]"); } catch { /* corrupt cart = empty */ }
    localStorage.setItem(CART_KEY, JSON.stringify(mergeLine(Array.isArray(lines) ? lines : [], line)));
    try { sessionStorage.setItem(ATTRIBUTION_KEY, JSON.stringify({ id: page.id, variant: variantId, code: p.publicCode })); } catch { /* optional */ }
    funnel("lp_order_click", { lp_id: page.id, lp_variant: variantId, item_id: p.publicCode });
    funnel("add_to_cart", { currency: "EGP", ...(okMinor(v.unitPrice?.amountMinor) ? { value: v.unitPrice.amountMinor / 100 } : {}),
      items: [{ item_id: p.publicCode, quantity: 1 }] });
    // An early tap may come before the idle analytics load: start it now and wait briefly so queued events go out once.
    await Promise.race([loadAnalytics(), new Promise(r => setTimeout(r, EARLY_CLICK_WAIT_MS))]);
    location.href = "/checkout/";
  });
}

if (typeof document !== "undefined") {
  try { localStorage.setItem(VARIANT_KEY, document.documentElement.dataset.v === "b" ? "b" : "a"); } catch { /* private mode */ }
  void init();
}
