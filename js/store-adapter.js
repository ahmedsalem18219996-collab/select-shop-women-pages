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
  // Responsive derivative is emitted only when source filename belongs to the public
  // manifest; build step verifies every w400 asset before release.
  const smallThumbnailFor = source => {
    if (!validPhoto(source)) return null;
    const name = source.slice(source.lastIndexOf("/") + 1);
    return thumbnailNames.has(name) ? new URL(name + ".w400.webp", THUMB_BASE).href : null;
  };


  // Preload the CURRENT leading product photo, never a hard-coded product.
  // Catalog is the server-owned truth; cloning the response leaves its only
  // actual network request available to loadCatalog without a second fetch.
  // This skips new photos whose static derivatives have not been built yet.
  if (!demo && window.__womenCatalogRequest) {
    window.__womenCatalogRequest.then(response => {
      if (!response.ok) return null;
      return response.clone().json();
    }).then(data => {
      const first = Array.isArray(data?.items) ? data.items.find(item =>
        item && /^SS-\d{4,19}$/.test(String(item.publicCode || "")) &&
        Number.isSafeInteger(item.priceMinor) && item.priceMinor > 0 &&
        validPhoto(item.image)) : null;
      if (!first) return;
      const filename = first.image.slice(first.image.lastIndexOf("/") + 1);
      if (!thumbnailNames.has(filename)) return;
      const link = document.createElement("link");
      link.rel = "preload";
      link.as = "image";
      link.fetchPriority = "high";
      link.imageSrcset = new URL(filename + ".w400.webp", THUMB_BASE).href + " 400w, " +
        new URL(filename + ".webp", THUMB_BASE).href + " 560w";
      link.imageSizes = "(max-width: 699px) calc((100vw - 60px) / 2), " +
        "(max-width: 979px) calc((100vw - 80px) / 3), 300px";
      document.head.append(link);
    }).catch(() => { /* A failed optimization must not affect product data. */ });
  }

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
          signal: (typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function" ? AbortSignal.timeout(12000) : undefined),
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
            smallImage: smallThumbnailFor(item.image),
            // Last-resort fallback if a deployed thumbnail URL fails to load.
            originalImage: validPhoto(item.image),
            // Opening a published product sends customers to the trusted, same-origin checkout stack.
            url: SECURE_CHECKOUT_ORIGIN + "/p/?code=" + encodeURIComponent(item.publicCode),
            purchasable: item.purchasable === true,
          }));
        // Presentation-only model grouping until WOMEN admin supports persisted
        // model/color relations. Each colour remains its existing live product
        // with its own SKU, stock, price and checkout validation.
        // Only group when at least two child products are publicly available.
        const modelGroups = [
          { id: "leather-jacket", title: "Leather jacket", url: "/lp/ss-1008/",
            codes: ["SS-1008", "SS-1009"], sw: ["#5A3B2C", "#1F1B1E"] },
          { id: "ballon-suit", title: "Ballon suit", url: "/lp/ballon-suit/",
            codes: ["SS-1037", "SS-1035", "SS-1036", "SS-1038", "SS-1039", "SS-1040"],
            sw: ["#6B2737", "#6E4B3A", "#7E8186", "#1F1B1E", "#B0262F", "#B8B4B0"] },
        ];
        const byCode = new Map(products.map(p => [p.id, p]));
        const groupOf = new Map(modelGroups.flatMap(g => g.codes.map(code => [code, g])));
        const seenGroups = new Set();
        const shownProducts = products.flatMap(p => {
          const g = groupOf.get(p.id);
          if (!g) return [p];
          if (seenGroups.has(g.id)) return [];
          const members = g.codes.map(code => byCode.get(code)).filter(Boolean);
          if (members.length < 2) return [p];
          seenGroups.add(g.id);
          const lead = members[0];
          const minPrice = Math.min(...members.map(m => m.price));
          return [{ ...lead, name: g.title, url: SECURE_CHECKOUT_ORIGIN + g.url,
            sw: g.codes.flatMap((code, i) => byCode.has(code) ? [g.sw[i]] : []),
            price: minPrice, priceFrom: members.some(m => m.price !== minPrice),
            badge: members.length + " ألوان", isNew: members.some(m => m.isNew),
            purchasable: members.some(m => m.purchasable) }];
        });
        const categories = ["الكل", ...(shownProducts.some(p => p.isNew) ? ["الجديد"] : []), ...visibleCategories];
        return { ...empty(), categories, products: shownProducts };
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
