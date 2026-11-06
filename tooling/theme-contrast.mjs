// WCAG AA text-contrast scan of every public route in Dark and Light, on the local mock. axe-core's color-contrast rule
// skips Arabic text (it reads joined letters as icon ligatures), so this measures it directly: each visible element with its
// own text, its colour against the first solid background up the tree, 4.5:1 (3:1 for large text).
// shortcut: text over photos/gradients (background-image up the tree) is skipped, and ancestor opacity is ignored; upgrade to a pixel sampler if that matters.
// Read-only: non-local requests are aborted and the checkout is never submitted.
//   node theme-contrast.mjs        (BASE defaults to http://127.0.0.1:4180)
import { chromium, devices } from "@playwright/test";

const BASE = process.env.BASE || "http://127.0.0.1:4180";
// Runs in the page. Returns "selector ratio fg/bg" for every failing text element.
const scan = () => {
  // "rgb(r g b / a)" or, for color-mix(), "color(srgb r g b / a)" with 0–1 channels
  const rgb = s => { const n = (s.match(/[\d.]+/g) || []).map(Number); return s.startsWith("color(srgb") ? [...n.slice(0, 3).map(v => v * 255), ...n.slice(3)] : n; };
  const lum = ([r, g, b]) => [r, g, b].map(v => (v /= 255) <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4).reduce((a, v, i) => a + v * [0.2126, 0.7152, 0.0722][i], 0);
  const mix = (f, b) => { const a = f[3] ?? 1; return [0, 1, 2].map(i => f[i] * a + b[i] * (1 - a)); };
  const bgOf = el => { for (let n = el; n; n = n.parentElement) { const cs = getComputedStyle(n); if (cs.backgroundImage !== "none" || n.tagName === "PICTURE") return null;
    const c = rgb(cs.backgroundColor); if (c.length && (c[3] ?? 1) > 0) return (c[3] ?? 1) < 1 ? mix(c, bgOf(n.parentElement) || [255, 255, 255]) : c; } return rgb(getComputedStyle(document.body).backgroundColor); };
  const out = [];
  for (const el of document.querySelectorAll("body *")) {
    if (![...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim())) continue;
    const r = el.getBoundingClientRect(), cs = getComputedStyle(el);
    if (el.disabled || !r.width || !r.height || cs.visibility === "hidden" || el.closest("[hidden],[aria-hidden=true]") || cs.opacity === "0") continue;
    const bg = bgOf(el); if (!bg) continue;
    const fg = mix(rgb(cs.color), bg), L = [lum(fg), lum(bg)].sort((a, b) => b - a), ratio = (L[0] + 0.05) / (L[1] + 0.05);
    const px = parseFloat(cs.fontSize), large = px >= 24 || (px >= 18.66 && Number(cs.fontWeight) >= 700);
    if (ratio < (large ? 3 : 4.5)) out.push(`${el.tagName.toLowerCase()}${el.id ? "#" + el.id : ""}.${[...el.classList].join(".")} "${el.textContent.trim().slice(0, 24)}" ${ratio.toFixed(2)}:1 ${cs.color} on rgb(${bg.map(Math.round)})`);
  }
  return out;
};
const ROUTES = [["home", "/", "#feed .card"], ["lp", "/lp/ss-1008/", "#lpOrder:enabled"], ["lp-auto", "/lp/?p=SS-1099", "#lpOrder:enabled"],
  ["lp-campaign", "/lp/ss-1011/", "#lpOrder:enabled"], ["product", "/p/?code=SS-1008&legacy=1", "#productPhoto:not([hidden])"],
  ["cart", "/cart/", "#toCheckout"], ["checkout", "/checkout/", "#region"], ["success", "/order-success/?order=ORD-THEME-TEST", "main"]];
const browser = await chromium.launch();
let total = 0;
for (const theme of ["dark", "light"]) for (const [dev, opts] of [["mobile", devices["Pixel 7"]], ["desktop", { viewport: { width: 1440, height: 900 } }]]) {
  const ctx = await browser.newContext({ ...opts, baseURL: BASE });
  await ctx.addInitScript(t => { try { localStorage.setItem("ssw.theme.v1", t); } catch { /* blocked */ } }, theme);
  await ctx.route(u => !["127.0.0.1", "localhost"].includes(u.hostname), r => r.abort());
  const page = await ctx.newPage();
  await page.goto("/lp/ss-1008/"); await page.locator("#lpAddCart:enabled").click(); await page.waitForTimeout(400);
  for (const [name, url, ready] of ROUTES) {
    await page.goto(url); await page.locator(ready).first().waitFor({ timeout: 20000 });
    if (name === "checkout") { await page.locator("#region").selectOption({ index: 1 }); await page.waitForTimeout(500); }
    await page.waitForTimeout(600); // let colour transitions (enabled buy buttons) finish
    const v = await page.evaluate(scan);
    total += v.length;
    console.log(`${theme} ${dev} ${name}: ${v.length ? v.length + " issues\n  " + v.join("\n  ") : "AA ok"}`);
  }
  await ctx.close();
}
await browser.close();
console.log("TOTAL contrast issues:", total);
process.exitCode = total ? 1 : 0;
