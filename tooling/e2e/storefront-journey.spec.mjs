import { test, expect } from "@playwright/test";

// Full storefront purchase journey on the isolated mock API (tooling/serve.mjs): no real order is created anywhere.
const mockLog = async (request) => (await request.get("/__mock/log")).json();

test.beforeEach(async ({ page }) => {
  page.external = [];
  page.on("request", r => { const u = new URL(r.url()); if (u.hostname !== "127.0.0.1") page.external.push(r.method() + " " + u.host + u.pathname + " (from " + new URL(page.url()).pathname + ")"); });
});

test("home: the category tape sits between the heading and the feed, never over the first products", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("#feed .card").first()).toBeVisible({ timeout: 12000 });
  const box = await page.evaluate(() => {
    const r = s => document.querySelector(s).getBoundingClientRect();
    return { head: r(".shop-head").bottom, dockTop: r(".tape-dock").top, dockBottom: r(".tape-dock").bottom, feed: r("#feed").top };
  });
  expect(box.dockTop).toBeGreaterThanOrEqual(box.head - 1);
  expect(box.dockTop - box.head).toBeLessThan(24); // no empty band above the tape
  expect(box.dockBottom).toBeLessThanOrEqual(box.feed + 1); // the tape does not cover the feed
});

test("product page: every gallery thumbnail is a local optimized WebP, no full-size original is downloaded", async ({ page }) => {
  await page.goto("/p/?code=SS-1008");
  const thumbs = page.locator("#productThumbs img");
  await expect(thumbs).toHaveCount(4);
  await expect.poll(() => thumbs.evaluateAll(images => images.every(img => img.complete && img.naturalWidth > 0)), { timeout: 15000 }).toBe(true);
  const sources = await thumbs.evaluateAll(images => images.map(img => new URL(img.currentSrc).pathname));
  for (const src of sources) expect(src).toMatch(/^\/assets\/catalog-thumbs\/[0-9a-f]{32}\.(jpg|png|webp)\.w400\.webp$/);
  expect(new URL(await page.locator("#productPhoto").evaluate(img => img.currentSrc)).pathname).toMatch(/^\/assets\/catalog-thumbs\//);
  expect(page.external).toEqual([]);
});

test("journey: home → product → cart → checkout → confirmation, one order with the chosen product", async ({ page, request }, info) => {
  const before = (await mockLog(request)).orders.length;
  await page.goto("/");
  // Check the unchanged legacy SKU checkout alongside the new grouped-model cards.
  const link = page.locator('#feed .card .shot-link[href*="/p/?code=SS-"]').first();
  await expect(link).toBeVisible({ timeout: 12000 });
  const code = new URL(await link.getAttribute("href"), "http://x").searchParams.get("code");
  await link.click();
  await expect(page).toHaveURL(new RegExp(`/p/\\?code=${code}$`));
  await expect(page.locator("#addToCart")).toBeEnabled({ timeout: 12000 });
  if (info.project.name === "mobile") await page.locator("#productMobileOrder").click();
  else await page.locator("#addToCart").click();
  await expect(page.locator("#status")).toContainText("اتضافت للشنطة");
  await page.goto("/cart/");
  await expect(page.locator("#toCheckout")).toHaveAttribute("aria-disabled", "false", { timeout: 12000 });
  // The cart must use the same local WebP derivative manifest as the product page;
  // it must never fetch full-resolution Supabase photos for a tiny cart row.
  const cartImage = page.locator("#cartItems .commerce-row-product img").first();
  await expect(cartImage).toHaveAttribute("src", /^\/assets\/catalog-thumbs\/[0-9a-f]{32}\.(?:jpg|png|webp)\.w400\.webp$/);
  await expect.poll(() => cartImage.evaluate(img => img.complete && img.naturalWidth > 0), { timeout: 12000 }).toBe(true);
  expect(page.external).toEqual([]);
  await page.locator("#toCheckout").click();
  await page.waitForURL("**/checkout/");
  await page.locator("#region").selectOption("cairo");
  await page.fill("[name=name]", "اختبار آلي");
  await page.fill("[name=phone]", "01000000000");
  await page.fill("[name=area]", "مدينة نصر");
  await page.fill("[name=address]", "عنوان اختبار فقط");
  await expect(page.locator("#placeOrder")).toBeEnabled();
  await page.locator("#placeOrder").click();
  await page.waitForURL(/\/order-success\/\?order=ORD-/);
  await expect(page.locator("#orderCode")).toHaveText(/^ORD-[2-9A-Z]{8}$/);
  const { orders } = await mockLog(request);
  expect(orders.length - before).toBe(1);
  expect(orders.at(-1).lines.map(l => l.publicCode)).toContain(code);
  expect(page.external).toEqual([]);
});
