// QA screenshots of the multi-product campaign page and its Admin preview on the mock (no production).
// PORT=4173 node serve.mjs &  then  node multi-product-shots.mjs <outDir>
import { chromium, devices } from "@playwright/test";
const BASE = "http://127.0.0.1:4173";
const out = process.argv[2] || "preview-output";
const codes = ["SS-1013", "SS-9101", "SS-1012", "SS-1014", "SS-1015"];
await fetch(BASE + "/__mock/collection", { method: "POST", body: JSON.stringify({ slug: "shots-5", codes, title: "تشكيلة الخروج", description: "خمس موديلات في صفحة واحدة، وكلهم في طلب واحد." }) });
const browser = await chromium.launch({ channel: process.env.PW_CHANNEL || undefined });
for (const [name, opts] of [["mobile-390", { ...devices["Pixel 7"], viewport: { width: 390, height: 844 } }], ["desktop-1366", { viewport: { width: 1366, height: 900 } }]]) {
  const page = await (await browser.newContext(opts)).newPage();
  await page.goto(BASE + "/collections/?slug=shots-5&utm_source=meta&utm_campaign=shots");
  await page.locator(".cp-product[data-code]").first().waitFor();
  const a = page.locator('.cp-product[data-code="SS-9101"]');
  await a.locator(".cp-option").first().locator(".cp-chip").first().click();
  await a.locator(".cp-option").nth(1).locator(".cp-chip:not([disabled])").first().click();
  await a.locator(".cp-add").click();
  await a.locator(".cp-status").filter({ hasText: "اتضافت" }).waitFor();
  await page.evaluate(() => scrollTo(0, 0));
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${out}/multi-product-${name}.png`, fullPage: false });
  await page.screenshot({ path: `${out}/multi-product-${name}-full.png`, fullPage: true });
}
await browser.close();
console.log("shots in", out);
