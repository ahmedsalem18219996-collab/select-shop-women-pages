// @ts-check
/* Product Landing Studio — the presentation-only design of one product's landing page.
   Three marketing images (Hero / Features / Closing) uploaded by hand, marketing texts, section order,
   background, font, CTA and order-card look. A design NEVER carries a price, shipping or stock value:
   the page keeps reading those from women-checkout, and the order is the unchanged /orders flow.
   The server (women_landing_clean) is the trust boundary; normalizeDesign mirrors it for the browser.
   Every text is written with textContent; image URLs must be WOMEN public storage URLs. */

export const SECTIONS = ["hero", "product", "features", "closing"];
export const HIDEABLE = ["hero", "features", "closing"];
export const SLOTS = ["hero", "features", "closing"];
export const CHOICES = {
  template: ["classic", "editorial", "minimal"],
  background: ["midnight", "navy", "elevated", "light"],
  font: ["readex", "rakkas", "system"],
  divider: ["none", "line", "dots", "wave"],
  color: ["purple", "cyan", "white", "gold"],
  position: ["below", "overlay", "both"],
  shape: ["pill", "rounded", "square"],
  size: ["md", "lg", "xl"],
  animation: ["none", "pulse", "shine", "bounce"],
  cardStyle: ["card", "outlined", "glass", "flat"],
  fields: ["labeled", "compact"],
};
export const IMAGE_PATH = /^[a-z0-9][a-z0-9-]{1,40}\/[A-Za-z0-9][A-Za-z0-9/_-]{0,160}\.(?:webp|jpg|jpeg|png)$/;
export const STORAGE = "https://byluoipdunralsurwebt.supabase.co/storage/v1/object/public/";
const DEFAULT_CTA = "اطلبي الآن";

const pick = (/** @type {unknown} */ v, /** @type {string[]} */ allowed) => (typeof v === "string" && allowed.includes(v) ? v : allowed[0]);
const text = (/** @type {unknown} */ v, /** @type {number} */ max, newlines = false) => {
  if (typeof v !== "string") return "";
  const clean = v.replace(newlines ? /[\u0000-\u0009\u000b-\u001f\u007f<>]/g : /[\u0000-\u001f\u007f<>]/g, "").trim();
  return clean.slice(0, max);
};
/** A storage path ("bucket/object.webp") or, with urls=true, a full WOMEN public storage URL. */
const image = (/** @type {unknown} */ v, urls = false) => {
  if (typeof v !== "string" || v.includes("..") || v.includes("//", urls ? 8 : 0)) return null;
  if (!urls) return IMAGE_PATH.test(v) ? v : null;
  return v.startsWith(STORAGE) && IMAGE_PATH.test(v.slice(STORAGE.length)) ? v : null;
};

export function defaultDesign() {
  return normalizeDesign({});
}

/** Whitelist + bound every field. Unknown keys (a "price", say) are dropped. */
export function normalizeDesign(/** @type {any} */ raw, { urls = false } = {}) {
  const d = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  const order = Array.isArray(d.order) && d.order.length === 4 && new Set(d.order.filter((/** @type {any} */ x) => SECTIONS.includes(x))).size === 4
    ? [...d.order] : [...SECTIONS];
  const hidden = Array.isArray(d.hidden) ? [...new Set(d.hidden.filter((/** @type {any} */ x) => HIDEABLE.includes(x)))] : [];
  const features = (Array.isArray(d.features) ? d.features : []).slice(0, 6).map((/** @type {unknown} */ f) => text(f, 90)).filter(Boolean);
  const imgs = d.images && typeof d.images === "object" ? d.images : {};
  const cta = d.cta && typeof d.cta === "object" ? d.cta : {};
  const card = d.orderCard && typeof d.orderCard === "object" ? d.orderCard : {};
  return {
    v: 1,
    template: pick(d.template, CHOICES.template),
    order, hidden,
    background: pick(d.background, CHOICES.background),
    font: pick(d.font, CHOICES.font),
    divider: pick(d.divider, CHOICES.divider),
    title: text(d.title, 120),
    description: text(d.description, 600, true),
    features,
    images: Object.fromEntries(SLOTS.map(s => [s, image(imgs[s], urls)])),
    cta: { text: text(cta.text, 40), color: pick(cta.color, CHOICES.color), position: pick(cta.position, CHOICES.position),
      shape: pick(cta.shape, CHOICES.shape), size: pick(cta.size, CHOICES.size), animation: pick(cta.animation, CHOICES.animation) },
    orderCard: { style: pick(card.style, CHOICES.cardStyle), fields: pick(card.fields, CHOICES.fields), title: text(card.title, 60) },
  };
}

/** True when the design would change nothing on the page (no images, no texts, defaults). */
export function isEmptyDesign(/** @type {ReturnType<typeof normalizeDesign>} */ d) {
  return JSON.stringify(d) === JSON.stringify(defaultDesign());
}

const CSS = `
html[data-studio]{--st-cta:#D100D1;--st-cta-ink:#fff;--st-cta-hover:#AE00B8}
html[data-studio-color="cyan"]{--st-cta:#2ED9D1;--st-cta-ink:#050B1C;--st-cta-hover:#25b9b2}
html[data-studio-color="white"]{--st-cta:#FFFFFF;--st-cta-ink:#050B1C;--st-cta-hover:#E6EAF2}
html[data-studio-color="gold"]{--st-cta:#D8B36A;--st-cta-ink:#050B1C;--st-cta-hover:#c49c50}
html[data-studio-bg="navy"]:not([data-theme="light"]) body{background:#0B1730}
html[data-studio-bg="elevated"]:not([data-theme="light"]) body{background:#111F3A}
.studio-sec{box-sizing:border-box;width:min(100% - 32px,1120px);margin:20px auto;padding:20px 16px;border:1px solid var(--line,#253452);background:var(--st-bg,#0B1730);color:var(--st-ink,#fff);display:grid;gap:14px;align-items:center;overflow:hidden}
html[data-studio-bg="midnight"] .studio-sec{--st-bg:#050B1C}
html[data-studio-bg="elevated"] .studio-sec{--st-bg:#111F3A}
html[data-studio-bg="light"] .studio-sec{--st-bg:#F4F6FA;--st-ink:#050B1C;--st-muted:#3a4560}
.studio-sec h2{margin:0;font:600 clamp(22px,5.4vw,34px)/1.35 var(--st-font,var(--f,'Readex Pro'));color:inherit;overflow-wrap:anywhere}
.studio-sec p{margin:0;font:400 16px/1.8 var(--st-font,var(--f,'Readex Pro'));color:var(--st-muted,#AAB5C8);white-space:pre-line;overflow-wrap:anywhere}
.studio-sec ul{margin:0;padding:0;list-style:none;display:grid;gap:10px}
.studio-sec li{display:flex;gap:10px;align-items:flex-start;font:500 16px/1.7 var(--st-font,var(--f,'Readex Pro'));overflow-wrap:anywhere}
.studio-sec li::before{content:"✓";color:var(--cyan,#2ED9D1);font-weight:700}
html[data-studio-bg="light"] .studio-sec li::before{color:#0b7d78}
html[data-studio-font="rakkas"] .studio-sec h2,html[data-studio-font="rakkas"] #lpForm>h2{font-family:Rakkas,serif;font-weight:400}
html[data-studio-font="system"] .studio-sec{--st-font:system-ui,-apple-system,"Segoe UI",Tahoma,sans-serif}
.studio-media{position:relative;margin:0;background:#F4F6FA;display:flex;justify-content:center}
.studio-media img{display:block;width:100%;height:auto;max-height:78vh;object-fit:contain}
.studio-copy{display:grid;gap:12px;min-width:0}
@media(min-width:900px){
  html[data-studio-template="editorial"] .studio-sec{grid-template-columns:1fr 1fr;padding:28px;gap:28px}
  html[data-studio-template="editorial"] .studio-features .studio-media{order:2}
  html[data-studio-template="classic"] .studio-sec{justify-items:center;text-align:center}
  html[data-studio-template="classic"] .studio-sec .studio-copy{max-width:720px;justify-items:center}
}
html[data-studio-template="minimal"] .studio-sec{border:0;background:transparent;padding:8px 0}
html[data-studio-template="minimal"] .studio-media{background:transparent}
.studio-cta{box-sizing:border-box;display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:48px;padding:12px 26px;background:var(--st-cta);color:var(--st-cta-ink);font:700 17px/1.2 var(--f,'Readex Pro');text-decoration:none;border:0;cursor:pointer;max-width:100%;position:relative;overflow:hidden}
.studio-cta:hover{background:var(--st-cta-hover)}
.studio-cta:focus-visible{outline:3px solid var(--cyan,#2ED9D1);outline-offset:3px}
.studio-cta[data-shape="pill"]{border-radius:999px}.studio-cta[data-shape="rounded"]{border-radius:12px}.studio-cta[data-shape="square"]{border-radius:0}
.studio-cta[data-size="lg"]{min-height:54px;font-size:19px;padding:14px 32px}
.studio-cta[data-size="xl"]{min-height:60px;font-size:21px;padding:16px 40px;width:min(100%,420px)}
.studio-media .studio-cta{position:absolute;inset-inline:16px;bottom:16px;margin-inline:auto;width:auto;max-width:calc(100% - 32px)}
@media (prefers-reduced-motion:no-preference){
  .studio-cta[data-anim="pulse"]{animation:st-pulse 2.2s ease-in-out infinite}
  .studio-cta[data-anim="bounce"]{animation:st-bounce 2.6s ease-in-out infinite}
  .studio-cta[data-anim="shine"]::after{content:"";position:absolute;inset:0;background:linear-gradient(100deg,transparent 30%,rgba(255,255,255,.35) 50%,transparent 70%);transform:translateX(-120%);animation:st-shine 3s ease-in-out infinite}
}
@keyframes st-pulse{0%,100%{transform:scale(1)}50%{transform:scale(1.04)}}
@keyframes st-bounce{0%,80%,100%{transform:translateY(0)}88%{transform:translateY(-5px)}94%{transform:translateY(0)}}
@keyframes st-shine{0%,55%{transform:translateX(-120%)}100%{transform:translateX(120%)}}
html[data-studio] #lpOrder{background:var(--st-cta);color:var(--st-cta-ink)}
html[data-studio] #lpOrder:hover:not(:disabled){background:var(--st-cta-hover)}
html[data-studio-shape="pill"] #lpOrder{border-radius:999px}html[data-studio-shape="rounded"] #lpOrder{border-radius:12px}
html[data-studio-size="lg"] #lpOrder{min-height:54px;font-size:18px}html[data-studio-size="xl"] #lpOrder{min-height:58px;font-size:19px}
.studio-divider{width:min(100% - 32px,1120px);margin:8px auto;height:14px}
.studio-divider[data-kind="line"]{height:1px;background:var(--line,#253452)}
.studio-divider[data-kind="dots"]{background:radial-gradient(circle,var(--cyan,#2ED9D1) 2px,transparent 2.5px) center/18px 14px repeat-x;opacity:.7}
.studio-divider[data-kind="wave"]{background:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='40' height='14'%3E%3Cpath d='M0 7q10-7 20 0t20 0' fill='none' stroke='%232ED9D1' stroke-width='1.5'/%3E%3C/svg%3E") center/40px 14px repeat-x;opacity:.7}
#lpForm[data-studio-style="outlined"]{background:transparent;border:2px solid var(--cyan,#2ED9D1)}
#lpForm[data-studio-style="glass"]{background:rgba(17,31,58,.72);border:1px solid rgba(46,217,209,.35)}
#lpForm[data-studio-style="flat"]{background:transparent;border:0;box-shadow:none;padding-inline:0}
#lpForm[data-studio-fields="compact"] label.f>span{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
#lpForm{scroll-margin-top:80px}
`;

/** Paint (or repaint) a normalized design (urls=true) on a landing page. Returns the nodes it added. */
export function applyDesign(/** @type {Document} */ doc, /** @type {ReturnType<typeof normalizeDesign>} */ d) {
  doc.querySelectorAll("[data-studio-node]").forEach(n => n.remove());
  const root = doc.documentElement;
  const form = /** @type {HTMLFormElement|null} */ (doc.getElementById("lpForm"));
  const main = doc.querySelector("main.page");
  if (!main || !form) return [];
  const head = form.querySelector("h2");
  if (head && !head.dataset.studioOriginal) head.dataset.studioOriginal = head.firstChild?.textContent || "";
  if (isEmptyDesign(d)) {
    ["studio", "studioColor", "studioBg", "studioFont", "studioTemplate", "studioShape", "studioSize"].forEach(k => delete root.dataset[k]);
    delete form.dataset.studioStyle; delete form.dataset.studioFields;
    if (head?.firstChild && head.dataset.studioOriginal) head.firstChild.textContent = head.dataset.studioOriginal;
    return [];
  }
  Object.assign(root.dataset, { studio: "1", studioColor: d.cta.color, studioBg: d.background, studioFont: d.font,
    studioTemplate: d.template, studioShape: d.cta.shape, studioSize: d.cta.size });
  form.dataset.studioStyle = d.orderCard.style;
  form.dataset.studioFields = d.orderCard.fields;
  if (head?.firstChild) head.firstChild.textContent = d.orderCard.title || head.dataset.studioOriginal || "";
  if (d.orderCard.fields === "compact") {
    form.querySelectorAll("label.f").forEach(l => {
      const input = /** @type {HTMLInputElement|null} */ (l.querySelector("input,textarea"));
      const label = l.querySelector("span")?.textContent || "";
      if (input && !input.placeholder) { input.placeholder = label; input.dataset.studioPlaceholder = "1"; }
    });
  } else form.querySelectorAll("[data-studio-placeholder]").forEach(i => { /** @type {HTMLInputElement} */ (i).placeholder = ""; delete /** @type {HTMLElement} */ (i).dataset.studioPlaceholder; });

  const style = doc.createElement("style");
  style.dataset.studioNode = "style"; style.textContent = CSS;
  doc.head.append(style);
  /** @type {HTMLElement[]} */ const added = [style];

  const make = (/** @type {string} */ tag, /** @type {string} */ cls = "", /** @type {string} */ t = "") => {
    const n = doc.createElement(tag); if (cls) n.className = cls; if (t) n.textContent = t; return n;
  };
  const cta = () => {
    const a = /** @type {HTMLAnchorElement} */ (make("a", "studio-cta", d.cta.text || DEFAULT_CTA));
    a.href = "#lpForm";
    Object.assign(a.dataset, { shape: d.cta.shape, size: d.cta.size, anim: d.cta.animation, studioCta: "1" });
    a.addEventListener("click", e => {
      e.preventDefault();
      form.scrollIntoView({ behavior: "smooth", block: "start" });
      /** @type {HTMLElement|null} */ (form.querySelector("input[name=name]"))?.focus({ preventScroll: true });
    });
    return a;
  };
  const media = (/** @type {string|null} */ src, /** @type {string} */ alt, eager = false) => {
    if (!src) return null;
    const fig = make("figure", "studio-media");
    const img = /** @type {HTMLImageElement} */ (make("img"));
    img.src = src; img.alt = alt; img.decoding = "async";
    if (!eager) img.loading = "lazy";
    fig.append(img);
    if (d.cta.position !== "below") fig.append(cta());
    return fig;
  };
  const wantsBelow = d.cta.position !== "overlay";
  /** @type {Record<string, () => HTMLElement|null>} */
  const build = {
    hero: () => {
      if (!d.images.hero && !d.title && !d.description) return null;
      const s = make("section", "studio-sec studio-hero");
      const m = media(d.images.hero, d.title || "صورة العرض", d.order[0] === "hero");
      const copy = make("div", "studio-copy");
      if (d.title) copy.append(make("h2", "", d.title));
      if (d.description) copy.append(make("p", "", d.description));
      if (wantsBelow || !m) copy.append(cta());
      if (m) s.append(m);
      if (copy.childElementCount) s.append(copy);
      return s;
    },
    features: () => {
      if (!d.images.features && !d.features.length) return null;
      const s = make("section", "studio-sec studio-features");
      const m = media(d.images.features, "مميزات القطعة");
      const copy = make("div", "studio-copy");
      if (d.features.length) {
        const ul = make("ul");
        d.features.forEach(f => ul.append(make("li", "", f)));
        copy.append(ul);
      }
      if (wantsBelow || !m) copy.append(cta());
      if (m) s.append(m);
      s.append(copy);
      return s;
    },
    closing: () => {
      if (!d.images.closing) return null;
      const s = make("section", "studio-sec studio-closing");
      const m = media(d.images.closing, "اطلبي قطعتك");
      if (m) s.append(m);
      if (wantsBelow) { const copy = make("div", "studio-copy"); copy.append(cta()); s.append(copy); }
      return s;
    },
  };
  const at = d.order.indexOf("product");
  const before = d.order.slice(0, at), after = d.order.slice(at + 1);
  const divider = () => {
    if (d.divider === "none") return null;
    const n = make("div", "studio-divider"); n.dataset.kind = d.divider; n.setAttribute("aria-hidden", "true"); return n;
  };
  /** @param {string[]} keys */
  const nodes = keys => keys.filter(k => !d.hidden.includes(k)).map(k => build[k]()).filter(n => !!n);
  const top = nodes(before), bottom = nodes(after);
  const place = (/** @type {HTMLElement} */ n, /** @type {"before"|"after"} */ where, /** @type {Element} */ ref) => {
    n.dataset.studioNode = n.dataset.studioNode || "section"; ref[where](n); added.push(n); return n;
  };
  let ref = /** @type {Element} */ (main);
  for (const n of [...top].reverse()) {
    const dv = divider(); if (dv) ref = place(dv, "before", ref);
    ref = place(n, "before", ref);
  }
  ref = main;
  for (const n of bottom) {
    const dv = divider(); if (dv) ref = place(dv, "after", ref);
    ref = place(n, "after", ref);
  }
  return added;
}
