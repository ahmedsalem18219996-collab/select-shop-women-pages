import { test, expect } from "@playwright/test";

// One model page, several colours: each colour is its own real product (SS-1035…SS-1040). No product data is merged.
const MODEL = "/lp/ballon-suit/";
const mockLog = async (request) => (await request.get("/__mock/log")).json();
const fillBuyer = async (page, region = "cairo") => {
  await page.fill("[name=name]", "اختبار آلي");
  await page.fill("[name=phone]", "01000000000");
  await page.locator("[name=region]").selectOption(region);
  await page.fill("[name=address]", "عنوان اختبار فقط");
};
const heroSrc = (page) => page.locator("#lpHero img").evaluate(i => i.currentSrc || i.src);

test.beforeEach(async ({ page }) => {
  page.external = [];
  page.on("request", r => { const u = new URL(r.url()); if (u.hostname !== "127.0.0.1") page.external.push(r.method() + " " + u.host + u.pathname); });
});

test("previously isolated SS-1010 goes to seven-colour Balloon Suit, keeps photo and true order SKU", async ({ page, request }) => {
  const before = (await mockLog(request)).orders.length;
  await page.goto("/lp/ss-1010/?utm_source=instagram&fbclid=legacy1010");
  await expect(page).toHaveURL(url =>
    url.pathname === MODEL && url.searchParams.get("color") === "SS-1010" &&
    url.searchParams.get("utm_source") === "instagram" &&
    url.searchParams.get("fbclid") === "legacy1010");
  await expect(page.locator("#lpColors .chip")).toHaveCount(7);
  await expect(page.locator("#lpFormColors .chip")).toHaveCount(7);
  await expect(page.locator("#lpFormColorName")).toHaveText("رمادي زيتي");
  await expect(page.locator('#lpColors [data-code="SS-1010"]')).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator('#lpFormColors [data-code="SS-1010"]')).toHaveAttribute("aria-pressed", "true");
  await expect.poll(() => heroSrc(page)).toMatch(/\/lp\/ss-1010\/img\/SS-1010\/0-(?:480|800)\.(webp|avif)$/);
  await expect(page.locator("#lpPrice")).toHaveText("١٬٠٠٠");
  await expect(page.locator("#lpOrder")).toBeEnabled();
  await fillBuyer(page);
  await page.locator("#lpOrder").click();
  await expect(page.locator("#lpDoneCode")).toHaveText(/^ORD-/);
  const orders = (await mockLog(request)).orders;
  expect(orders.length - before).toBe(1);
  expect(orders.at(-1).lines[0].publicCode).toBe("SS-1010");
  expect(page.external).toEqual([]);
});

test("SS-1010 stays an independent real SKU after choosing a second Balloon colour and back", async ({ page }) => {
  await page.goto(MODEL);
  await expect(page.locator("#lpColors .chip")).toHaveCount(7);
  await page.locator('#lpFormColors [data-code="SS-1010"]').click();
  await expect(page.locator("#lpFormColorName")).toHaveText("رمادي زيتي");
  await expect(page.locator("#lpOrder")).toBeEnabled();
  await page.locator('#lpColors [data-code="SS-1036"]').click();
  await expect(page.locator("#lpFormColorName")).toHaveText("رصاصي");
  await expect.poll(() => heroSrc(page)).toMatch(/\/SS-1036\//);
  await page.locator('#lpFormColors [data-code="SS-1010"]').click();
  await expect(page.locator("#lpColorName")).toHaveText("رمادي زيتي");
  await expect(page.locator('#lpColors [data-code="SS-1010"]')).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#lpOrder")).toBeEnabled();
});

test("one COD order can contain different colours with separate quantities", async ({ page, request }) => {
  const before = (await mockLog(request)).orders.length;
  await page.goto(MODEL);
  await expect(page.locator("#lpMixToggle")).toBeVisible();
  await page.locator("#lpMixToggle").click();
  await expect(page.locator("#lpMixRows")).toBeVisible();
  await expect(page.locator('#lpMixRows [data-mix-count="SS-1037"]')).toHaveText("١");
  await page.locator('#lpMixRows [data-mix-code="SS-1010"][data-delta="1"]').click();
  await expect(page.locator('#lpMixRows [data-mix-count="SS-1010"]')).toHaveText("١");
  await expect(page.locator("#lpBarChoice")).toContainText("رمادي زيتي × 1");
  await fillBuyer(page);
  await expect(page.locator("#lpSub")).toHaveText("٢٬٠٠٠ ج");
  await expect(page.locator("#lpTotal")).toHaveText("٢٬٠٧٠ ج");
  await page.locator("#lpOrder").click();
  await expect(page.locator("#lpDoneCode")).toHaveText(/^ORD-/);
  await expect(page.locator("#lpDoneText")).toContainText("رمادي زيتي");
  const orders = (await mockLog(request)).orders;
  expect(orders.length - before).toBe(1);
  expect(orders.at(-1).lines).toEqual([
    { publicCode: "SS-1037", structureVersion: 2, selection: [], quantity: 1 },
    { publicCode: "SS-1010", structureVersion: 2, selection: [], quantity: 1 },
  ]);
  expect(orders.at(-1).shipping).toBe(7000);
  expect(page.external).toEqual([]);
});

test("removing the only colour disables confirm; adding a colour re-enables it", async ({ page }) => {
  await page.goto(MODEL);
  await page.locator("#lpMixToggle").click();
  await page.locator('#lpMixRows [data-mix-code="SS-1037"][data-delta="-1"]').click();
  await expect(page.locator('#lpMixRows [data-mix-count="SS-1037"]')).toHaveText("٠");
  await expect(page.locator("#lpOrder")).toBeDisabled();
  await page.locator('#lpMixRows [data-mix-code="SS-1010"][data-delta="1"]').click();
  await expect(page.locator("#lpOrder")).toBeEnabled();
  await expect(page.locator('#lpMixRows [data-mix-count="SS-1010"]')).toHaveText("١");
});

test("default colour is in the HTML; choosing a colour swaps photo, name and verified product", async ({ page, request }) => {
  const viewsBefore = (await mockLog(request)).views;
  await page.goto(MODEL);
  await expect(page.locator("h1")).toHaveText("Ballon suit");
  await expect(page.locator("#lpColorName")).toHaveText("نبيتي");
  expect(await heroSrc(page)).toMatch(/img\/SS-1037\/0-\d+\.(avif|webp)$/);
  await expect(page.locator("#lpOrder")).toBeEnabled();
  await page.locator("#lpColors").getByRole("button", { name: "أسود" }).click();
  await expect(page.locator("#lpColors").getByRole("button", { name: "أسود" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#lpColorName")).toHaveText("أسود");
  await expect.poll(() => heroSrc(page)).toMatch(/img\/SS-1038\/0-\d+\.(avif|webp)$/);
  await expect(page.locator("#lpBarChoice")).toHaveText("أسود · مقاس واحد");
  await expect(page.locator("#lpPrice")).toHaveText("١٬٠٠٠");
  await expect(page.locator("#lpOrder")).toBeEnabled();
  await expect.poll(async () => (await mockLog(request)).views - viewsBefore).toBe(2); // one anonymous view per colour seen
  expect(page.external).toEqual([]);
});

test("the order carries the chosen colour's own product code", async ({ page, request }) => {
  const before = (await mockLog(request)).orders.length;
  await page.goto(MODEL);
  await page.locator("#lpColors").getByRole("button", { name: "رصاصي" }).click();
  await expect(page.locator("#lpBarChoice")).toHaveText("رصاصي · مقاس واحد");
  await fillBuyer(page, "giza");
  await expect(page.locator("#lpTotal")).toHaveText("١٬٠٨٠ ج");
  await page.locator("#lpOrder").click();
  await expect(page.locator("#lpDoneCode")).toHaveText(/^ORD-/);
  const { orders } = await mockLog(request);
  expect(orders.length - before).toBe(1);
  expect(orders.at(-1).lines.at(-1).publicCode).toBe("SS-1036");
  expect(page.external).toEqual([]);
});

test("a sold-out colour disables ordering without a stale price; another colour re-enables it", async ({ page }) => {
  await page.route("**/women-checkout/product/SS-1035", route => route.fulfill({ json: { product: {
    publicCode: "SS-1035", structureVersion: 1, purchasable: false, title: "Ballon suit بني",
    price: { currency: "EGP", minAmountMinor: 100000, maxAmountMinor: 100000 }, options: [], variants: [] } } }));
  await page.goto(MODEL);
  await expect(page.locator("#lpOrder")).toBeEnabled();
  await page.locator("#lpColors").getByRole("button", { name: "بني" }).click();
  await expect(page.locator("#lpStatus")).toHaveText("اللون ده خلص حاليًا، اختاري لون تاني.");
  await expect(page.locator("#lpOrder")).toBeDisabled();
  await expect(page.locator("#lpPrice")).toHaveText("—");
  await page.locator("#lpColors").getByRole("button", { name: "نبيتي" }).click();
  await expect(page.locator("#lpOrder")).toBeEnabled();
  await expect(page.locator("#lpPrice")).toHaveText("١٬٠٠٠");
});

test("two quick colour taps: the last one wins even if the first answer arrives later", async ({ page, request }) => {
  await page.route("**/women-checkout/product/SS-1036", async route => { await new Promise(r => setTimeout(r, 900)); await route.continue(); });
  await page.goto(MODEL);
  await expect(page.locator("#lpOrder")).toBeEnabled();
  await page.locator("#lpColors").getByRole("button", { name: "رصاصي" }).click();
  await page.locator("#lpColors").getByRole("button", { name: "أحمر" }).click();
  await page.waitForTimeout(1200);
  await expect(page.locator("#lpColorName")).toHaveText("أحمر");
  await expect(page.locator("#lpBarChoice")).toHaveText("أحمر · مقاس واحد");
  await expect(page.locator("#lpOrder")).toBeEnabled();
  await fillBuyer(page);
  await expect(page.locator("#lpTotal")).toHaveText("١٬٠٧٠ ج");
  await page.locator("#lpOrder").click();
  await expect(page.locator("#lpDoneCode")).toHaveText(/^ORD-/);
  expect((await mockLog(request)).orders.at(-1).lines[0].publicCode).toBe("SS-1039");
});

test("short form: exactly name, mobile, governorate, address (+ quantity), changing colour re-quotes the total", async ({ page }) => {
  await page.goto(MODEL);
  const fields = await page.locator("#lpForm :is(input,select,textarea)").evaluateAll(els => els.map(e => [e.name, e.required]));
  expect(fields).toEqual([["name", true], ["phone", true], ["region", true], ["address", true]]);
  await fillBuyer(page, "cairo");
  await expect(page.locator("#lpTotal")).toHaveText("١٬٠٧٠ ج");
  await page.locator("#lpColors").getByRole("button", { name: "أسود" }).click();
  await expect(page.locator("#lpTotal")).toHaveText("١٬٠٧٠ ج"); // fresh server quote for the new colour
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
