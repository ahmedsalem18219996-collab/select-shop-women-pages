import { test, expect } from "@playwright/test";

// Read-only routes and assets against the isolated local test server.
// No order POST, Supabase write, or production-side requests.
test("Atelier storefront + admin route styles are served", async ({ request }) => {
  const routes = [
    ["/", "/css/atelier-site.css?v=20261114-luxe"],
    ["/p/?code=SS-1011", "/css/atelier-site.css?v=20261114-luxe"],
    ["/cart/", "/css/atelier-site.css?v=20261114-luxe"],
    ["/checkout/", "/css/atelier-site.css?v=20261114-luxe"],
    ["/order-success/", "/css/atelier-site.css?v=20261114-luxe"],
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
