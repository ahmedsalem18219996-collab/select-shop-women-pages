import { test, expect } from "@playwright/test";

// Campaign page phase 1 on the local mock only: the order box at the end of the page (same fields as /checkout/,
// regions from GET /regions, shipping and total from POST /checkout/quote), the fixed buy bar, the name and price
// over the first photo, the priced band, "other models" and the 6 self-hosted fonts. Nothing reaches Supabase.
const SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="300" height="400"><rect width="300" height="400" fill="#D4A4AF"/></svg>';
const setPage = (request, slug, codes, extra = {}) => request.post("/__mock/collection", { data: { slug, codes, title: "حملة " + slug, ...extra } });
const setDesign = (request, code, design) => request.post("/__mock/landing", { data: { code, design } });
const mockLog = async (request) => (await request.get("/__mock/log")).json();
const used = [];

test.beforeEach(async ({ page }) => {
  await page.route("**/storage/v1/object/public/**", r => r.fulfill({ contentType: "image/svg+xml", body: SVG }));
});
test.afterEach(async ({ request }) => {
  for (const slug of used.splice(0)) await setPage(request, slug, null);
  await setDesign(request, "SS-1013", null);
});

test("order box: two colours of one model and a One Size model become ONE COD order with server shipping", async ({ page, request }) => {
  used.push("box-order"); await setPage(request, "box-order", ["SS-9101", "SS-1012"]);
  const before = await mockLog(request);
  await page.goto("/collections/?slug=box-order&utm_source=meta&utm_campaign=box-test&utm_content=SS-9101");
  const box = page.locator("#cpOrder");
  await expect(box.locator(".cp-lines")).toContainText("الشنطة لسه فاضية");
  // Same fields and order as /checkout/.
  expect(await box.locator("#orderForm [name]").evaluateAll(els => els.map(e => e.getAttribute("name"))))
    .toEqual(["region", "name", "phone", "area", "address", "notes"]);
  await expect(box.locator("#region option")).not.toHaveCount(1);
  expect((await box.locator("#region option").allTextContents()).slice(1, 3)).toEqual(["القاهرة", "الجيزة"]);

  const a = page.locator('.cp-product[data-code="SS-9101"]');
  for (const colour of [0, 1]) {
    if (colour) await page.reload();                                                  // fresh choice; the bag stays
    await a.locator(".cp-option").first().locator(".cp-chip").nth(colour).click();
    await a.locator(".cp-option").nth(1).locator(".cp-chip:not([disabled])").first().click();
    await a.locator(".cp-add").click();
    await expect(a.locator(".cp-status")).toContainText("اتضافت للشنطة");
  }
  await page.locator('.cp-product[data-code="SS-1012"] .cp-add').click();
  await expect(box.locator(".cp-line")).toHaveCount(3);
  await expect(box.locator(".cp-line").nth(2)).toContainText("One Size");
  await expect(box.locator(".cp-line").nth(1)).toContainText("بني");

  await box.locator("#region").selectOption("cairo");
  await expect(box.locator("#shipping")).toContainText("ج.م");
  const total1 = await box.locator("#grandTotal").textContent();
  await box.locator(".cp-line").nth(2).getByRole("button", { name: /^زيادة/ }).click();   // quantity → fresh quote
  await expect(box.locator(".cp-line").nth(2).locator("output")).toHaveText("٢");
  await expect(box.locator("#grandTotal")).not.toHaveText(total1 || "");
  await expect(box.locator("#grandTotal")).toContainText("ج.م");

  await box.locator('[name="name"]').fill("اختبار آلي");
  await box.locator('[name="phone"]').fill("01012345678");
  await box.locator('[name="area"]').fill("مدينة نصر");
  await box.locator('[name="address"]').fill("عنوان اختبار فقط، شارع 1");
  await expect(box.locator("#placeOrder")).toBeEnabled();
  await box.locator("#placeOrder").click();
  await expect(page).toHaveURL(/\/order-success\/\?order=ORD-/);

  const log = await mockLog(request);
  expect(log.orders.length - before.orders.length).toBe(1);
  const order = log.orders.at(-1);
  expect(order.region).toBe("cairo");
  expect(order.lines.map(l => [l.publicCode, l.quantity, l.selection[0].valuePosition])).toEqual([
    ["SS-9101", 1, 0], ["SS-9101", 1, 1], ["SS-1012", 2, 0]]);
  const attr = log.attributions.at(-1);
  expect(attr.params).toMatchObject({ campaign: "box-test", content: "SS-9101" });
  expect(JSON.stringify(attr)).not.toContain("01012345678");
  expect(await page.evaluate(() => localStorage.getItem("women.cart.v1"))).toBe("[]");
});

test("removing the last piece empties the box; an order cannot be sent without a piece", async ({ page, request }) => {
  used.push("box-empty"); await setPage(request, "box-empty", ["SS-1012", "SS-1013"]);
  await page.goto("/collections/?slug=box-empty");
  await page.locator('.cp-product[data-code="SS-1012"] .cp-add').click();
  const box = page.locator("#cpOrder");
  await box.locator("#region").selectOption("giza");
  await expect(box.locator("#placeOrder")).toBeEnabled();
  await box.locator(".cp-line").getByRole("button", { name: /^تقليل/ }).click();
  await expect(box.locator(".cp-line")).toHaveCount(0);
  await expect(box.locator("#placeOrder")).toBeDisabled();
  await expect(box.locator("#status")).toContainText("إضافة موديل");
  await expect(page.locator("#cpBagCount")).toHaveText("");
});

test("fixed buy bar: hidden on the first screen, shown after it, hidden over the order box; takes her to buy", async ({ page, request }) => {
  used.push("box-bar"); await setPage(request, "box-bar", ["SS-1012", "SS-1013", "SS-1014"]);
  await page.goto("/collections/?slug=box-bar");
  const bar = page.locator(".cp-bag");
  await expect(page.locator("#cpOrder")).toBeAttached();
  await expect(bar).toBeHidden();
  await page.locator('.cp-product[data-code="SS-1013"]').scrollIntoViewIfNeeded();
  await page.mouse.wheel(0, 200);
  await expect(bar).toBeVisible();
  await expect(bar.locator(".cp-bag-link")).toHaveText("اطلب الآن");
  await bar.locator(".cp-bag-link").click();                                         // empty bag: the add button on screen
  await expect.poll(() => page.evaluate(() => [...document.querySelectorAll(".cp-product .cp-add")]
    .some(b => { const r = b.getBoundingClientRect(); return r.height > 0 && r.top >= 0 && r.bottom <= innerHeight; }))).toBe(true);
  await page.locator('.cp-product[data-code="SS-1013"] .cp-add').click();
  await expect(bar.locator(".cp-bag-count")).toContainText("١");
  await bar.locator(".cp-bag-link").click();                                         // a piece in the bag: the order box
  await expect(page.locator("#cpOrder h2")).toBeInViewport();
  await expect(bar).toBeHidden();
  const small = await page.locator(".cp-bag-link, .cp-line button, #orderForm input, #orderForm select").evaluateAll(els =>
    els.filter(e => e.getBoundingClientRect().height > 0 && e.getBoundingClientRect().height < 44).length);
  expect(small).toBe(0);
});

test("name and price over the first photo without a campaign photo; the band carries the price; other models", async ({ page, request }) => {
  used.push("box-cap"); await setPage(request, "box-cap", ["SS-1013", "SS-1012"]);
  await setDesign(request, "SS-1013", { title: "", motion: { mode: "cinematic", dirs: ["side"], hint: "" }, accent: "" });
  await page.goto("/collections/?slug=box-cap");
  const moving = page.locator('.cp-product[data-code="SS-1013"]');
  await expect(moving.locator(".mo-first .mo-cap b")).not.toHaveText("");
  await expect(moving.locator(".mo-first .mo-cap span")).toContainText("جنيه");
  await expect(moving.locator(".mo-sec:not(.mo-first) .mo-cap")).toHaveCount(0);
  await expect(moving.locator(".mo-track span").first()).toContainText("جنيه");
  await expect(moving.locator(".mo-track span").first()).toContainText("الدفع عند الاستلام");
  const plain = page.locator('.cp-product[data-code="SS-1012"]');
  await expect(plain.locator(".cp-cap")).toBeVisible();
  await expect(plain.locator(".cp-cap span")).toContainText("جنيه");

  const others = page.locator(".cp-others .cp-other");
  await expect(page.locator(".cp-others h2")).toHaveText("موديلات تانية");
  expect(await others.evaluateAll(a => a.map(x => x.getAttribute("href")))).toEqual(["#p-SS-1013", "#p-SS-1012"]);
  // "Other models" sits before the order box at the end of the page.
  expect(await page.evaluate(() => {
    const o = document.querySelector(".cp-others"), b = document.getElementById("cpOrder");
    return !!(o && b && o.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
  })).toBe(true);
});

test("a campaign photo of its own (hero) shows as is: no caption over it", async ({ page, request }) => {
  used.push("box-hero"); await setPage(request, "box-hero", ["SS-1013", "SS-1012"]);
  await setDesign(request, "SS-1013", { title: "", images: { hero: "women-storefront/storefront/hero-e2e.webp" } });
  await page.goto("/collections/?slug=box-hero");
  await expect(page.locator('.cp-product[data-code="SS-1013"] .cp-main')).toBeVisible();
  await expect(page.locator('.cp-product[data-code="SS-1013"] .cp-cap')).toHaveCount(0);
});

test("6 self-hosted fonts: a campaign font loads from this site only, never from Google", async ({ page, request }) => {
  used.push("box-font"); await setPage(request, "box-font", ["SS-1012", "SS-1013"], { theme: { enabled: true, font: "cairo" } });
  const fonts = [];
  page.on("request", r => { if (r.resourceType() === "font" || /fonts\.(googleapis|gstatic)/.test(r.url())) fonts.push(r.url()); });
  await page.goto("/collections/?slug=box-font");
  await expect(page.locator(".collection-hero h1")).toHaveCSS("font-family", /Cairo/);
  await expect(page.locator('.cp-product[data-code="SS-1012"] .cp-title')).toHaveCSS("font-family", /Cairo/);
  await expect.poll(() => fonts.some(u => u.endsWith("/assets/fonts/cairo-arabic.woff2"))).toBe(true);
  expect(fonts.filter(u => !new URL(u).pathname.startsWith("/assets/fonts/"))).toEqual([]);
  expect(await page.evaluate(() => document.fonts.check('700 20px "Cairo"', "طقم"))).toBe(true);
});
