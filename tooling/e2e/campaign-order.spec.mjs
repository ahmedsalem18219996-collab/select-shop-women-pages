import { test, expect } from "@playwright/test";

// Campaign page phase 1 on the local mock only: the order box (a card per model with colour, size, quantity and
// "أكثر من لون؟", then the same fields as /checkout/, shipping and total from POST /checkout/quote), the glass buy bar,
// the name and price over the first photo, the priced band, "other models" and the one campaign colour (PR #65
// theme.accent, else ctaColor). Nothing reaches Supabase.
const SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="300" height="400"><rect width="300" height="400" fill="#D4A4AF"/></svg>';
const setPage = (request, slug, codes, extra = {}) => request.post("/__mock/collection", { data: { slug, codes, title: "حملة " + slug, ...extra } });
const setDesign = (request, code, design) => request.post("/__mock/landing", { data: { code, design } });
const mockLog = async (request) => (await request.get("/__mock/log")).json();
const used = [];
const card = (page, code) => page.locator(`.cp-card[data-code="${code}"]`);
const key = (page, code, k) => card(page, code).locator(`[data-k="${k}"]`);
const bag = (page) => page.evaluate(() => JSON.parse(localStorage.getItem("women.cart.v1") || "[]")
  .map(l => [l.publicCode, l.quantity, l.selection.map(s => s.valuePosition)]));

test.beforeEach(async ({ page }) => {
  await page.route("**/storage/v1/object/public/**", r => r.fulfill({ contentType: "image/svg+xml", body: SVG }));
});
test.afterEach(async ({ request }) => {
  for (const slug of used.splice(0)) await setPage(request, slug, null);
  await setDesign(request, "SS-1013", null);
});

test("order box cards: two colours of one model, a size choice and a One Size model become ONE COD order", async ({ page, request }) => {
  used.push("box-order"); await setPage(request, "box-order", ["SS-9102", "SS-9101", "SS-1012"]);
  const before = await mockLog(request);
  await page.goto("/collections/?slug=box-order&utm_source=meta&utm_campaign=box-test&utm_content=SS-9102");
  const box = page.locator("#cpOrder");
  await expect(box.locator(".cp-card")).toHaveCount(3);
  // Same fields and order as /checkout/.
  expect(await box.locator("#orderForm [name]").evaluateAll(els => els.map(e => e.getAttribute("name"))))
    .toEqual(["region", "name", "phone", "area", "address", "notes"]);
  expect((await box.locator("#region option").allTextContents()).slice(1, 3)).toEqual(["القاهرة", "الجيزة"]);

  // Model 1: size M, black, then "أكثر من لون؟" → 1 black + 2 beige in size M.
  await key(page, "SS-9102", "1:1").click();
  await expect(card(page, "SS-9102").locator(".cp-status")).toContainText("اللون");
  await key(page, "SS-9102", "0:0").click();
  await expect(key(page, "SS-9102", "q+").locator("xpath=..").locator("output")).toHaveText("١");
  const mix = key(page, "SS-9102", "mix");
  await expect(mix).toHaveText("أكثر من لون؟ تحديد كمية كل لون");
  await mix.click();
  await expect(mix).toHaveAttribute("aria-expanded", "true");
  await expect(mix).toHaveText("لون واحد بس");
  await expect(card(page, "SS-9102").locator(".cp-colour")).toHaveCount(3);
  await expect(card(page, "SS-9102").locator(".cp-colour").first()).toContainText("أسود");
  await key(page, "SS-9102", "c1+").click();
  await key(page, "SS-9102", "c1+").click();
  // Model 2: brown comes in One Size only; model 3 has nothing to choose but the quantity.
  await key(page, "SS-9101", "0:1").click();
  await key(page, "SS-9101", "1:3").click();
  await expect(card(page, "SS-1012").locator(".cp-pill")).toHaveText("One Size");
  await key(page, "SS-1012", "q+").click();
  await expect.poll(() => bag(page)).toEqual([["SS-9102", 1, [0, 1]], ["SS-9102", 2, [1, 1]], ["SS-9101", 1, [1, 3]], ["SS-1012", 1, [0]]]);
  await expect(page.locator("#cpBagCount")).toHaveText("٥");

  await box.locator("#region").selectOption("cairo");
  await expect(box.locator("#shipping")).toContainText("ج.م");
  const total1 = await box.locator("#grandTotal").textContent();
  await key(page, "SS-1012", "q+").click();                                          // quantity → fresh quote
  await expect(box.locator("#grandTotal")).not.toHaveText(total1 || "");
  await expect(box.locator("#grandTotal")).toContainText("ج.م");

  await box.locator('[name="name"]').fill("اختبار آلي");
  await box.locator('[name="phone"]').fill("01012345678");
  await box.locator('[name="area"]').fill("مدينة نصر");
  await box.locator('[name="address"]').fill("عنوان اختبار فقط، شارع 1");
  await expect(box.locator("#placeOrder")).toBeEnabled();
  await expect(box.locator("#placeOrder")).toHaveText("تأكيد الطلب · الدفع عند الاستلام");
  await box.locator("#placeOrder").click();
  await expect(page).toHaveURL(/\/order-success\/\?order=ORD-/);

  const log = await mockLog(request);
  expect(log.orders.length - before.orders.length).toBe(1);
  const order = log.orders.at(-1);
  expect(order.region).toBe("cairo");
  expect(order.lines.map(l => [l.publicCode, l.quantity, l.selection.map(s => s.valuePosition)])).toEqual([
    ["SS-9102", 1, [0, 1]], ["SS-9102", 2, [1, 1]], ["SS-9101", 1, [1, 3]], ["SS-1012", 2, [0]]]);
  const attr = log.attributions.at(-1);
  expect(attr.params).toMatchObject({ campaign: "box-test", content: "SS-9102" });
  expect(JSON.stringify(attr)).not.toContain("01012345678");
  expect(await page.evaluate(() => localStorage.getItem("women.cart.v1"))).toBe("[]");
});

test("a colour that is not sold in the chosen size cannot be added; one colour again keeps the biggest count", async ({ page, request }) => {
  used.push("box-mix"); await setPage(request, "box-mix", ["SS-9102", "SS-1012"]);
  await page.goto("/collections/?slug=box-mix");
  await key(page, "SS-9102", "mix").click();
  await expect(card(page, "SS-9102").locator(".cp-status")).toContainText("المقاس");
  await key(page, "SS-9102", "1:2").click();                                         // L: olive is sold out in L
  await expect(key(page, "SS-9102", "c2+")).toBeDisabled();
  await key(page, "SS-9102", "c0+").click();
  await key(page, "SS-9102", "c1+").click();
  await key(page, "SS-9102", "c1+").click();
  await expect.poll(() => bag(page)).toEqual([["SS-9102", 1, [0, 2]], ["SS-9102", 2, [1, 2]]]);
  await key(page, "SS-9102", "mix").click();
  await expect.poll(() => bag(page)).toEqual([["SS-9102", 2, [1, 2]]]);
  await expect(key(page, "SS-9102", "0:1")).toHaveAttribute("aria-pressed", "true");
});

test("the section's add button and the card are one bag; the last piece removed means no order", async ({ page, request }) => {
  used.push("box-empty"); await setPage(request, "box-empty", ["SS-1012", "SS-1013"]);
  await page.goto("/collections/?slug=box-empty");
  await page.locator('.cp-product[data-code="SS-1012"] .cp-add').click();
  await expect(key(page, "SS-1012", "q+").locator("xpath=..").locator("output")).toHaveText("١");
  const box = page.locator("#cpOrder");
  await box.locator("#region").selectOption("giza");
  await expect(box.locator("#placeOrder")).toBeEnabled();
  await key(page, "SS-1012", "q-").click();
  await expect(key(page, "SS-1012", "q-")).toBeDisabled();
  await expect(box.locator("#placeOrder")).toBeDisabled();
  await expect(box.locator("#status")).toContainText("إضافة موديل");
  await expect(page.locator("#cpBagCount")).toHaveText("");
});

test("a piece added on another page stays in the order and can be changed here", async ({ page, request }) => {
  used.push("box-other"); await setPage(request, "box-other", ["SS-1012", "SS-1013"]);
  await page.goto("/collections/?slug=box-other");
  await page.evaluate(() => localStorage.setItem("women.cart.v1", JSON.stringify([{ publicCode: "SS-1014", structureVersion: 1, quantity: 1, selection: [] }])));
  await page.reload();
  await expect(page.locator("#cpLines .cp-line")).toHaveCount(1);
  await page.locator("#cpLines .cp-line").getByRole("button", { name: /^تقليل/ }).click();
  await expect(page.locator("#cpLines .cp-line")).toHaveCount(0);
});

test("glass buy bar: hidden on the first screen, shows the price of the model on screen, takes her to its card", async ({ page, request }) => {
  used.push("box-bar"); await setPage(request, "box-bar", ["SS-1012", "SS-1013", "SS-1014"]);
  await page.goto("/collections/?slug=box-bar");
  const bar = page.locator(".cp-bag");
  await expect(page.locator("#cpOrder")).toBeAttached();
  await expect(bar).toBeHidden();
  await page.locator('.cp-product[data-code="SS-1013"]').scrollIntoViewIfNeeded();
  await page.mouse.wheel(0, 200);
  await expect(bar).toBeVisible();
  await expect(bar.locator(".cp-bag-link")).toContainText("اطلب الآن · ");
  await expect(bar.locator(".cp-bag-link")).toContainText("جنيه");
  expect(await bar.evaluate(e => getComputedStyle(e).backdropFilter || getComputedStyle(e).webkitBackdropFilter)).toContain("blur");
  await bar.locator(".cp-bag-link").click();
  await expect(page.locator(".cp-card").first()).toBeInViewport();
  await expect(bar).toBeHidden();
  const small = await page.locator(".cp-bag-link, .cp-card button, .cp-line button, #orderForm input, #orderForm select").evaluateAll(els =>
    els.filter(e => e.getBoundingClientRect().height > 0 && e.getBoundingClientRect().height < 44).length);
  expect(small).toBe(0);
});

test("model badge, name and price at the bottom of the first photo; the band carries the price; other models after the box", async ({ page, request }) => {
  used.push("box-cap"); await setPage(request, "box-cap", ["SS-1013", "SS-1012"]);
  await setDesign(request, "SS-1013", { title: "", motion: { mode: "cinematic", dirs: ["side"], hint: "" }, accent: "" });
  await page.goto("/collections/?slug=box-cap");
  const moving = page.locator('.cp-product[data-code="SS-1013"]');
  await expect(moving.locator(".mo-first .mo-cap .mo-mark")).not.toHaveText("");
  await expect(moving.locator(".mo-first .mo-price")).toContainText("جنيه");
  await expect(moving.locator(".mo-first .mo-badge")).toHaveText("موديل ١ من ٢");
  await expect(moving.locator(".mo-sec:not(.mo-first) .mo-cap")).toHaveCount(0);
  await expect(moving.locator(".mo-track span").first()).toContainText("جنيه");
  await expect(moving.locator(".mo-track span").first()).toContainText("الدفع عند الاستلام");
  const plain = page.locator('.cp-product[data-code="SS-1012"]');
  await expect(plain.locator(".cp-cap .cp-mark")).toBeVisible();
  await expect(plain.locator(".cp-cap-price")).toContainText("جنيه");
  await expect(plain.locator(".cp-badge")).toHaveText("موديل ٢ من ٢");
  await expect(plain.locator(".cp-track span").first()).toContainText("الدفع عند الاستلام");
  const [cap, photo] = await Promise.all([plain.locator(".cp-cap").boundingBox(), plain.locator(".cp-photo").boundingBox()]);
  expect(Math.abs((cap?.y || 0) + (cap?.height || 0) - (photo?.y || 0) - (photo?.height || 0))).toBeLessThan(2);

  await expect(page.locator(".cp-others h2")).toHaveText("موديلات تانية");
  expect(await page.locator(".cp-others .cp-other").evaluateAll(a => a.map(x => x.getAttribute("href")))).toEqual(["#p-SS-1013", "#p-SS-1012"]);
  expect(await page.evaluate(() => {
    const o = document.querySelector(".cp-others"), b = document.getElementById("cpOrder");
    return !!(o && b && b.compareDocumentPosition(o) & Node.DOCUMENT_POSITION_FOLLOWING);
  })).toBe(true);
});

test("a campaign photo of its own (hero) shows as is: no caption over it", async ({ page, request }) => {
  used.push("box-hero"); await setPage(request, "box-hero", ["SS-1013", "SS-1012"]);
  await setDesign(request, "SS-1013", { title: "", images: { hero: "women-storefront/storefront/hero-e2e.webp" } });
  await page.goto("/collections/?slug=box-hero");
  await expect(page.locator('.cp-product[data-code="SS-1013"] .cp-main')).toBeVisible();
  await expect(page.locator('.cp-product[data-code="SS-1013"] .cp-cap')).toHaveCount(0);
});

for (const [name, theme, rgb] of [
  ["theme.accent", { enabled: true, accent: "#C62828", ctaColor: "gold" }, "rgb(198, 40, 40)"],
  ["ctaColor when accent is empty", { enabled: true, accent: "", ctaColor: "gold" }, "rgb(217, 180, 90)"],
  ["ctaColor when accent is not #RRGGBB", { enabled: true, accent: "red", ctaColor: "cyan" }, "rgb(46, 217, 209)"],
]) {
  test(`one campaign colour (PR #65): ${name} on buy buttons, band, bag count and bar`, async ({ page, request }) => {
    const slug = "box-accent-" + rgb.replace(/\D/g, "");
    used.push(slug); await setPage(request, slug, ["SS-1012", "SS-1013"], { theme });
    await page.goto("/collections/?slug=" + slug);
    const bg = (sel) => page.locator(sel).first().evaluate(e => getComputedStyle(e).backgroundColor);
    await expect.poll(() => bg('.cp-product[data-code="SS-1012"] .cp-add')).toBe(rgb);
    expect(await bg("#placeOrder")).toBe(rgb);
    expect(await bg(".cp-bag-link")).toBe(rgb);
    expect(await bg(".cp-marq")).toBe(rgb);
    await page.locator('.cp-product[data-code="SS-1012"] .cp-add').click();
    await expect.poll(() => bg("#cpBagCount")).toBe(rgb);
  });
}

test("campaign texts (PR #68): ctaText on the buy buttons and the fixed bar, hintText as the swipe hint; blank = defaults", async ({ page, request }) => {
  used.push("box-texts"); await setPage(request, "box-texts", ["SS-1013", "SS-1012"], { theme: { enabled: true, ctaText: "اشتري دلوقتي", hintText: "اسحبي للمزيد" } });
  await setDesign(request, "SS-1013", { title: "", motion: { mode: "cinematic", dirs: ["side"], hint: "" } });
  await page.goto("/collections/?slug=box-texts");
  await expect(page.locator('.cp-product[data-code="SS-1012"] .cp-add')).toHaveText("اشتري دلوقتي");
  await expect(page.locator(".mo-hint .mo-txt")).toHaveText("اسحبي للمزيد");
  await page.locator('.cp-product[data-code="SS-1012"]').scrollIntoViewIfNeeded();
  await page.mouse.wheel(0, 200);
  await expect(page.locator(".cp-bag-link")).toContainText("اشتري دلوقتي");
  await expect(page.locator("#placeOrder")).toHaveText("تأكيد الطلب · الدفع عند الاستلام");   // the final step stays explicit
  await setPage(request, "box-texts", ["SS-1013", "SS-1012"], { theme: { enabled: true, ctaText: "", hintText: "" } });
  await page.reload();
  await expect(page.locator('.cp-product[data-code="SS-1012"] .cp-add')).toHaveText("إضافة للشنطة");
});

test("theme off: buy buttons keep the store's Neon Purple", async ({ page, request }) => {
  used.push("box-noaccent"); await setPage(request, "box-noaccent", ["SS-1012", "SS-1013"], { theme: { enabled: false, accent: "#C62828" } });
  await page.goto("/collections/?slug=box-noaccent");
  await expect.poll(() => page.locator("#placeOrder").evaluate(e => getComputedStyle(e).backgroundColor)).toBe("rgb(209, 0, 209)");
});
