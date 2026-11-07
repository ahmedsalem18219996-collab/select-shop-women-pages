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
  await expect(hero(page)).toHaveAttribute("src", /b1b1/);                     // first buyable colour preview, never mixed gallery
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
  await expect(page.locator("#lpGallery button")).toHaveCount(2);               // only its 2 tagged photos, never shared/sibling media
  await expect(page.locator("#lpCount")).toHaveText("1/2");                     // back to this colour's first photo
  for (const src of await page.locator("#lpGallery img").evaluateAll(i => i.map(x => x.src))) expect(src).not.toMatch(/c1c1/); // never the brown photos
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

test("customer first sees a clear colour picker below the photo, not mixed colour images", async ({ page }) => {
  await page.goto("/lp/?p=SS-9101");
  await expect(page.locator("#lpQuickColors")).toBeVisible();
  await expect(page.locator("#lpQuickColors")).toContainText("اختيار اللون");
  await expect(page.locator("#lpQuickColors")).toContainText("متوفر لونين");
  // Single authoritative radio group: the selected colour is bound to the cart's Variant.
  await expect(page.locator("input[name=opt0]")).toHaveCount(3);
  await expect(page.locator("#lpOrder")).toBeDisabled();
  await expect(hero(page)).toHaveAttribute("src", /b1b1/);
  const initialPhotos = await page.locator("#lpGallery img").evaluateAll(imgs => imgs.map(img => img.src));
  expect(initialPhotos.every(src => !/c1c1/.test(src))).toBe(true);
  await page.locator("#lpQuickColors label:has(input[name=opt0][value='1'])").click();
  await expect(page.locator("#lpQuickColors")).toContainText("فيه لون تاني");
  await expect(hero(page)).toHaveAttribute("src", /c1c1/);
  await expect(page.locator("#lpOrder")).toBeEnabled(); // brown's only size is selected
  await expect(page.locator("#lpBarChoice")).toContainText("بني");
  await expect(page.locator(".order h2")).toContainText("تسجيل الطلب");
  await expect(page.locator("#lpMixToggle")).not.toContainText("عايزة");
});

test("new Admin model: two colours and distinct sizes in one COD order (isolated mock)", async ({ page, request }) => {
  const before = (await mockLog(request)).orders.length;
  await page.goto("/lp/?p=SS-9101");
  await expect(page.locator("#lpMixToggle")).toBeVisible();
  await page.locator("#lpMixToggle").click();
  await expect(page.locator("#lpMixRows .lp-mix-row")).toHaveCount(4); // blue S/M/L + brown One Size, no sold-out pink
  await expect(page.locator("#lpOrder")).toBeDisabled();
  await page.locator('#lpMixRows [data-mix-code="SS-9101@0.0,1.0"][data-delta="1"]').click();
  await page.locator('#lpMixRows [data-mix-code="SS-9101@0.1,1.3"][data-delta="1"]').click();
  await expect(page.locator("#lpOrder")).toBeEnabled();
  await expect(page.locator("#lpBarChoice")).toContainText("بيبي بلو");
  await expect(page.locator("#lpBarChoice")).toContainText("بني");
  await page.fill("[name=name]", "اختبار آلي");
  await page.fill("[name=phone]", "01012345678");
  await page.locator("[name=region]").selectOption("cairo");
  await page.fill("[name=address]", "عنوان اختبار فقط");
  await expect(page.locator("#lpSub")).toHaveText("١٬١٥٠ ج");
  await expect(page.locator("#lpTotal")).toHaveText("١٬٢٢٠ ج");
  await page.locator("#lpOrder").click();
  await expect(page.locator("#lpDone")).toBeVisible();
  await expect(page.locator("#lpDoneText")).toContainText("بيبي بلو");
  await expect(page.locator("#lpDoneText")).toContainText("بني");
  const orders = (await mockLog(request)).orders;
  expect(orders.length - before).toBe(1);
  expect(orders.at(-1).lines).toEqual([
    { publicCode: "SS-9101", structureVersion: 7, quantity: 1, selection: [{ optionPosition: 0, valuePosition: 0 }, { optionPosition: 1, valuePosition: 0 }] },
    { publicCode: "SS-9101", structureVersion: 7, quantity: 1, selection: [{ optionPosition: 0, valuePosition: 1 }, { optionPosition: 1, valuePosition: 3 }] },
  ]);
});

test("new model mixed mode excludes unavailable colour and disables empty orders", async ({ page }) => {
  await page.goto("/lp/?p=SS-9101");
  await page.locator("#lpMixToggle").click();
  await expect(page.locator("#lpMixRows")).not.toContainText("بينك");
  await expect(page.locator('#lpMixRows [data-mix-count="SS-9101@0.0,1.0"]')).toHaveText("٠");
  await page.locator('#lpMixRows [data-mix-code="SS-9101@0.0,1.0"][data-delta="1"]').click();
  await page.locator('#lpMixRows [data-mix-code="SS-9101@0.0,1.0"][data-delta="-1"]').click();
  await expect(page.locator("#lpOrder")).toBeDisabled();
});
