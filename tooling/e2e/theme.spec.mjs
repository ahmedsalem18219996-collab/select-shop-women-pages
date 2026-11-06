import { test, expect } from "@playwright/test";

// Dark / Light theme on the local mock (tooling/serve.mjs). Nothing external is reached and no order is confirmed.
const KEY = "ssw.theme.v1";
const DARK_BG = "rgb(5, 11, 28)", LIGHT_BG = "rgb(247, 243, 236)";
const mockLog = async (request) => (await request.get("/__mock/log")).json();
const themeOf = (page) => page.evaluate(() => ({ theme: document.documentElement.dataset.theme, bg: getComputedStyle(document.body).backgroundColor,
  meta: document.querySelector('meta[name="theme-color"]').content }));
const saveLight = (page) => page.addInitScript(k => { try { if (!sessionStorage.getItem("seeded")) { localStorage.setItem(k, "light"); sessionStorage.setItem("seeded", "1"); } } catch { /* blocked */ } }, KEY);

test.beforeEach(async ({ page }) => {
  await page.route(u => u.hostname !== "127.0.0.1", r => r.abort());
  // What the very first frame sees: the theme must already be on <html> before anything paints.
  await page.addInitScript(() => { requestAnimationFrame(() => { window.__firstFrameTheme = document.documentElement.dataset.theme; }); });
});

test("Dark by default; the Sun/Moon switch works from the keyboard, instantly, and is remembered", async ({ page }) => {
  await page.goto("/lp/ss-1008/");
  await page.locator("#lpOrder:enabled").waitFor();
  expect(await themeOf(page)).toEqual({ theme: "dark", bg: DARK_BG, meta: "#050B1C" });
  const toggle = page.locator(".top [data-theme-toggle]");
  await expect(toggle).toHaveAttribute("aria-label", "التحويل للوضع الفاتح");
  const box = await toggle.boundingBox();
  expect(box.width).toBeGreaterThanOrEqual(44); expect(box.height).toBeGreaterThanOrEqual(44);
  await page.evaluate(() => { window.__sameDocument = true; });
  await toggle.focus();
  await page.keyboard.press("Enter");
  expect(await themeOf(page)).toEqual({ theme: "light", bg: LIGHT_BG, meta: "#F7F3EC" });
  await expect(toggle).toHaveAttribute("aria-label", "التحويل للوضع الداكن");
  expect(await page.evaluate(() => window.__sameDocument)).toBe(true); // no reload
  expect(await page.evaluate(k => localStorage.getItem(k), KEY)).toBe("light");
  await page.keyboard.press("Space");
  expect((await themeOf(page)).theme).toBe("dark");
  expect(await page.evaluate(k => localStorage.getItem(k), KEY)).toBe("dark");
});

test("a saved Light choice is on from the first frame of every page, after reload and across navigation", async ({ page }) => {
  await saveLight(page);
  const routes = [["/", "#feed .card"], ["/lp/ss-1008/", "#lpOrder:enabled"], ["/lp/?p=SS-1099", "#lpOrder:enabled"], ["/lp/ss-1011/", "#lpOrder:enabled"],
    ["/p/?code=SS-1008&legacy=1", "#productPhoto:not([hidden])"], ["/cart/", "main"], ["/checkout/", "#region"], ["/order-success/?order=ORD-THEME", "main"]];
  for (const [url, ready] of routes) {
    await page.goto(url);
    await page.locator(ready).first().waitFor();
    expect(await page.evaluate(() => window.__firstFrameTheme), url + " first frame").toBe("light");
    expect(await themeOf(page), url).toEqual({ theme: "light", bg: LIGHT_BG, meta: "#F7F3EC" });
    await expect(page.locator("[data-theme-toggle]:visible"), url + " switch").toHaveCount(1);
  }
  await page.reload();
  expect((await themeOf(page)).theme).toBe("light");
  // following a link (not page.goto) keeps it too
  await page.goto("/cart/");
  await page.locator(".logo").click();
  await page.locator("#feed .card").first().waitFor();
  expect(await page.evaluate(() => window.__firstFrameTheme)).toBe("light");
});

test("switching mid-product keeps the colour, size, photo and order state; the gallery keeps working", async ({ page, request }) => {
  const before = (await mockLog(request)).orders.length;
  await page.goto("/lp/ss-1008/");
  await page.locator("#lpOrder:enabled").waitFor();
  await page.locator('#lpColors .chip[data-code="SS-1009"]').click();
  await page.waitForFunction(() => /SS-1009/.test(document.querySelector("#lpHero img").src));
  await page.locator("#lpNext").click();
  await expect(page.locator("#lpCount")).toHaveText("2/4");
  const url = page.url();
  await page.locator(".top [data-theme-toggle]").click();
  expect((await themeOf(page)).theme).toBe("light");
  expect(page.url()).toBe(url);
  await expect(page.locator("#lpCount")).toHaveText("2/4");
  await expect(page.locator('#lpColors .chip[data-code="SS-1009"]')).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#lpGallery button").nth(1)).toHaveCSS("border-color", "rgb(0, 114, 122)"); // Light cyan frame
  await page.locator("#lpGallery button").nth(3).click();
  await expect(page.locator("#lpCount")).toHaveText("4/4");
  await expect(page.locator("#lpZoom[open]")).toHaveCount(0);
  await page.locator("#lpPrev").click();
  await expect(page.locator("#lpCount")).toHaveText("3/4");
  await expect(page.locator("#lpOrder")).toBeEnabled();
  await page.waitForTimeout(400);
  await page.locator("#lpHero img").click();
  await expect(page.locator("#lpZoom[open]")).toBeVisible();
  await expect(page.locator("#lpZoom")).toHaveCSS("background-color", "rgb(255, 253, 248)"); // zoom follows the theme
  expect((await mockLog(request)).orders.length).toBe(before);
});

test("Light cart and checkout show the server quote; nothing is ordered", async ({ page, request }) => {
  const before = (await mockLog(request)).orders.length;
  await saveLight(page);
  await page.goto("/lp/ss-1008/");
  await page.locator("#lpAddCart:enabled").click();
  await page.goto("/cart/");
  await page.locator("#toCheckout").click();
  await page.waitForURL("**/checkout/");
  await page.locator("#region").selectOption({ index: 1 });
  await expect(page.locator("#grandTotal")).toHaveText(/[0-9٠-٩]/);
  await expect(page.locator("#placeOrder")).toHaveCSS("background-color", "rgb(209, 0, 209)");
  expect((await themeOf(page)).theme).toBe("light");
  expect((await mockLog(request)).orders.length).toBe(before);
});

test("no horizontal overflow in either theme at the review widths", async ({ page, isMobile }) => {
  const widths = isMobile ? [320, 360, 390] : [768, 1440];
  const routes = [["/", "#feed .card"], ["/lp/ss-1008/", "#lpOrder:enabled"], ["/lp/ss-1011/", "#lpOrder:enabled"], ["/p/?code=SS-1008&legacy=1", "#productPhoto:not([hidden])"],
    ["/cart/", "main"], ["/checkout/", "#region"], ["/order-success/?order=ORD-THEME", "main"]];
  for (const theme of ["dark", "light"]) {
    await page.goto("/");
    await page.evaluate(([k, t]) => localStorage.setItem(k, t), [KEY, theme]);
    for (const w of widths) {
      await page.setViewportSize({ width: w, height: 800 });
      for (const [url, ready] of routes) {
        await page.goto(url);
        await page.locator(ready).first().waitFor();
        // compare with the requested width: mobile emulation widens the layout viewport (innerWidth) when content overflows
        const o = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, theme: document.documentElement.dataset.theme,
          head: [...document.querySelectorAll(".top>*,.hdr-in>*,.hdr-tools>*")].filter(e => e.getClientRects().length && getComputedStyle(e).display !== "contents")
            .map(e => e.getBoundingClientRect()).map(r => [Math.round(r.left), Math.round(r.right)]) }));
        expect(o.theme).toBe(theme);
        expect(o.sw, `${theme} ${w}px ${url}`).toBeLessThanOrEqual(w);
        for (const [l, r] of o.head) { expect(l, `${w}px ${url} header`).toBeGreaterThanOrEqual(0); expect(r, `${w}px ${url} header`).toBeLessThanOrEqual(w); }
      }
    }
  }
});

test("under 375px the header drops only what the tab bar or buy bar already offers; nothing becomes unreachable", async ({ page, request }) => {
  const before = (await mockLog(request)).orders.length;
  await page.setViewportSize({ width: 320, height: 760 });
  const inView = (loc) => loc.evaluate(e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.left >= 0 && r.right <= innerWidth && r.top < innerHeight && r.bottom > 0; });
  // home: "browse" (#shop) is the الأقسام tab; the header keeps switch · wordmark · bag
  await page.goto("/");
  await page.locator("#feed .card").first().waitFor();
  await expect(page.locator('.hdr-tools a[href="#shop"]')).toBeHidden();
  await expect(page.locator(".hdr-tools [data-open-bag]")).toBeVisible();
  await expect(page.locator(".hdr-tools [data-theme-toggle]")).toBeVisible();
  await page.locator('.tabbar a[href="#shop"]').click();
  await expect.poll(() => inView(page.locator("#shop"))).toBe(true);
  // cart and product: the bag is the الشنطة tab (same link and count); the one-tap catalog link stays in the header
  await page.goto("/lp/ss-1008/");
  await page.locator("#lpAddCart:enabled").click();
  for (const url of ["/cart/", "/p/?code=SS-1008&legacy=1"]) {
    await page.goto(url);
    await page.locator(".tabbar").waitFor();
    await expect(page.locator('.hdr-tools a[href="/cart/"]'), url).toBeHidden();
    await expect(page.locator('.tabbar a[href="/cart/"] [data-cart-count]'), url).toHaveText("1");
    expect(await inView(page.locator('.hdr-tools a[href="/#shop"]')), url + " catalog link").toBe(true);
    expect(await inView(page.locator(".hdr-tools [data-theme-toggle]")), url + " switch").toBe(true);
  }
  await page.locator('.hdr-tools a[href="/#shop"]').click();
  await page.locator("#feed .card").first().waitFor();
  // landing page: "jump to form" goes; the fixed bar's confirm button still leads to the form, the bag link stays
  await page.goto("/lp/ss-1008/");
  await page.locator("#lpOrder:enabled").waitFor();
  await expect(page.locator(".top .jump")).toBeHidden();
  expect(await inView(page.locator("#lpCartLink"))).toBe(true);
  expect(await inView(page.locator("#lpOrder"))).toBe(true);
  await page.locator("#lpOrder").click(); // empty form: validation takes her to the first missing field, nothing is sent
  await expect.poll(() => page.evaluate(() => !!document.activeElement?.closest("#lpForm"))).toBe(true);
  await expect.poll(() => inView(page.locator("#lpForm :focus"))).toBe(true); // smooth scroll
  expect((await mockLog(request)).orders.length).toBe(before);
  // from 375px everything is back
  await page.setViewportSize({ width: 375, height: 760 });
  await expect(page.locator(".top .jump")).toBeVisible();
  await page.goto("/");
  await expect(page.locator('.hdr-tools a[href="#shop"]')).toBeVisible();
  await page.goto("/cart/");
  await expect(page.locator('.hdr-tools a[href="/cart/"]')).toBeVisible();
});


test("saved Light theme survives browser Back and Forward navigation", async ({ page }) => {
  await saveLight(page);
  await page.goto("/");
  await page.locator("#feed .card").first().waitFor();
  await page.goto("/cart/");
  await page.locator("main").waitFor();
  await page.goBack();
  await page.locator("#feed .card").first().waitFor();
  expect((await themeOf(page)).theme).toBe("light");
  await page.goForward();
  await page.locator("main").waitFor();
  expect((await themeOf(page)).theme).toBe("light");
});
