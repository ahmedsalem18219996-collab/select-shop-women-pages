import { test, expect } from "@playwright/test";

// SS-9101 is a TEST-ONLY fixture (one model, 3 real colour Variants, per-colour sizes, prices and tagged photos,
// in the shape of the public API with the media-target patch). Orders go to the local mock server only.
const mockLog = async (request) => (await request.get("/__mock/log")).json();
const hero = (page) => page.locator("#lpHero img");

test.beforeEach(async ({ page }) => {
  // Storage photos are answered locally; nothing reaches Supabase.
  await page.route("**/storage/v1/object/public/**", (r) => r.fulfill({ contentType: "image/svg+xml",
    body: '<svg xmlns="http://www.w3.org/2000/svg" width="300" height="400"><rect width="300" height="400" fill="#D4A4AF"/></svg>' }));
});

test("choosing a colour switches to its photos, shows only its real sizes and its price, then orders that exact Variant (COD mock)", async ({ page, request }) => {
  await page.goto("/lp/?p=SS-9101");
  await expect(page.locator("h1")).toHaveText("فستان سوارية مطرز");
  await expect(hero(page)).toHaveAttribute("src", /aaaa/);                     // shared photo before a colour is picked
  const colour = page.locator('input[name="opt0"]'), size = page.locator('input[name="opt1"]');
  await expect(colour).toHaveCount(3);
  await expect(colour.nth(2)).toBeDisabled();                                   // pink: not available from the supplier
  await expect(page.locator(".lp-opt i.sw").first()).toHaveCSS("background-color", "rgb(169, 200, 232)");

  await page.locator('label:has(input[name="opt0"][value="1"])').click();       // بني
  await expect(hero(page)).toHaveAttribute("src", /c1c1/);
  await expect(size.locator("visible=true")).toHaveCount(4);
  for (const [v, open] of [["0", false], ["1", false], ["2", false], ["3", true]]) {
    if (open) await expect(page.locator(`input[name="opt1"][value="${v}"]`)).toBeEnabled();
    else await expect(page.locator(`input[name="opt1"][value="${v}"]`)).toBeDisabled();
  }
  await expect(page.locator('input[name="opt1"][value="3"]')).toBeChecked();    // its only size is picked for her
  await expect(page.locator("#lpPrice")).toHaveText("٦٠٠");

  await page.locator('label:has(input[name="opt0"][value="0"])').click();       // بيبي بلو
  await expect(hero(page)).toHaveAttribute("src", /b1b1/);
  await expect(page.locator("#lpGallery img")).toHaveCount(2);                  // its 2nd photo + the shared one
  await expect(page.locator('input[name="opt1"][value="3"]')).toBeDisabled();
  await page.locator('label:has(input[name="opt1"][value="2"])').click();       // L
  await expect(page.locator("#lpPrice")).toHaveText("٥٥٠");

  const before = (await mockLog(request)).orders.length;
  await page.fill("[name=name]", "اختبار آلي");
  await page.fill("[name=phone]", "01012345678");
  await page.locator("[name=region]").selectOption("cairo");
  await page.fill("[name=address]", "عنوان اختبار فقط");
  await page.locator("#lpOrder").click();
  await expect(page.locator("#lpDone")).toBeVisible();
  const orders = (await mockLog(request)).orders;
  expect(orders.length - before).toBe(1);
  expect(orders.at(-1).lines).toEqual([{ publicCode: "SS-9101", structureVersion: 7, quantity: 1, selection: [{ optionPosition: 0, valuePosition: 0 }, { optionPosition: 1, valuePosition: 2 }] }]);
  if (test.info().project.name === "mobile") await page.screenshot({ path: test.info().outputPath("lp-colour-model.png") });
});
