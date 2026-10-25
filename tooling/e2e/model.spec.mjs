import { mkdir } from "node:fs/promises";
import { test, expect } from "@playwright/test";

// One model page, several colours: each colour is its own real product (SS-1035…SS-1040). No product data is merged.
const MODEL = "/lp/ballon-suit/";
const mockLog = async (request) => (await request.get("/__mock/log")).json();
const heroSrc = (page) => page.locator("#lpHero img").evaluate(i => i.currentSrc || i.src);

test.beforeEach(async ({ page }) => {
  page.external = [];
  page.on("request", r => { const u = new URL(r.url()); if (u.hostname !== "127.0.0.1") page.external.push(r.method() + " " + u.host + u.pathname); });
});

test("default colour is in the HTML; choosing a colour swaps photo, name and verified product", async ({ page, request }, info) => {
  const viewsBefore = (await mockLog(request)).views;
  await page.goto(MODEL);
  await expect(page.locator("h1")).toHaveText("Ballon suit");
  await expect(page.locator("#lpColorName")).toHaveText("نبيتي");
  // Owner requested photo-based selection for every physical colour.
  await expect(page.locator("#lpColors .chip img")).toHaveCount(6);
  await expect(page.locator('#lpColors [data-code="SS-1038"] img')).toHaveAttribute("src", /SS-1038\/0-480\.webp$/);
  await expect(page.locator('#lpColors [data-code="SS-1035"] img')).toHaveAttribute("src", /SS-1035\/0-480\.webp$/);
  await expect(page.locator("#lpColors .chip")).toHaveCount(6);
  expect(await heroSrc(page)).toMatch(/img\/SS-1037\/0-\d+\.(avif|webp)$/);
  await expect(page.locator("#lpOrder")).toBeEnabled();
  await page.getByRole("button", { name: "أسود" }).click();
  await expect(page.getByRole("button", { name: "أسود" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#lpColorName")).toHaveText("أسود");
  await expect.poll(() => heroSrc(page)).toMatch(/img\/SS-1038\/0-\d+\.(avif|webp)$/);
  await expect(page.locator("#lpBarChoice")).toHaveText("أسود · مقاس واحد");
  await expect(page.locator("#lpPrice")).toHaveText("١٬٠٠٠");
  await expect(page.locator("#lpOrder")).toBeEnabled();
  await expect.poll(async () => (await mockLog(request)).views - viewsBefore).toBe(2); // one anonymous view per colour seen
  expect(page.external).toEqual([]);
  await mkdir("preview-output", { recursive: true });
  await page.screenshot({ path: `preview-output/${info.project.name}-model-colors.png`, fullPage: true, animations: "disabled" });
});

test("the cart and the order carry the chosen colour's own product code", async ({ page, request }) => {
  const before = (await mockLog(request)).orders.length;
  await page.goto(MODEL);
  await page.getByRole("button", { name: "رصاصي" }).click();
  await expect(page.locator("#lpBarChoice")).toHaveText("رصاصي · مقاس واحد");
  await expect(page.locator("#lpOrder")).toBeEnabled();
  await page.locator("#lpOrder").click();
  await page.waitForURL("**/checkout/");
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("women.cart.v1")).at(-1).publicCode)).toBe("SS-1036");
  expect(JSON.parse(await page.evaluate(() => sessionStorage.getItem("women.lp.attribution.v1")))).toMatchObject({ id: "ballon-suit", code: "SS-1036" });
  await page.locator("#region").selectOption("giza");
  await page.fill("[name=name]", "اختبار آلي");
  await page.fill("[name=phone]", "01000000000");
  await page.fill("[name=area]", "الدقي");
  await page.fill("[name=address]", "عنوان اختبار فقط");
  await expect(page.locator("#placeOrder")).toBeEnabled();
  await page.locator("#placeOrder").click();
  await page.waitForURL(/\/order-success\/\?order=ORD-/);
  const { orders } = await mockLog(request);
  expect(orders.length - before).toBe(1);
  expect(orders.at(-1).lines.at(-1).publicCode).toBe("SS-1036");
});

test("a sold-out colour disables ordering without a stale price; another colour re-enables it", async ({ page }) => {
  await page.route("**/women-checkout/product/SS-1035", route => route.fulfill({ json: { product: {
    publicCode: "SS-1035", structureVersion: 1, purchasable: false, title: "Ballon suit بني",
    price: { currency: "EGP", minAmountMinor: 100000, maxAmountMinor: 100000 }, options: [], variants: [] } } }));
  await page.goto(MODEL);
  await expect(page.locator("#lpOrder")).toBeEnabled();
  await page.getByRole("button", { name: "بني" }).click();
  await expect(page.locator("#lpStatus")).toHaveText("اللون ده خلص حاليًا، اختاري لون تاني.");
  await expect(page.locator("#lpOrder")).toBeDisabled();
  await expect(page.locator("#lpPrice")).toHaveText("—");
  await page.getByRole("button", { name: "نبيتي" }).click();
  await expect(page.locator("#lpOrder")).toBeEnabled();
  await expect(page.locator("#lpPrice")).toHaveText("١٬٠٠٠");
});

test("two quick colour taps: the last one wins even if the first answer arrives later", async ({ page }) => {
  await page.route("**/women-checkout/product/SS-1036", async route => { await new Promise(r => setTimeout(r, 900)); await route.continue(); });
  await page.goto(MODEL);
  await expect(page.locator("#lpOrder")).toBeEnabled();
  await page.getByRole("button", { name: "رصاصي" }).click();
  await page.getByRole("button", { name: "أحمر" }).click();
  await page.waitForTimeout(1200);
  await expect(page.locator("#lpColorName")).toHaveText("أحمر");
  await expect(page.locator("#lpBarChoice")).toHaveText("أحمر · مقاس واحد");
  await expect(page.locator("#lpOrder")).toBeEnabled();
  await page.locator("#lpOrder").click();
  await page.waitForURL("**/checkout/");
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("women.cart.v1")).at(-1).publicCode)).toBe("SS-1039");
});

test("simplified checkout: governorate first, notes folded, required delivery fields kept", async ({ page }) => {
  await page.goto(MODEL);
  await page.locator("#lpOrder").click();
  await page.waitForURL("**/checkout/");
  const fields = await page.locator("#orderForm :is(input,select,textarea)").evaluateAll(els => els.map(e => [e.name, e.required]));
  expect(fields).toEqual([["region", true], ["name", true], ["phone", true], ["area", true], ["address", true], ["notes", false]]);
  await expect(page.locator("[name=notes]")).toBeHidden(); // folded until the shopper asks for it
  await expect(page.locator("#placeOrder")).toBeDisabled();
  await page.locator("#region").selectOption("cairo");
  await expect(page.locator("#grandTotal")).toContainText("١٬٠٧٠");
  await page.fill("[name=name]", "اختبار آلي");
  await page.locator("#placeOrder").click(); // missing phone/area/address: the browser blocks it, nothing is sent
  await expect(page).toHaveURL(/\/checkout\/$/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
