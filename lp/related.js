// Other models of the same campaign page, shown on a landing page opened from a multi-product page (?collection=).
// Loaded on demand by lp/runtime.js so ordinary ad visits do not download it.
/** @param {string} currentCode @param {{ BRIDGE: string, timeout: (ms: number) => AbortSignal|undefined, validCode: (x: unknown) => boolean, okMinor: (x: unknown) => boolean, egp: (x: number) => string }} h */
export async function renderRelatedProducts(currentCode, { BRIDGE, timeout, validCode, okMinor, egp }) {
  const params = new URLSearchParams(location.search);
  const slug = (params.get("collection") || "").trim();
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || params.get("studio_preview") === "1") return;
  try {
    const response = await fetch(BRIDGE + "/collections/" + encodeURIComponent(slug), {
      headers: { Accept: "application/json" }, credentials: "omit", cache: "no-store", signal: timeout(8000),
    });
    if (!response.ok) return;
    const payload = await response.json();
    const items = Array.isArray(payload?.items)
      ? payload.items.filter(item => validCode(item?.publicCode) && item.publicCode !== currentCode).slice(0, 4)
      : [];
    if (!items.length) return;
    paintRow(items, { id: "lpRelatedProducts", title: "موديلات تانية من نفس المجموعة",
      intro: "ممكن اختيار أكتر من موديل وإضافة كل قطعة للشنطة، وإتمامهم في طلب واحد والدفع عند الاستلام.",
      slug, currentCode, validCode, okMinor, egp, bag: true });
  } catch { /* Related products are optional; never block the current product or its order. */ }
}

/** A landing page whose product is gone (404): the models that are on sale now, from the public catalog. */
/** @param {string} currentCode @param {{ BRIDGE: string, timeout: (ms: number) => AbortSignal|undefined, validCode: (x: unknown) => boolean, okMinor: (x: unknown) => boolean, egp: (x: number) => string }} h */
export async function renderAvailableModels(currentCode, { BRIDGE, timeout, validCode, okMinor, egp }) {
  if (document.getElementById("lpAvailableModels")) return;
  try {
    const response = await fetch(BRIDGE + "/catalog", {
      headers: { Accept: "application/json" }, credentials: "omit", cache: "no-store", signal: timeout(8000),
    });
    if (!response.ok) return;
    const payload = await response.json();
    const items = Array.isArray(payload?.items)
      ? payload.items.filter(item => validCode(item?.publicCode) && item.publicCode !== currentCode && okMinor(item.priceMinor)).slice(0, 6)
      : [];
    if (!items.length) return;
    paintRow(items, { id: "lpAvailableModels", title: "موديلات متاحة دلوقتي", intro: "اختيار موديل منهم، والدفع عند الاستلام.",
      slug: "", currentCode, validCode, okMinor, egp, bag: false });
  } catch { /* Optional: the page already says the model is not available. */ }
}

/** @param {any[]} items @param {{ id: string, title: string, intro: string, slug: string, currentCode: string, validCode: (x: unknown) => boolean, okMinor: (x: unknown) => boolean, egp: (x: number) => string, bag: boolean }} o */
function paintRow(items, { id, title: titleText, intro: introText, slug, currentCode, validCode, okMinor, egp, bag }) {
    const params = new URLSearchParams(location.search);
    const section = document.createElement("section");
    section.id = id;
    section.className = "lp-related";
    section.setAttribute("aria-labelledby", id + "Title");
    const heading = document.createElement("h2");
    heading.id = id + "Title";
    heading.textContent = titleText;
    const intro = document.createElement("p");
    intro.textContent = introText;
    const grid = document.createElement("div");
    grid.className = "lp-related-grid";

    for (const item of items) {
      const link = document.createElement("a");
      link.className = "lp-related-card";
      link.dataset.relatedCode = item.publicCode;
      const target = new URL("/lp/", location.origin);
      target.searchParams.set("p", item.publicCode);
      if (slug) target.searchParams.set("collection", slug);
      ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "utm_id", "fbclid", "gclid", "adset", "utm_adset", "ad", "utm_ad"]
        .forEach(key => { const value = params.get(key); if (value) target.searchParams.set(key, value); });
      // The ad's product stays the one the visitor landed on, never the related model being opened.
      if (!target.searchParams.has("utm_content") && validCode(currentCode)) target.searchParams.set("utm_content", currentCode);
      link.href = target.pathname + target.search;

      const media = document.createElement("div");
      media.className = "lp-related-image";
      let imageUrl = null;
      try {
        const candidate = new URL(item.image);
        if (candidate.origin === "https://byluoipdunralsurwebt.supabase.co"
          && candidate.pathname.startsWith("/storage/v1/object/public/product-media/")) imageUrl = candidate.href;
      } catch { /* an absent or untrusted image gets a placeholder */ }
      if (imageUrl) {
        const img = document.createElement("img");
        img.src = imageUrl;
        img.alt = String(item.title || "موديل آخر");
        img.loading = "lazy";
        img.decoding = "async";
        media.append(img);
      } else {
        const placeholder = document.createElement("span");
        placeholder.textContent = "SELECT SHOP";
        media.append(placeholder);
      }

      const body = document.createElement("div");
      body.className = "lp-related-body";
      const title = document.createElement("strong");
      title.textContent = String(item.title || "موديل من SELECT SHOP");
      const price = document.createElement("span");
      price.className = "lp-related-price";
      price.textContent = okMinor(item.priceMinor) ? egp(item.priceMinor) + " ج" : "السعر داخل صفحة المنتج";
      const action = document.createElement("span");
      action.className = "lp-related-action";
      action.textContent = "اختيار اللون والمقاس";
      body.append(title, price, action);
      link.append(media, body);
      grid.append(link);
    }

    section.append(heading, intro, grid);
    if (bag) {
      const bagLink = document.createElement("a");
      bagLink.className = "lp-related-bag";
      bagLink.href = "/cart/";
      bagLink.textContent = "مراجعة الشنطة وإتمام الطلب";
      section.append(bagLink);
    }
    const main = document.querySelector("main.page");
    if (main) main.after(section);
}
