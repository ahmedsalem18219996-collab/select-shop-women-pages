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

  // Verified sibling SKUs share one storefront card and their existing multi-colour LP.
  // Orders, stock, media, deep links and admin records stay tied to each REAL public code.
  // A family is collapsed only when all visible members have the same selling price/category.
  const VERIFIED_MODEL_FAMILIES = [
    {
      name: "جاكيت جلد",
      path: "/lp/ss-1008/",
      colors: [
        { code: "SS-1008", name: "بني", hex: "#5A3B2C" },
        { code: "SS-1009", name: "أسود", hex: "#1F1B1E" },
      ],
    },
    {
      name: "طقم بالون",
      path: "/lp/ballon-suit/",
      colors: [
        { code: "SS-1037", name: "نبيتي", hex: "#6B2737" },
        { code: "SS-1035", name: "بني", hex: "#6E4B3A" },
        { code: "SS-1036", name: "رصاصي", hex: "#7E8186" },
        { code: "SS-1038", name: "أسود", hex: "#1F1B1E" },
        { code: "SS-1039", name: "أحمر", hex: "#B0262F" },
        { code: "SS-1040", name: "رمادي", hex: "#B8B4B0" },
        { code: "SS-1010", name: "رمادي زيتي", hex: "#898B7D" },
      ],
    },
    {name:"بلوفر مقلم",path:"/lp/striped-knit/",colors:[{"code":"SS-1042","name":"أحمر","hex":"#BB3340"},{"code":"SS-1043","name":"بينك","hex":"#D9A5B9"},{"code":"SS-1044","name":"أسود × أبيض","hex":"#28282A"}]},
    {name:"سويت شيرت PRA",path:"/lp/pra-sweatshirt/",colors:[{"code":"SS-1015","name":"أصفر","hex":"#DEE957"},{"code":"SS-1027","name":"بني","hex":"#49352D"},{"code":"SS-1028","name":"كحلي","hex":"#263654"}]},
    {name:"جاكيت Chinese",path:"/lp/chinese-jacket/",colors:[{"code":"SS-1014","name":"أحمر","hex":"#AE1E30"},{"code":"SS-1023","name":"بيج","hex":"#C7B39C"},{"code":"SS-1024","name":"بني","hex":"#503027"},{"code":"SS-1025","name":"زيتي","hex":"#52523E"},{"code":"SS-1026","name":"أسود","hex":"#242426"}]},
    {name:"بلوفر أزرار",path:"/lp/button-knit/",colors:[{"code":"SS-1019","name":"نبيتي","hex":"#722536"},{"code":"SS-1021","name":"أوف وايت","hex":"#EEEADF"},{"code":"SS-1022","name":"كحلي","hex":"#273451"}]},
    {name:"بلوفر Zebra",path:"/lp/zebra-knit/",colors:[{"code":"SS-1012","name":"أبيض × أسود","hex":"#EEEDE7"},{"code":"SS-1029","name":"بيج × أسود","hex":"#C3AD85"},{"code":"SS-1030","name":"أسود × أبيض","hex":"#222225"}]},
    {name:"جاكيت كاروهات",path:"/lp/checked-jacket/",colors:[{"code":"SS-1031","name":"بيج","hex":"#B7A6A0"},{"code":"SS-1032","name":"بني","hex":"#504840"},{"code":"SS-1033","name":"كحلي","hex":"#2B3652"},{"code":"SS-1034","name":"أسود","hex":"#212025"}]},
  ];
  const normaliseLiveFamilies = models => Array.isArray(models) ? models.filter(m =>
    m && typeof m.slug === "string" && /^[a-z][a-z0-9-]{2,63}$/.test(m.slug) &&
    typeof m.name === "string" && m.name.trim().length > 1 && Array.isArray(m.colors) &&
    m.colors.length > 0
  ).map(m => {
    const colors = m.colors.filter(c => c && /^SS-[0-9]{4,19}$/.test(c.code || "") &&
      typeof c.name === "string" && /^#[0-9a-fA-F]{6}$/.test(c.hex || ""));
    const slug = m.slug;
    const path = slug === "leather-jacket" ? "/lp/ss-1008/" :
      slug === "balloon-suit" ? "/lp/ballon-suit/" :
      ["striped-knit","pra-sweatshirt","chinese-jacket","button-knit","zebra-knit","checked-jacket"].includes(slug)
        ? "/lp/" + slug + "/" : "/lp/?model=" + encodeURIComponent(slug);
    return { name: m.name.trim().slice(0,160), path, colors,
      category: typeof m.category === "string" ? m.category : "", persisted: true };
  }).filter(m => m.colors.length > 0) : null;

  const groupVerifiedModels = (products, apiModels = null) => {
    const families = normaliseLiveFamilies(apiModels) || VERIFIED_MODEL_FAMILIES;
    const modelForCode = new Map(families.flatMap(
      family => family.colors.map(color => [color.code, family])));
    const byCode = new Map(products.map(product => [product.id, product]));
    const eligible = new Map();
    for (const family of families) {
      const members = family.colors
        .map(color => ({ ...color, product: byCode.get(color.code) }))
        .filter(color => color.product);
      // No grouping when price/category drift, or fewer than two colours are live.
      // This prevents a misleading price or a model with no real choice.
      // The pre-rendered LP always boots its FIRST configured colour. If that
      // default SKU is hidden or sold out, leave the real SKUs separate: a
      // different available colour must not route into an unavailable first one.
      const duplicateCodes = new Set(family.colors.map(c => c.code)).size !== family.colors.length;
      // Modern one-SKU/many-colour products keep the native variant option picker.
      // Legacy families share a card and may legitimately have different per-colour prices.
      if (duplicateCodes || members.length < 2 ||
        members[0].code !== family.colors[0].code ||
        members[0].product.purchasable !== true ||
        (family.persisted ? !members.every(c => c.product.cat === family.category)
          : !members.every(c => c.product.price === members[0].product.price &&
              c.product.cat === members[0].product.cat))) continue;
      eligible.set(family, members);
    }
    const shown = new Set();
    return products.flatMap(product => {
      const family = modelForCode.get(product.id);
      const members = family && eligible.get(family);
      if (!members) return [product];
      if (shown.has(family)) return [];
      shown.add(family);
      const primary = members[0];
      return [{
        ...primary.product,
        name: family.name,
        // One model may have multiple real per-colour selling prices. The card
        // displays the lowest price; /checkout/quote remains server authoritative.
        price: family.persisted ? Math.min(...members.map(c => c.product.price)) : primary.product.price,
        sw: members.map(color => color.hex),
        isNew: members.some(color => color.product.isNew),
        purchasable: members.some(color => color.product.purchasable),
        url: SECURE_CHECKOUT_ORIGIN + family.path,
      }];
    });
  };

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
            // All public product links open the direct COD form (pre-rendered where available).
            // /lp/ resolves known colors instantly and is the automatic fallback for new codes.
            url: SECURE_CHECKOUT_ORIGIN + "/lp/?p=" + encodeURIComponent(item.publicCode),
            purchasable: item.purchasable === true,
          }));
        const categories = ["الكل", ...(products.some(p => p.isNew) ? ["الجديد"] : []), ...visibleCategories];
        return { ...empty(), categories, products: groupVerifiedModels(products, data.models) };
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
