import { test, expect } from "@playwright/test";

// Read-only routes and assets against the isolated local test server.
// No order POST, Supabase write, or production-side requests.
test("Atelier storefront + admin route styles are served", async ({ request }) => {
  const routes = [
    ["/", "/css/atelier-site.css?v=20261122-wordmark"],
    ["/p/?code=SS-1011", "/css/atelier-site.css?v=20261122-wordmark"],
    ["/cart/", "/css/atelier-site.css?v=20261122-wordmark"],
    ["/checkout/", "/css/atelier-site.css?v=20261122-wordmark"],
    ["/order-success/", "/css/atelier-site.css?v=20261122-wordmark"],
    ["/admin/", null],
  ];
  for (const [url, stylesheet] of routes) {
    const response = await request.get(url);
    expect(response.ok(), url + " status").toBe(true);
    const html = await response.text();
    const href = stylesheet || html.match(/href="([^"]*atelier-admin\.css\?v=[^"]+)"/)?.[1];
    expect(href, url + " stylesheet href").toBeTruthy();
    expect(html, url + " stylesheet").toContain(url === "/admin/" ? href : href.replace(/^\//, ""));
    const assetPath = url === "/admin/" ? "/admin/" + href.replace(/^\//, "") : stylesheet;
    const css = await request.get(assetPath);
    expect(css.ok(), assetPath + " status").toBe(true);
    // Public storefront and WOMEN Admin share the same fuchsia actions.
    expect(await css.text()).toContain("#D100D1");
  }
});

test("Admin palette defaults to the White & Blue Glass day mode and keeps a matching dark mode", async ({ page }) => {
  await page.goto("/admin/");
  const read = () => page.evaluate(() => {
    const root = document.documentElement, css = getComputedStyle(root);
    return { theme: root.dataset.theme, bg: css.getPropertyValue("--bg").trim(),
      surface: css.getPropertyValue("--surface").trim(), primary: css.getPropertyValue("--primary").trim() };
  });
  // Owner choice 2026-11-20: 60% #F5F8FF, 30% #FFFFFF, 10% #2563EB; day mode first.
  expect(await read()).toEqual({theme:"light",bg:"#F5F8FF",surface:"#FFFFFF",primary:"#2563EB"});
  await page.evaluate(() => { document.documentElement.dataset.theme="dark"; });
  expect(await read()).toEqual({theme:"dark",bg:"#0B1220",surface:"#111A2E",primary:"#3B82F6"});
});

test("public headers keep the linked text wordmark legible in RTL and LTR", async ({ page }) => {
  await page.route(/^https:\/\//, route => route.abort());
  if (page.viewportSize().width < 900) await page.setViewportSize({ width: 390, height: 844 });
  const routes = ["/", "/p/?code=SS-1008&legacy=1", "/lp/?p=SS-1099", "/lp/ss-1008/",
    "/collections/?slug=wordmark", "/cart/", "/checkout/", "/order-success/"];
  for (const route of routes) {
    await page.goto(route);
    const brand = page.locator("header a:has(.shop-wordmark)");
    await expect(brand, route).toBeVisible();
    await expect(brand).toHaveAttribute("href", "/");
    const wordmark = brand.locator(".shop-wordmark");
    await expect(wordmark.locator("b")).toHaveText("select");
    await expect(wordmark.locator("small")).toHaveText("shop");
    await expect(wordmark.locator("b")).toHaveCSS("font-weight", "800");
    await expect(wordmark.locator("small")).toHaveCSS("font-weight", "400");
    for (const dir of ["rtl", "ltr"]) {
      await page.locator("html").evaluate((html, value) => { html.dir = value; }, dir);
      const layout = await brand.evaluate(anchor => {
        const name = anchor.querySelector(".shop-wordmark b").getBoundingClientRect();
        const subtitle = anchor.querySelector(".shop-wordmark small").getBoundingClientRect();
        const cart = document.getElementById("lpCartLink")?.getBoundingClientRect();
        const browse = anchor.closest("header").querySelector(".browse-home--top")?.getBoundingClientRect();
        const rect = anchor.getBoundingClientRect();
        return { labelFits: name.left >= 0 && subtitle.right <= innerWidth && name.right <= subtitle.left,
          cartFits: !cart || (cart.left >= 0 && cart.right <= innerWidth && (rect.right <= cart.left || cart.right <= rect.left)),
          browseFits: !browse || innerWidth >= 900 || (browse.left >= 0 && browse.right <= innerWidth && browse.top >= rect.bottom),
          tile: getComputedStyle(anchor, "::before").content };
      });
      expect(layout.labelFits, `${route} ${dir}`).toBe(true);
      expect(layout.cartFits, `${route} ${dir}`).toBe(true);
      expect(layout.browseFits, `${route} ${dir}`).toBe(true);
      expect(layout.tile, route).not.toBe('"S."');
    }
  }
});
