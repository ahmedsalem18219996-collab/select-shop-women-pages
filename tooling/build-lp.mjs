// Build a static product landing page: node build-lp.mjs <page-id> [--refresh] [--images] [--check]
//   --refresh  re-read every colour's product from the PUBLIC catalog API (GET only) into fixtures/<CODE>.product.json
//   --images   download the product photos and encode AVIF/WebP derivatives into lp/<id>/img/<CODE>/
//   --check    render from the committed fixtures and fail if lp/<id>/index.html is stale (used by CI, no network)
// A page is one model: each colour is its own real product (public code), so no product data is merged.
import { readFile, writeFile, mkdir, access, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { priceLabel, photoFiles, firstColourThumb } from "../lp/runtime.js";
import { waLink, productText, GENERAL, FALLBACK } from "../js/store-contact.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const API = "https://byluoipdunralsurwebt.supabase.co/functions/v1/women-checkout";
const MEDIA = /^https:\/\/byluoipdunralsurwebt\.supabase\.co\/storage\/v1\/object\/public\/product-media\/media\/[0-9a-f]{32}\.(jpg|png|webp)$/;
// Photo derivatives (names in lp/runtime.js photoFiles): photo 0 = AVIF+WebP at both widths, every other photo = one
// 800px WebP for the main view, and every photo a 320px thumbnail. Never cropped: the 3:4 originals keep their shape.
const HERO_WIDTHS = [480, 800];
const MAIN_WIDTH = 800;
const THUMB_WIDTH = 320;
const MAX_GALLERY = 3;
const HEX = /^#[0-9A-Fa-f]{6}$/;

export const esc = (s) => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

// Runs inline in <head> before first paint so the A/B layout never shifts. Kept tiny on purpose.
export const AB_SNIPPET = `(()=>{let s=null;try{s=localStorage.getItem("women.lp.variant.v1")}catch(e){}const f=new URLSearchParams(location.search).get("lpv"),ok=x=>x==="a"||x==="b";document.documentElement.dataset.v=ok(f)?f:ok(s)?s:(Math.random()<.5?"a":"b")})()`;

// Dark (default) / Light. Inline in <head> right after the theme-color meta, before any stylesheet: <html data-theme> is set before
// first paint, so a saved Light choice never flashes Dark. One delegated click handler serves every [data-theme-toggle] on the page.
// Since the Neutral look (2026-11-21) the home and the landing pages are light only and carry neither; /p/, /cart/, /checkout/ and
// /order-success/ still carry these two strings, and tooling/test/theme.test.mjs keeps them identical.
export const THEME_BOOT = `(()=>{const d=document.documentElement,K="ssw.theme.v1";let t="dark";const read=()=>{try{return localStorage.getItem(K)==="light"?"light":"dark"}catch(e){return"dark"}},set=x=>{t=x;d.dataset.theme=x;const m=document.querySelector('meta[name="theme-color"]'),l=x==="light"?"التحويل للوضع الداكن":"التحويل للوضع الفاتح";if(m)m.content=x==="light"?"#F7F3EC":"#050B1C";for(const b of document.querySelectorAll("[data-theme-toggle]")){b.setAttribute("aria-label",l);b.title=l}};set(read());document.addEventListener("click",e=>{const b=e.target instanceof Element&&e.target.closest("[data-theme-toggle]");if(!b)return;set(t==="light"?"dark":"light");try{localStorage.setItem(K,t)}catch(e){}});document.addEventListener("DOMContentLoaded",()=>set(t));addEventListener("pageshow",e=>{if(e.persisted)set(read())})})()`;
export const THEME_TOGGLE = '<button type="button" class="theme-toggle" data-theme-toggle aria-label="التحويل للوضع الفاتح" title="التحويل للوضع الفاتح"><svg class="sun" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M5.3 18.7l1.6-1.6M17.1 6.9l1.6-1.6"/></svg><svg class="moon" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/></svg></button>';
/** Light tokens + switch styles, read from the storefront sheet so both surfaces share one palette. */
export const SHARED_THEME = (await readFile(fileURLToPath(new URL("../css/atelier-site.css", import.meta.url)), "utf8"))
  .match(/\/\* theme:shared[^]*?\/\* \/theme:shared \*\//)[0].replace(/\r\n/g, "\n"); // a Windows (CRLF) checkout must build the same LF pages

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

// Reuse the existing optimized photos of the original colour page instead of re-encoding another copy on the grouped
// model pages (and SS-1010 on Balloon Suit). The relative sibling path resolves under /lp/ and is checked against committed assets.
const imgPrefix = (page, code) => page.reuse_images === true ? "../ss-" + code.slice(3).toLowerCase() + "/"
  : page.id === "ballon-suit" && code === "SS-1010" ? "../ss-1010/" : "";

/** Per-colour data the runtime needs to swap photos without another request for page markup. */
export function colorData(page, products) {
  return colorsOf(page).map(c => {
    const p = products[c.code];
    if (!p) throw new Error(`${page.id}: no fixture for ${c.code}`);
    const pics = photos(p);
    if (!pics.length) throw new Error(`${c.code}: no public photo`);
    const alt = String(p.title || "").trim().slice(0, 200) + (c.name ? " باللون " + c.name : "");
    return { code: c.code, name: c.name, hex: c.hex, alt,
      zoom: pics.map(m => m.url), // full-size originals, fetched only when the shopper opens a photo; one per gallery photo
      dir: `${imgPrefix(page, c.code)}img/${c.code}/` };
  });
}

// Shared by every generated page and the automatic shell, so the two never drift apart.
const CAMPAIGN_CSS = `
body[data-campaign] .atelier-heading{font-size:clamp(28px,4vw,42px);line-height:1.35;margin:0}
body[data-campaign] .campaign-trust{margin:0;font-size:14px;color:var(--muted)}
body[data-campaign] .campaign-jump{display:block;padding:15px;text-align:center;background:var(--accent);color:#fff;text-decoration:none;font-weight:600}
body[data-campaign] #lpAddCart[hidden]{display:none!important}
body[data-campaign] .hero img,body[data-campaign] .gallery img{cursor:zoom-in}
body[data-campaign] .hero{background:var(--surface)}
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
.head > .row{display:flex;justify-content:space-between;align-items:baseline;gap:12px}
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
.browse-home{display:inline-flex;align-items:center;gap:8px;align-self:flex-start;width:fit-content;max-width:100%;min-height:40px;margin-top:8px;padding:8px 12px;border:1px solid var(--cyan);border-radius:0;background:transparent;color:var(--ink);font-size:13px;line-height:1.5;text-decoration:none}
.browse-home::before{content:"↩";color:var(--cyan);font-size:15px;line-height:1}
.browse-home:hover{border-color:var(--gold);background:var(--elev)}
.browse-home:focus-visible{outline:2px solid var(--cyan);outline-offset:3px}
.browse-home--top{align-self:auto;flex:none;margin:0;min-height:40px;padding:0 10px;font-size:12px;white-space:nowrap}
.browse-home__compact{display:none}
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
#lpCartCount:empty{display:none!important}#lpCartCount{margin-inline-start:5px}#lpCartCount::before{content:"("}#lpCartCount::after{content:")"}
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
/* Premium pass (2026-11-04): product photo first, one-line header and buttons, truthful trust strip, zoomable photos. */
.top{display:flex;align-items:center;gap:14px}.top .jump{margin-inline-start:auto;white-space:nowrap}
#lpCartLink{white-space:nowrap;border:0;background:var(--paper);padding:0 14px}
.trust{display:flex;flex-wrap:wrap;gap:6px;margin:0;padding:0;list-style:none}
.trust li{font-size:12.5px;line-height:1.4;padding:7px 10px;background:var(--paper);color:var(--ink)}
.trust li::before{content:"✓";margin-inline-end:6px;color:var(--gold)}
#lpMore:not(:empty)::before{content:"تفاصيل القطعة";display:block;margin-bottom:4px;font-weight:600;color:var(--ink)}
.bar button{white-space:nowrap}#lpAddCart{border-radius:0;border-color:var(--accent);color:var(--accent)}
.hero img,.gallery img{cursor:zoom-in}#lpFormColors{order:0}html:not(.hl) .gallery img{display:none}
/* Brand fonts download after the hero photo; until then text uses the system Arabic font (same weights). */
html:not(.hl){--f:"Segoe UI",Tahoma,"Noto Sans Arabic",sans-serif}html:not(.hl) .atelier-heading,html:not(.hl) .reassurance{font-family:var(--f)}
@media(max-width:899px){.top{padding:10px 16px;gap:10px}.mark{font-size:20px;letter-spacing:.3em}.top .jump{font-size:13px}#lpCartLink{font-size:13px;padding:0 10px}
.page{padding:0 16px 40px;gap:18px}.hero{order:0;width:auto;height:auto;aspect-ratio:4/5;margin-inline:-16px}.hero img{height:100%;object-position:50% 30%}
.atelier-heading{order:1;font-size:26px}.head{order:2}.trust{order:2}
.gallery{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}.gallery img{width:100%;height:auto;aspect-ratio:4/5}
.bar>div{gap:8px}.bar .sum{flex:none}#lpAddCart{flex:1 1 0;padding:0 6px;font-size:13px}#lpOrder{flex:1.25 1 0;font-size:15px}}
@media(min-width:560px) and (max-width:899px){.hero{margin-inline:auto}}
/* Dark Luxury (2026-11-06), same identity as the shared storefront overlay: midnight navy grounds, white text,
   neon purple for the buy button only, electric cyan for selection/links/focus, product photos on a light canvas (true garment colours),
   square edges, light large type. Readex Pro only (Rakkas is no longer drawn on ordinary pages). */
:root{--bg:#050B1C;--paper:#0B1730;--chalk:#0B1730;--elev:#111F3A;--surface:#F4F6FA;--line:#253452;--ink:#FFFFFF;--accent:#D100D1;--accent-hover:#AE00B8;--mauve:#D100D1;--cyan:#2ED9D1;--rose:#253452;--wash:#0B1730;--muted:#AAB5C8;--gold:#2ED9D1;--danger:#FF8A9A;--field:rgba(170,181,200,.5);color-scheme:dark}
:focus-visible,a:focus-visible,button:focus-visible,.lp-opt input:focus-visible+span{outline-color:var(--cyan)}
.hero,.gallery img{background:var(--surface)}
h1:empty{background:var(--elev)}
.video{background:var(--elev)}
.notes,.lp-opt input:disabled+span{color:var(--muted)}
#lpStatus[data-error="true"],.f small{color:var(--danger)}
.f [aria-invalid="true"]{border-color:var(--danger)}
.step button:disabled{color:rgba(170,181,200,.45)}
.chip i{box-shadow:0 0 0 1px rgba(255,255,255,.4)}
#lpMix #lpMixToggle{background:transparent;color:var(--ink);border:1px solid var(--cyan)}
#lpMix #lpMixRows button{background:var(--elev)}
body{font-weight:400}
.top{border-bottom:1px solid var(--line);background:var(--bg);position:sticky;top:0;z-index:6}
.mark{font-weight:600;letter-spacing:.34em;line-height:1;gap:4px}
.mark::after{content:"SHOP";width:auto;height:auto;background:none;font:400 8px/1 var(--f);letter-spacing:.38em;color:var(--muted)}
.top .jump{font-size:13px;text-decoration:none;border-bottom:1px solid var(--cyan);padding:4px 0}
#lpCartLink{background:transparent;color:var(--ink);border:0;box-shadow:inset 0 0 0 1px var(--cyan)}
body:not([data-campaign]) .atelier-heading{font:400 11px/1.6 var(--f);letter-spacing:.22em;color:var(--cyan);margin:0}
.head{gap:8px}
.head > .row{flex-direction:column;align-items:flex-start;gap:6px}
h1{font-weight:300;font-size:30px;line-height:1.25;letter-spacing:-.015em}
.price{font-size:24px;font-weight:600}
.price small{font-size:13px}
.desc{color:var(--muted)}
.trust{gap:0;border-block:1px solid var(--line)}
.trust li{background:none;padding:11px 12px 11px 0;font-size:12px}
.trust li::before{content:"";display:inline-block;width:5px;height:5px;background:var(--gold);transform:rotate(45deg);vertical-align:middle;margin-inline-end:8px}
.pick legend,.lp-opt legend{font-weight:500;font-size:13px;letter-spacing:.02em}
.chip,.lp-opt span,.one{border-radius:0!important;background:var(--elev);color:var(--ink);border:1px solid var(--line);min-height:46px}
.chip[aria-pressed="true"],.lp-opt input:checked+span{background:var(--elev);color:var(--ink);border-color:var(--cyan);box-shadow:inset 0 0 0 1px var(--cyan);font-weight:600}
.chip i{border-radius:50%}
.gallery img{border-radius:0}
.order{background:var(--chalk);border:1px solid var(--line);padding:22px 18px}
.order h2{font-weight:300;font-size:26px;letter-spacing:-.01em}
.order h2 small{font-size:13px;color:var(--muted);margin-top:4px}
.f{font-weight:500;font-size:13px}
.f input,.f select,.f textarea{background-color:var(--elev);color:var(--ink);border:1px solid var(--field);border-radius:0}
.f input:focus,.f select:focus,.f textarea:focus{outline:0;border-color:var(--cyan);background-color:var(--elev);box-shadow:inset 0 0 0 1px var(--cyan)}
.order .step,.order .step button{background:var(--elev)}
.totals{border-top:1px solid var(--line)!important;padding-top:14px}
#lpOrder{background:var(--accent);color:#fff;border-radius:0;font-weight:500;letter-spacing:.04em}
#lpOrder:enabled:is(:hover,:active){background:var(--accent-hover)}
#lpOrder:disabled{background:var(--elev);color:var(--muted)}
#lpAddCart{border:1px solid var(--cyan);color:var(--ink);background:transparent;border-radius:0;font-weight:500}
.reassurance{font:300 24px/1.35 var(--f);letter-spacing:-.01em}
.notes{background:none;border-block:1px solid var(--line);padding:6px 0}
.notes li{padding-inline-start:16px;position:relative}
.notes li::before{content:"";position:absolute;inset-inline-start:0;top:.65em;width:5px;height:5px;background:var(--gold);transform:rotate(45deg)}
.done{background:var(--chalk);border:1px solid var(--line)}
.done .tick{border-radius:0;background:var(--cyan);color:var(--bg)}
.done a{color:var(--cyan)}
footer{background:var(--chalk);color:var(--muted);border-top:1px solid var(--line)}
footer strong{font-weight:300;letter-spacing:.2em}
@media(max-width:899px){
.page{gap:16px}
.bar{background:var(--bg);border:0;border-top:1px solid var(--rose)}
.bar .sum b{color:var(--ink)}.bar .sum span{color:var(--muted)}
/* floating editorial card over the photo: name, price and promises reach the first screen */
body:not([data-campaign]) .atelier-heading{position:relative;z-index:1;margin:-88px 12px 0;padding:18px 18px 0;background:var(--bg);border-top:2px solid var(--gold)}
body:not([data-campaign]) .head{position:relative;z-index:1;margin:-16px 12px 0;padding:10px 18px 16px;background:var(--bg)}
}
@media(min-width:900px){
.top{padding:16px 32px}
.top>a.browse-home--top{flex:0 1 auto;min-width:0;padding-inline:12px;white-space:normal;text-align:center}
.media{position:sticky;top:84px}
h1{font-size:44px}.price{font-size:28px}
.info{gap:22px}
}
body{background:transparent}
/* Product gallery (2026-11-06): the whole garment stays visible (3:4 photos shown with contain, never cropped or covered),
   one colour's photos at a time, thumbnails under the photo (beside it on desktop), arrows, swipe and a 1/4 counter.
   Id selectors win over the older layered skins above (hero heights, 4:5 boxes, the floating card). */
#lpStage{position:relative;min-width:0;touch-action:pan-y}
#lpStage [hidden]{display:none!important}
#lpHero{display:block;width:100%;height:auto;aspect-ratio:3/4;margin:0;border-radius:0;overflow:hidden;background:var(--surface)}
#lpHero img{width:100%;height:100%;object-fit:contain;object-position:50% 50%;border-radius:0}
#lpStage .nav{position:absolute;top:50%;translate:0 -50%;z-index:1;display:grid;place-items:center;width:44px;height:44px;padding:0;border:1px solid rgba(255,255,255,.3);border-radius:0;background:rgba(5,11,28,.6);color:#fff;cursor:pointer}
#lpStage .nav:hover{background:rgba(5,11,28,.85)}
#lpPrev{inset-inline-start:8px}#lpNext{inset-inline-end:8px}
#lpCount{position:absolute;top:10px;inset-inline-end:10px;z-index:1;padding:2px 10px;background:rgba(5,11,28,.72);color:#fff;font:500 12px/1.7 var(--f);font-variant-numeric:tabular-nums;letter-spacing:.08em;pointer-events:none}
#lpGallery{order:0;display:flex;gap:8px;margin:0;padding:0}
#lpGallery:empty{display:none}
#lpGallery button{flex:none;width:48px;aspect-ratio:3/4;padding:0;border:1px solid var(--line);border-radius:0;background:var(--surface);cursor:pointer;overflow:hidden}
#lpGallery button[aria-current="true"]{border-color:var(--cyan);box-shadow:0 0 0 1px var(--cyan)}
#lpGallery img{width:100%;height:100%;aspect-ratio:auto;object-fit:contain;border-radius:0;cursor:pointer;vertical-align:top;background:none}
@media(max-width:899px){
#lpStage{order:0;margin-inline:-16px}
#lpGallery{margin-top:-6px}
body:not([data-campaign]) .atelier-heading,body:not([data-campaign]) .head{margin:0;padding:0;border:0}
}
@media(min-width:560px) and (max-width:899px){#lpStage,#lpGallery{width:min(100%,520px);align-self:center;margin-inline:auto}}
@media(min-width:900px){
.media{display:grid;grid-template-columns:56px minmax(0,1fr);gap:12px;align-items:start}
#lpStage{grid-column:2;grid-row:1}
#lpGallery{grid-column:1;grid-row:1;flex-direction:column}
#lpGallery button{width:56px}
#lpHero{max-height:calc(100dvh - 110px)}
}
/* Theme (2026-11-06): the last hard-coded dark values become tokens. */
.step button:disabled{color:var(--off)}
.chip i{box-shadow:0 0 0 1px var(--ring)}
/* small phones: tighter header gaps, and under 375px the "jump to form" link goes (the fixed bar's buy button does the same) */
@media(max-width:420px){.top{gap:4px;padding-inline:8px}.mark{font-size:18px;letter-spacing:.18em}.top .jump{font-size:11px}#lpCartLink{font-size:11px;padding-inline:6px}.browse-home--top{font-size:10px;padding-inline:5px;gap:4px}.browse-home__wide{display:none}.browse-home__compact{display:inline}}
@media(max-width:374px){.top .jump{display:none}}
/* LP mobile purchase flow: options before descriptions, an unclipped catalogue return link. */
html .head > .pick,html .head > #lpOptions{order:0}
html .head > #lpDesc,html .head > #lpMore{order:1}
.head > #lpOptions:empty{display:none}
@media(max-width:899px){
.top{display:grid;grid-template-columns:auto minmax(0,1fr) auto;grid-template-areas:"brand jump cart" "browse browse browse";gap:8px;padding:10px 12px}
.top .mark{grid-area:brand;min-width:0}
.top .jump{grid-area:jump;justify-self:center;margin:0;min-width:0;overflow:hidden;text-overflow:ellipsis}
.top #lpCartLink{grid-area:cart}
.top .browse-home--top{grid-area:browse;justify-self:stretch;justify-content:center;width:100%;min-width:0;min-height:44px;margin:0;padding:9px 12px;border:1px solid var(--cyan);border-radius:10px;background:var(--elev);color:var(--ink);font-size:14px;font-weight:600;white-space:normal}
.top .browse-home__wide{display:none}
.top .browse-home__compact{display:inline}
}
@media(max-width:374px){.top{grid-template-columns:auto minmax(0,1fr);grid-template-areas:"brand cart" "browse browse"}.top #lpCartLink{justify-self:end}}
/* Neutral look (2026-11-21), the same identity as the home (css/neutral.css): warm off-white canvas, near-black ink and buttons,
   rounded cards and pills, glass header and buy bar, Alexandria titles, Manrope prices. Light only (no theme switch).
   Fields and the stepper use a darker hairline (#8F8A86, 3.5:1 on white) so their edges stay visible. */
:root{--bg:#FAFAF9;--paper:#FFFFFF;--chalk:#FFFFFF;--wash:#FFFFFF;--elev:#F2F1EF;--surface:#F2F1EF;--line:#E7E5E4;--rose:#E7E5E4;--field:#8F8A86;--ink:#111111;--muted:#6B6966;
 --accent:#111111;--accent-hover:#000000;--mauve:#111111;--cyan:#111111;--gold:#111111;--danger:#B42318;--nx-accent:#C8102E;--ring:rgba(17,17,17,.22);--off:rgba(107,105,102,.45);
 --f:"IBM Plex Sans Arabic","Segoe UI",Tahoma,"Noto Sans Arabic",sans-serif;--f-display:"Alexandria","IBM Plex Sans Arabic","Segoe UI",Tahoma,sans-serif;--f-num:"Manrope","IBM Plex Sans Arabic","Segoe UI",Tahoma,sans-serif;color-scheme:light}
html:not(.hl){--f-display:var(--f);--f-num:var(--f)}
html{background:var(--bg)}
::selection{background:#111;color:#fff}
:focus-visible,a:focus-visible,button:focus-visible,.lp-opt input:focus-visible+span{outline:2px solid #111;outline-offset:3px}
.top{background:rgba(250,250,249,.86);-webkit-backdrop-filter:saturate(1.6) blur(14px);backdrop-filter:saturate(1.6) blur(14px);border-bottom:1px solid var(--line)}
.mark{justify-content:center;min-height:44px}
.mark::before,.mark::after{content:none}
.shop-wordmark{display:inline-flex;align-items:baseline;gap:6px;unicode-bidi:isolate;white-space:nowrap}
.shop-wordmark>b{font:800 clamp(20px,4vw,24px)/1 var(--f-num);letter-spacing:-.03em;color:var(--ink)}
.shop-wordmark>small{font:400 13px/1 var(--f);letter-spacing:.055em;color:var(--muted)}
.top .jump{border-bottom:1.5px solid var(--nx-accent)}
#lpCartLink{border-radius:999px;background:#fff;box-shadow:inset 0 0 0 1px var(--line);padding:0 14px}
.browse-home::before{color:var(--ink)}
.top .browse-home--top{border:1px solid var(--line);border-radius:14px;background:#fff}
#lpHero{background:var(--surface)}
#lpStage .nav{border:0;border-radius:50%;background:rgba(255,255,255,.85);color:#111;box-shadow:0 6px 18px -6px rgba(0,0,0,.3)}
#lpStage .nav:hover{background:#fff}
#lpCount{border-radius:999px;background:rgba(17,17,17,.72);font-family:var(--f-num);letter-spacing:.04em}
#lpGallery button{border:1px solid var(--line);border-radius:12px;background:var(--surface)}
#lpGallery button[aria-current="true"]{border:2px solid #111;box-shadow:none}
body:not([data-campaign]) .atelier-heading{font:500 12px/1.6 var(--f);letter-spacing:.06em;color:var(--muted)}
body:not([data-campaign]) .atelier-heading::before{content:"";display:inline-block;width:7px;height:7px;margin-inline-end:8px;border-radius:50%;background:var(--nx-accent);vertical-align:middle}
body[data-campaign] .atelier-heading{font-family:var(--f-display);font-weight:800}
#lpTitle{font:800 26px/1.35 var(--f-display);letter-spacing:-.01em}
.head .price{font:800 26px/1.2 var(--f-num);letter-spacing:-.02em}
.head .price small{font:400 13px var(--f);color:var(--muted)}
.trust{gap:8px;border:0}
.trust li{padding:8px 12px;border-radius:999px;background:#fff;box-shadow:inset 0 0 0 1px var(--line)}
.trust li::before{width:6px;height:6px;border-radius:50%;background:#047857;transform:none}
.chip,.lp-opt span{border-radius:999px!important;background:#fff;border:1px solid var(--line);min-height:44px}
.chip[aria-pressed="true"],.lp-opt input:checked+span{background:var(--elev);border:2px solid #111;box-shadow:none;font-weight:600}
.chip i{width:22px;height:22px}
.one{border-radius:16px!important;min-height:52px;padding:0 20px;border:0;background:var(--elev);box-shadow:none}
.order{background:#fff;border:1px solid var(--line);border-radius:22px;box-shadow:0 22px 44px -32px rgba(0,0,0,.3)}
.order h2{font:800 22px/1.35 var(--f-display);letter-spacing:-.01em}
.order h2 small{font:400 13px/1.7 var(--f);color:var(--muted)}
.order #lpMix{border-radius:16px;background:var(--bg)}#lpMix #lpMixToggle{border-radius:12px}
.order .step{border-radius:14px!important;background:#fff;box-shadow:inset 0 0 0 1px var(--field)}
.order .step button{background:transparent}
.f input,.f select,.f textarea{border:1px solid var(--field);border-radius:14px;background-color:#fff}
.f input:focus,.f select:focus,.f textarea:focus{border-color:#111;background-color:#fff;box-shadow:0 0 0 3px rgba(17,17,17,.12)}
.totals .total dd,.bar .sum b{font-family:var(--f-num);font-weight:800}
/* The beam repaints every frame on the main thread: it starts 3 s in, after the first screen (LCP) has painted. */
@property --nx-b{syntax:"<angle>";inherits:false;initial-value:0deg}
#lpOrder,#lpAddCart{border-radius:16px;font-family:var(--f-display);font-weight:800;letter-spacing:0}
#lpOrder:enabled{border:2px solid transparent;background:linear-gradient(135deg,#1c1c1c,#000) padding-box,conic-gradient(from var(--nx-b),transparent 0 60%,#fff 78%,transparent 90%) border-box,linear-gradient(#000,#000) border-box;box-shadow:0 14px 30px -12px rgba(0,0,0,.4);animation:nx-beam 3.5s linear 3s infinite}
#lpOrder:enabled:is(:hover,:active){background:#000}
#lpOrder:disabled{background:var(--elev);color:var(--muted)}
#lpAddCart{border:1.5px solid #111;background:#fff;color:#111}
@keyframes nx-beam{to{--nx-b:360deg}}
.reassurance{font:800 22px/1.4 var(--f-display)}
.notes li::before{background:var(--nx-accent)}
.done{background:#fff;border:1px solid var(--line);border-radius:22px}
.done .tick{border-radius:50%;background:#111;color:#fff}
.done a{color:#111}
footer{background:#111;color:rgba(255,255,255,.72);border:0}
footer strong{color:#fff;font:800 clamp(28px,5vw,64px)/1.1 var(--f-num);letter-spacing:-.02em}
body[data-campaign] .campaign-jump{border-radius:16px}
@media(max-width:899px){
.bar{background:rgba(250,250,249,.9);-webkit-backdrop-filter:saturate(1.6) blur(16px);backdrop-filter:saturate(1.6) blur(16px);border-top:1px solid var(--line)}
#lpGallery{gap:10px;margin-top:2px}#lpGallery button{width:64px}
}
@media(min-width:900px){#lpHero{border-radius:24px!important}#lpTitle{font-size:38px}.head .price{font-size:30px}}
/* Trust strip with line icons, the size question and the WhatsApp button (2026-11-22). The button sits on the photo side,
   above the fixed buy bar on phones, so it never covers the order button. */
.trust li{display:inline-flex;align-items:center;gap:6px}.trust li::before{display:none}
.trust svg,.wa-size svg{width:18px;height:18px;flex:none;fill:none;stroke:currentColor;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round}
#lpOptions:has(.one)+.wa-size{display:none}
.wa-size{display:inline-flex;align-items:center;gap:6px;align-self:flex-start;min-height:44px;font-size:13px;color:var(--ink);text-underline-offset:3px}
.wa-fab{position:fixed;z-index:6;inset-inline-start:max(16px,env(safe-area-inset-right,0px));bottom:calc(24px + env(safe-area-inset-bottom,0px));width:52px;height:52px;display:grid;place-items:center;border-radius:50%;background:#128C7E;color:#fff;box-shadow:0 10px 24px -10px rgba(0,0,0,.45)}
.wa-fab svg{width:26px;height:26px;fill:none;stroke:currentColor;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round}
@media(max-width:899px){.wa-fab{bottom:calc(96px + env(safe-area-inset-bottom,0px))}}
#lpColourDiscovery{box-sizing:border-box;display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:10px;min-height:44px;margin-top:8px;padding:11px 14px;background:var(--elev);border:1px solid var(--cyan);color:var(--ink);font:600 14px/1.6 var(--f);text-decoration:none;max-width:100%}
#lpColourDiscovery::after{content:"↓";color:var(--cyan);font-size:19px;line-height:1}
#lpColourDiscovery[hidden]{display:none}
#lpColourDiscovery:focus-visible{outline:2px solid var(--cyan);outline-offset:3px}
@media(max-width:899px){#lpColourDiscovery{order:0;margin:0 0 4px;font-size:13px}}
@media(min-width:900px){#lpColourDiscovery{grid-column:1/-1;grid-row:2}}
#lpColors,#lpOptions{scroll-margin-top:140px}
#lpColourDiscovery .lp-discovery-copy{flex:1 1 205px;min-width:0}
#lpColourDiscovery .lp-discovery-swatches{display:inline-flex;gap:6px;align-items:center}
#lpColourDiscovery .lp-discovery-swatch{display:inline-block;flex:0 0 16px;width:16px;height:16px;border-radius:50%;border:1px solid var(--line);box-shadow:0 0 0 1px var(--ring)}
@media(max-width:899px){#lpGallery{width:100%;max-width:100%;box-sizing:border-box;gap:10px;min-width:0;overflow-x:auto;overflow-y:hidden;scroll-snap-type:x proximity;padding:7px 4px 12px;scrollbar-width:thin}#lpGallery[data-layout="centered"]{justify-content:center}#lpGallery[data-layout="strip"]{justify-content:flex-start}#lpGallery button{flex:0 0 64px;width:64px;scroll-snap-align:start}}
@media(min-width:560px) and (max-width:899px){#lpGallery{width:min(100%,520px)}}
@media(min-width:900px){#lpGallery{max-height:min(70vh,640px);overflow-y:auto;overscroll-behavior:contain;scrollbar-width:thin}}
.chip.lp-colour-card,.lp-opt .lp-colour-card{display:inline-flex;flex-direction:column;align-items:center;gap:6px;min-width:68px;padding:6px 8px;border-radius:12px!important;text-align:center;line-height:1.35}
.chip.lp-colour-card[aria-pressed="true"],.lp-opt input:checked+.lp-colour-card{border:1px solid #111;box-shadow:inset 0 0 0 1px #111}
.lp-colour-thumb,.chip .lp-colour-thumb{display:block;width:52px;height:52px;border-radius:8px;flex:none;overflow:hidden;background:var(--elev);box-shadow:0 0 0 1px var(--ring)}
.lp-colour-thumb img{display:block;width:100%;height:100%;object-fit:cover;object-position:50% 35%}
.lp-colour-thumb img:not([src]){visibility:hidden}
#lpMix{border:1px solid var(--line);padding:14px;background:var(--bg);margin:6px 0}
#lpMix [hidden]{display:none!important}
#lpMixToggle{background:var(--accent);color:#fff;border:0;min-height:44px;padding:10px 12px;width:100%;font:600 14px var(--f);cursor:pointer}
#lpMixHint{font-size:13px;margin:10px 0;color:var(--muted)}
#lpMixRows{display:grid;gap:10px;margin-top:12px}
.lp-mix-row{display:flex;align-items:center;justify-content:space-between;gap:8px;border-bottom:1px solid var(--line);padding:5px 0 10px}
.lp-mix-color{display:flex;align-items:center;gap:8px;font-size:14px;font-weight:600;min-width:0}
.lp-mix-color .lp-colour-thumb{width:36px;height:36px}
.lp-mix-step{display:flex;align-items:center;gap:6px;flex:none}
#lpMixRows button{min-width:44px;min-height:44px;border:1px solid var(--line);background:var(--paper);font:600 20px var(--f);color:var(--ink)}
#lpMixRows button:disabled{opacity:.35}
#lpMixRows output{min-width:27px;text-align:center;font-weight:600}
`;

const chevron = (d) => `<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="${d}" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>`;
/** Arrows and "1/4" over the main photo (RTL: previous on the right, next on the left). Hidden for a single photo;
 *  lp/runtime.js shows them again when a colour or live product has more photos. */
const stageControls = (n) => { const h = n > 1 ? "" : " hidden";
  return `<button type="button" class="nav" id="lpPrev" aria-label="الصورة السابقة"${h}>${chevron("M9 5l7 7-7 7")}</button>`
    + `<button type="button" class="nav" id="lpNext" aria-label="الصورة التالية"${h}>${chevron("M15 5l-7 7 7 7")}</button>`
    + `<span class="count" id="lpCount" dir="ltr" aria-live="polite"${h}>1/${n}</span>`; };
/** Same buttons lp/runtime.js setShots builds, so the first colour needs no repaint. */
const thumbs = (c, n) => n < 2 ? "" : c.zoom.map((_, i) => `<button type="button" data-i="${i}" aria-label="اعرضي الصورة ${i + 1} من ${n}" aria-current="${i === 0}">`
  + `<img src="${photoFiles(c.dir, i).thumb}" alt="" width="240" height="320" loading="lazy" decoding="async"></button>`).join("");
// Gallery thumbnails stay unloaded (display:none + lazy) until the hero photo arrives, so on slow networks the
// hero gets the whole connection instead of sharing it with photos below the fold.
// html.hl (fonts, gallery photos) only after the hero photo has painted, so nothing else competes with the LCP paint.
const HERO_READY = ` onload="requestAnimationFrame(()=>setTimeout(()=>document.documentElement.classList.add('hl')))" onerror="document.documentElement.classList.add('hl')"`;

const DEFAULT_BENEFITS = ["الدفع عند الاستلام، من غير دفع مقدم", "اختيار المحافظة لمعرفة مصاريف الشحن والإجمالي قبل التأكيد", "هنكلمك نأكد التوافر وميعاد الشحن قبل ما نبعت الطلب."];

const icon = (d) => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${d}"/></svg>`;
/** The same three promises as the home's trust row, with line icons (cash, eye, truck). */
export const TRUST = `<ul class="trust" aria-label="مميزات الطلب">${[
  ["M2.5 6.5h19v11h-19zM12 9.5a2.5 2.5 0 1 0 0 5a2.5 2.5 0 1 0 0-5", "الدفع عند الاستلام"],
  ["M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12zM12 9a3 3 0 1 0 0 6a3 3 0 1 0 0-6", "عايني قبل ما تدفعي"],
  ["M2 6h12v10H2zM14 10h4.5L22 13.5V16h-8zM6 18.5a1.8 1.8 0 1 0 0 .01M17 18.5a1.8 1.8 0 1 0 0 .01", "شحن لكل المحافظات"],
].map(([d, t]) => `<li>${icon(d)}${t}</li>`).join("")}</ul>`;
const WA_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3.5 20.5l1.3-4.4a8.5 8.5 0 1 1 3.2 3.1z"/><path d="M9.2 8.2c-.4 2.9 3.6 6.9 6.6 6.6l.9-1.6-2.1-1.1-1 .9a5 5 0 0 1-2.6-2.6l.9-1-1.1-2.1z"/></svg>';
const SHARE_IMAGE = "https://selectshopeg.com/assets/og/og-share.jpg";
const SHARE_TEXT = "عايني قبل ما تدفعي · الدفع عند الاستلام · شحن لكل المحافظات";

// Starts the product and governorate reads while the runtime module downloads; lp/runtime.js picks them up once.
export const PREFETCH = (codeExpr) => `(()=>{try{if(window.__lpGo)return;const A="${API}",c=${codeExpr};if(!/^SS-\\d{4,19}$/.test(c)){location.replace("/");return}const g=p=>fetch(A+p,{cache:"no-store",headers:{Accept:"application/json"}});window.__lp={code:c,product:g("/product/"+c),regions:g("/regions")}}catch(e){}})()`;

const field = (name, label, control) => `<label class="f"><span>${label}</span>${control}<small id="lpErr-${name}" aria-live="polite"></small></label>`;
const ORDER_FORM = `<form class="order" id="lpForm" novalidate>
<h2>تسجيل الطلب<small>اكتبي بياناتك، وهنكلمك نأكد معاكي التوافر وميعاد الشحن.</small></h2>
<div class="qty"><span id="lpQtyLabel">الكمية</span><div class="step" role="group" aria-labelledby="lpQtyLabel"><button type="button" id="lpQtyUp" data-q="1" aria-label="زوّدي واحدة">+</button><output id="lpQty" aria-live="polite">١</output><button type="button" id="lpQtyDown" data-q="-1" aria-label="قلّلي واحدة" disabled>−</button></div></div>
${field("name", "الاسم", `<input name="name" autocomplete="name" maxlength="200" enterkeyhint="next" required>`)}
${field("phone", "رقم الموبايل", `<input name="phone" type="tel" inputmode="tel" autocomplete="tel" maxlength="20" placeholder="01xxxxxxxxx" dir="ltr" enterkeyhint="next" required>`)}
${field("region", "المحافظة", `<select name="region" autocomplete="address-level1" required><option value="">اختيار المحافظة</option></select>`)}
${field("address", "العنوان بالتفصيل", `<textarea name="address" rows="2" autocomplete="street-address" maxlength="860" placeholder="المنطقة، الشارع، رقم العمارة والدور" enterkeyhint="done" required></textarea>`)}
<dl class="totals"><div><dt>سعر القطع</dt><dd id="lpSub">—</dd></div><div><dt>الشحن</dt><dd id="lpShip">اختيار المحافظة</dd></div><div class="total"><dt>الإجمالي</dt><dd id="lpTotal">—</dd></div></dl>
<p class="cod">مفيش دفع أونلاين. هتدفعي الإجمالي ده كاش للمندوب.</p>
</form>
<section class="done" id="lpDone" tabindex="-1" hidden><span class="tick" aria-hidden="true">✓</span><h2>تم تسجيل طلبك</h2><p>رقم الطلب</p><strong id="lpDoneCode" dir="ltr"></strong><p id="lpDoneText"></p><a href="/">عرض قطع أخرى</a></section>`;

/** One layout for both kinds of page. `o` holds already-escaped HTML fragments. */
function layout(o) {
  const campaign = o.campaign;
  // Keep the exact same colour choices visible when a shopper jumps straight
  // from "تسجيل الطلب" to the COD form; the first picker remains by the photo.
  const checkoutPicker = o.picker
    ? o.picker.replace('id="lpColors"', 'id="lpFormColors"')
      .replace('id="lpColorName"', 'id="lpFormColorName"')
    : "";
  const orderForm = checkoutPicker
    ? ORDER_FORM.replace('</small></h2>', '</small></h2>\n' + checkoutPicker)
    : ORDER_FORM;
  // Product Landing Studio is part of the shared runtime, so every LP must fetch this release.
  const runtimeVersion = "20261123-sizing";
  const wa = esc(o.wa);
  return `<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="robots" content="noindex, follow">
<meta name="theme-color" content="#FAFAF9">
<meta name="referrer" content="strict-origin-when-cross-origin">
<!-- Generated by tooling/build-lp.mjs${o.source}. Do not edit by hand. -->
<title>${o.title}</title>
<meta name="description" content="${o.description}">
<meta property="og:type" content="${o.ogType}">
<meta property="og:site_name" content="SELECT SHOP">
<meta property="og:locale" content="ar_EG">
${o.ogUrl ? `<meta property="og:url" content="${o.ogUrl}">\n` : ""}<meta property="og:title" content="${o.ogTitle}">
<meta property="og:description" content="${SHARE_TEXT}">
<meta property="og:image" content="${o.ogImage}">
<meta name="twitter:card" content="summary_large_image">
${o.canonical}<link rel="icon" href="/assets/icons/favicon.svg" type="image/svg+xml">
${o.preload}<link rel="preconnect" href="https://byluoipdunralsurwebt.supabase.co" crossorigin>
${o.route || ""}<script id="lp-ab">${AB_SNIPPET}</script>
<script id="lp-prefetch">${PREFETCH(o.codeExpr)}</script>
<style>
${o.fontFaces}
${CSS}${campaign ? "\n" + CAMPAIGN_CSS : ""}</style>
</head>
<body${campaign ? ' data-campaign="focused"' : ""}>
<header class="top"><a class="mark" href="/" aria-label="SELECT SHOP الرئيسية"><span class="shop-wordmark" dir="ltr"><b>select</b><small>shop</small></span></a><a class="jump" href="#lpForm">تسجيل الطلب</a>${campaign?.directOnly ? "" : '<a href="/cart/" id="lpCartLink" aria-label="شنطة التسوق">الشنطة <span id="lpCartCount"></span></a>'}<a href="/" class="browse-home browse-home--top" aria-label="للرجوع للرئيسية لاختيار موديلات أكثر" title="للرجوع للرئيسية لاختيار موديلات أكثر"><span class="browse-home__wide">للرجوع للرئيسية لاختيار موديلات أكثر</span><span class="browse-home__compact">اكتشف موديلات أكتر</span></a></header>
<main class="page">
<div class="media">
<div class="stage" id="lpStage">
<picture class="hero" id="lpHero">${o.hero}</picture>
${stageControls(o.count)}
</div>
<div class="gallery" id="lpGallery" aria-label="صور القطعة">${o.gallery}</div>
</div>
<div class="info">
<p class="atelier-heading">${campaign ? esc(campaign.headline) : "تفاصيل تكمّل إطلالتك"}</p>
<div class="head"><div class="row"><h1 id="lpTitle">${o.h1}</h1><p class="price"><span id="lpPrice">${o.price}</span><small>جنيه</small></p></div>
${o.picker ? o.picker + "\n" : ""}<div id="lpOptions">${o.options}</div>
<a class="wa-size" href="${wa}" data-wa rel="noopener">${WA_ICON}محتارة في المقاس؟ اسألينا على واتساب</a>\n<p class="desc" id="lpDesc">${o.desc}</p>\n<div class="desc product-details" id="lpMore">${o.more}</div></div>
${TRUST}
${campaign ? `<a class="campaign-jump" href="#lpForm">اختيار الكمية وتسجيل الطلب</a>\n` : ""}${orderForm}
<p id="lpStatus" role="status" aria-live="polite"></p>
<div class="bar"><div><span class="sum" aria-hidden="true"><b id="lpBarPrice">${o.price === "—" ? "—" : o.price + " ج"}</b><span id="lpBarChoice">${o.choice}</span></span><button type="button" id="lpAddCart"${campaign?.directOnly ? " hidden" : ""} disabled>إضافة للشنطة</button><button type="submit" form="lpForm" id="lpOrder" disabled>تأكيد الطلب</button></div></div>
<h2 class="reassurance">طلبك واضح من البداية</h2>
<ul class="notes">${o.benefits.map(t => `<li>${esc(t)}</li>`).join("")}</ul>

${o.video}
</div>
</main>
<a class="wa-fab" href="${wa}" data-wa rel="noopener" aria-label="كلمينا على واتساب">${WA_ICON}</a>
<footer><strong dir="ltr">SELECT SHOP</strong><p>الدفع نقدًا عند الاستلام · اختيار اللون والمقاس قبل تأكيد الطلب</p></footer>
<noscript><p style="text-align:center">${o.noscript}</p></noscript>
<script type="application/json" id="lp-data">${o.data}</script>
${o.scripts}<script type="module" src="/lp/runtime.js?v=${runtimeVersion}"></script>
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
  const hero = photoFiles(first.dir, 0), count = first.zoom.length;
  const lines = String(product.description || "").split("\n").map(l => l.trim()).filter(Boolean).slice(0, 6);
  const oneSize = Array.isArray(product.options) && product.options.length === 0;
  const url = `https://selectshopeg.com/lp/${esc(page.id)}/`;
  const picker = colors.length > 1 ? `<fieldset class="pick" id="lpColors"><legend>اللون: <span id="lpColorName">${esc(first.name)}</span></legend><div class="row">${colors.map((c, i) =>
    `<button type="button" class="chip lp-colour-card" data-code="${esc(c.code)}" aria-pressed="${i === 0}"><i class="lp-colour-thumb" aria-hidden="true" style="background:${esc(c.hex)}"><img data-colour-src="${esc(firstColourThumb(c.dir))}" alt="" width="52" height="52" loading="lazy" decoding="async" fetchpriority="low"></i>${esc(c.name)}</button>`).join("")}</div></fieldset>` : "";
  return layout({
    campaign: page.campaign,
    source: ` from tooling/pages/${esc(page.id)}.json`,
    title: `${esc(title)} · ${price} ج · SELECT SHOP`,
    description: `${esc(title)} بـ ${price} جنيه. عايني قبل ما تدفعي، والدفع عند الاستلام، والشحن لكل المحافظات.`,
    canonical: `<link rel="canonical" href="${url}">\n`,
    ogType: "product", ogUrl: url, ogTitle: `${esc(title)} · ${price} ج`,
    // The product's own first photo (the committed 800px WebP) is the share image.
    ogImage: esc(new URL(hero.src, url).href),
    wa: waLink(FALLBACK, productText(title, first.code)),
    preload: `<link rel="preload" as="image" type="image/avif" imagesrcset="${hero.avif}" imagesizes="${sizes}" fetchpriority="high">\n`,
    codeExpr: JSON.stringify(first.code), fontFaces,
    hero: `<source type="image/avif" srcset="${hero.avif}" sizes="${sizes}"><source type="image/webp" srcset="${hero.webp}" sizes="${sizes}"><img src="${hero.src}" alt="${esc(first.alt)}" width="800" height="1067" fetchpriority="high" decoding="async"${HERO_READY}>`,
    count, gallery: thumbs(first, count),
    h1: esc(title), price, desc: lines[0] ? esc(lines[0]) : "", picker,
    options: oneSize ? `<div class="lp-opt"><span class="one">مقاس واحد</span></div>` : "",
    choice: esc((first.name ? first.name + " · " : "") + (oneSize ? "مقاس واحد" : "اختيار المقاس")),
    benefits: page.benefits || DEFAULT_BENEFITS,
    more: page.campaign?.colourNote ? `<p>${esc(page.campaign.colourNote)}</p>` : lines.slice(1).map(l => `<p>${esc(l)}</p>`).join(""),
    video: page.video ? `<button type="button" class="video" data-lp-video="${esc(page.video.src)}">▶ تشغيل الفيديو</button>` : "",
    noscript: `<a href="/p/?code=${esc(first.code)}">فتح صفحة المنتج لإتمام الطلب</a>`,
    data: JSON.stringify({ id: page.id, code: first.code, colors, ...(page.campaign ? { directOnly: page.campaign.directOnly === true, campaign: true } : {}) }).replace(/</g, "\\u003c"),
    scripts: '<script type="module" src="/lp/image-zoom.js?v=20261106-theme"></script>',
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
    source: " (automatic product page)", title: "SELECT SHOP",
    description: SHARE_TEXT, ogType: "website", ogUrl: "", ogTitle: "SELECT SHOP", ogImage: SHARE_IMAGE,
    wa: waLink(FALLBACK, GENERAL),
    canonical: "", preload: "", codeExpr: code, fontFaces, route: ROUTE(routes),
    hero: `<img alt="" width="800" height="1067" decoding="async"${HERO_READY}>`, gallery: "", count: 0, h1: "", price: "—", desc: "", picker: "", options: "",
    choice: "اختيار المقاس", benefits: DEFAULT_BENEFITS, more: "", video: "",
    noscript: `<a href="/">فتح المتجر</a>`, data: JSON.stringify({ auto: true }),
    scripts: `<script src="/js/catalog-thumbs.js"></script>\n<script id="lp-hero">${HERO_BOOT}</script>\n<script type="module" src="/lp/image-zoom.js?v=20261114-auto-zoom"></script>\n`,
  });
}

async function encodeImages(page, products) {
  const sharp = (await import("sharp")).default;
  for (const c of colorsOf(page)) {
    if (imgPrefix(page, c.code)) continue; // photos owned (and encoded) by the original colour page
    const dir = path.join(ROOT, "lp", page.id, "img", c.code);
    await mkdir(dir, { recursive: true });
    for (const [i, m] of photos(products[c.code]).entries()) {
      const r = await fetch(m.url);
      if (!r.ok) throw new Error(`${c.code} photo ${i}: HTTP ${r.status}`);
      const buf = Buffer.from(await r.arrayBuffer());
      // Width only: the photo keeps its own shape (no crop), so the whole garment stays visible.
      const at = (w) => sharp(buf).rotate().resize({ width: w, withoutEnlargement: true });
      for (const w of [THUMB_WIDTH, ...(i === 0 ? HERO_WIDTHS : [MAIN_WIDTH])]) await at(w).webp({ quality: 65 }).toFile(path.join(dir, `${i}-${w}.webp`));
      if (i === 0) for (const w of HERO_WIDTHS) await at(w).avif({ quality: 40, effort: 6 }).toFile(path.join(dir, `${i}-${w}.avif`));
    }
  }
}

// Neutral fonts (2026-11-21), self-hosted in assets/fonts/neutral (OFL): three files, about the weight of the old Readex pair, so the
// page budget holds. Plex Arabic 400 is subset to Arabic + digits/punctuation (Latin letters use the system font) and other weights
// are synthesised from it; Alexandria 800 draws titles and Manrope 800 prices. All wait for the hero photo (html.hl, see CSS).
export const NEUTRAL_FACES = [
  ["IBM Plex Sans Arabic", "ibm-plex-sans-arabic-arabic-400-lp", 400, "U+0020-0040,U+00A0,U+00AB,U+00BB,U+0600-06FF,U+200C-200F,U+2010-2011"],
  ["Alexandria", "alexandria-arabic-800-normal", 800, "U+0600-06FF,U+200C-200E,U+2010-2011,U+FB50-FDFF,U+FE70-FEFC"],
  ["Manrope", "manrope-latin-800-normal", 800, "U+0000-00FF,U+2000-206F"],
].map(([family, file, weight, range]) => `@font-face{font-family:'${family}';font-style:normal;font-display:swap;font-weight:${weight};src:url(/assets/fonts/neutral/${file}.woff2) format("woff2");unicode-range:${range}}`).join("");

async function main() {
  const [id, ...flags] = process.argv.slice(2);
  if (!/^[a-z0-9-]{3,40}$/.test(id || "")) throw new Error("usage: node build-lp.mjs <page-id>|shell [--refresh] [--images] [--check]");
  const fontFaces = NEUTRAL_FACES;
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
  for (const c of colorData(page, products)) for (const i of c.zoom.keys()) {
    const f = photoFiles(c.dir, i);
    for (const file of [f.src, f.thumb, ...[f.avif, f.webp].flatMap(set => set ? set.split(", ").map(x => x.split(" ")[0]) : [])])
      await access(path.join(ROOT, "lp", id, file)); // every referenced image is committed
  }
  await output(`lp/${id}/index.html`, html, id, flags);
}

async function output(rel, html, id, flags) {
  const out = path.join(ROOT, rel);
  if (flags.includes("--check")) {
    const current = await readFile(out, "utf8").catch(() => "");
    if (current !== html) {
      let at = 0;
      while (at < Math.min(current.length, html.length) && current[at] === html[at]) at++;
      const excerpt = (value) => JSON.stringify(value.slice(Math.max(0, at - 100), at + 180));
      console.error(`STALE: ${rel} differs from its generator output at offset ${at}; current: ${excerpt(current)}; generated: ${excerpt(html)}; run node build-lp.mjs ${id}`);
      process.exit(1);
    }
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
