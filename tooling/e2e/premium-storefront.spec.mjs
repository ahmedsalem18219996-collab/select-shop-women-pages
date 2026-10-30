import { test, expect } from "@playwright/test";
import { mkdir } from "node:fs/promises";

// Staging only. tooling/serve.mjs rewrites Edge API requests to in-memory fixtures.
// Screenshots provide an owner-review preview before any public deployment.
test("premium storefront renders verified catalog and retains product navigation", async ({ page }, info) => {
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("/");
  // Homepage copy is owner-managed; respect what the catalog returns instead of pinning an invented heading.
  await expect(page.getByRole("heading", { level: 1 })).not.toBeEmpty();
  await expect(page.locator("#womenOwnerAnnouncement")).toHaveCount(1);
  await expect(page.locator("#womenOwnerAnnouncement")).not.toBeEmpty();
  await expect(page.locator("#feed .card").first()).toBeVisible({ timeout: 12000 });
  // A shop with actual products must never tell buyers it is still preparing them.
  await expect(page.locator(".hero p")).not.toContainText("بنجهز");
  await expect(page.locator("#countOut")).not.toHaveText("جارٍ التحميل…");
  const color = await page.locator(".hdr").evaluate(el => getComputedStyle(el).backgroundColor);
  expect(color).toBe("rgba(247, 246, 242, 0.98)"); // Atelier warm-paper header
  const productLink = page.locator("#feed .card .shot-link").first();
  await expect(productLink).toHaveAttribute("href", /\/p\/\?code=SS-\d+/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await mkdir("preview-output", { recursive: true });
  await page.screenshot({ path: `preview-output/${info.project.name}-home.png`, animations: "disabled" });
  await productLink.click();
  await expect(page).toHaveURL(/\/p\/\?code=SS-\d+/);
  await expect(page.locator("#productTitle")).not.toContainText("جارٍ تحميل", { timeout: 12000 });
  await expect(page.locator("#productPrice")).not.toBeEmpty();
  await expect(page.locator("#addToCart")).toBeEnabled();
  await expect(page.locator("#productPhoto")).toBeVisible();
  const thumbs = page.locator("#productThumbs img");
  await expect(thumbs).toHaveCount(4);
  await thumbs.last().scrollIntoViewIfNeeded();
  await expect.poll(() => thumbs.evaluateAll(images => images.every(img => img.complete && img.naturalWidth > 0)), { timeout: 15000 }).toBe(true);
  await expect(page.locator(".commerce-size-heading > b")).toHaveText("مقاس واحد");
  await expect(page.locator("#optionFields select")).toHaveCount(0);
  if (info.project.name === "mobile") {
    await expect(page.locator("#productMobileBuyBar")).toBeVisible();
    expect(await page.locator("#productMobilePrice").textContent()).toBe(await page.locator("#productPrice").textContent());
    await expect(page.locator("#productMobileOrder")).toBeEnabled();
  } else {
    await expect(page.locator("#productMobileBuyBar")).toBeHidden();
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: `preview-output/${info.project.name}-product.png`, fullPage: true, animations: "disabled" });
  expect(errors).toEqual([]);
});

test("mobile sticky buy bar submits to the existing cart exactly once", async ({ page, request }, info) => {
  await page.goto("/p/?code=SS-1008");
  await expect(page.locator("#addToCart")).toBeEnabled();
  const before = (await (await request.get("/__mock/log")).json()).cartAdds.length;
  if (info.project.name === "mobile") {
    await expect(page.locator("#productMobileBuyBar")).toBeVisible();
    await page.locator("#productMobileOrder").click();
  } else {
    await page.locator("#addToCart").click();
  }
  await expect(page.locator("#status")).toContainText("اتضافت للشنطة");
  const after = (await (await request.get("/__mock/log")).json()).cartAdds;
  expect(after.length-before).toBe(1);
  expect(after.at(-1).publicCode).toBe("SS-1008");
  expect(after.at(-1).selection).toEqual([]);
});
