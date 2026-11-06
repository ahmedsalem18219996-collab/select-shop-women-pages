import { test, expect } from "@playwright/test";

// Read-only routes and assets against the isolated local test server.
// No order POST, Supabase write, or production-side requests.
test("Atelier storefront + admin route styles are served", async ({ request }) => {
  const routes = [
    ["/", "/css/atelier-site.css?v=20261106-theme"],
    ["/p/?code=SS-1011", "/css/atelier-site.css?v=20261106-theme"],
    ["/cart/", "/css/atelier-site.css?v=20261106-theme"],
    ["/checkout/", "/css/atelier-site.css?v=20261106-theme"],
    ["/order-success/", "/css/atelier-site.css?v=20261106-theme"],
    ["/admin/", "/admin/css/atelier-admin.css?v=20261105-models"],
  ];
  for (const [url, stylesheet] of routes) {
    const response = await request.get(url);
    expect(response.ok(), url + " status").toBe(true);
    const html = await response.text();
    expect(html, url + " stylesheet").toContain(url === "/admin/" ? stylesheet.replace(/^\/admin\//, "") : stylesheet.replace(/^\//, ""));
    const css = await request.get(stylesheet);
    expect(css.ok(), stylesheet + " status").toBe(true);
    // The admin keeps its own Soft Luxury sheet; the storefront is Dark Luxury (neon purple buy buttons).
    expect(await css.text()).toContain(url === "/admin/" ? "#765268" : "#D100D1");
  }
});
