import { test, expect } from "@playwright/test";

const LP = "/lp/ss-1008/";
const mockLog = async (request) => (await request.get("/__mock/log")).json();
const setStock = (request, code, units) => request.post("/__mock/stock", { data: { code, units } });
const expectPrices = async (page, text) => {
  await expect(page.locator("#lpPrice")).toHaveText(text);
  await expect(page.locator("#lpBarPrice")).toHaveText(text === "—" ? "—" : text + " ج");
};
const product = (fields) => ({ json: { product: { publicCode: "SS-1008", structureVersion: 2, purchasable: true, title: "Leather jacket", ...fields } } });
/** Fills the four customer fields exactly like a shopper (Arabic digits in the phone on purpose). */
const fillBuyer = async (page, region = "cairo") => {
  await page.fill("[name=name]", "اختبار آلي");
  await page.fill("[name=phone]", "٠١٠ ١٢٣٤ ٥٦٧٨");
  await page.locator("[name=region]").selectOption(region);
  await page.fill("[name=address]", "عنوان اختبار فقط، شارع ١");
};

// Every test fails if the page reaches any origin except the local QA server. This is the guarantee that no
// production data, order or ad account is touched.
test.beforeEach(async ({ page }) => {
  page.external = [];
  page.on("request", r => { const u = new URL(r.url()); if (u.hostname !== "127.0.0.1") page.external.push(r.method() + " " + u.host + u.pathname); });
});

test("one page: real product data, the order form is already open under it, sticky confirm visible, local only", async ({ page, isMobile }) => {
  await page.goto(LP);
  await expect(page.locator("h1")).toHaveText("Leather jacket");
  await expectPrices(page, "١٬٢٠٠");
  await expect(page.locator("#lpForm")).toBeVisible(); // no button to reveal it
  for (const n of ["name", "phone", "region", "address"]) await expect(page.locator(`[name=${n}]`)).toBeVisible();
  await expect(page.locator("#lpOrder")).toHaveText("تأكيد الطلب");
  await expect(page.locator("#lpOrder")).toBeEnabled();
  if (isMobile) await expect(page.locator("#lpOrder")).toBeInViewport(); // desktop: the button sits under the form
  await expect(page.locator("[name=region] option")).toHaveCount(4);
  const hero = page.locator(".hero img");
  await expect(hero).toHaveJSProperty("complete", true);
  expect(await hero.evaluate(i => i.currentSrc)).toMatch(/\/lp\/ss-1008\/img\/SS-1008\/0-\d+\.(avif|webp)$/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(await page.evaluate(() => getComputedStyle(document.body).direction)).toBe("rtl");
  expect(page.external).toEqual([]);
});

test("order jump keeps both real colour choices visible inside COD form and submits selected SKU", async ({ page, request }) => {
  await page.goto(LP);
  await page.locator('.top a[href="#lpForm"]').click();
  await expect(page.locator("#lpFormColors")).toBeVisible();
  await expect(page.locator("#lpFormColors .chip")).toHaveCount(2);
  await expect(page.locator("#lpColors .chip")).toHaveCount(2);
  await page.locator('#lpFormColors [data-code="SS-1009"]').click();
  await expect(page.locator("#lpColorName")).toHaveText("أسود");
  await expect(page.locator("#lpFormColorName")).toHaveText("أسود");
  await expect(page.locator('#lpColors .chip[aria-pressed="true"]')).toHaveAttribute("data-code", "SS-1009");
  await expect(page.locator('#lpFormColors .chip[aria-pressed="true"]')).toHaveAttribute("data-code", "SS-1009");
  await expect(page.locator("#lpHero img")).toHaveAttribute("src", /SS-1009/);
  await expect(page.locator("#lpOrder")).toBeEnabled();
  const before = (await mockLog(request)).orders.length;
  await fillBuyer(page);
  await page.locator("#lpOrder").click();
  await expect(page.locator("#lpDone")).toBeVisible();
  const orders = (await mockLog(request)).orders;
  expect(orders.length - before).toBe(1);
  expect(orders.at(-1).lines[0].publicCode).toBe("SS-1009");
  expect(page.external).toEqual([]);
});

test("old direct black jacket link redirects to two-colour model preserving chosen SKU and ad parameters", async ({ page }) => {
  await page.goto("/lp/ss-1009/?utm_source=instagram&fbclid=old-link-1");
  await expect(page).toHaveURL(u =>
    u.pathname === "/lp/ss-1008/" && u.searchParams.get("color") === "SS-1009" &&
    u.searchParams.get("utm_source") === "instagram" && u.searchParams.get("fbclid") === "old-link-1");
  await expect(page.locator("#lpColors .chip")).toHaveCount(2);
  await expect(page.locator("#lpFormColors .chip")).toHaveCount(2);
  await expect(page.locator("#lpFormColorName")).toHaveText("أسود");
  await expect(page.locator("#lpHero img")).toHaveAttribute("src", /SS-1009/);
  await expect(page.locator("#lpOrder")).toBeEnabled();
});

test("old Balloon Suit colour link redirects to full six-colour chooser without losing original colour", async ({ page }) => {
  await page.goto("/lp/ss-1035/?utm_source=facebook");
  await expect(page).toHaveURL(u =>
    u.pathname === "/lp/ballon-suit/" && u.searchParams.get("color") === "SS-1035" &&
    u.searchParams.get("utm_source") === "facebook");
  await expect(page.locator("#lpColors .chip")).toHaveCount(6);
  await expect(page.locator("#lpFormColors .chip")).toHaveCount(6);
  await expect(page.locator("#lpFormColorName")).toHaveText("بني");
  await expect(page.locator("#lpHero img")).toHaveAttribute("src", /SS-1035/);
  await expect(page.locator("#lpOrder")).toBeEnabled();
});

test("A/B: ?lpv pins the variant and the bucket is remembered", async ({ page }) => {
  await page.goto(LP + "?lpv=b");
  await expect(page.locator("html")).toHaveAttribute("data-v", "b");
  await page.goto(LP);
  await expect(page.locator("html")).toHaveAttribute("data-v", "b");
  await page.goto(LP + "?lpv=a");
  await expect(page.locator("html")).toHaveAttribute("data-v", "a");
});

test("direct COD order: server shipping per governorate, quantity, one order on double tap, confirmation in page", async ({ page, request }) => {
  const before = (await mockLog(request)).orders.length;
  await page.goto(LP);
  await expect(page.locator("#lpShip")).toHaveText("اختاري المحافظة");
  await expect(page.locator("#lpTotal")).toHaveText("—");
  await fillBuyer(page, "cairo");
  await expect(page.locator("#lpShip")).toHaveText("٧٠ ج");
  await expect(page.locator("#lpTotal")).toHaveText("١٬٢٧٠ ج");
  await expect(page.locator("#lpBarPrice")).toHaveText("١٬٢٧٠ ج"); // the sticky bar shows the same server total
  await page.locator("[name=region]").selectOption("aswan");
  await expect(page.locator("#lpShip")).toHaveText("١٢٠ ج");
  await page.locator("#lpQtyUp").click();
  await expect(page.locator("#lpQty")).toHaveText("٢");
  await expect(page.locator("#lpSub")).toHaveText("٢٬٤٠٠ ج");
  await expect(page.locator("#lpTotal")).toHaveText("٢٬٥٢٠ ج");
  await page.locator("#lpOrder").dblclick();
  await expect(page.locator("#lpDone")).toBeVisible();
  await expect(page.locator("#lpDoneCode")).toHaveText(/^ORD-[2-9A-Z]{8}$/);
  await expect(page.locator("#lpDoneText")).toContainText("٢٬٥٢٠");
  await expect(page.locator("#lpDoneText")).toContainText("التوافر وميعاد الشحن بيتأكدوا");
  await expect(page.locator("#lpForm")).toBeHidden();
  expect(new URL(page.url()).pathname).toBe(LP); // no cart, no checkout, no redirect
  const { orders } = await mockLog(request);
  expect(orders.length - before).toBe(1);
  expect(orders.at(-1)).toMatchObject({
    lines: [{ publicCode: "SS-1008", structureVersion: 2, quantity: 2, selection: [] }], region: "aswan", total: 252000, shipping: 12000,
    buyer: { name: "اختبار آلي", phone: "01012345678", area: "أسوان", address: "عنوان اختبار فقط، شارع ١", notes: "" } });
  expect(await page.evaluate(() => sessionStorage.getItem("women.lp.order.key.v1"))).toBeNull(); // next order = new attempt
  expect(page.external).toEqual([]);
});

test("unknown outcome: the order was saved but the reply was lost; retry returns the SAME order, never a second", async ({ page, request }) => {
  const before = (await mockLog(request)).orders.length;
  let lost = true;
  await page.route("**/women-checkout/orders", async route => {
    const reply = await route.fetch(); // the server really creates the order…
    if (lost) { lost = false; await route.fulfill({ status: 503, json: { error: "write_unconfirmed" } }); return; } // …but the phone never hears back
    await route.fulfill({ response: reply });
  });
  await page.goto(LP);
  await fillBuyer(page);
  await expect(page.locator("#lpTotal")).toHaveText("١٬٢٧٠ ج");
  await page.locator("#lpOrder").click();
  await expect(page.locator("#lpStatus")).toContainText("مش هيتكرر");
  const key = await page.evaluate(() => sessionStorage.getItem("women.lp.order.key.v1"));
  expect(key).toMatch(/^[0-9a-f]{32}$/);
  await page.reload(); // even a reload keeps the attempt's key
  await fillBuyer(page);
  await expect(page.locator("#lpTotal")).toHaveText("١٬٢٧٠ ج");
  await page.locator("#lpOrder").click();
  await expect(page.locator("#lpDoneCode")).toHaveText(/^ORD-/);
  const { orders } = await mockLog(request);
  expect(orders.length - before).toBe(1);
  expect(orders.at(-1).key).toBe(key);
});

test("stock: more pieces than are left cannot be confirmed; the order never oversells", async ({ page, request }) => {
  const before = (await mockLog(request)).orders.length;
  await setStock(request, "SS-1008", 1);
  try {
    await page.goto(LP);
    await fillBuyer(page);
    await expect(page.locator("#lpTotal")).toHaveText("١٬٢٧٠ ج");
    await page.locator("#lpQtyUp").click();
    await expect(page.locator("#lpStatus")).toContainText("الكمية دي مش متاحة");
    await expect(page.locator("#lpTotal")).toHaveText("—");
    await page.locator("#lpOrder").click();
    await expect(page.locator("#lpDone")).toBeHidden();
    expect((await mockLog(request)).orders.length - before).toBe(0);
    await page.locator("#lpQtyDown").click();
    await expect(page.locator("#lpTotal")).toHaveText("١٬٢٧٠ ج");
    await page.locator("#lpOrder").click();
    await expect(page.locator("#lpDoneCode")).toHaveText(/^ORD-/);
    // Sold out now: a second shopper's quote is refused by the server.
    await page.goto(LP);
    await fillBuyer(page);
    await expect(page.locator("#lpStatus")).toContainText("الكمية دي مش متاحة");
    expect((await mockLog(request)).orders.length - before).toBe(1);
  } finally { await setStock(request, "SS-1008", null); }
});

test("field help: empty or wrong fields are named next to the field and nothing is sent", async ({ page, request }) => {
  const before = (await mockLog(request)).orders.length;
  await page.goto(LP);
  await expect(page.locator("#lpOrder")).toBeEnabled();
  await page.locator("#lpOrder").click();
  for (const n of ["name", "phone", "region", "address"]) {
    await expect(page.locator(`#lpErr-${n}`)).not.toBeEmpty();
    await expect(page.locator(`[name=${n}]`)).toHaveAttribute("aria-invalid", "true");
  }
  await expect(page.locator("[name=name]")).toBeFocused();
  await fillBuyer(page);
  await page.fill("[name=phone]", "0223456789"); // landline
  await page.locator("#lpOrder").click();
  await expect(page.locator("#lpErr-phone")).toContainText("01012345678");
  await expect(page.locator("#lpErr-name")).toBeEmpty();
  await page.fill("[name=phone]", "01012345678");
  await expect(page.locator("#lpStatus")).toBeEmpty(); // the hint goes away once every field is fixed
  expect((await mockLog(request)).orders.length - before).toBe(0);
});

test("refused at confirm time with the same total (stock shortfall): nothing created, quantity hint, then one order", async ({ page, request }) => {
  const before = (await mockLog(request)).orders.length;
  let first = true;
  await page.route("**/women-checkout/orders", async route => {
    if (first) { first = false; await route.fulfill({ status: 409, json: { error: "checkout_changed" } }); return; }
    await route.continue();
  });
  await page.goto(LP);
  await fillBuyer(page);
  await expect(page.locator("#lpTotal")).toHaveText("١٬٢٧٠ ج");
  await page.locator("#lpOrder").click();
  await expect(page.locator("#lpStatus")).toContainText("أكبر من المتاح");
  expect((await mockLog(request)).orders.length - before).toBe(0);
  await expect(page.locator("#lpTotal")).toHaveText("١٬٢٧٠ ج");
  await page.locator("#lpOrder").click();
  await expect(page.locator("#lpDoneCode")).toHaveText(/^ORD-/);
  expect((await mockLog(request)).orders.length - before).toBe(1);
});

test("store switched order taking off (503 orders_not_enabled): clear message, nothing saved, no Purchase", async ({ page, request }) => {
  const before = (await mockLog(request)).orders.length;
  await page.route("**/women-checkout/orders", route => route.fulfill({ status: 503, json: { error: "orders_not_enabled" } }));
  await page.goto(LP);
  await fillBuyer(page);
  await expect(page.locator("#lpTotal")).toHaveText("١٬٢٧٠ ج");
  await page.locator("#lpOrder").click();
  await expect(page.locator("#lpStatus")).toContainText("استقبال الطلبات متوقف مؤقتًا");
  await expect(page.locator("#lpDone")).toBeHidden();
  expect((await mockLog(request)).orders.length - before).toBe(0);
});

test("multi-size product: size required, sold-out disabled, prices follow the size, the order carries it", async ({ page }) => {
  await page.route("**/__mock/functions/v1/women-checkout/product/SS-1008", route => route.fulfill(product({
    price: { currency: "EGP", minAmountMinor: 120000, maxAmountMinor: 125000 },
    options: [{ name: "المقاس", values: [{ position: 0, value: "S" }, { position: 1, value: "M" }, { position: 2, value: "L" }] }],
    variants: [0, 1, 2].map(p => ({ selection: [{ optionPosition: 0, valuePosition: p }], purchasable: p !== 2, unitPrice: { currency: "EGP", amountMinor: p === 1 ? 125000 : 120000 } })),
  })));
  // The mock backend prices the real one-size fixture, so this test's sizes get a matching quote and order reply.
  const sent = [];
  const money = (amountMinor) => ({ currency: "EGP", amountMinor });
  await page.route("**/__mock/functions/v1/women-checkout/checkout/quote", route => { sent.push(["quote", route.request().postDataJSON()]);
    route.fulfill({ json: { purchasable: true, merchandiseSubtotal: money(125000), shippingTotal: money(7000), grandTotal: money(132000) } }); });
  await page.route("**/__mock/functions/v1/women-checkout/orders", route => { sent.push(["order", route.request().postDataJSON()]);
    route.fulfill({ status: 201, json: { status: "created", publicOrderCode: "ORD-ABCDEFGH", grandTotal: money(132000) } }); });
  await page.goto(LP);
  await expect(page.getByRole("radio", { name: "L" })).toBeDisabled();
  await expectPrices(page, "من ١٬٢٠٠");
  await fillBuyer(page);
  expect(sent).toEqual([]); // no quote without a size
  await page.locator("#lpOrder").click();
  await expect(page.locator("#lpStatus")).toHaveText("اختاري المقاس الأول.");
  const chip = page.getByText("M", { exact: true });
  expect((await chip.boundingBox()).height).toBeGreaterThanOrEqual(44); // comfortable tap target
  // Interaction latency (INP proxy) of the size tap alone, measured by the browser's Event Timing API.
  await page.evaluate(() => { window.__worst = 0; new PerformanceObserver(l => l.getEntries().forEach(e => { window.__worst = Math.max(window.__worst, e.duration); })).observe({ type: "event", durationThreshold: 16 }); });
  await chip.click(); // tap the visible chip itself, exactly like a customer
  await expect(page.getByRole("radio", { name: "M" })).toBeChecked();
  await expect(page.locator("#lpPrice")).toHaveText("١٬٢٥٠");
  await expect(page.locator("#lpTotal")).toHaveText("١٬٣٢٠ ج");
  await page.waitForTimeout(300);
  const worst = await page.evaluate(() => window.__worst);
  console.log(`size tap event duration: ${worst} ms`);
  expect(worst).toBeLessThan(200);
  await page.locator("#lpOrder").click();
  await expect(page.locator("#lpDoneCode")).toHaveText("ORD-ABCDEFGH");
  const order = sent.find(s => s[0] === "order")[1];
  expect(order.lines).toEqual([{ publicCode: "SS-1008", structureVersion: 2, selection: [{ optionPosition: 0, valuePosition: 1 }], quantity: 1 }]);
  expect(order).toMatchObject({ paymentMethod: "cod", confirmedGrandTotalPiastres: 132000, confirmedShippingTotalPiastres: 7000, confirmedMerchandiseSubtotalPiastres: 125000 });
});

test("sticky price follows a changed live server price", async ({ page }) => {
  await page.route("**/women-checkout/product/SS-1008", route => route.fulfill(product({
    price: { currency: "EGP", minAmountMinor: 130000, maxAmountMinor: 130000 }, options: [],
    variants: [{ selection: [], purchasable: true, unitPrice: { currency: "EGP", amountMinor: 130000 } }],
  })));
  await page.goto(LP);
  await expectPrices(page, "١٬٣٠٠");
});

for (const [name, reply] of [
  ["missing (404)", { status: 404, json: { error: "not_found" } }],
  ["sold out", product({ purchasable: false, price: { currency: "EGP", minAmountMinor: 120000, maxAmountMinor: 120000 }, options: [], variants: [] })],
  ["service error (503)", { status: 503, json: { error: "service_unavailable" } }],
]) {
  test(`unavailable product (${name}): confirm disabled and no unverified price in page or sticky bar`, async ({ page }) => {
    await page.route("**/women-checkout/product/SS-1008", route => route.fulfill(reply));
    await page.goto(LP);
    await expect(page.locator("#lpStatus")).not.toBeEmpty();
    await expect(page.locator("#lpOrder")).toBeDisabled();
    await expectPrices(page, "—");
  });
}

test("automatic page for any product: old /lp/?p= and ?code= links order directly; local thumbnails; bad codes go home", async ({ page, request }) => {
  const before = (await mockLog(request)).orders.length;
  // SS-1099 is a test-only fixture (no page config): the automatic page for products added after a build.
  for (const url of ["/lp/?p=SS-1099", "/lp/?code=ss-1099"]) {
    await page.goto(url);
    await expect(page.locator("h1")).toHaveText("Leather jacket");
    await expect(page).toHaveTitle("Leather jacket · SELECT SHOP WOMEN");
    await expectPrices(page, "١٬٢٠٠");
    await expect(page.locator("#lpForm")).toBeVisible();
    await expect.poll(() => page.locator("#lpHero img").evaluate(i => i.currentSrc)).toMatch(/\/assets\/catalog-thumbs\/[0-9a-f]{32}\.jpg\.(w400\.)?webp$/);
  }
  await fillBuyer(page, "giza");
  await expect(page.locator("#lpTotal")).toHaveText("١٬٢٨٠ ج");
  await page.locator("#lpOrder").click();
  await expect(page.locator("#lpDoneCode")).toHaveText(/^ORD-/);
  const { orders } = await mockLog(request);
  expect(orders.length - before).toBe(1);
  expect(orders.at(-1).lines[0].publicCode).toBe("SS-1099");
  await page.goto("/lp/?p=SS-99999");
  await expect(page.locator("#lpStatus")).toHaveText("القطعة دي مش متاحة دلوقتي.");
  await expect(page.locator("#lpOrder")).toBeDisabled();
  await page.goto("/p/?code=SS-1008&utm_source=facebook&fbclid=abc123");
  await page.waitForURL(u => u.pathname === "/lp/ss-1008/");
  expect(new URL(page.url()).searchParams.get("utm_source")).toBe("facebook");
  expect(new URL(page.url()).searchParams.get("fbclid")).toBe("abc123");
  await expect(page.locator("#lpForm")).toBeVisible();
  await page.goto("/lp/?p=bad");
  await page.waitForURL(u => u.pathname === "/");
  expect(page.external).toEqual([]);
});

test("Facebook/Instagram in-app browser: no AbortSignal.timeout, blocked sessionStorage, still one order", async ({ browser, request }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 760 }, isMobile: true, hasTouch: true,
    userAgent: "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/90.0.4430.210 Mobile Safari/537.36 [FB_IAB/FB4A;FBAV/400.0.0.0;]" });
  await context.addInitScript(() => {
    delete AbortSignal.timeout;
    Object.defineProperty(window, "sessionStorage", { get() { throw new DOMException("blocked", "SecurityError"); } });
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  const before = (await mockLog(request)).orders.length;
  await page.goto(LP);
  await fillBuyer(page);
  await expect(page.locator("#lpTotal")).toHaveText("١٬٢٧٠ ج");
  await page.evaluate(() => scrollTo(0, 0));
  await page.locator("[name=address]").evaluate(el => { el.blur(); scrollTo(0, 0); el.focus(); }); // native focus scrolling keeps the field above the fixed confirm bar
  // The page scrolls smoothly (Atelier); wait for the focus scroll to settle, then the field must sit above the bar.
  await expect.poll(async () => {
    const [field, bar] = await Promise.all([page.locator("[name=address]").boundingBox(), page.locator(".bar").boundingBox()]);
    return field.y + field.height <= bar.y;
  }, { timeout: 3000 }).toBe(true);
  await expect(page.locator("#lpOrder")).toBeInViewport(); // the confirm button stays reachable while typing
  await page.locator("#lpOrder").tap();
  await expect(page.locator("#lpDoneCode")).toHaveText(/^ORD-/);
  expect((await mockLog(request)).orders.length - before).toBe(1);
  expect(errors).toEqual([]);
  await context.close();
});

// GA4 + Meta capture: /js/analytics.js is replaced by a recorder, so nothing leaves the QA server.
const FAKE_ANALYTICS = `(()=>{const rec=k=>function(){const s=JSON.parse(localStorage.getItem("__cap")||"[]");s.push([k,...arguments]);localStorage.setItem("__cap",JSON.stringify(s))};window.gtag=rec("gtag");window.womenMetaEvent=rec("meta");})();`;
const fakeAnalytics = (page, delayMs = 0) => page.route("**/js/analytics.js*", async route => {
  if (delayMs) await new Promise(r => setTimeout(r, delayMs));
  await route.fulfill({ contentType: "text/javascript", body: FAKE_ANALYTICS });
});
const captured = (page) => page.evaluate(() => JSON.parse(localStorage.getItem("__cap") || "[]"));
const gaEvents = (cap, name) => cap.filter(c => c[0] === "gtag" && c[1] === "event" && c[2] === name);
const metaEvents = (cap, name) => cap.filter(c => c[0] === "meta" && c[1] === name);

test("events follow real actions: view once, InitiateCheckout on first form use, Purchase only after a confirmed order", async ({ page }) => {
  await fakeAnalytics(page);
  await page.goto(LP + "?lpv=b");
  await expect.poll(async () => gaEvents(await captured(page), "view_item").length, { timeout: 8000 }).toBe(1); // idle load
  let cap = await captured(page);
  expect(cap.filter(c => c[0] === "gtag" && c[1] === "set")).toEqual([["gtag", "set", "user_properties", { lp_variant: "ss-1008:b" }]]);
  expect(gaEvents(cap, "lp_view")[0][3]).toMatchObject({ lp_id: "ss-1008", lp_variant: "ss-1008:b", item_id: "SS-1008" });
  expect(metaEvents(cap, "ViewContent")).toHaveLength(1);
  expect(metaEvents(cap, "InitiateCheckout")).toHaveLength(0); // looking is not checking out
  await fillBuyer(page); // several fields focused: still one begin_checkout
  await expect(page.locator("#lpTotal")).toHaveText("١٬٢٧٠ ج");
  cap = await captured(page);
  expect(gaEvents(cap, "begin_checkout")).toHaveLength(1);
  expect(metaEvents(cap, "InitiateCheckout")).toHaveLength(1);
  expect(gaEvents(cap, "purchase")).toHaveLength(0);
  await page.locator("#lpOrder").click();
  await expect(page.locator("#lpDoneCode")).toHaveText(/^ORD-/);
  await expect.poll(async () => gaEvents(await captured(page), "purchase").length).toBe(1);
  cap = await captured(page);
  expect(gaEvents(cap, "purchase")[0][3]).toMatchObject({ currency: "EGP", value: 1200, shipping: 70, lp_id: "ss-1008", lp_variant: "ss-1008:b",
    items: [{ item_id: "SS-1008", item_variant: "one_size", quantity: 1 }] });
  expect(metaEvents(cap, "Purchase")).toHaveLength(1);
  expect(metaEvents(cap, "Purchase")[0][3]).toMatch(/^[0-9a-f]{32}$/); // event id for Pixel/CAPI dedupe
  expect(metaEvents(cap, "AddToCart")).toHaveLength(0); // there is no cart on this page
  expect(JSON.stringify(cap)).not.toMatch(/01012345678|عنوان اختبار|ORD-/); // no PII or order code reaches analytics
});

test("a refused order sends no Purchase; a replayed order code is never reported twice", async ({ page }) => {
  await fakeAnalytics(page);
  let mode = "refuse";
  await page.route("**/women-checkout/orders", route => mode === "refuse"
    ? route.fulfill({ status: 409, json: { error: "checkout_not_purchasable" } })
    : route.fulfill({ status: 200, json: { status: "existing", publicOrderCode: "ORD-REPKAYAA", grandTotal: { currency: "EGP", amountMinor: 127000 } } }));
  await page.goto(LP);
  await fillBuyer(page);
  await expect(page.locator("#lpTotal")).toHaveText("١٬٢٧٠ ج");
  await page.locator("#lpOrder").click();
  await expect(page.locator("#lpStatus")).toContainText("مش متاح");
  await page.waitForTimeout(300);
  expect(metaEvents(await captured(page), "Purchase")).toHaveLength(0);
  mode = "existing";
  for (let i = 0; i < 2; i++) {
    await page.goto(LP);
    await fillBuyer(page);
    await expect(page.locator("#lpTotal")).toHaveText("١٬٢٧٠ ج");
    await page.locator("#lpOrder").click();
    await expect(page.locator("#lpDoneCode")).toHaveText("ORD-REPKAYAA");
  }
  await page.waitForTimeout(300);
  const cap = await captured(page);
  expect(metaEvents(cap, "Purchase")).toHaveLength(1);
  expect(gaEvents(cap, "purchase")).toHaveLength(1);
});
