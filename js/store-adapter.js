/* SELECT SHOP WOMEN Claude V2 adapter. No secrets or privileged mutations in public GitHub Pages.
   The public catalog is served by the WOMEN-only Supabase Edge Function. The sample catalog
   is ONLY available on the explicitly labelled ?design-preview=1 visual comparison URL.
   Orders/checkout stay disabled until secure authenticated APIs are verified end-to-end. */
window.SelectStore = (() => {
  "use strict";
  const API = "https://byluoipdunralsurwebt.supabase.co/functions/v1/women-store-bridge";
  // Product, cart and checkout are now static pages backed by the WOMEN Supabase Edge API.
  // Never submit an order or a browser-calculated price through this static page.
  const SECURE_CHECKOUT_ORIGIN = location.origin + "/select-shop-women-pages";
  const demo = new URLSearchParams(location.search).get("design-preview") === "1";
  const saved = new Set();
  let bagCount = 0;
  window.SELECT_CONFIG.demo = demo;
  const allowedCategories = ["فساتين", "أطقم", "عبايات", "بلوزات", "جيبات وبناطيل", "إكسسوارات", "أخرى"];
  const categories = ["الكل", "الجديد", ...allowedCategories, "تخفيضات"];
  const empty = () => ({
    sizes: [], categories, products: [], looks: [], stories: [],
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

  return {
    // The full-stack cart uses its own origin-bound browser storage; never make a fake static-site bag.
    cartUrl: demo ? null : SECURE_CHECKOUT_ORIGIN + "/cart/",
    async loadCatalog() {
      if (demo) return window.SELECT_DEMO_DATA;
      window.SELECT_CONFIG.loadError = false;
      try {
        const response = await fetch(API + "/catalog", {
          headers: { Accept: "application/json" },
          cache: "no-store",
          signal: AbortSignal.timeout(12000),
        });
        if (!response.ok) throw Error("catalog_http_" + response.status);
        const data = await response.json();
        if (!Array.isArray(data.items)) throw Error("bad_catalog");
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
            cat: allowedCategories.includes(item.category) ? item.category : "أخرى",
            price: item.priceMinor / 100,
            c: "#ECE8E5",
            sw: [],
            out: [],
            one: false,
            isNew: item.isNew === true,
            image: validPhoto(item.image),
            // Opening a published product sends customers to the trusted, same-origin checkout stack.
            url: SECURE_CHECKOUT_ORIGIN + "/p/?code=" + encodeURIComponent(item.publicCode),
            purchasable: item.purchasable === true,
          }));
        return { ...empty(), products };
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
      saved.has(productId) ? saved.delete(productId) : saved.add(productId);
      return { saved: saved.has(productId), count: saved.size };
    },
    isSaved(productId) { return saved.has(productId); },
  };
})();
