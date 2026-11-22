// Other models of the same campaign page, shown on a landing page opened from a multi-product page (?collection=).
// Loaded on demand by lp/runtime.js so ordinary ad visits do not download it.
const RELATED_PRODUCTS_CSS = `
.lp-related{box-sizing:border-box;max-width:1120px;margin:38px auto 0;padding:0 18px 132px;direction:rtl;color:var(--ink,#242126);font-family:var(--f,inherit)}
.lp-related h2{margin:0 0 7px;font-size:clamp(20px,3vw,27px);font-weight:700;line-height:1.45}
.lp-related>p{margin:0 0 17px;color:var(--muted,#777);font-size:13px;line-height:1.8}
.lp-related-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:13px}
.lp-related-card{display:flex;min-width:0;flex-direction:column;overflow:hidden;border:1px solid var(--line,#ded9d6);border-radius:15px;background:var(--paper,#fff);color:inherit;text-decoration:none}
.lp-related-image{display:grid;aspect-ratio:4/5;place-items:center;overflow:hidden;background:var(--bg,#f5f2ef);color:var(--muted,#777);font-size:12px}
.lp-related-image img{width:100%;height:100%;object-fit:cover}
.lp-related-body{display:flex;min-width:0;flex-direction:column;gap:7px;padding:11px}
.lp-related-body strong{font-size:13px;line-height:1.6}
.lp-related-price{font-size:13px;font-weight:700;font-variant-numeric:tabular-nums}
.lp-related-action{display:flex;min-height:38px;align-items:center;justify-content:center;border-radius:9px;background:var(--accent,#303c2d);color:#fff;font-size:12px;font-weight:600;text-align:center}
.lp-related-bag{display:flex;width:min(100%,320px);min-height:46px;margin:20px auto 0;align-items:center;justify-content:center;border-radius:12px;background:var(--accent,#303c2d);color:#fff;text-decoration:none;font-size:14px;font-weight:700}
@media(max-width:620px){.lp-related{margin-top:28px;padding-inline:12px}.lp-related-grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}.lp-related-body{padding:9px}.lp-related-body strong{font-size:12px}.lp-related-action{font-size:11px}}
`;

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
      slug, currentCode, validCode, okMinor, egp, bag: true, top: false });
  } catch { /* Related products are optional; never block the current product or its order. */ }
}

/** A landing page whose product is gone (404): the models that are on sale now, from the public catalog. */
/** @param {string[]} codes the page's colour codes @param {{ BRIDGE: string, timeout: (ms: number) => AbortSignal|undefined, validCode: (x: unknown) => boolean, okMinor: (x: unknown) => boolean, egp: (x: number) => string }} h */
export async function renderAvailableModels(codes, { BRIDGE, timeout, validCode, okMinor, egp }) {
  if (document.getElementById("lpAvailableModels")) return;
  const currentCode = codes[0];
  // The whole page is gone (hidden or removed model): keep it out of search.
  const noindex = () => (document.querySelector('meta[name="robots"]') || document.head.appendChild(Object.assign(document.createElement("meta"), { name: "robots" })))
    .setAttribute("content", "noindex, follow");
  if (codes.length < 2) noindex();
  try {
    const response = await fetch(BRIDGE + "/catalog", {
      headers: { Accept: "application/json" }, credentials: "omit", cache: "no-store", signal: timeout(8000),
    });
    if (!response.ok) return;
    const payload = await response.json();
    const all = Array.isArray(payload?.items) ? payload.items : [];
    // A shared-model page (several colours) is gone only when none of its colours is still on sale.
    if (codes.length > 1) {
      if (all.some(item => codes.includes(item?.publicCode))) {
        // Only this colour is gone: point her to the others (unless she already picked another colour meanwhile).
        const status = document.getElementById("lpStatus");
        if (status?.textContent === "الموديل ده مش متاح دلوقتي.") status.textContent = "اللون ده مش متاح دلوقتي؛ اختاري لون تاني.";
        return;
      }
      noindex();
    }
    const items = all.filter(item => validCode(item?.publicCode) && !codes.includes(item.publicCode) && okMinor(item.priceMinor)).slice(0, 6);
    if (!items.length) return;
    // First thing on the page: the visitor came for this model, so she sees at once that it is gone and what is on sale.
    paintRow(items, { id: "lpAvailableModels", title: "الموديل ده مش متاح دلوقتي", intro: "دي موديلات متاحة دلوقتي، والدفع عند الاستلام.",
      slug: "", currentCode, validCode, okMinor, egp, bag: false, top: true });
  } catch { /* Optional: the page already says the model is not available. */ }
}

/** @param {any[]} items @param {{ id: string, title: string, intro: string, slug: string, currentCode: string, validCode: (x: unknown) => boolean, okMinor: (x: unknown) => boolean, egp: (x: number) => string, bag: boolean, top: boolean }} o */
function paintRow(items, { id, title: titleText, intro: introText, slug, currentCode, validCode, okMinor, egp, bag, top }) {
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
        // The committed 400px thumbnail (~20KB) instead of the multi-hundred-KB original; the original only if none exists.
        const file = /\/product-media\/media\/([0-9a-f]{32}\.(?:jpg|png|webp))$/.exec(imageUrl)?.[1];
        if (file) img.addEventListener("error", () => { if (img.src !== imageUrl) img.src = imageUrl; }, { once: true });
        img.src = file ? "/assets/catalog-thumbs/" + file + ".w400.webp" : imageUrl;
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
    if (main && !document.getElementById("lp-related-style")) {
      const style = document.createElement("style");
      style.id = "lp-related-style";
      style.textContent = RELATED_PRODUCTS_CSS;
      document.head.append(style);
    }
    if (main && top) { section.style.padding = "0 18px"; section.style.marginTop = "18px"; main.before(section); }
    else if (main) main.after(section);
}
