// Build a static product landing page: node build-lp.mjs <page-id> [--refresh] [--images] [--check]
//   --refresh  re-read every colour's product from the PUBLIC catalog API (GET only) into fixtures/<CODE>.product.json
//   --images   download the product photos and encode AVIF/WebP derivatives into lp/<id>/img/<CODE>/
//   --check    render from the committed fixtures and fail if lp/<id>/index.html is stale (used by CI, no network)
// A page is one model: each colour is its own real product (public code), so no product data is merged.
import { readFile, writeFile, mkdir, access, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { priceLabel } from "../lp/runtime.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const API = "https://byluoipdunralsurwebt.supabase.co/functions/v1/women-checkout";
const MEDIA = /^https:\/\/byluoipdunralsurwebt\.supabase\.co\/storage\/v1\/object\/public\/product-media\/media\/[0-9a-f]{32}\.(jpg|png|webp)$/;
const HERO_WIDTHS = [480, 800];
const GALLERY_WIDTH = 320;
const MAX_GALLERY = 3;
const HEX = /^#[0-9A-Fa-f]{6}$/;

export const esc = (s) => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

// Runs inline in <head> before first paint so the A/B layout never shifts. Kept tiny on purpose.
export const AB_SNIPPET = `(()=>{let s=null;try{s=localStorage.getItem("women.lp.variant.v1")}catch(e){}const f=new URLSearchParams(location.search).get("lpv"),ok=x=>x==="a"||x==="b";document.documentElement.dataset.v=ok(f)?f:ok(s)?s:(Math.random()<.5?"a":"b")})()`;

export function photos(product) {
  const media = (product.media || []).filter(m => MEDIA.test(m.url));
  media.sort((a, b) => (b.isPrimary === true) - (a.isPrimary === true) || a.position - b.position);
  return media.slice(0, 1 + MAX_GALLERY);
}

/** Older configs name one product (`code`); newer ones list colours. Either way: [{code, name, hex}], first = default. */
export function colorsOf(page) {
  const colors = Array.isArray(page.colors) && page.colors.length ? page.colors : [{ code: page.code, name: "", hex: "" }];
  for (const c of colors) {
    if (!/^SS-\d{4,19}$/.test(c.code)) throw new Error(`${page.id}: bad colour code ${c.code}`);
    if (colors.length > 1 && (!c.name || !HEX.test(c.hex))) throw new Error(`${page.id}: colour ${c.code} needs a name and #RRGGBB`);
  }
  if (new Set(colors.map(c => c.code)).size !== colors.length) throw new Error(`${page.id}: duplicate colour code`);
  return colors;
}

const imgSet = (code, i, ext, prefix = "") => HERO_WIDTHS.map(w => `${prefix}img/${code}/${i}-${w}.${ext} ${w}w`).join(", ");

/** Per-colour data the runtime needs to swap photos without another request for page markup. */
export function colorData(page, products) {
  return colorsOf(page).map(c => {
    const p = products[c.code];
    if (!p) throw new Error(`${page.id}: no fixture for ${c.code}`);
    const pics = photos(p);
    if (!pics.length) throw new Error(`${c.code}: no public photo`);
    const alt = String(p.title || "").trim().slice(0, 200) + (c.name ? " باللون " + c.name : "");
    // Reuse the existing optimized SS-1010 photos instead of re-encoding
    // another copy on the grouped Balloon Suit page. The relative sibling
    // path resolves under /lp/ and is checked against committed assets.
    const prefix = page.reuse_images === true ? "../ss-" + c.code.slice(3).toLowerCase() + "/"
      : page.id === "ballon-suit" && c.code === "SS-1010" ? "../ss-1010/" : "";
    return { code: c.code, name: c.name, hex: c.hex, alt,
      ...(page.campaign?.zoom ? { zoom: pics.map(m => m.url) } : {}),
      hero: { avif: imgSet(c.code, 0, "avif", prefix), webp: imgSet(c.code, 0, "webp", prefix), src: `${prefix}img/${c.code}/0-800.webp` },
      gallery: pics.slice(1).map((_, i) => `${prefix}img/${c.code}/${i + 1}-${GALLERY_WIDTH}.webp`) };
  });
}

// Shared by every generated page and the automatic shell, so the two never drift apart.
const CAMPAIGN_CSS = `
body[data-campaign] .atelier-heading{font-size:clamp(28px,4vw,42px);line-height:1.35;margin:0}
body[data-campaign] .campaign-trust{margin:0;font-size:14px;color:var(--muted)}
body[data-campaign] .campaign-jump{display:block;padding:15px;text-align:center;background:var(--accent);color:#fff;text-decoration:none;font-weight:600}
body[data-campaign] #lpAddCart[hidden]{display:none!important}
body[data-campaign] .hero img,body[data-campaign] .gallery img{cursor:zoom-in}
body[data-campaign] .hero{background:var(--paper)}
@media(max-width:899px){body[data-campaign] .page{gap:16px}body[data-campaign] .atelier-heading{order:0}body[data-campaign] .hero{height:auto;aspect-ratio:4/5}body[data-campaign] .hero img{height:100%;object-fit:contain;object-position:center}body[data-campaign] .campaign-trust{order:4}body[data-campaign] .campaign-jump{order:4}body[data-campaign] .bar>div{gap:8px}body[data-campaign] .bar .sum{min-width:80px}body[data-campaign] #lpOrder{flex:1;min-width:0}body[data-campaign] .top{padding:12px 20px}body[data-campaign] .mark{font-size:23px}}
`;
const CSS = `:root{--bg:#F8F5F4;--surface:#F1EAEE;--line:#E7DCE2;--mauve:#7A5C71;--ink:#2A2129;--muted:#5F5560;--gold:#A8894E;--f:"Readex Pro","Segoe UI",Tahoma,"Noto Sans Arabic",sans-serif;color-scheme:light}
*{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
html{background:var(--bg)}
body{margin:0;background:var(--bg);color:var(--ink);font:400 15px/1.6 var(--f);overflow-x:clip}
a{color:var(--ink)}
:focus-visible{outline:2px solid var(--mauve);outline-offset:2px}
.top{display:flex;justify-content:space-between;align-items:center;max-width:1200px;margin:0 auto;padding:8px 20px;min-height:52px}
.mark{display:inline-flex;flex-direction:column;gap:3px;text-decoration:none;font-weight:600;font-size:16px;letter-spacing:.36em}
.mark::after{content:"";width:26px;height:1px;background:var(--gold)}
.top>a:last-child{font-size:14px;padding:12px 0}
.page{max-width:1200px;margin:0 auto;padding:0 0 calc(96px + env(safe-area-inset-bottom,0px));display:flex;flex-direction:column}
/* Mobile: photo, then title/price/colours, then the extra photos; desktop keeps them under the photo. */
.media{display:contents}
.hero{display:block;aspect-ratio:4/5;background:var(--surface)}
h1:empty{min-height:31px;border-radius:8px;background:var(--surface)}
.hero img{width:100%;height:100%;object-fit:cover;display:block}
.gallery{order:2;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;padding:20px 20px 0}
.gallery:empty{display:none}
.gallery img{width:100%;height:auto;aspect-ratio:4/5;object-fit:cover;border-radius:10px;background:var(--surface)}
.info{padding:18px 20px 0;display:flex;flex-direction:column;gap:18px;min-width:0}
.head{display:flex;flex-direction:column;gap:2px}
.head .row{display:flex;justify-content:space-between;align-items:baseline;gap:12px}
h1{margin:0;font-size:23px;font-weight:600;line-height:1.35;overflow-wrap:anywhere}
.price{margin:0;font-size:21px;font-weight:600;font-variant-numeric:tabular-nums;white-space:nowrap}
.price small{font-size:13px;font-weight:400;color:var(--muted);margin-inline-start:3px}
.pick{border:0;margin:0;padding:0;min-width:0}
.pick legend{padding:0;margin-bottom:10px;font-weight:600;font-size:14px}
.pick legend span{font-weight:400;color:var(--muted)}
.pick .row{display:flex;flex-wrap:wrap;gap:8px}
.chip{display:inline-flex;align-items:center;gap:8px;min-height:44px;padding:0 15px 0 12px;border:1px solid var(--line);border-radius:22px;background:#fff;color:var(--ink);font:400 14px var(--f);cursor:pointer}
.chip i{width:16px;height:16px;border-radius:50%;box-shadow:0 0 0 1px rgba(42,33,41,.15)}
.chip[aria-pressed="true"],.lp-opt input:checked+span{border-color:var(--ink);box-shadow:0 0 0 .5px var(--ink),inset 0 -2px 0 var(--gold)}
#lpOptions{min-height:44px}
.lp-opt{border:0;margin:0;padding:0;display:flex;flex-wrap:wrap;gap:8px}
.lp-opt legend{padding:0;margin-bottom:10px;font-weight:600;font-size:14px}
.lp-opt label{display:inline-flex;cursor:pointer}
.lp-opt input{position:absolute;width:1px;height:1px;margin:-1px;opacity:0;overflow:hidden;clip-path:inset(50%)}
.lp-opt span{display:inline-grid;place-items:center;min-width:54px;min-height:44px;padding:0 16px;border:1px solid var(--line);border-radius:22px;background:#fff}
.lp-opt input:focus-visible+span{outline:2px solid var(--mauve);outline-offset:2px}
.lp-opt input:disabled+span{border-style:dashed;color:#9A8E97;text-decoration:line-through;cursor:not-allowed}
.one{display:inline-grid;place-items:center;min-height:44px;padding:0 18px;border:1px solid var(--ink);border-radius:22px;background:#fff;box-shadow:inset 0 -2px 0 var(--gold);font-size:14px}
#lpStatus{margin:-8px 0 0;font-size:14px;min-height:22px}
#lpStatus[data-error="true"]{color:#9B2C3F}
.notes{margin:0;padding:14px 0;border-top:1px solid var(--line);border-bottom:1px solid var(--line);display:grid;gap:6px;font-size:14px;color:#4A3F49;list-style:none}
.desc{margin:0;font-size:14px;color:#4A3F49}
.desc:empty{display:none}
.desc p{margin:0}
.video{width:100%;aspect-ratio:16/9;border:0;border-radius:14px;background:var(--ink);color:#fff;font:600 16px var(--f);cursor:pointer}
.lp-video{width:100%;border-radius:14px}
.bar{position:fixed;inset-inline:0;bottom:0;z-index:5;padding:10px 16px calc(12px + env(safe-area-inset-bottom,0px));background:rgba(248,245,244,.97);border-top:1px solid var(--line)}
.bar>div{max-width:560px;margin-inline:auto;display:flex;gap:12px;align-items:center}
.bar .sum{display:flex;flex-direction:column;line-height:1.25;min-width:0}
.bar .sum b{font-size:17px;font-weight:600;font-variant-numeric:tabular-nums;white-space:nowrap}
.bar .sum span{font-size:12px;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#lpOrder{flex:1;height:52px;border:0;border-radius:14px;background:var(--mauve);color:#fff;font:600 16px var(--f);cursor:pointer;transition:background .15s}
#lpOrder:active{background:#5E4357}
#lpOrder:disabled{background:#D9CCD4;color:#4A3F49;cursor:default}
#lpAddCart{flex:0 1 43%;min-width:0;height:52px;padding:0 8px;border:1.5px solid var(--accent);border-radius:11px;background:transparent;color:var(--accent);font:600 14px var(--f);cursor:pointer}
#lpAddCart:disabled{opacity:.48;cursor:default}
#lpCartLink{display:inline-flex;align-items:center;min-height:44px;padding:0 10px;border:1px solid var(--line);color:var(--ink);text-decoration:none}
.bar>div{gap:8px}#lpOrder{min-width:0}
@media(max-width:899px){.bar button{min-width:0!important}#lpAddCart{font-size:12px}}

/* Direct order form: part of the page, no extra step. 16px inputs stop iOS from zooming. */
.order{display:flex;flex-direction:column;gap:14px;margin:0;padding:16px;border:1px solid var(--line);border-radius:16px;background:#fff}
.order[hidden],.bar[hidden],.done[hidden]{display:none}
.order h2{margin:0;font-size:17px;font-weight:600}
.order h2 small{display:block;font-size:13px;font-weight:400;color:var(--muted)}
.qty{display:flex;justify-content:space-between;align-items:center;font-size:14px;font-weight:600}
.step{display:inline-flex;align-items:center;border:1px solid var(--line);border-radius:12px;overflow:hidden}
.step button{width:44px;height:44px;border:0;background:var(--bg);color:var(--ink);font:500 20px var(--f);cursor:pointer}
.step button:disabled{color:#C4B6BF;cursor:default}
.step output{min-width:40px;text-align:center;font-weight:600;font-variant-numeric:tabular-nums}
.f{display:flex;flex-direction:column;gap:6px;font-size:14px;font-weight:600}
.f input,.f select,.f textarea{width:100%;min-height:48px;padding:11px 14px;border:1px solid var(--line);border-radius:12px;background-color:var(--bg);color:var(--ink);font:400 16px var(--f);-webkit-appearance:none;appearance:none}
.f textarea{min-height:72px;resize:vertical}
.f select{background-image:linear-gradient(45deg,transparent 50%,var(--muted) 50%),linear-gradient(135deg,var(--muted) 50%,transparent 50%);background-position:18px 21px,23px 21px;background-size:5px 5px;background-repeat:no-repeat}
.f input:focus,.f select:focus,.f textarea:focus{outline:0;border-color:var(--mauve);background-color:#fff;box-shadow:0 0 0 3px rgba(122,92,113,.18)}
.f [aria-invalid="true"]{border-color:#9B2C3F}
.f small{font-size:13px;font-weight:400;color:#9B2C3F}
.f small:empty{display:none}
.totals{margin:0;display:grid;gap:6px;padding-top:12px;border-top:1px dashed var(--line);font-size:14px}
.totals div{display:flex;justify-content:space-between;gap:12px}
.totals dt{color:var(--muted)}.totals dd{margin:0;font-variant-numeric:tabular-nums}
.totals .total{font-size:17px;font-weight:600}.totals .total dt{color:var(--ink)}
.cod{margin:0;font-size:13px;color:var(--muted)}
.done{display:flex;flex-direction:column;align-items:center;gap:6px;text-align:center;padding:24px 16px;border:1px solid var(--line);border-radius:16px;background:#fff;outline:0;animation:rise .35s ease-out}
.done .tick{display:grid;place-items:center;width:52px;height:52px;border-radius:50%;background:var(--mauve);color:#fff;font-size:26px}
.done h2{margin:6px 0 0;font-size:20px}.done p{margin:0;color:var(--muted)}
.done strong{font-size:22px;color:var(--ink);letter-spacing:.06em}
.done a{margin-top:10px;font-weight:600}
@keyframes rise{from{opacity:0;transform:translateY(8px)}}
@media (prefers-reduced-motion:reduce){.done{animation:none}}
/* Focus scrolling keeps the field above the fixed confirm bar (and the keyboard in in-app browsers). */
@media (max-width:899px){html{scroll-padding-bottom:110px}}
html[data-v="b"] .pick,html[data-v="b"] #lpOptions{order:-1}
@media (min-width:900px){
.page{display:grid;grid-template-columns:minmax(0,1.15fr) minmax(0,1fr);gap:48px;padding:8px 20px 56px;align-items:start}
.media{display:block;min-width:0}
.hero{border-radius:16px;overflow:hidden}.gallery{padding:12px 0 0}.info{padding:8px 0 0}
h1{font-size:34px}.price{font-size:26px}
.bar{position:static;padding:0;background:none;border:0}.bar>div{max-width:none}.bar .sum{display:none}#lpOrder{height:56px}
}
/* Atelier skin: olive/neutral, Rakkas display, square edges. */
@font-face{font-family:Rakkas;src:url('/assets/fonts/rakkas-400-arabic.woff2') format('woff2');font-display:swap}
:root{--bg:#f7f6f2;--paper:#eeece5;--ink:#22251f;--accent:#303c2d;--muted:#54584c}html{scroll-behavior:smooth;scroll-padding-top:20px}body{background:var(--bg);color:var(--ink)}.top{background:var(--bg);border:0;max-width:1400px;padding:24px 32px;margin:auto}.mark{color:var(--ink);font-size:32px}.page{max-width:1400px;padding:20px 32px 70px;gap:64px}.media{grid-column:1;grid-row:1}.info{grid-column:2;grid-row:1}.hero{border-radius:0!important;background:var(--paper)}.hero img{border-radius:0}.gallery img{border-radius:0}.atelier-heading{font-family:Rakkas,serif;font-size:56px;line-height:1.3;margin:0 0 24px}.head h1{font-size:28px}.desc{color:var(--muted)}.chip,.one,.step,.step button{border-radius:0!important;border:0;background:var(--paper)}.chip[aria-pressed=true]{background:var(--accent);color:#fff}.order{background:var(--paper);border:0;border-radius:0;padding:26px;margin-top:24px}.order h2{font-size:25px}.order h2 small{font-size:14px;line-height:1.8}.f input,.f select,.f textarea{border:0;border-bottom:2px solid transparent;border-radius:0;background-color:var(--bg);min-height:48px}.f input:focus,.f select:focus,.f textarea:focus{outline:2px solid var(--accent)}.totals{border:0}.total{border:0!important}.bar{border:0;background:var(--bg)}#lpOrder{background:var(--accent);color:#fff;border:0;border-radius:0;min-height:54px}.reassurance{font-family:Rakkas,serif;font-size:30px;margin-top:36px}.notes{background:var(--paper);padding:24px 38px;color:var(--ink);border:0;border-radius:0}.notes li{margin-block:12px}.done{border:0;border-radius:0;background:var(--paper)}footer{background:var(--ink);color:var(--bg);padding:40px 32px}footer strong{font-size:clamp(28px,5vw,72px)}footer p{font-size:14px}a:focus-visible,button:focus-visible{outline:3px solid var(--accent);outline-offset:4px}::selection{background:var(--accent);color:white}
@media(max-width:899px){.top{padding:18px 20px}.page{padding:0 20px 40px;display:flex;flex-direction:column;gap:24px}.media{display:contents}.hero{order:1;width:100%;height:330px}.hero img{width:100%;height:330px;object-fit:cover;object-position:50% 35%}.info{display:contents}.atelier-heading{order:0;font-size:38px;margin:0}.head{order:2}.pick{order:3}#lpOptions{order:4}.gallery{order:5;display:flex;gap:12px;padding:0}.gallery img{width:calc((100% - 24px)/3);height:120px;object-fit:cover}.order{order:6;padding:22px 18px;margin:0}.reassurance{order:7;margin-top:20px}.notes{order:8;margin-top:0}#lpMore{order:9}#lpStatus{order:6}#lpDone{order:6}.bar{order:10}.head h1{font-size:25px}.price{font-size:24px}footer{padding-bottom:120px}.bar>div{gap:16px}.bar button{min-width:160px}}
@media(prefers-reduced-motion:reduce){html{scroll-behavior:auto}*{animation:none!important;transition:none!important}}
@media(max-width:899px){html[data-v="b"] .pick{order:3}html[data-v="b"] #lpOptions{order:4}}
@media(min-width:900px){html[data-v="b"] .pick,html[data-v="b"] #lpOptions{order:0}}
/* Launch polish (screenshots at 320/390/768): olive focus everywhere, visible stepper, select chevron kept,
   320px header fits, tablet hero keeps the 4:5 photo instead of a cropped strip. */
:root{--mauve:var(--accent)}
.order .step{background:var(--bg);box-shadow:inset 0 0 0 1px var(--line)}.order .step button{background:var(--bg)}
@media(max-width:380px){.mark{font-size:24px;letter-spacing:.26em}.top>a:last-child{font-size:13px}}
@media(min-width:560px) and (max-width:899px){.hero,.hero img{height:auto;aspect-ratio:4/5}.hero{width:min(100%,520px);align-self:center}}
`;

const DEFAULT_BENEFITS = ["الدفع عند الاستلام، من غير دفع مقدم", "اختاري المحافظة لمعرفة مصاريف الشحن والإجمالي قبل التأكيد", "الطلب خاضع لتأكيد توافر القطعة وميعاد الشحن بعد التسجيل"];

// Starts the product and governorate reads while the runtime module downloads; lp/runtime.js picks them up once.
export const PREFETCH = (codeExpr) => `(()=>{try{if(window.__lpGo)return;const A="${API}",c=${codeExpr};if(!/^SS-\\d{4,19}$/.test(c)){location.replace("/");return}const g=p=>fetch(A+p,{cache:"no-store",headers:{Accept:"application/json"}});window.__lp={code:c,product:g("/product/"+c),regions:g("/regions")}}catch(e){}})()`;

const field = (name, label, control) => `<label class="f"><span>${label}</span>${control}<small id="lpErr-${name}" aria-live="polite"></small></label>`;
const ORDER_FORM = `<form class="order" id="lpForm" novalidate>
<h2>اطلبي دلوقتي<small>سيبي بياناتك، والتوافر وميعاد الشحن بيتأكدوا بعد تسجيل الطلب.</small></h2>
<div class="qty"><span id="lpQtyLabel">الكمية</span><div class="step" role="group" aria-labelledby="lpQtyLabel"><button type="button" id="lpQtyUp" data-q="1" aria-label="زوّدي واحدة">+</button><output id="lpQty" aria-live="polite">١</output><button type="button" id="lpQtyDown" data-q="-1" aria-label="قلّلي واحدة" disabled>−</button></div></div>
${field("name", "الاسم", `<input name="name" autocomplete="name" maxlength="200" enterkeyhint="next" required>`)}
${field("phone", "رقم الموبايل", `<input name="phone" type="tel" inputmode="tel" autocomplete="tel" maxlength="20" placeholder="01xxxxxxxxx" dir="ltr" enterkeyhint="next" required>`)}
${field("region", "المحافظة", `<select name="region" autocomplete="address-level1" required><option value="">اختاري المحافظة</option></select>`)}
${field("address", "العنوان بالتفصيل", `<textarea name="address" rows="2" autocomplete="street-address" maxlength="860" placeholder="المنطقة، الشارع، رقم العمارة والدور" enterkeyhint="done" required></textarea>`)}
<dl class="totals"><div><dt>سعر القطع</dt><dd id="lpSub">—</dd></div><div><dt>الشحن</dt><dd id="lpShip">اختاري المحافظة</dd></div><div class="total"><dt>الإجمالي</dt><dd id="lpTotal">—</dd></div></dl>
<p class="cod">مفيش دفع أونلاين. هتدفعي الإجمالي ده كاش للمندوب.</p>
</form>
<section class="done" id="lpDone" tabindex="-1" hidden><span class="tick" aria-hidden="true">✓</span><h2>تم تسجيل طلبك</h2><p>رقم الطلب</p><strong id="lpDoneCode" dir="ltr"></strong><p id="lpDoneText"></p><a href="/">شوفي قطع تانية</a></section>`;

/** One layout for both kinds of page. `o` holds already-escaped HTML fragments. */
function layout(o) {
  const campaign = o.campaign;
  // Keep the exact same colour choices visible when a shopper jumps straight
  // from "اطلبي إطلالتك" to the COD form; the first picker remains by the photo.
  const checkoutPicker = o.picker
    ? o.picker.replace('id="lpColors"', 'id="lpFormColors"')
      .replace('id="lpColorName"', 'id="lpFormColorName"')
    : "";
  const orderForm = checkoutPicker
    ? ORDER_FORM.replace('<form class="order" id="lpForm" novalidate>',
      '<form class="order" id="lpForm" novalidate>\n' + checkoutPicker)
    : ORDER_FORM;
  // Refresh the browser-cached runtime only on affected grouped and legacy
  // product pages. Unrelated generated LPs retain their exact original HTML.
  const choiceVersion = campaign ? "20261031-sweater-2" : /tooling\/pages\/(?:ballon-suit|ss-1008|ss-1009|ss-1010|ss-1035|ss-1036|ss-1038|ss-1039|ss-1040|striped-knit|pra-sweatshirt|chinese-jacket|button-knit|zebra-knit|checked-jacket)\.json/.test(o.source || "")
    ? "20261030-7" : checkoutPicker ? "20261030-5" : "20261030-4";
  return `<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="robots" content="noindex, follow">
<meta name="theme-color" content="#f7f6f2">
<meta name="referrer" content="strict-origin-when-cross-origin">
<!-- Generated by tooling/build-lp.mjs${o.source}. Do not edit by hand. -->
<title>${o.title}</title>
<meta name="description" content="${o.description}">
${o.canonical}<link rel="icon" href="/assets/icons/favicon.svg" type="image/svg+xml">
${o.preload}<link rel="preconnect" href="https://byluoipdunralsurwebt.supabase.co" crossorigin>
${o.route || ""}<script id="lp-ab">${AB_SNIPPET}</script>
<script id="lp-prefetch">${PREFETCH(o.codeExpr)}</script>
<style>
${o.fontFaces}
${CSS}${campaign ? "\n" + CAMPAIGN_CSS : ""}</style>
</head>
<body${campaign ? ' data-campaign="focused"' : ""}>
<header class="top"><a class="mark" href="/" aria-label="SELECT SHOP WOMEN الرئيسية">SELECT</a><a href="#lpForm">اطلبي إطلالتك</a>${campaign?.directOnly ? "" : '<a href="/cart/" id="lpCartLink" aria-label="شنطة التسوق">الشنطة (<span id="lpCartCount">0</span>)</a>'}</header>
<main class="page">
<div class="media">
<picture class="hero" id="lpHero">${o.hero}</picture>
<div class="gallery" id="lpGallery">${o.gallery}</div>
</div>
<div class="info">
<p class="atelier-heading">${campaign ? esc(campaign.headline) : "تفاصيل تكمّل إطلالتك"}</p>
<div class="head"><div class="row"><h1 id="lpTitle">${o.h1}</h1><p class="price"><span id="lpPrice">${o.price}</span><small>جنيه</small></p></div><p class="desc" id="lpDesc">${o.desc}</p></div>
${o.picker}
<div id="lpOptions">${o.options}</div>
${campaign ? `<p class="campaign-trust">الدفع عند الاستلام · الشحن واضح قبل التأكيد</p><a class="campaign-jump" href="#lpForm">اختاري الكمية واطلبي دلوقتي</a>\n` : ""}${orderForm}
<p id="lpStatus" role="status" aria-live="polite"></p>
<div class="bar"><div><span class="sum" aria-hidden="true"><b id="lpBarPrice">${o.price === "—" ? "—" : o.price + " ج"}</b><span id="lpBarChoice">${o.choice}</span></span><button type="button" id="lpAddCart"${campaign?.directOnly ? " hidden" : ""} disabled>أضيفي للشنطة</button><button type="submit" form="lpForm" id="lpOrder" disabled>تأكيد الطلب</button></div></div>
<h2 class="reassurance">طلبك واضح من البداية</h2>
<ul class="notes">${o.benefits.map(t => `<li>${esc(t)}</li>`).join("")}</ul>
<div class="desc" id="lpMore">${o.more}</div>
${o.video}
</div>
</main>
<footer><strong dir="ltr">SELECT SHOP WOMEN</strong><p>الدفع نقدًا عند الاستلام · اختيار اللون والمقاس قبل تأكيد الطلب</p></footer>
<noscript><p style="text-align:center">${o.noscript}</p></noscript>
<script type="application/json" id="lp-data">${o.data}</script>
${o.scripts}<script type="module" src="/lp/runtime.js?v=${choiceVersion}"></script>
</body>
</html>
`;
}

export function render(page, products, fontFaces = "") {
  const colors = colorData(page, products);
  const first = colors[0], product = products[first.code];
  const price = priceLabel(product, null); // same text the runtime shows, so the live re-check never flips it
  if (price === "—") throw new Error(`${first.code}: no real price`);
  const title = String(page.title || product.title || "").trim().slice(0, 200);
  const sizes = "(min-width: 900px) 560px, 100vw";
  const lines = String(product.description || "").split("\n").map(l => l.trim()).filter(Boolean).slice(0, 6);
  const oneSize = Array.isArray(product.options) && product.options.length === 0;
  const picker = colors.length > 1 ? `<fieldset class="pick" id="lpColors"><legend>اللون: <span id="lpColorName">${esc(first.name)}</span></legend><div class="row">${colors.map((c, i) =>
    `<button type="button" class="chip" data-code="${esc(c.code)}" aria-pressed="${i === 0}"><i style="background:${esc(c.hex)}"></i>${esc(c.name)}</button>`).join("")}</div></fieldset>` : "";
  return layout({
    campaign: page.campaign,
    source: ` from tooling/pages/${esc(page.id)}.json`,
    title: `${esc(title)} · SELECT SHOP WOMEN`,
    description: `${esc(title)}. اطلبي من نفس الصفحة، الدفع عند الاستلام والشحن لكل المحافظات.`,
    canonical: `<link rel="canonical" href="https://selectshopeg.com/lp/${esc(page.id)}/">\n`,
    preload: `<link rel="preload" as="image" type="image/avif" imagesrcset="${first.hero.avif}" imagesizes="${sizes}" fetchpriority="high">\n`,
    codeExpr: JSON.stringify(first.code), fontFaces,
    hero: `<source type="image/avif" srcset="${first.hero.avif}" sizes="${sizes}"><source type="image/webp" srcset="${first.hero.webp}" sizes="${sizes}"><img src="${first.hero.src}" alt="${esc(first.alt)}" width="800" height="1000" fetchpriority="high" decoding="async">`,
    gallery: first.gallery.map(src => `<img src="${src}" alt="${esc(first.alt)}" width="320" height="400" loading="lazy" decoding="async">`).join(""),
    h1: esc(title), price, desc: lines[0] ? esc(lines[0]) : "", picker,
    options: oneSize ? `<div class="lp-opt"><span class="one">مقاس واحد</span></div>` : "",
    choice: esc((first.name ? first.name + " · " : "") + (oneSize ? "مقاس واحد" : "اختاري المقاس")),
    benefits: page.benefits || DEFAULT_BENEFITS,
    more: page.campaign?.colourNote ? `<p>${esc(page.campaign.colourNote)}</p>` : lines.slice(1).map(l => `<p>${esc(l)}</p>`).join(""),
    video: page.video ? `<button type="button" class="video" data-lp-video="${esc(page.video.src)}">▶ شغّلي الفيديو</button>` : "",
    noscript: `<a href="/p/?code=${esc(first.code)}">افتحي صفحة المنتج للطلب</a>`,
    data: JSON.stringify({ id: page.id, code: first.code, colors, ...(page.campaign ? { directOnly: page.campaign.directOnly === true, campaign: true } : {}) }).replace(/</g, "\\u003c"),
    scripts: page.campaign?.zoom ? '<script type="module" src="/lp/image-zoom.js?v=20261031-1"></script>' : "",
  });
}

// Automatic page only: shows the hero photo as soon as the early product read lands, without waiting for the
// runtime module (lp/runtime.js fillFromProduct sets the same URLs, so nothing is downloaded twice).
const HERO_BOOT = String.raw`(()=>{const w=window,l=w.__lp;if(!l||!l.product)return;l.product.then(r=>r.ok?r.clone().json():null).then(d=>{const m=((d&&d.product&&d.product.media)||[]).filter(x=>/^https:\/\/byluoipdunralsurwebt\.supabase\.co\/storage\/v1\/object\/public\/product-media\/media\/[0-9a-f]{32}\.(jpg|png|webp)$/.test(x.url||"")).sort((a,b)=>(b.isPrimary===true)-(a.isPrimary===true)||a.position-b.position)[0],img=document.querySelector("#lpHero img");if(!m||!img||img.src)return;const f=m.url.split("/").pop(),b="/assets/catalog-thumbs/"+f;img.fetchPriority="high";if(new Set(w.SELECT_THUMBNAILS||[]).has(f)){img.sizes="(min-width: 900px) 560px, 100vw";img.srcset=b+".w400.webp 400w, "+b+".webp 559w";img.src=b+".webp"}else img.src=m.url}).catch(()=>{})})()`;

/** /lp/index.html: the automatic page for any public product (/lp/?p=SS-1008). Filled by lp/runtime.js from the
 *  live product read; photos come from the checked-in catalog thumbnails (js/catalog-thumbs.js) when present. */
// Old ad links (/lp/?p=SS-…) for a product that has its own pre-rendered page go straight there, before any other
// script or request runs (marketing parameters kept, p/code dropped): its photo paints from HTML instead of after an
// API round-trip. Codes without their own page (other colours of a model page) stay on the automatic page.
const ROUTE = (routes) => `<script id="lp-route">(()=>{try{const q=new URLSearchParams(location.search),R=${JSON.stringify(routes)},c=String(q.get("p")||q.get("code")||"").trim().toUpperCase();if(R[c]){q.delete("p");q.delete("code");const s=q.toString();window.__lpGo=1;location.replace(R[c]+(s?"?"+s:""))}}catch(e){}})()</script>
`;

/** { "SS-1012": "/lp/ss-1012/", … }: each page config's DEFAULT code -> its pre-rendered page. */
export async function shellRoutes() {
  const dir = path.join(ROOT, "tooling", "pages"), routes = {};
  for (const f of (await readdir(dir)).filter(f => f.endsWith(".json")).sort()) {
    const page = JSON.parse(await readFile(path.join(dir, f), "utf8"));
    // These new model LPs reuse the original colour pages, which remain the stable
    // legacy shell destinations; lp/runtime.js preserves the selected SKU on redirect.
    if (page.reuse_images === true) continue;
    routes[colorsOf(page)[0].code] = `/lp/${page.id}/`;
  }
  return routes;
}

export function renderShell(fontFaces = "", routes = {}) {
  const code = `String(new URLSearchParams(location.search).get("p")||new URLSearchParams(location.search).get("code")||"").trim().toUpperCase()`;
  return layout({
    source: " (automatic product page)", title: "SELECT SHOP WOMEN",
    description: "اطلبي من نفس الصفحة من SELECT SHOP WOMEN. الدفع عند الاستلام والشحن لكل المحافظات.",
    canonical: "", preload: "", codeExpr: code, fontFaces, route: ROUTE(routes),
    hero: `<img alt="" width="800" height="1000" decoding="async">`, gallery: "", h1: "", price: "—", desc: "", picker: "", options: "",
    choice: "اختاري المقاس", benefits: DEFAULT_BENEFITS, more: "", video: "",
    noscript: `<a href="/">افتحي المتجر</a>`, data: JSON.stringify({ auto: true }),
    scripts: `<script src="/js/catalog-thumbs.js"></script>\n<script id="lp-hero">${HERO_BOOT}</script>\n`,
  });
}

async function encodeImages(page, products) {
  const sharp = (await import("sharp")).default;
  for (const c of colorsOf(page)) {
    const dir = path.join(ROOT, "lp", page.id, "img", c.code);
    await mkdir(dir, { recursive: true });
    for (const [i, m] of photos(products[c.code]).entries()) {
      const r = await fetch(m.url);
      if (!r.ok) throw new Error(`${c.code} photo ${i}: HTTP ${r.status}`);
      const buf = Buffer.from(await r.arrayBuffer());
      for (const w of i === 0 ? HERO_WIDTHS : [GALLERY_WIDTH]) {
        const base = sharp(buf).rotate().resize({ width: w, height: Math.round(w * 1.25), fit: "cover" });
        await base.clone().webp({ quality: 65 }).toFile(path.join(dir, `${i}-${w}.webp`));
        if (i === 0) await base.clone().avif({ quality: 40, effort: 6 }).toFile(path.join(dir, `${i}-${w}.avif`));
      }
    }
  }
}

// Only the Readex Pro faces are inlined: one variable font file per script, nothing else competes with the photo.
export const readexFaces = (css) => (css.match(/@font-face\s*{[^}]*}/g) || [])
  .filter(f => /font-family:\s*'Readex Pro'/.test(f))
  .map(f => f.replace(/\s*\n\s*/g, "").replaceAll("../assets/fonts/", "/assets/fonts/")).join("");

async function main() {
  const [id, ...flags] = process.argv.slice(2);
  if (!/^[a-z0-9-]{3,40}$/.test(id || "")) throw new Error("usage: node build-lp.mjs <page-id>|shell [--refresh] [--images] [--check]");
  const fontFaces = readexFaces(await readFile(path.join(ROOT, "css", "fonts.css"), "utf8"));
  // "shell" = lp/index.html, the automatic page behind /lp/?p=<code>.
  if (id === "shell") return output("lp/index.html", renderShell(fontFaces, await shellRoutes()), "shell", flags);
  const page = JSON.parse(await readFile(path.join(ROOT, "tooling", "pages", id + ".json"), "utf8"));
  if (page.id !== id) throw new Error("page config id invalid");
  const products = {};
  for (const c of colorsOf(page)) {
    const fixture = path.join(ROOT, "tooling", "fixtures", c.code + ".product.json");
    if (flags.includes("--refresh")) {
      const r = await fetch(`${API}/product/${c.code}`, { headers: { Accept: "application/json", Origin: "https://selectshopeg.com" } });
      if (!r.ok) throw new Error(`${c.code} product read HTTP ${r.status}`);
      await writeFile(fixture, JSON.stringify(await r.json()));
    }
    const { product } = JSON.parse(await readFile(fixture, "utf8"));
    if (product?.publicCode !== c.code) throw new Error(`fixture does not match ${c.code}`);
    products[c.code] = product;
  }
  if (flags.includes("--images")) await encodeImages(page, products);
  const html = render(page, products, fontFaces);
  for (const c of colorData(page, products)) for (const f of [c.hero.src, ...c.gallery, ...c.hero.avif.split(", ").map(s => s.split(" ")[0])])
    await access(path.join(ROOT, "lp", id, f)); // every referenced image is committed
  await output(`lp/${id}/index.html`, html, id, flags);
}

async function output(rel, html, id, flags) {
  const out = path.join(ROOT, rel);
  if (flags.includes("--check")) {
    const current = await readFile(out, "utf8").catch(() => "");
    if (current !== html) { console.error(`STALE: ${rel} differs from its generator output; run node build-lp.mjs ${id}`); process.exit(1); }
    console.log(`OK ${rel} is up to date`);
    return;
  }
  await mkdir(path.dirname(out), { recursive: true });
  await writeFile(out, html);
  console.log(`wrote ${rel} (${html.length} bytes)`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(e => { console.error(e.message); process.exit(1); });
}
