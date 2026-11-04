// Mobile buyer journey on the local mock (tooling/serve.mjs), one screenshot per step:
// home → first card → model page → photo zoom → colour switch → direct COD order → confirmation.
// Every non-local request is aborted, so no production order, view or GA4 hit can happen.
//   node journey-shots.mjs [outDir]          (BASE defaults to http://127.0.0.1:4180)
import { chromium, devices } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const BASE = process.env.BASE || "http://127.0.0.1:4180";
const out = process.argv[2] || "preview-output/journey";
await mkdir(out, { recursive: true });
const browser = await chromium.launch();
const ctx = await browser.newContext({ ...devices["Pixel 7"], baseURL: BASE });
const external = [];
await ctx.route(u => !["127.0.0.1", "localhost"].includes(u.hostname), r => {
  const u = new URL(r.request().url());
  // The zoom opens the full-size original from storage; serve a local stand-in instead.
  if (u.pathname.includes("/storage/")) return r.fulfill({ path: fileURLToPath(new URL("../lp/ss-1008/img/SS-1008/0-800.webp", import.meta.url)), contentType: "image/webp" });
  external.push(u.host + u.pathname); return r.abort();
});
const page = await ctx.newPage();
const shot = name => page.screenshot({ path: `${out}/${name}.png`, animations: "disabled" });
const ordersNow = async () => (await (await ctx.request.get("/__mock/log")).json()).orders.length;
const ordersBefore = await ordersNow();

await page.goto("/");
await page.locator("#feed .card").first().waitFor();
await shot("1-home");
await page.locator("#feed .card .shot-link").first().click();
await page.waitForURL(u => u.pathname === "/lp/ss-1008/");
await page.locator("#lpOrder:enabled").waitFor();
await shot("2-model-page");
await page.locator("#lpHero img").click();
await page.getByRole("dialog", { name: "تفاصيل الصورة" }).waitFor();
await shot("3-zoom");
await page.getByRole("button", { name: "اقفلي الصورة" }).click();
await page.locator("#lpColors [data-code='SS-1009']").click();
await page.waitForFunction(() => /SS-1009/.test(document.querySelector("#lpHero img").src));
await shot("4-colour");
await page.fill("[name=name]", "اختبار آلي");
await page.fill("[name=phone]", "٠١٠ ١٢٣٤ ٥٦٧٨");
await page.locator("[name=region]").selectOption("cairo");
await page.fill("[name=address]", "عنوان اختبار فقط، شارع ١");
await page.locator("#lpForm").scrollIntoViewIfNeeded();
await shot("5-order-form");
await page.locator("#lpOrder").click();
await page.locator("#lpDone").waitFor();
await shot("6-confirmed");
const placed = await ordersNow() - ordersBefore;
await browser.close();
console.log(JSON.stringify({ mockOrdersPlaced: placed, externalBlocked: external }));
if (placed !== 1) throw new Error("expected exactly one mock order, got " + placed);
