import { test, expect } from "@playwright/test";

// Product gallery on the local mock (tooling/serve.mjs): committed photos only, orders go to the mock, nothing external.
const LP = "/lp/ss-1008/";
const mockLog = async (request) => (await request.get("/__mock/log")).json();
const hero = (page) => page.locator("#lpHero img");
const heroSrc = (page) => hero(page).evaluate(i => new URL(i.currentSrc || i.src).pathname);
const thumbs = (page) => page.locator("#lpGallery button");

// Touch swipe on the main photo, then the click some browsers fire at the end of it (it must not open the zoom).
const swipe = (page, dx, dy = 0) => page.locator("#lpHero img").evaluate((img, [dx, dy]) => {
  const r = img.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2;
  const fire = (type, cx, cy) => img.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerType: "touch", isPrimary: true, clientX: cx, clientY: cy }));
  fire("pointerdown", x, y); fire("pointerup", x + dx, y + dy);
  img.dispatchEvent(new MouseEvent("click", { bubbles: true, clientX: x + dx, clientY: y + dy }));
}, [dx, dy]);

test.beforeEach(async ({ page }) => {
  page.external = [];
  page.on("request", r => { const u = new URL(r.url()); if (u.hostname !== "127.0.0.1") page.external.push(u.host + u.pathname); });
  await page.route(u => u.hostname !== "127.0.0.1", r => r.abort());
});

test("several photos: thumbnails, arrows (RTL), keys, swipe and counter swap the main photo in place", async ({ page }) => {
  await page.goto(LP);
  await expect(thumbs(page)).toHaveCount(4);
  await expect(page.locator("#lpCount")).toHaveText("1/4");
  await expect(thumbs(page).nth(0)).toHaveAttribute("aria-current", "true");
  await expect(thumbs(page).nth(0)).toHaveCSS("border-color", "rgb(46, 217, 209)"); // cyan frame on the current photo
  const url = page.url();
  await page.locator("#lpNext").click();
  expect(await heroSrc(page)).toBe("/lp/ss-1008/img/SS-1008/1-800.webp");
  await expect(page.locator("#lpCount")).toHaveText("2/4");
  await expect(thumbs(page).nth(1)).toHaveAttribute("aria-current", "true");
  await expect(thumbs(page).nth(0)).toHaveAttribute("aria-current", "false");
  await page.locator("#lpPrev").click();
  await page.locator("#lpPrev").click(); // wraps from the first photo to the last
  await expect(page.locator("#lpCount")).toHaveText("4/4");
  expect(await heroSrc(page)).toBe("/lp/ss-1008/img/SS-1008/3-800.webp");
  await thumbs(page).nth(2).click();
  await expect(page.locator("#lpCount")).toHaveText("3/4");
  await expect(page.getByRole("dialog")).toBeHidden(); // a thumbnail swaps the photo, it does not open the zoom
  await hero(page).focus();
  await page.keyboard.press("ArrowLeft"); // RTL: left = next
  await expect(page.locator("#lpCount")).toHaveText("4/4");
  await page.keyboard.press("ArrowRight");
  await expect(page.locator("#lpCount")).toHaveText("3/4");
  await swipe(page, 120); // finger moves right: the next photo comes in from the left
  await expect(page.locator("#lpCount")).toHaveText("4/4");
  await swipe(page, -120);
  await expect(page.locator("#lpCount")).toHaveText("3/4");
  await swipe(page, 30, 160); // a vertical scroll is not a swipe
  await expect(page.locator("#lpCount")).toHaveText("3/4");
  await expect(page.getByRole("dialog")).toBeHidden(); // the swipe's trailing click did not open the zoom
  await page.waitForTimeout(400); // past the 350ms that swallow a swipe's trailing click
  await hero(page).click(); // a real tap opens the original of the photo on screen
  await expect(page.getByRole("dialog", { name: "تفاصيل الصورة" })).toBeVisible();
  await page.getByRole("button", { name: "إغلاق الصورة" }).click();
  expect(page.url()).toBe(url); // no navigation or reload while flipping
  // every photo shown and every thumbnail is a real, distinct, loaded image
  const t = await page.locator("#lpGallery img").evaluateAll(imgs => imgs.map(i => ({ src: new URL(i.src).pathname, ok: i.complete && i.naturalWidth > 0 })));
  expect(t.map(x => x.src)).toEqual([0, 1, 2, 3].map(i => `/lp/ss-1008/img/SS-1008/${i}-320.webp`));
  expect(t.every(x => x.ok)).toBe(true);
  for (const i of [0, 1, 2, 3]) {
    await thumbs(page).nth(i).click();
    await expect.poll(() => hero(page).evaluate(img => img.complete && img.naturalWidth > 0)).toBe(true);
  }
  // the only off-site request is the one original she opened in the zoom (aborted here); flipping loads committed files only
  expect(page.external).toEqual([expect.stringMatching(/\/product-media\/media\/[0-9a-f]{32}\.(jpg|png|webp)$/)]);
});

test("colour change: that colour's own photos only, back to its first photo; price and ordered SKU follow the colour (COD mock)", async ({ page, request }) => {
  await page.goto(LP);
  const price = await page.locator("#lpPrice").textContent();
  await page.locator("#lpNext").click();
  await page.locator("#lpNext").click();
  await expect(page.locator("#lpCount")).toHaveText("3/4");
  await expect(page.locator("#lpPrice")).toHaveText(price || ""); // flipping photos never changes the price
  await page.locator('#lpColors .chip[data-code="SS-1009"]').click();
  await expect(page.locator("#lpCount")).toHaveText(/^1\/\d$/);
  expect(await heroSrc(page)).toMatch(/^\/lp\/ss-1008\/img\/SS-1009\/0-\d+\.(avif|webp)$/);
  const srcs = await page.locator("#lpGallery img").evaluateAll(imgs => imgs.map(i => new URL(i.src).pathname));
  expect(srcs.length).toBeGreaterThan(1);
  for (const s of srcs) expect(s).toMatch(/\/img\/SS-1009\//); // never a photo of the other colour
  expect(new Set(srcs).size).toBe(srcs.length);               // no duplicates
  await expect(thumbs(page).nth(0)).toHaveAttribute("aria-current", "true");
  await page.locator("#lpNext").click();
  expect(await heroSrc(page)).toBe("/lp/ss-1008/img/SS-1009/1-800.webp");
  await page.locator('#lpColors .chip[data-code="SS-1008"]').click();
  await expect(page.locator("#lpCount")).toHaveText("1/4");
  expect(await heroSrc(page)).toMatch(/\/img\/SS-1008\/0-/);
  await page.locator('#lpColors .chip[data-code="SS-1009"]').click();

  const before = (await mockLog(request)).orders.length;
  await page.fill("[name=name]", "اختبار آلي");
  await page.fill("[name=phone]", "01012345678");
  await page.locator("[name=region]").selectOption("cairo");
  await page.fill("[name=address]", "عنوان اختبار فقط");
  await page.locator("#lpOrder").click();
  await expect(page.locator("#lpDone")).toBeVisible();
  const orders = (await mockLog(request)).orders;
  expect(orders.length - before).toBe(1);
  expect(orders.at(-1).lines.map(l => [l.publicCode, l.quantity])).toEqual([["SS-1009", 1]]);
});

test("one photo: no arrows, counter or thumbnails, the photo stays whole", async ({ page }) => {
  await page.goto("/lp/ballon-suit/?color=SS-1040");
  await expect(page.locator('#lpColors .chip[data-code="SS-1040"]')).toHaveAttribute("aria-pressed", "true");
  await expect(hero(page)).toHaveAttribute("src", /SS-1040\/0-800\.webp/);
  for (const id of ["#lpPrev", "#lpNext", "#lpCount"]) await expect(page.locator(id)).toBeHidden();
  await expect(thumbs(page)).toHaveCount(0);
  await swipe(page, 120);
  await expect(hero(page)).toHaveAttribute("src", /SS-1040\/0-800\.webp/);
  await page.locator('#lpColors .chip[data-code="SS-1037"]').click(); // a colour with several photos brings them back
  await expect(page.locator("#lpNext")).toBeVisible();
  await expect(page.locator("#lpCount")).toHaveText(/^1\/[2-4]$/);
});

for (const [w, h] of [[320, 740], [360, 780], [390, 844], [768, 1024], [1440, 900]]) {
  test(`${w}px: whole photo, thumbnails ${w >= 900 ? "beside" : "under"} it, 44px controls, no horizontal overflow`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: h });
    await page.goto(LP);
    await expect(page.locator("#lpOrder")).toBeEnabled();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(await hero(page).evaluate(i => getComputedStyle(i).objectFit)).toBe("contain");
    const box = async (s) => /** @type {{x:number,y:number,width:number,height:number}} */ (await page.locator(s).boundingBox());
    const stage = await box("#lpStage"), first = await box("#lpGallery button >> nth=0"), last = await box("#lpGallery button >> nth=3");
    expect(Math.abs(stage.height / stage.width - 4 / 3)).toBeLessThan(w >= 900 ? 0.4 : 0.02); // 3:4 box (desktop may cap the height)
    if (w >= 900) expect(first.x).toBeGreaterThanOrEqual(stage.x + stage.width - 1); // RTL: thumbnails on the right
    else expect(first.y).toBeGreaterThanOrEqual(stage.y + stage.height - 1);
    for (const b of [first, last]) { expect(b.x).toBeGreaterThanOrEqual(0); expect(b.x + b.width).toBeLessThanOrEqual(w); expect(Math.min(b.width, b.height)).toBeGreaterThanOrEqual(44); }
    for (const s of ["#lpPrev", "#lpNext"]) { const b = await box(s); expect(b.width).toBeGreaterThanOrEqual(44); expect(b.height).toBeGreaterThanOrEqual(44); }
    const next = await box("#lpNext"), prev = await box("#lpPrev");
    expect(next.x).toBeLessThan(prev.x); // next on the left in RTL
    await page.locator("#lpNext").click();
    await expect(page.locator("#lpCount")).toHaveText("2/4");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}

test("store product page: arrows, 1/4 and swipe flip the main photo; the photo stays whole", async ({ page }) => {
  await page.goto("/p/?code=SS-1008&legacy=1");
  await expect(page.locator("#productThumbs button")).toHaveCount(4);
  await expect(page.locator("#photoMainCount")).toHaveText("1/4");
  expect(await page.locator("#productPhoto").evaluate(i => getComputedStyle(i).objectFit)).toBe("contain");
  await page.locator("#photoMainNext").click();
  await expect(page.locator("#photoMainCount")).toHaveText("2/4");
  await expect(page.locator("#productThumbs button").nth(1)).toHaveAttribute("aria-pressed", "true");
  await page.locator("#photoMainPrev").click();
  await page.locator("#photoMainPrev").click();
  await expect(page.locator("#photoMainCount")).toHaveText("4/4");
  await page.locator("#productPhoto").evaluate(img => {
    const r = img.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2;
    for (const [t, cx] of [["pointerdown", x], ["pointerup", x + 120]]) img.dispatchEvent(new PointerEvent(t, { bubbles: true, pointerType: "touch", isPrimary: true, clientX: cx, clientY: y }));
    img.dispatchEvent(new MouseEvent("click", { bubbles: true, clientX: x + 120, clientY: y }));
  });
  await expect(page.locator("#photoMainCount")).toHaveText("1/4");
  await expect(page.locator("#photoViewer")).not.toHaveAttribute("open", "");
  await page.locator("#productThumbs button").nth(2).click();
  await expect(page.locator("#photoMainCount")).toHaveText("3/4");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(page.external).toEqual([]);
});
