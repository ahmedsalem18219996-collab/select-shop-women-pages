import { test, expect } from "@playwright/test";

const LP = "/lp/ss-1008/";
const mockLog = async (request) => (await request.get("/__mock/log")).json();
const expectPrices = async (page, text) => {
  await expect(page.locator("#lpPrice")).toHaveText(text);
  await expect(page.locator("#lpBarPrice")).toHaveText(text === "—" ? "—" : text + " ج");
};
const product = (fields) => ({ json: { product: { publicCode: "SS-1008", structureVersion: 2, purchasable: true, title: "Leather jacket", ...fields } } });

// Every test fails if the page reaches any origin except the local QA server (public photo CDN reads allowed
// only where a legacy page needs them). This is the guarantee that no production data or order is touched.
test.beforeEach(async ({ page }) => {
  page.external = [];
  page.on("request", r => { const u = new URL(r.url()); if (u.hostname !== "127.0.0.1") page.external.push(r.method() + " " + u.host + u.pathname); });
});

test("pilot LP paints real product data, re-checks it live and stays on the local server", async ({ page }) => {
  await page.goto(LP);
  await expect(page.locator("h1")).toHaveText("Leather jacket");
  await expectPrices(page, "١٬٢٠٠");
  await expect(page.locator("#lpOrder")).toBeEnabled();
  await expect(page.locator("#lpOrder")).toBeInViewport(); // sticky CTA visible without scrolling
  const hero = page.locator(".hero img");
  await expect(hero).toHaveJSProperty("complete", true);
  expect(await hero.evaluate(i => i.currentSrc)).toMatch(/\/lp\/ss-1008\/img\/SS-1008\/0-\d+\.(avif|webp)$/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(page.external).toEqual([]);
});

test("A/B: ?lpv pins the variant and the bucket is remembered", async ({ page }) => {
  await page.goto(LP + "?lpv=b");
  await expect(page.locator("html")).toHaveAttribute("data-v", "b");
  await page.goto(LP);
  await expect(page.locator("html")).toHaveAttribute("data-v", "b");
  await page.goto(LP + "?lpv=a");
  await expect(page.locator("html")).toHaveAttribute("data-v", "a");
});

test("order: LP -> existing checkout -> one confirmed order even on double submit", async ({ page, request }) => {
  const before = (await mockLog(request)).orders.length;
  await page.goto(LP);
  await page.locator("#lpOrder").click();
  await page.waitForURL("**/checkout/");
  await page.locator("#region").selectOption("cairo");
  await expect(page.locator("#grandTotal")).toContainText("١٬٢٧٠");
  await page.fill("[name=name]", "اختبار آلي");
  await page.fill("[name=phone]", "01000000000");
  await page.fill("[name=area]", "مدينة نصر");
  await page.fill("[name=address]", "عنوان اختبار فقط");
  await expect(page.locator("#placeOrder")).toBeEnabled();
  await page.locator("#placeOrder").dblclick();
  await page.waitForURL(/\/order-success\/\?order=ORD-/);
  await expect(page.locator("#orderCode")).toHaveText(/^ORD-[2-9A-Z]{8}$/);
  const { orders } = await mockLog(request);
  expect(orders.length - before).toBe(1);
  expect(orders.at(-1).lines).toEqual([{ publicCode: "SS-1008", structureVersion: 2, quantity: 1, selection: [] }]);
  expect(page.external).toEqual([]);
});

test("multi-size product: size required, sold-out disabled, both prices follow the chosen size", async ({ page }) => {
  await page.route("**/__mock/functions/v1/women-checkout/product/SS-1008", route => route.fulfill(product({
    price: { currency: "EGP", minAmountMinor: 120000, maxAmountMinor: 125000 },
    options: [{ name: "المقاس", values: [{ position: 0, value: "S" }, { position: 1, value: "M" }, { position: 2, value: "L" }] }],
    variants: [0, 1, 2].map(p => ({ selection: [{ optionPosition: 0, valuePosition: p }], purchasable: p !== 2, unitPrice: { currency: "EGP", amountMinor: p === 1 ? 125000 : 120000 } })),
  })));
  // The mock backend validates /cart/add against the real one-size fixture, so this test's multi-size
  // product needs a matching cart check; we record what the page sent instead.
  const added = [];
  await page.route("**/__mock/functions/v1/women-checkout/cart/add", route => { added.push(route.request().postDataJSON()); route.fulfill({ json: { ok: true } }); });
  await page.goto(LP);
  await expect(page.getByRole("radio", { name: "L" })).toBeDisabled();
  await expectPrices(page, "من ١٬٢٠٠");
  await page.locator("#lpOrder").click();
  await expect(page.locator("#lpStatus")).toHaveText("اختاري المقاس الأول.");
  const chip = page.getByText("M", { exact: true });
  expect((await chip.boundingBox()).height).toBeGreaterThanOrEqual(44); // comfortable tap target
  await expect(page.locator("#lpOrder")).toBeInViewport(); // sticky CTA stays reachable
  await chip.click(); // tap the visible chip itself, exactly like a customer
  await expect(page.getByRole("radio", { name: "M" })).toBeChecked();
  await expectPrices(page, "١٬٢٥٠"); // the sticky bar shows the chosen size's price too
  // Interaction latency (INP proxy) on the size tap, measured by the browser's Event Timing API.
  const worst = await page.evaluate(() => new Promise(res => {
    let max = 0; new PerformanceObserver(l => l.getEntries().forEach(e => { max = Math.max(max, e.duration); })).observe({ type: "event", buffered: true, durationThreshold: 16 });
    setTimeout(() => res(max), 300);
  }));
  console.log(`size tap event duration: ${worst} ms`);
  expect(worst).toBeLessThan(200);
  await page.locator("#lpOrder").click();
  await page.waitForURL("**/checkout/");
  expect(added.at(-1).selection).toEqual([{ optionPosition: 0, valuePosition: 1 }]);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("women.cart.v1")).at(-1).selection)).toEqual([{ optionPosition: 0, valuePosition: 1 }]);
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
  test(`unavailable product (${name}): CTA disabled and no unverified price in page or sticky bar`, async ({ page }) => {
    await page.route("**/women-checkout/product/SS-1008", route => route.fulfill(reply));
    await page.goto(LP);
    await expect(page.locator("#lpStatus")).not.toBeEmpty();
    await expect(page.locator("#lpOrder")).toBeDisabled();
    await expectPrices(page, "—");
  });
}

test("product links: storefront link, legacy /lp/?p= page and product page still work", async ({ page }) => {
  await page.goto(LP);
  await expect(page.getByRole("link", { name: "كل القطع" })).toHaveAttribute("href", "/");
  await page.goto("/lp/?p=SS-1008");
  await expect(page.locator("#cta")).toHaveAttribute("href", /\/p\/\?code=SS-1008$/);
  await page.goto("/p/?code=SS-1008");
  await expect(page.locator("#productTitle")).toHaveText("Leather jacket");
  await page.goto("/lp/?p=bad");
  await page.waitForURL(u => u.pathname === "/");
});

// GA4 + Meta capture: /js/analytics.js is replaced by a recorder, so nothing leaves the QA server.
const FAKE_ANALYTICS = `(()=>{const rec=k=>function(){const s=JSON.parse(sessionStorage.getItem("__cap")||"[]");s.push([k,...arguments]);sessionStorage.setItem("__cap",JSON.stringify(s))};window.gtag=rec("gtag");window.womenMetaEvent=rec("meta");})();`;
const fakeAnalytics = (page, delayMs = 0) => page.route("**/js/analytics.js*", async route => {
  if (delayMs) await new Promise(r => setTimeout(r, delayMs));
  await route.fulfill({ contentType: "text/javascript", body: FAKE_ANALYTICS });
});
const captured = (page) => page.evaluate(() => JSON.parse(sessionStorage.getItem("__cap") || "[]"));
const gaEvents = (cap, name) => cap.filter(c => c[0] === "gtag" && c[1] === "event" && c[2] === name);
const metaEvents = (cap, name) => cap.filter(c => c[0] === "meta" && c[1] === name);

test("A/B attribution: one scoped variant value from LP view to the purchase event, each funnel event once", async ({ page }) => {
  await fakeAnalytics(page);
  await page.goto(LP + "?lpv=b");
  await expect.poll(async () => gaEvents(await captured(page), "view_item").length, { timeout: 8000 }).toBe(1); // idle load
  let cap = await captured(page);
  // gtag.js signature: gtag("set", "user_properties", { ... })
  expect(cap.filter(c => c[0] === "gtag" && c[1] === "set")).toEqual([["gtag", "set", "user_properties", { lp_variant: "ss-1008:b" }]]);
  expect(gaEvents(cap, "lp_view")[0][3]).toMatchObject({ lp_id: "ss-1008", lp_variant: "ss-1008:b", item_id: "SS-1008" });
  expect(metaEvents(cap, "ViewContent")).toHaveLength(1);
  await page.locator("#lpOrder").click();
  await page.waitForURL("**/checkout/");
  await page.locator("#region").selectOption("cairo");
  await page.fill("[name=name]", "اختبار آلي");
  await page.fill("[name=phone]", "01000000000");
  await page.fill("[name=area]", "اختبار");
  await page.fill("[name=address]", "عنوان اختبار فقط");
  await expect(page.locator("#placeOrder")).toBeEnabled();
  await page.locator("#placeOrder").click();
  await page.waitForURL(/\/order-success\//);
  await expect(page.locator("#orderCode")).toHaveText(/^ORD-/);
  cap = await captured(page);
  expect(gaEvents(cap, "lp_order_click").map(c => c[3].lp_variant)).toEqual(["ss-1008:b"]);
  expect(metaEvents(cap, "AddToCart")).toHaveLength(1);
  expect(metaEvents(cap, "ViewContent")).toHaveLength(1);
  const purchases = gaEvents(cap, "purchase");
  expect(purchases).toHaveLength(1);
  expect(purchases[0][3]).toMatchObject({ lp_id: "ss-1008", lp_variant: "ss-1008:b", items: [{ item_id: "SS-1008", quantity: 1 }] });
  expect(JSON.stringify(cap)).not.toMatch(/01000000000|عنوان اختبار|ORD-/); // no PII or order code reaches analytics
  expect(await page.evaluate(() => sessionStorage.getItem("women.lp.attribution.v1"))).toBeNull(); // credited once
  expect(page.external).toEqual([]);
});

test("early tap before analytics loads: events still sent exactly once, checkout not blocked", async ({ page }) => {
  await fakeAnalytics(page, 400);
  await page.goto(LP + "?lpv=a");
  await expect(page.locator("#lpOrder")).toBeEnabled();
  await page.locator("#lpOrder").click(); // well before the idle load
  await page.waitForURL("**/checkout/");
  const cap = await captured(page);
  expect(gaEvents(cap, "lp_order_click")).toHaveLength(1);
  expect(gaEvents(cap, "add_to_cart")).toHaveLength(1);
  expect(metaEvents(cap, "AddToCart")).toHaveLength(1);
  expect(metaEvents(cap, "ViewContent")).toHaveLength(1);
  expect(gaEvents(cap, "lp_view")[0][3].lp_variant).toBe("ss-1008:a");
});

test("rejected cart add: no AddToCart, no order click, no attribution, stays on the LP", async ({ page }) => {
  await fakeAnalytics(page);
  await page.route("**/women-checkout/cart/add", route => route.fulfill({ status: 409, json: { error: "unavailable" } }));
  await page.goto(LP);
  await expect.poll(async () => metaEvents(await captured(page), "ViewContent").length, { timeout: 8000 }).toBe(1);
  await page.locator("#lpOrder").click();
  await expect(page.locator("#lpStatus")).toHaveText("المقاس ده خلص، اختاري مقاس تاني.");
  await page.waitForTimeout(300);
  const cap = await captured(page);
  expect(metaEvents(cap, "AddToCart")).toHaveLength(0);
  expect(gaEvents(cap, "add_to_cart")).toHaveLength(0);
  expect(gaEvents(cap, "lp_order_click")).toHaveLength(0);
  expect(await page.evaluate(() => sessionStorage.getItem("women.lp.attribution.v1"))).toBeNull();
  expect(new URL(page.url()).pathname).toBe("/lp/ss-1008/");
});
