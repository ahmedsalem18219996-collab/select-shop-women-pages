import { test, expect } from "@playwright/test";
import { readdirSync, readFileSync } from "node:fs";

// Every pre-rendered landing page (one per advertised product/model) against the local mock API only.
const dir = new URL("../pages/", import.meta.url);
const PAGES = readdirSync(dir).filter(f => f.endsWith(".json")).map(f => JSON.parse(readFileSync(new URL(f, dir), "utf8")))
  .map(c => ({ id: c.id, code: c.colors?.[0]?.code || c.code, title: c.title }));
const fixture = (code) => JSON.parse(readFileSync(new URL(`../fixtures/${code}.product.json`, import.meta.url), "utf8")).product;
const mockLog = async (request) => (await request.get("/__mock/log")).json();

test.beforeEach(async ({ page }) => {
  page.external = [];
  page.on("request", r => { const u = new URL(r.url()); if (u.hostname !== "127.0.0.1") page.external.push(r.method() + " " + u.host + u.pathname); });
});

test("every pre-rendered page: real title and price, form open, orderable, no overflow, local only", async ({ page, isMobile }) => {
  test.skip(!isMobile, "one pass on the mobile project is enough for 33 pages");
  test.setTimeout(240000);
  for (const p of PAGES) {
    const product = fixture(p.code);
    await page.goto(`/lp/${p.id}/`);
    await expect(page.locator("h1"), p.id).toHaveText(String(p.title || product.title).trim());
    await expect(page.locator("#lpPrice"), p.id).toHaveText(new Intl.NumberFormat("ar-EG").format(product.price.minAmountMinor / 100));
    await expect(page.locator("#lpForm"), p.id).toBeVisible();
    await expect(page.locator("#lpOrder"), p.id).toBeEnabled();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), p.id).toBe(0);
  }
  expect(page.external).toEqual([]);
});

for (const id of ["ss-1012", "ss-1046"]) {
  test(`full direct COD order on /lp/${id}/ (one-size handling, server quote, order code)`, async ({ page, request }) => {
    const code = id.toUpperCase(), product = fixture(code);
    const before = (await mockLog(request)).orders.length;
    await page.goto(`/lp/${id}/`);
    if (product.options.length) await expect(page.getByRole("radio").first()).toBeChecked(); // single size preselected
    await page.fill("[name=name]", "اختبار آلي");
    await page.fill("[name=phone]", "٠١٠ ١٢٣٤ ٥٦٧٨");
    await page.locator("[name=region]").selectOption("giza");
    await page.fill("[name=address]", "عنوان اختبار فقط، شارع ١");
    const total = (product.price.minAmountMinor + 8000) / 100;
    await expect(page.locator("#lpTotal")).toHaveText(new Intl.NumberFormat("ar-EG").format(total) + " ج");
    await page.locator("#lpOrder").dblclick();
    await expect(page.locator("#lpDoneCode")).toHaveText(/^ORD-[2-9A-Z]{8}$/);
    const { orders } = await mockLog(request);
    expect(orders.length - before).toBe(1);
    expect(orders.at(-1)).toMatchObject({ region: "giza", total: total * 100,
      lines: [{ publicCode: code, structureVersion: product.structureVersion, quantity: 1, selection: product.variants[0].selection }],
      buyer: { phone: "01012345678", area: "الجيزة" } });
    expect(page.external).toEqual([]);
  });
}

test("old ad links /lp/?p=CODE go to the product's own page with marketing parameters kept; other colours stay", async ({ page }) => {
  await page.goto("/lp/?p=SS-1012&utm_source=facebook&utm_id=9&fbclid=abc&lpv=b");
  await page.waitForURL(u => u.pathname === "/lp/ss-1012/");
  const url = new URL(page.url());
  expect(Object.fromEntries(url.searchParams)).toEqual({ utm_source: "facebook", utm_id: "9", fbclid: "abc", lpv: "b" });
  await expect(page.locator("#lpOrder")).toBeEnabled();
  await page.goto("/lp/?code=ss-1037");                       // a model page default colour (lowercase code accepted)
  await page.waitForURL(u => u.pathname === "/lp/ballon-suit/");
  await page.goto("/lp/?p=SS-1099");                          // test-only product without its own page: automatic page, no redirect
  await expect(page.locator("h1")).toHaveText("Leather jacket");
  expect(new URL(page.url()).pathname).toBe("/lp/");
  expect(page.external).toEqual([]);
});
