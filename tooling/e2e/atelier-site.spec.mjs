import { test, expect } from "@playwright/test";

// Read-only routes and assets against the isolated local test server.
// No order POST, Supabase write, or production-side requests.
test("Atelier storefront + admin route styles are served", async ({ request }) => {
  const routes = [
    ["/", "/css/atelier-site.css?v=20261106-card-colours"],
    ["/p/?code=SS-1011", "/css/atelier-site.css?v=20261106-theme"],
    ["/cart/", "/css/atelier-site.css?v=20261106-theme"],
    ["/checkout/", "/css/atelier-site.css?v=20261106-theme"],
    ["/order-success/", "/css/atelier-site.css?v=20261106-theme"],
    ["/admin/", "/admin/css/atelier-admin.css?v=20261107-one-upload"],
  ];
  for (const [url, stylesheet] of routes) {
    const response = await request.get(url);
    expect(response.ok(), url + " status").toBe(true);
    const html = await response.text();
    expect(html, url + " stylesheet").toContain(url === "/admin/" ? stylesheet.replace(/^\/admin\//, "") : stylesheet.replace(/^\//, ""));
    const css = await request.get(stylesheet);
    expect(css.ok(), stylesheet + " status").toBe(true);
    // Public storefront and WOMEN Admin share the same fuchsia actions.
    expect(await css.text()).toContain("#D100D1");
  }
});

test("Admin palette defaults to the storefront navy/fuchsia/cyan and preserves accessible light mode", async ({ page }) => {
  await page.goto("/admin/");
  const tokens = await page.evaluate(() => {
    const root = document.documentElement, css = getComputedStyle(root);
    return { theme: root.dataset.theme, bg: css.getPropertyValue("--bg").trim(),
      surface: css.getPropertyValue("--surface").trim(),
      primary: css.getPropertyValue("--primary").trim(), cyan: css.getPropertyValue("--tape").trim() };
  });
  expect(tokens).toEqual({theme:"dark",bg:"#050B1C",surface:"#0B1730",primary:"#D100D1",cyan:"#2ED9D1"});
  await page.evaluate(() => { document.documentElement.dataset.theme="light"; });
  const light = await page.evaluate(() => {
    const css = getComputedStyle(document.documentElement);
    return {bg: css.getPropertyValue("--bg").trim(), primary: css.getPropertyValue("--primary").trim()};
  });
  expect(light).toEqual({bg:"#F7F3EC",primary:"#D100D1"});
});
