// Build a static product landing page: node build-lp.mjs <page-id> [--refresh] [--images] [--check]
//   --refresh  re-read every colour's product from the PUBLIC catalog API (GET only) into fixtures/<CODE>.product.json
//   --images   download the product photos and encode AVIF/WebP derivatives into lp/<id>/img/<CODE>/
//   --check    render from the committed fixtures and fail if lp/<id>/index.html is stale (used by CI, no network)
// A page is one model: each colour is its own real product (public code), so no product data is merged.
import { readFile, writeFile, mkdir, access } from "node:fs/promises";
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

const imgSet = (code, i, ext) => HERO_WIDTHS.map(w => `img/${code}/${i}-${w}.${ext} ${w}w`).join(", ");

/** Per-colour data the runtime needs to swap photos without another request for page markup. */
export function colorData(page, products) {
  return colorsOf(page).map(c => {
    const p = products[c.code];
    if (!p) throw new Error(`${page.id}: no fixture for ${c.code}`);
    const pics = photos(p);
    if (!pics.length) throw new Error(`${c.code}: no public photo`);
    const alt = String(p.title || "").trim().slice(0, 200) + (c.name ? " باللون " + c.name : "");
    return { code: c.code, name: c.name, hex: c.hex, alt,
      hero: { avif: imgSet(c.code, 0, "avif"), webp: imgSet(c.code, 0, "webp"), src: `img/${c.code}/0-800.webp` },
      gallery: pics.slice(1).map((_, i) => `img/${c.code}/${i + 1}-${GALLERY_WIDTH}.webp`) };
  });
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
  const picker = colors.length > 1 ? `<fieldset class="pick" id="lpColors"><legend>اختاري اللون: <strong id="lpColorName">${esc(first.name)}</strong> <span class="color-count">· ${colors.length} ألوان</span></legend><div class="row">${colors.map((c, i) =>
    `<button type="button" class="chip" data-code="${esc(c.code)}" aria-pressed="${i === 0}"><img src="img/${esc(c.code)}/0-480.webp" alt="" width="120" height="150" loading="lazy" decoding="async"><span class="chip-name"><i style="background:${esc(c.hex)}"></i>${esc(c.name)}</span></button>`).join("")}</div><p class="color-help">اضغطي على صورة اللون علشان تشوفي الموديل بيه</p></fieldset>` : "";
  const gallery = first.gallery.map(src => `<img src="${src}" alt="${esc(first.alt)}" width="320" height="400" loading="lazy" decoding="async">`).join("");
  const video = page.video ? `<button type="button" class="video" data-lp-video="${esc(page.video.src)}">▶ شغّلي الفيديو</button>` : "";
  const data = JSON.stringify({ id: page.id, code: first.code, colors }).replace(/</g, "\\u003c");
  const choice = (first.name ? first.name + " · " : "") + (oneSize ? "مقاس واحد" : "اختاري المقاس");
  return `<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="robots" content="noindex, follow">
<meta name="theme-color" content="#F8F5F4">
<meta name="referrer" content="strict-origin-when-cross-origin">
<!-- Generated by tooling/build-lp.mjs from tooling/pages/${esc(page.id)}.json. Do not edit by hand. -->
<title>${esc(title)} · SELECT SHOP WOMEN</title>
<meta name="description" content="${esc(title)}. الدفع عند الاستلام والشحن لكل المحافظات.">
<link rel="canonical" href="https://selectshopeg.com/lp/${esc(page.id)}/">
<link rel="icon" href="/assets/icons/favicon.svg" type="image/svg+xml">
<link rel="preload" as="image" type="image/avif" imagesrcset="${first.hero.avif}" imagesizes="${sizes}" fetchpriority="high">
<link rel="preconnect" href="https://byluoipdunralsurwebt.supabase.co" crossorigin>
<script id="lp-ab">${AB_SNIPPET}</script>
<style>
${fontFaces}
:root{--bg:#F8F5F4;--surface:#F1EAEE;--line:#E7DCE2;--mauve:#7A5C71;--ink:#2A2129;--muted:#5F5560;--gold:#A8894E;--f:"Readex Pro","Segoe UI",Tahoma,"Noto Sans Arabic",sans-serif;color-scheme:light}
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
.hero img{width:100%;height:100%;object-fit:cover;display:block}
.gallery{order:2;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;padding:20px 20px 0}
.gallery:empty{display:none}
.gallery img{width:100%;height:auto;aspect-ratio:4/5;object-fit:cover;border-radius:10px;background:var(--surface)}
.info{padding:18px 20px 0;display:flex;flex-direction:column;gap:18px;min-width:0}
.head{display:flex;flex-direction:column;gap:5px}
.eyebrow{margin:0 0 2px;font-size:10px;letter-spacing:.18em;font-weight:600;color:var(--mauve);text-transform:uppercase}
.head .desc{line-height:1.8}
.notes{border:1px solid var(--line);background:#fff;border-radius:16px;padding:12px 14px}
.notes li{position:relative;padding-inline-start:23px}
.notes li::before{content:"✓";position:absolute;inset-inline-start:1px;top:0;color:var(--mauve);font-weight:700}
.headline-note{color:var(--muted);font-size:12px;margin:0;line-height:1.7}
@media(min-width:900px){.pick .row{grid-auto-columns:minmax(95px,110px);grid-auto-flow:column;max-width:100%}}
.head .row{display:flex;justify-content:space-between;align-items:baseline;gap:12px}
h1{margin:0;font-size:23px;font-weight:600;line-height:1.35;overflow-wrap:anywhere}
.price{margin:0;font-size:21px;font-weight:600;font-variant-numeric:tabular-nums;white-space:nowrap}
.price small{font-size:13px;font-weight:400;color:var(--muted);margin-inline-start:3px}
.pick{border:0;margin:0;padding:0;min-width:0}
.pick legend{padding:0;margin-bottom:10px;font-weight:600;font-size:14px}
.pick legend span{font-weight:400;color:var(--muted)}
.pick{padding:16px 14px;border:1px solid var(--line);background:#fff;border-radius:18px}
.pick legend{padding:0 6px;font-size:14px;color:var(--ink)}
.pick legend strong{font-weight:600;color:var(--mauve)}
.pick .row{display:grid;grid-auto-flow:column;grid-auto-columns:minmax(94px,112px);gap:9px;overflow-x:auto;scroll-snap-type:x mandatory;padding:3px 1px 7px;scrollbar-width:thin;overscroll-behavior-x:contain}
.chip{display:flex;flex-direction:column;gap:5px;min-width:0;min-height:112px;padding:5px;border:1.5px solid var(--line);border-radius:13px;background:var(--bg);color:var(--ink);font:500 12px var(--f);cursor:pointer;scroll-snap-align:start;text-align:center;transition:border-color .15s,box-shadow .15s}
.chip img{width:100%;height:84px;display:block;object-fit:contain;border-radius:9px;background:var(--surface)}
.chip-name{display:flex;justify-content:center;gap:6px;align-items:center;min-height:22px;line-height:1.4}
.chip i{flex:none;width:12px;height:12px;border-radius:50%;box-shadow:0 0 0 1px rgba(42,33,41,.15)}
.chip[aria-pressed="true"],.lp-opt input:checked+span{border-color:var(--mauve);box-shadow:0 0 0 1px var(--mauve),inset 0 -3px 0 var(--gold)}
.chip[aria-pressed="true"]{background:#fff}
.chip:focus-visible{outline:3px solid var(--gold);outline-offset:2px}
.color-help{font-size:11px;color:var(--muted);margin:5px 0 0}
.color-count{font-size:12px;font-weight:400;color:var(--muted)}
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
.video{width:100%;aspect-ratio:16/9;border:0;border-radius:14px;background:var(--ink);color:#fff;font:600 16px var(--f);cursor:pointer}
.lp-video{width:100%;border-radius:14px}
.bar{position:fixed;inset-inline:0;bottom:0;z-index:5;padding:10px 16px calc(12px + env(safe-area-inset-bottom,0px));background:rgba(248,245,244,.97);border-top:1px solid var(--line)}
.bar>div{max-width:560px;margin-inline:auto;display:flex;gap:12px;align-items:center}
.bar .sum{display:flex;flex-direction:column;line-height:1.25;min-width:0}
.bar .sum b{font-size:17px;font-weight:600;font-variant-numeric:tabular-nums;white-space:nowrap}
.bar .sum span{font-size:12px;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#lpOrder{flex:1;height:52px;border:0;border-radius:14px;background:var(--ink);color:var(--bg);font:600 16px var(--f);cursor:pointer}
#lpOrder:disabled{background:#D9CCD4;color:#4A3F49;cursor:default}
html[data-v="b"] .pick,html[data-v="b"] #lpOptions{order:-1}
@media (min-width:900px){
.page{display:grid;grid-template-columns:minmax(0,1.15fr) minmax(0,1fr);gap:48px;padding:8px 20px 56px;align-items:start}
.media{display:block;min-width:0}
.hero{border-radius:16px;overflow:hidden}.gallery{padding:12px 0 0}.info{padding:8px 0 0}
h1{font-size:34px}.price{font-size:26px}
.bar{position:static;padding:0;background:none;border:0}.bar>div{max-width:none}.bar .sum{display:none}#lpOrder{height:56px}
}
</style>
</head>
<body>
<header class="top"><a class="mark" href="/" aria-label="SELECT SHOP WOMEN الرئيسية">SELECT</a><a href="/">كل القطع</a></header>
<main class="page">
<div class="media">
<picture class="hero" id="lpHero"><source type="image/avif" srcset="${first.hero.avif}" sizes="${sizes}"><source type="image/webp" srcset="${first.hero.webp}" sizes="${sizes}"><img src="${first.hero.src}" alt="${esc(first.alt)}" width="800" height="1000" fetchpriority="high" decoding="async"></picture>
<div class="gallery" id="lpGallery">${gallery}</div>
</div>
<div class="info">
<div class="head"><p class="eyebrow">SELECT SHOP WOMEN · اختاري إطلالتك</p><div class="row"><h1>${esc(title)}</h1><p class="price"><span id="lpPrice">${price}</span><small>جنيه</small></p></div>${lines[0] ? `<p class="desc">${esc(lines[0])}</p>` : ""}</div>
${picker}
<div id="lpOptions">${oneSize ? `<div class="lp-opt"><span class="one">مقاس واحد</span></div>` : ""}</div>
<p id="lpStatus" role="status" aria-live="polite"></p>
<p class="headline-note">السعر والتوفر بيتأكدوا من المتجر قبل إضافة القطعة، والشحن بيتحسب قبل تأكيد الطلب.</p>
<div class="bar"><div><span class="sum" aria-hidden="true"><b id="lpBarPrice">${price} ج</b><span id="lpBarChoice">${esc(choice)}</span></span><button type="button" id="lpOrder" disabled>اطلبي دلوقتي</button></div></div>
<ul class="notes">${page.benefits.map(t => `<li>${esc(t)}</li>`).join("")}</ul>
${lines.length > 1 ? `<div class="desc">${lines.slice(1).map(l => `<p style="margin:0">${esc(l)}</p>`).join("")}</div>` : ""}
${video}
</div>
</main>
<noscript><p style="text-align:center"><a href="/p/?code=${esc(first.code)}">افتحي صفحة المنتج للطلب</a></p></noscript>
<script type="application/json" id="lp-data">${data}</script>
<script type="module" src="/lp/runtime.js?v=20261025-2"></script>
</body>
</html>
`;
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
  if (!/^[a-z0-9-]{3,40}$/.test(id || "")) throw new Error("usage: node build-lp.mjs <page-id> [--refresh] [--images] [--check]");
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
  const fontFaces = readexFaces(await readFile(path.join(ROOT, "css", "fonts.css"), "utf8"));
  const html = render(page, products, fontFaces);
  for (const c of colorData(page, products)) for (const f of [c.hero.src, ...c.gallery, ...c.hero.avif.split(", ").map(s => s.split(" ")[0])])
    await access(path.join(ROOT, "lp", id, f)); // every referenced image is committed
  const out = path.join(ROOT, "lp", id, "index.html");
  if (flags.includes("--check")) {
    const current = await readFile(out, "utf8").catch(() => "");
    if (current !== html) { console.error(`STALE: lp/${id}/index.html differs from its generator output; run node build-lp.mjs ${id}`); process.exit(1); }
    console.log(`OK lp/${id}/index.html is up to date`);
    return;
  }
  await mkdir(path.dirname(out), { recursive: true });
  await writeFile(out, html);
  console.log(`wrote lp/${id}/index.html (${html.length} bytes)`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(e => { console.error(e.message); process.exit(1); });
}
