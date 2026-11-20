import { test, expect } from "@playwright/test";

// A landing page whose product was hidden or removed (women-checkout/product → 404): the page says so, offers the
// models on sale now from the public catalog, stays out of search, and can never send an order. Local mock only.
const gone = (page, code) => page.route(`**/women-checkout/product/${code}`, r => r.fulfill({ status: 404, json: { error: "not_found" } }));

for (const [name, url, code] of [["pre-rendered page", "/lp/ss-1045/", "SS-1045"], ["automatic page", "/lp/?p=SS-9999", "SS-9999"]]) {
  test(`${name}: a gone model shows "not available", available models from the catalog, noindex`, async ({ page }) => {
    const external = [];
    await page.route("**/storage/v1/object/public/**", r => r.fulfill({ contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" width="4" height="5"/>' }));
    page.on("request", r => { const u = new URL(r.url()); if (u.hostname !== "127.0.0.1" && !u.pathname.startsWith("/storage/v1/object/public/")) external.push(u.host + u.pathname); });
    await gone(page, code);
    await page.goto(url);
    await expect(page.locator("#lpStatus, [role=status], .status").filter({ hasText: "الموديل ده مش متاح دلوقتي" }).first()).toBeVisible();
    const row = page.locator("#lpAvailableModels");
    await expect(row.locator("h2")).toHaveText("الموديل ده مش متاح دلوقتي");
    await expect(row).toBeInViewport();                                               // the first thing she sees
    const cards = row.locator("[data-related-code]");
    await expect(cards).not.toHaveCount(0);
    expect(await cards.count()).toBeLessThanOrEqual(6);
    expect(await cards.evaluateAll(a => a.map(x => x.dataset.relatedCode))).not.toContain(code);
    await expect(cards.first()).toHaveAttribute("href", /^\/lp\/\?p=SS-\d+/);
    await expect(row.locator(".lp-related-bag")).toHaveCount(0);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
    await expect(page.locator("#lpSubmit, #lpCta, button[type=submit]").first()).toBeDisabled();
    expect(external).toEqual([]);
  });
}

test("a server hiccup (not a 404) does not claim the model is gone and shows no catalog row", async ({ page }) => {
  await page.route("**/women-checkout/product/SS-1012", r => r.fulfill({ status: 503, json: { error: "service_unavailable" } }));
  await page.goto("/lp/ss-1012/");
  await expect(page.getByText("مش قادرين نتأكد من السعر والتوفر دلوقتي").first()).toBeVisible({ timeout: 15000 });
  await expect(page.locator("#lpAvailableModels")).toHaveCount(0);
});
