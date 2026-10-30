import { test, expect } from "@playwright/test";

// Read-only routes and assets against the isolated local test server.
// No order POST, Supabase write, or production-side requests.
test("Atelier storefront + admin route styles are served", async ({ request }) => {
  const routes = [
    ["/", "/css/atelier-site.css?v=20261030-1"],
    ["/p/?code=SS-1011", "/css/atelier-site.css?v=20261030-1"],
    ["/cart/", "/css/atelier-site.css?v=20261030-1"],
    ["/checkout/", "/css/atelier-site.css?v=20261030-1"],
    ["/order-success/", "/css/atelier-site.css?v=20261030-1"],
    ["/admin/", "/admin/css/atelier-admin.css?v=20261030-2"],
  ];
  for (const [url, stylesheet] of routes) {
    const response = await request.get(url);
    expect(response.ok(), url + " status").toBe(true);
    const html = await response.text();
    expect(html, url + " stylesheet").toContain(url === "/admin/" ? stylesheet.replace(/^\/admin\//, "") : stylesheet.replace(/^\//, ""));
    const css = await request.get(stylesheet);
    expect(css.ok(), stylesheet + " status").toBe(true);
    expect(await css.text()).toContain("#303c2d");
  }
});
