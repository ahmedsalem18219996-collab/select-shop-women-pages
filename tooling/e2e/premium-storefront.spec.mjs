import { test, expect } from "@playwright/test";
import { mkdir } from "node:fs/promises";

// Staging only. tooling/serve.mjs rewrites Edge API requests to in-memory fixtures.
// Screenshots provide an owner-review preview before any public deployment.
test("premium storefront renders verified catalog and retains product navigation", async ({ page }, info) => {
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("ستايل يليق");
  await expect(page.locator("#feed .card").first()).toBeVisible({ timeout: 12000 });
  await expect(page.locator("#countOut")).not.toHaveText("جارٍ التحميل…");
  const color = await page.locator(".hdr").evaluate(el => getComputedStyle(el).backgroundColor);
  expect(color).toBe("rgb(255, 255, 255)");
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
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: `preview-output/${info.project.name}-product.png`, fullPage: true, animations: "disabled" });
  expect(errors).toEqual([]);
});
