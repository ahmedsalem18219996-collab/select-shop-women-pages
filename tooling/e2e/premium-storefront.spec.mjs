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
  await expect(productLink).toHaveAttribute("href", /\/lp\/\?p=SS-\d+/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await mkdir("preview-output", { recursive: true });
  await page.screenshot({ path: `preview-output/${info.project.name}-home.png`, animations: "disabled" });
  await productLink.click();
  await page.waitForURL(u=>u.pathname.startsWith("/lp/"), { timeout:12000 });
  await expect(page.locator("#lpTitle")).not.toBeEmpty();
  await expect(page.locator("#lpPrice")).not.toBeEmpty();
  await expect(page.locator("#lpHero img")).toBeVisible();
  await expect(page.locator("#lpForm")).toBeVisible();
  await expect(page.locator("#lpOrder")).toBeEnabled();
  await expect(page.locator("#addToCart")).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: `preview-output/${info.project.name}-product.png`, fullPage:true, animations:"disabled" });
  expect(errors).toEqual([]);
});

test("legacy cart remains isolated behind explicit legacy=1", async ({ page, request }, info) => {
  await page.goto("/p/?code=SS-1008&legacy=1");
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
