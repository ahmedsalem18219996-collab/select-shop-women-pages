import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";

// Published Landing Studio design on a real landing page, against the local mock only: the CTA reaches the
// unchanged COD order form, the order is the normal /orders flow and the ad parameters follow it afterwards.
const LP = "/lp/ss-1008/";
const STORAGE = "https://byluoipdunralsurwebt.supabase.co/storage/v1/object/public/";
const IMG = new URL("../../assets/catalog-thumbs/005a3ee1a8504efca19a780f21981d33.jpg.w400.webp", import.meta.url);
const GENERATIVE = /gemini|generativelanguage|aistudio|makersuite|openai|stability\.ai|replicate\.com|midjourney|huggingface|imagen/i;
const mockLog = async (request) => (await request.get("/__mock/log")).json();
const publish = (request, design) => request.post("/__mock/landing", { data: { code: "SS-1008", design } });
const DESIGN = {
  v: 1, template: "editorial", order: ["hero", "product", "features", "closing"], hidden: [], background: "navy", font: "readex", divider: "dots",
  title: "جاكيت جلد للشتا", description: "خامة تقيلة\nوقصّة مظبوطة", features: ["جلد صناعي ناعم", "بطانة دافية"],
  images: { hero: "women-storefront/storefront/studio-hero.webp", features: "women-storefront/storefront/studio-features.webp", closing: "women-storefront/storefront/studio-closing.webp" },
  cta: { text: "اطلبي دلوقتي", color: "gold", position: "both", shape: "square", size: "xl", animation: "pulse" },
  orderCard: { style: "glass", fields: "compact", title: "سجّلي طلبك" },
};

test.beforeEach(async ({ page }) => {
  page.hosts = [];
  page.on("request", r => page.hosts.push(new URL(r.url()).host));
  const body = await readFile(IMG);
  // Marketing images live on public storage; serve a local photo instead so nothing leaves the machine.
  await page.route(STORAGE + "**", route => route.fulfill({ contentType: "image/webp", body }));
});
test.afterEach(async ({ request }) => { await publish(request, null); });

test("published design: 3 marketing images, texts, CTA options, order card look; the price stays the server's", async ({ page, request }) => {
  await publish(request, DESIGN);
  await page.goto(LP);
  const hero = page.locator(".studio-hero");
  await expect(hero.locator("h2")).toHaveText("جاكيت جلد للشتا");
  await expect(page.locator(".studio-features li")).toHaveText(["جلد صناعي ناعم", "بطانة دافية"]);
  await expect(page.locator(".studio-closing img")).toHaveAttribute("src", STORAGE + "women-storefront/storefront/studio-closing.webp");
  // hero before the product section, features and closing after it
  expect(await page.evaluate(() => {
    const main = document.querySelector("main.page"), pos = (s) => main.compareDocumentPosition(document.querySelector(s));
    return [pos(".studio-hero") & 2, pos(".studio-features") & 4, pos(".studio-closing") & 4].map(Boolean);
  })).toEqual([true, true, true]);
  await expect(page.locator(".studio-divider[data-kind=dots]")).toHaveCount(3);
  const ctas = page.locator("[data-studio-cta]");
  await expect(ctas).toHaveCount(6); // position=both: on each of the 3 images and under each text block
  await expect(ctas.first()).toHaveText("اطلبي دلوقتي");
  await expect(ctas.first()).toHaveAttribute("data-shape", "square");
  await expect(ctas.first()).toHaveAttribute("data-size", "xl");
  await expect(ctas.first()).toHaveAttribute("data-anim", "pulse");
  await expect(page.locator("html")).toHaveAttribute("data-studio-color", "gold");
  await expect(page.locator("#lpForm")).toHaveAttribute("data-studio-style", "glass");
  await expect(page.locator("#lpForm > h2")).toContainText("سجّلي طلبك");
  await expect(page.locator("#lpForm [name=name]")).toHaveAttribute("placeholder", /.+/);
  await expect(page.locator("#lpOrder")).toHaveCSS("background-color", "rgb(216, 179, 106)"); // wait for the async design + CSS transition
  await expect(page.locator("#lpPrice")).toHaveText("١٬٢٠٠"); // from women-checkout, not from the design
  expect(page.hosts.filter(h => GENERATIVE.test(h))).toEqual([]);
});

for (const position of ["below", "overlay"]) {
  test(`CTA position ${position}: buttons only where chosen, each scrolls to the order form and focuses the name`, async ({ page, request }) => {
    await publish(request, { ...DESIGN, cta: { ...DESIGN.cta, position, animation: "none" } });
    await page.goto(LP);
    await expect(page.locator(".studio-hero")).toBeVisible();
    await expect(page.locator(".studio-media [data-studio-cta]")).toHaveCount(position === "overlay" ? 3 : 0);
    await expect(page.locator(".studio-copy [data-studio-cta]")).toHaveCount(position === "below" ? 3 : 0);
    await page.locator("[data-studio-cta]").first().click();
    await expect(page.locator("#lpForm [name=name]")).toBeFocused();
    await expect(page.locator("#lpForm")).toBeInViewport();
  });
}

test("campaign-linked landing pages show the other models and share one COD bag", async ({ page, request }) => {
  const before = await mockLog(request);
  await page.goto(LP + "?collection=group-001&utm_source=meta&utm_medium=paid_social&utm_campaign=group-001");
  await expect(page.locator("#lpRelatedProducts")).toBeVisible();
  await expect(page.locator("#lpRelatedProducts [data-related-code]")).toHaveCount(3);
  await expect(page.locator("#lpRelatedProducts a[data-related-code='SS-1011']")).toHaveAttribute(
    "href", /p=SS-1011.*collection=group-001.*utm_source=meta/
  );
  await expect(page.locator("#lpAddCart")).toBeEnabled();
  await expect(page.locator("#lpOrder")).toHaveText("اطلبي مباشرة");
  await page.setViewportSize({ width: 360, height: 800 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  await page.locator("#lpAddCart").click();
  await expect(page.locator("#lpStatus")).toContainText("اتضافت للشنطة");
  await page.locator("#lpRelatedProducts a[data-related-code='SS-1011']").click();
  await expect(page).toHaveURL(/p=SS-1011/);
  await expect(page.locator("#lpAddCart")).toBeEnabled();
  await page.locator("#lpAddCart").click();
  await expect(page.locator("#lpStatus")).toContainText("اتضافت للشنطة");

  await page.goto("/cart/");
  await expect(page.locator("#cartItems .commerce-row")).toHaveCount(2);
  await page.locator("#toCheckout").click();
  await page.locator("#region").selectOption("cairo");
  await page.locator('[name="name"]').fill("اختبار آلي");
  await page.locator('[name="phone"]').fill("01012345678");
  await page.locator('[name="area"]').fill("مدينة نصر");
  await page.locator('[name="address"]').fill("عنوان اختبار فقط، شارع 1");
  await expect(page.locator("#placeOrder")).toBeEnabled();
  await page.locator("#placeOrder").click();
  await expect(page).toHaveURL(/order-success/);
  await expect(page.locator("#orderCode")).toHaveText(/^ORD-/);

  const log = await mockLog(request);
  expect(log.orders.length - before.orders.length).toBe(1);
  expect(log.orders.at(-1).lines.map(line => line.publicCode)).toEqual(
    expect.arrayContaining(["SS-1008", "SS-1011"])
  );
});

test("hidden sections and an empty design: hidden parts disappear, no design = the standard page", async ({ page, request }) => {
  await publish(request, { ...DESIGN, hidden: ["hero", "closing"] });
  await page.goto(LP);
  await expect(page.locator(".studio-features")).toBeVisible();
  await expect(page.locator(".studio-hero, .studio-closing")).toHaveCount(0);
  await publish(request, null);
  await page.goto(LP);
  await expect(page.locator("#lpForm")).toBeVisible();
  await expect(page.locator("[data-studio-node]")).toHaveCount(0);
  await expect(page.locator("html")).not.toHaveAttribute("data-studio", /./);
});

test("order from a designed page: same COD /orders flow, one order, then its ad set + UTM are recorded (no buyer data)", async ({ page, request }) => {
  await publish(request, DESIGN);
  const before = await mockLog(request);
  await page.goto(LP + "?utm_source=meta&utm_medium=paid_social&utm_campaign=winter-jackets&utm_content=SS-1008&adset=women-25-34");
  await page.locator("[data-studio-cta]").first().click({ force: true }); // the pulse animation never settles
  await expect(page.locator("#lpForm [name=name]")).toBeFocused();
  await page.fill("[name=name]", "اختبار آلي");
  await page.fill("[name=phone]", "01012345678");
  await page.locator("[name=region]").selectOption("cairo");
  await page.fill("[name=address]", "عنوان اختبار فقط، شارع ١");
  await expect(page.locator("#lpTotal")).toHaveText("١٬٢٧٠ ج");
  await page.locator("#lpOrder").click();
  await expect(page.locator("#lpDoneCode")).toHaveText(/^ORD-[2-9A-Z]{8}$/);
  await expect.poll(async () => (await mockLog(request)).attributions.length).toBe(before.attributions.length + 1);
  const log = await mockLog(request);
  expect(log.orders.length - before.orders.length).toBe(1);
  const a = log.attributions.at(-1);
  expect(a.publicOrderCode).toBe(await page.locator("#lpDoneCode").textContent());
  expect(a.idempotencyKey).toBe(log.orders.at(-1).key);
  expect(a.params).toMatchObject({ source: "meta", medium: "paid_social", campaign: "winter-jackets", content: "SS-1008", adset: "women-25-34" });
  expect(JSON.stringify(a)).not.toMatch(/01012345678|اختبار آلي|عنوان/);
  expect(page.hosts.filter(h => GENERATIVE.test(h))).toEqual([]);
});

test("an order without ad parameters sends no attribution", async ({ page, request }) => {
  const before = (await mockLog(request)).attributions.length;
  await page.goto(LP);
  await page.fill("[name=name]", "اختبار آلي");
  await page.fill("[name=phone]", "01012345678");
  await page.locator("[name=region]").selectOption("cairo");
  await page.fill("[name=address]", "عنوان اختبار فقط، شارع ١");
  await expect(page.locator("#lpTotal")).toHaveText("١٬٢٧٠ ج");
  await page.locator("#lpOrder").click();
  await expect(page.locator("#lpDoneCode")).toHaveText(/^ORD-/);
  await page.waitForTimeout(300);
  expect((await mockLog(request)).attributions.length).toBe(before);
});

test("supplier confirmation expired: the server refuses the order and the page says so, nothing is created", async ({ page, request }) => {
  // The real refusal comes from the server (proven in the backend repo); here the same public reply on the mock.
  await publish(request, DESIGN);
  const before = (await mockLog(request)).orders.length;
  await page.route("**/women-checkout/orders", route => route.fulfill({ status: 409, json: { error: "checkout_changed" } }));
  await page.goto(LP);
  await page.fill("[name=name]", "اختبار آلي");
  await page.fill("[name=phone]", "01012345678");
  await page.locator("[name=region]").selectOption("cairo");
  await page.fill("[name=address]", "عنوان اختبار فقط، شارع ١");
  await expect(page.locator("#lpTotal")).toHaveText("١٬٢٧٠ ج");
  await page.locator("#lpOrder").click();
  await expect(page.locator("#lpStatus")).not.toBeEmpty();
  await expect(page.locator("#lpDone")).toBeHidden();
  expect((await mockLog(request)).orders.length).toBe(before);
});

for (const [w, h] of [[360, 780], [390, 844], [768, 1024], [1366, 900]]) {
  test(`designed page at ${w}px: no sideways scroll, CTA at least 44px tall`, async ({ page, request }) => {
    await page.setViewportSize({ width: w, height: h });
    await publish(request, { ...DESIGN, title: "عنوان طويل جدًا ".repeat(7).trim().slice(0, 120) });
    await page.goto(LP);
    await expect(page.locator(".studio-hero")).toBeVisible();
    await page.locator(".studio-closing").scrollIntoViewIfNeeded();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
    const box = await page.locator(".studio-copy [data-studio-cta]").first().boundingBox();
    expect(box.height).toBeGreaterThanOrEqual(44);
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(w);
  });
}
