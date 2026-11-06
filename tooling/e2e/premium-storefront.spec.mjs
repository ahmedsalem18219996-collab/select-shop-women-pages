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
  const accent = await page.locator("#womenOwnerAnnouncement").evaluate(el => getComputedStyle(el).borderBottomColor);
  expect(accent).toBe("rgb(37, 52, 82)"); // Dark Luxury border #253452
  await expect(page.locator("#feed .card").first()).toBeVisible({ timeout: 12000 });
  await expect(page.locator("#heroImg")).toHaveCount(0);
  await expect(page.locator("#heroPick")).toHaveCount(0);
  await expect(page.locator(".hero-cta a")).toHaveAttribute("href", "#shop");
  // SS-1011 is no longer special-cased: if published in the real public catalog,
  // it must appear as one ordinary product card with its direct COD landing page.
  const sweater = page.locator("#feed .card").filter({ has: page.locator('[data-name="SS-1011"]') });
  await expect(sweater).toHaveCount(1);
  await expect(sweater.locator(".shot-link")).toHaveAttribute("href", /\/lp\/\?p=SS-1011$/);
  await expect(sweater.locator(".pr")).toContainText("550");
  // A shop with actual products must never tell buyers it is still preparing them.
  await expect(page.locator(".hero p")).not.toContainText("بنجهز");
  await expect(page.locator("#countOut")).not.toHaveText("جارٍ التحميل…");
  const color = await page.locator(".hdr").evaluate(el => getComputedStyle(el).backgroundColor);
  expect(color).toBe("rgba(5, 11, 28, 0.97)"); // Dark Luxury midnight navy #050B1C header
  const productLink = page.locator("#feed .card .shot-link").first();
  // SS-1008 + SS-1009 are one verified model; the card must open the
  // canonical pre-rendered page rather than the legacy per-colour URL.
  await expect(productLink).toHaveAttribute("href", /\/lp\/ss-1008\/$/);
  await expect(page.locator("#feed .card").first().locator(".swatches i")).toHaveCount(2);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await mkdir("preview-output", { recursive: true });
  await page.screenshot({ path: `preview-output/${info.project.name}-home.png`, animations: "disabled" });
  await productLink.click();
  await page.waitForURL(u=>u.pathname.startsWith("/lp/"), { timeout:12000 });
  // Verify direct COD model landing offers both real legacy SKU choices.
  await expect(page.locator("#lpColors [data-code='SS-1008']")).toBeVisible();
  await expect(page.locator("#lpColors [data-code='SS-1009']")).toBeVisible();
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

test("new multi-colour Admin product automatically shows names and palette dots below its home card", async ({ page }) => {
  await page.route("**/women-store-bridge/catalog", async route => {
    const upstream = await route.fetch();
    const body = await upstream.json();
    const base = body.items.find(item => item.publicCode === "SS-1011");
    expect(base).toBeTruthy();
    body.items.push({ ...base, publicCode: "SS-1052", title: "سويت شيرت", priceMinor: 65000, colours: ["بطيخي", "فوشيا"] });
    body.items.push({ ...base, publicCode: "SS-1053", title: "منتج جديد", colours: ["أسود × أبيض"] });
    await route.fulfill({ response: upstream, json: body });
  });
  await page.goto("/");
  const sweatshirt = page.locator("#feed .card").filter({ has: page.locator('[data-name="SS-1052"]') });
  await expect(sweatshirt).toHaveCount(1);
  await expect(sweatshirt.locator(".card-colour-names")).toContainText("بطيخي · فوشيا");
  await expect(sweatshirt.locator(".swatches i")).toHaveCount(2);
  await expect(sweatshirt.locator(".shot-link")).toHaveAttribute("href", /\/lp\/\?p=SS-1052$/);
  const twoTone = page.locator("#feed .card").filter({ has: page.locator('[data-name="SS-1053"]') });
  await expect(twoTone.locator(".card-colour-names")).toContainText("أسود × أبيض");
  await expect(twoTone.locator(".swatches i")).toHaveCount(1);
  await expect(twoTone.locator(".swatches i")).toHaveCSS("background-image", /linear-gradient/);
  await expect(page.locator("#feed .card").first().locator(".card-colour-names")).toContainText("بني · أسود");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
