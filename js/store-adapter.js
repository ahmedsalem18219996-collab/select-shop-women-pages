/* SELECT SHOP WOMEN Claude V2 adapter. No secrets or privileged mutations in public GitHub Pages.
   The public catalog is served by the WOMEN-only Supabase Edge Function. The sample catalog
   is ONLY available on the explicitly labelled ?design-preview=1 visual comparison URL.
   Orders/checkout stay disabled until secure authenticated APIs are verified end-to-end. */
window.SelectStore = (() => {
  "use strict";
  const API = "https://byluoipdunralsurwebt.supabase.co/functions/v1/women-store-bridge";
  // Product, cart and checkout are now static pages backed by the WOMEN Supabase Edge API.
  // Never submit an order or a browser-calculated price through this static page.
  const SECURE_CHECKOUT_ORIGIN = location.origin;
  const demo = new URLSearchParams(location.search).get("design-preview") === "1";
  // Guest favorites persist across page loads on this browser only.
  // No customer PII, auth credentials, or private catalog data are stored.
  const SAVED_KEY = "women.saved.v1";
  const SAVED_LIMIT = 100;
  const readSaved = () => {
    try {
      const values = JSON.parse(localStorage.getItem(SAVED_KEY) || "[]");
      return Array.isArray(values)
        ? values.filter(x => typeof x === "string" && /^SS-[0-9]{4,19}$/.test(x)).slice(0, SAVED_LIMIT)
        : [];
    } catch { return []; }
  };
  const saved = new Set(readSaved());
  const storeSaved = () => {
    try { localStorage.setItem(SAVED_KEY, JSON.stringify([...saved])); }
    catch { /* Private-browsing storage may be unavailable; in-memory fallback. */ }
  };
  window.addEventListener("storage", (event) => {
    if (event.key !== SAVED_KEY) return;
    saved.clear();
    readSaved().forEach(id => saved.add(id));
    window.dispatchEvent(new Event("women-saved-changed"));
  });
  let bagCount = 0;
  window.SELECT_CONFIG.demo = demo;
  const empty = () => ({
    sizes: [], categories: ["الكل"], products: [], looks: [], stories: [],
    sizeChart: [], sizeChartMin: { bust: 0, waist: 0 },
  });

  const safeText = (value, limit = 300) =>
    typeof value === "string" ? value.trim().slice(0, limit) : "";
  const safeColor = value =>
    /^#[0-9a-fA-F]{6}$/.test(value || "") ? value : "#BCC0C9";
  const validPhoto = value =>
    typeof value === "string" &&
    /^https:\/\/byluoipdunralsurwebt\.supabase\.co\/storage\/v1\/object\/public\/product-media\/media\/[0-9a-f]{32}\.(png|jpg|webp)$/.test(value)
      ? value : null;

  // Only use a thumbnail when a locally generated, checked-in copy exists.
  // Keep the original Supabase image on product detail pages.
  const THUMB_BASE = new URL("../assets/catalog-thumbs/", document.currentScript.src);
  const thumbnailNames = new Set(Array.isArray(window.SELECT_THUMBNAILS) ? window.SELECT_THUMBNAILS : []);
  const thumbnailFor = source => {
    if (!validPhoto(source)) return null;
    const name = source.slice(source.lastIndexOf("/") + 1);
    return thumbnailNames.has(name) ? new URL(name + ".webp", THUMB_BASE).href : source;
  };

  return {
    // The full-stack cart uses its own origin-bound browser storage; never make a fake static-site bag.
    cartUrl: demo ? null : SECURE_CHECKOUT_ORIGIN + "/cart/",
    async loadCatalog() {
      if (demo) return window.SELECT_DEMO_DATA;
      window.SELECT_CONFIG.loadError = false;
      try {
        const response = await (window.__womenCatalogRequest || fetch(API + "/catalog", {
          headers: { Accept: "application/json" },
          cache: "no-store",
          signal: AbortSignal.timeout(12000),
        }));
        if (!response.ok) throw Error("catalog_http_" + response.status);
        const data = await response.json();
        if (!Array.isArray(data.items) || !Array.isArray(data.categories)) throw Error("bad_catalog");
        // These categories come from WOMEN Supabase, not from a hard-coded storefront list.
        const visibleCategories = [...new Set(data.categories.filter(c =>
          typeof c === "string" && c.length > 0 && c.length <= 70 && c.trim() === c))];
        const visibleSet = new Set(visibleCategories);
        const brand = data.brand || {};
        const presentation = data.presentation || {};
        window.SELECT_CONFIG.presentation = presentation;
        window.SELECT_CONFIG.brand = brand;
        if (safeText(brand.whatsapp) && /^\+?[1-9]\d{6,14}$/.test(brand.whatsapp)) {
          window.SELECT_CONFIG.whatsapp = String(brand.whatsapp).replace(/^\+/, "");
        }
        if (typeof brand.instagramUrl === "string" && /^https:\/\/(www\.)?instagram\.com\//.test(brand.instagramUrl))
          window.SELECT_CONFIG.links.instagram = brand.instagramUrl;
        const products = data.items.filter(item =>
          item && /^SS-\d{4,19}$/.test(String(item.publicCode || "")) &&
          Number.isSafeInteger(item.priceMinor) && item.priceMinor > 0 &&
          validPhoto(item.image)).map(item => ({
            id: item.publicCode,
            name: safeText(item.title, 200),
            cat: visibleSet.has(item.category) ? item.category : (visibleSet.has("أخرى") ? "أخرى" : ""),
            price: item.priceMinor / 100,
            c: "#ECE8E5",
            sw: [],
            out: [],
            one: false,
            isNew: item.isNew === true,
            image: thumbnailFor(item.image),
            // Last-resort fallback if a deployed thumbnail URL fails to load.
            originalImage: validPhoto(item.image),
            // Opening a published product sends customers to the trusted, same-origin checkout stack.
            url: SECURE_CHECKOUT_ORIGIN + "/p/?code=" + encodeURIComponent(item.publicCode),
            purchasable: item.purchasable === true,
          }));
        const categories = ["الكل", ...(products.some(p => p.isNew) ? ["الجديد"] : []), ...visibleCategories];
        return { ...empty(), categories, products };
      } catch (error) {
        // Never fall back to fabricated demo products on a public storefront.
        window.SELECT_CONFIG.loadError = true;
        console.warn("WOMEN public catalog is currently unavailable");
        return empty();
      }
    },
    async addToBag(lines) {
      if (!demo) return { ok: false, message: "الطلبات لسه تحت التجهيز. مفيش إضافة فعلية للشنطة أو تسجيل طلب حاليًا." };
      bagCount += Array.isArray(lines) ? lines.length : 0;
      return { ok: true, count: bagCount };
    },
    async toggleSaved(productId) {
      const id = String(productId || "");
      if (!/^SS-[0-9]{4,19}$/.test(id)) return { saved: false, count: saved.size, invalid: true };
      if (saved.has(id)) saved.delete(id);
      else if (saved.size >= SAVED_LIMIT) return { saved: false, count: saved.size, limitReached: true };
      else saved.add(id);
      storeSaved();
      return { saved: saved.has(id), count: saved.size };
    },
    savedIds() { return [...saved]; },
    savedCount() { return saved.size; },
    // The public homepage badge reflects the exact same origin-bound cart used
    // by product/cart/checkout; no product data or PII enters this adapter.
    cartCount() {
      try {
        const lines=JSON.parse(localStorage.getItem("women.cart.v1")||"[]");
        return Array.isArray(lines) ? lines.slice(0,50).reduce((total,line)=>
          total+(line && /^SS-[0-9]{4,19}$/.test(line.publicCode||"") &&
            Number.isInteger(line.quantity)&&line.quantity>0&&line.quantity<=99 ? line.quantity : 0),0) : 0;
      } catch { return 0; }
    },
    isSaved(productId) { return saved.has(String(productId)); },
  };
})();
