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
  expect(color).toBe("rgb(255, 255, 255)");
  // Model colours are one public card; legacy SKU product URLs remain tested independently.
  await expect(page.locator('#feed .card .shot-link[href$="/lp/ballon-suit/"]')).toHaveCount(1);
  await expect(page.locator('#feed .card .shot-link[href$="/lp/ss-1008/"]')).toHaveCount(1);
  const modelLink = page.locator('#feed .card .shot-link[href$="/lp/ss-1008/"]').first();
  await expect(modelLink).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await mkdir("preview-output", { recursive: true });
  await page.screenshot({ path: `preview-output/${info.project.name}-home.png`, animations: "disabled" });
  await modelLink.click();
  await expect(page).toHaveURL(/\/lp\/ss-1008\/$/);
  await expect(page.locator("#lpPrice")).not.toBeEmpty();
  await expect(page.locator("#lpColors .chip")).toHaveCount(2);
  await expect(page.locator("#lpOrder")).toBeEnabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: `preview-output/${info.project.name}-product-model.png`, fullPage: true, animations: "disabled" });
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
