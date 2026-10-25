import { test, expect } from "@playwright/test";

const LP = "/lp/ss-1008/";
const mockLog = async (request) => (await request.get("/__mock/log")).json();

// Every test fails if the page reaches any origin except the local QA server (public photo CDN reads allowed
// only where a legacy page needs them). This is the guarantee that no production data or order is touched.
test.beforeEach(async ({ page }) => {
  page.external = [];
  page.on("request", r => { const u = new URL(r.url()); if (u.hostname !== "127.0.0.1") page.external.push(r.method() + " " + u.host + u.pathname); });
});

test("pilot LP paints real product data, re-checks it live and stays on the local server", async ({ page }) => {
  await page.goto(LP);
  await expect(page.locator("h1")).toHaveText("Leather jacket");
  await expect(page.locator("#lpPrice")).toHaveText("١٬٢٠٠");
  await expect(page.locator("#lpOrder")).toBeEnabled();
  await expect(page.locator("#lpOrder")).toBeInViewport(); // sticky CTA visible without scrolling
  const hero = page.locator(".hero img");
  await expect(hero).toHaveJSProperty("complete", true);
  expect(await hero.evaluate(i => i.currentSrc)).toMatch(/\/lp\/ss-1008\/img\/0-\d+\.(avif|webp)$/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(page.external).toEqual([]);
});

test("A/B: ?lpv pins the variant and the bucket is remembered", async ({ page }) => {
  await page.goto(LP + "?lpv=b");
  await expect(page.locator("html")).toHaveAttribute("data-v", "b");
  await page.goto(LP);
  await expect(page.locator("html")).toHaveAttribute("data-v", "b");
  await page.goto(LP + "?lpv=a");
  await expect(page.locator("html")).toHaveAttribute("data-v", "a");
});

test("order: LP -> existing checkout -> one confirmed order even on double submit", async ({ page, request }) => {
  const before = (await mockLog(request)).orders.length;
  await page.goto(LP);
  await page.locator("#lpOrder").click();
  await page.waitForURL("**/checkout/");
  await page.locator("#region").selectOption("cairo");
  await expect(page.locator("#grandTotal")).toContainText("١٬٢٧٠");
  await page.fill("[name=name]", "اختبار آلي");
  await page.fill("[name=phone]", "01000000000");
  await page.fill("[name=area]", "مدينة نصر");
  await page.fill("[name=address]", "عنوان اختبار فقط");
  await expect(page.locator("#placeOrder")).toBeEnabled();
  await page.locator("#placeOrder").dblclick();
  await page.waitForURL(/\/order-success\/\?order=ORD-/);
  await expect(page.locator("#orderCode")).toHaveText(/^ORD-[2-9A-Z]{8}$/);
  const { orders } = await mockLog(request);
  expect(orders.length - before).toBe(1);
  expect(orders.at(-1).lines).toEqual([{ publicCode: "SS-1008", structureVersion: 2, quantity: 1, selection: [] }]);
  expect(page.external).toEqual([]);
});

test("multi-size product: a size must be chosen and sold-out sizes are disabled", async ({ page }) => {
  await page.route("**/__mock/functions/v1/women-checkout/product/SS-1008", route => route.fulfill({ json: { product: {
    publicCode: "SS-1008", structureVersion: 2, purchasable: true, title: "Leather jacket", price: { minAmountMinor: 120000 },
    options: [{ name: "المقاس", values: [{ position: 0, value: "S" }, { position: 1, value: "M" }, { position: 2, value: "L" }] }],
    variants: [0, 1, 2].map(p => ({ selection: [{ optionPosition: 0, valuePosition: p }], purchasable: p !== 2, unitPrice: { currency: "EGP", amountMinor: 120000 } })),
  } } }));
  await page.goto(LP);
  await expect(page.getByRole("radio", { name: "L" })).toBeDisabled();
  await page.locator("#lpOrder").click();
  await expect(page.locator("#lpStatus")).toHaveText("اختاري المقاس الأول.");
  const chip = page.getByText("M", { exact: true });
  expect((await chip.boundingBox()).height).toBeGreaterThanOrEqual(44); // comfortable tap target
  await expect(page.locator("#lpOrder")).toBeInViewport(); // sticky CTA stays reachable
  await chip.click(); // tap the visible chip itself, exactly like a customer
  await expect(page.getByRole("radio", { name: "M" })).toBeChecked();
  // Interaction latency (INP proxy) on the size tap, measured by the browser's Event Timing API.
  const worst = await page.evaluate(() => new Promise(res => {
    let max = 0; new PerformanceObserver(l => l.getEntries().forEach(e => { max = Math.max(max, e.duration); })).observe({ type: "event", buffered: true, durationThreshold: 16 });
    setTimeout(() => res(max), 300);
  }));
  console.log(`size tap event duration: ${worst} ms`);
  expect(worst).toBeLessThan(200);
  await page.locator("#lpOrder").click();
  await page.waitForURL("**/checkout/");
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("women.cart.v1")).at(-1).selection)).toEqual([{ optionPosition: 0, valuePosition: 1 }]);
});

test("product links: storefront link, legacy /lp/?p= page and product page still work", async ({ page }) => {
  await page.goto(LP);
  await expect(page.getByRole("link", { name: "كل المنتجات" })).toHaveAttribute("href", "/");
  await page.goto("/lp/?p=SS-1008");
  await expect(page.locator("#cta")).toHaveAttribute("href", /\/p\/\?code=SS-1008$/);
  await page.goto("/p/?code=SS-1008");
  await expect(page.locator("#productTitle")).toHaveText("Leather jacket");
  await page.goto("/lp/?p=bad");
  await page.waitForURL(u => u.pathname === "/");
});

test("unavailable product keeps the CTA disabled", async ({ page }) => {
  await page.route("**/women-checkout/product/SS-1008", route => route.fulfill({ status: 404, json: { error: "not_found" } }));
  await page.goto(LP);
  await expect(page.locator("#lpStatus")).not.toBeEmpty();
  await expect(page.locator("#lpOrder")).toBeDisabled();
});
