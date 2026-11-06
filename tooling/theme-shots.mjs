// Every public route in Dark and Light at the review widths, on the local mock (tooling/serve.mjs). Read-only:
// every non-local request is aborted and no order is confirmed (the checkout is filled, never submitted).
//   node theme-shots.mjs [outDir] [themes=dark,light] [widths=320,360,390,768,1440]   (BASE defaults to http://127.0.0.1:4180)
import { chromium, devices } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const BASE = process.env.BASE || "http://127.0.0.1:4180";
const [out = "preview-output/theme", themes = "dark,light", widths = "320,360,390,768,1440"] = process.argv.slice(2);
await mkdir(out, { recursive: true });
const browser = await chromium.launch();
const local = fileURLToPath(new URL("../lp/ss-1008/img/SS-1008/0-800.webp", import.meta.url));

for (const theme of themes.split(",")) for (const w of widths.split(",").map(Number)) {
  const mobile = w < 768;
  const ctx = await browser.newContext({ ...(mobile ? devices["Pixel 7"] : {}), viewport: { width: w, height: mobile ? 844 : w < 1000 ? 1024 : 900 }, baseURL: BASE });
  await ctx.addInitScript(t => { try { if (!sessionStorage.getItem("themeSet")) { localStorage.setItem("ssw.theme.v1", t); sessionStorage.setItem("themeSet", "1"); } } catch { /* storage blocked */ } }, theme);
  await ctx.route(u => !["127.0.0.1", "localhost"].includes(u.hostname), r => new URL(r.request().url()).pathname.includes("/storage/")
    ? r.fulfill({ path: local, contentType: "image/webp" }) : r.abort());
  const page = await ctx.newPage();
  const shot = (name, full = false) => page.screenshot({ path: `${out}/${theme}-${w}-${name}.png`, animations: "disabled", fullPage: full });
  const go = async (url, ready) => { await page.goto(url); await page.locator(ready).first().waitFor({ timeout: 20000 }); await page.waitForTimeout(250); };

  await go("/", "#feed .card");
  await shot("1-home");
  await page.locator("#shop").scrollIntoViewIfNeeded(); await page.waitForTimeout(200);
  await shot("2-catalog");
  await go("/lp/ss-1008/", "#lpOrder:enabled");
  await page.waitForFunction(() => document.documentElement.classList.contains("hl"));
  await shot("3-lp");
  if ((await page.locator("#lpNext").isVisible())) { await page.locator("#lpNext").click(); await page.waitForTimeout(400); }
  await page.locator("#lpForm").scrollIntoViewIfNeeded(); await page.waitForTimeout(200);
  await shot("4-lp-form");
  await page.locator("#lpHero").scrollIntoViewIfNeeded(); await page.locator("#lpHero img").click();
  await page.waitForTimeout(400);
  await shot("5-zoom");
  await page.keyboard.press("Escape");
  await go("/lp/?p=SS-1099", "#lpOrder:enabled");
  await shot("6-lp-auto");
  await go("/lp/ss-1011/", "#lpOrder:enabled");
  await shot("7-lp-campaign");
  await go("/p/?code=SS-1008&legacy=1", "#productPhoto:not([hidden])");
  await shot("8-product");
  await go("/lp/ss-1008/", "#lpAddCart:enabled");
  await page.locator("#lpAddCart").click(); await page.waitForTimeout(500);
  await go("/cart/", "#toCheckout");
  await shot("9-cart");
  await page.locator("#toCheckout").click(); await page.waitForURL("**/checkout/");
  await page.locator("#region").selectOption({ index: 1 }); await page.waitForTimeout(600);
  await shot("10-checkout", true);
  await go("/order-success/?order=ORD-THEME-TEST", "main");
  await shot("11-success");
  await ctx.close();
}
await browser.close();
console.log("done", out);
