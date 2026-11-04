// QA screenshots of the Admin with every Admin API call answered in memory (no login, no writes reach Supabase).
//   PORT=4180 node serve.mjs &  OUT=dir node admin-shots.mjs
import { chromium, devices } from "@playwright/test";
import { mkdir } from "node:fs/promises";

const BASE = (process.env.BASE || "http://127.0.0.1:4180") + "/admin/";
const OUT = process.env.OUT || "shots";
const row = (code, title, status = "public", price = 65000, views = 0) => ({ public_code: code, title, status, category: "بلوفرات", is_new: false,
  image: null, price_min_minor: price, price_max_minor: price, stock_total: 20, stock_low: false, views_30d: views, updated_at: "2026-11-01T00:00:00Z" });
const catalog = [row("SS-1042", "بلوفر مقلم أحمر", "public", 65000, 41), row("SS-1043", "بلوفر مقلم بينك", "public", 65000, 18),
  row("SS-1011", "بلوفر بيبي بلو", "public", 70000, 96), row("SS-1088", "بلوفر بألوان ومقاسات", "draft"), row("SS-1090", "جاكيت جلد", "hidden", 120000)];
const product = (p) => ({ outcome: "ok", data: {
  product: { ...p, description: "", base_price: { amount_minor: p.price_min_minor }, structure_version: 1, shipping_profile: { key: "women_standard", name: "شحن عادي" },
    variants: [{ position: 0, active: true, availability: "available", amount_minor: p.price_min_minor, price_source: "base", selections: [] }], options: [], publish_blockers: [] },
  card: { category: "بلوفرات", is_new: false, image: null }, stock: { 0: { quantity: 20 } }, media: { media: [], structure_version: 1 },
  shipping_profiles: [{ key: "women_standard", name: "شحن عادي" }], views: { today: 2, last_7_days: 12, last_30_days: p.views_30d, total: 140 }, activity: [] } });

// QA-only sample orders (fictional buyers, example.test style data); nothing is read from or written to Supabase.
const order = (n, name, region, total, at) => ({ public_order_code: "ORD-QA-" + n, buyer_name: name, buyer_phone: "0100000000" + n, delivery_region_label: region,
  item_quantity: 1, grand_total_minor: total, status: "pending", stage: null, created_at: at });
const orders = [order(1, "عميلة تجربة ١", "القاهرة", 127000, "2026-11-03T18:00:00Z"), order(2, "عميلة تجربة ٢", "الإسكندرية", 72000, "2026-11-03T12:00:00Z")];
const orderDetail = { ...orders[0], delivery_address: "عنوان اختبار فقط", payment_method: "cod", allowed_transitions: ["confirmed", "cancelled"],
  merchandise_subtotal_minor: 120000, shipping_total_minor: 7000, history: [{ to_status: "pending", changed_at: "2026-11-03T18:00:00Z" }],
  items: [{ product_public_code: "SS-1008", product_title: "جاكيت جلد", option_selections: [{ name: "اللون", value: "بني" }], quantity: 1, line_total_minor: 120000 }] };

async function harness(page) {
  await page.addInitScript(() => sessionStorage.setItem("wa.session", JSON.stringify({ access_token: "local-qa-only", refresh_token: "x", expires_at: Date.now() + 3600000, email: "qa-owner@example.test" })));
  await page.route("**/*", async (route) => {
    const req = route.request(), url = new URL(req.url());
    if (url.pathname.endsWith("/women-admin/call")) {
      const { op, args = {} } = JSON.parse(req.postData() || "{}");
      let payload = { outcome: "ok", data: [] };
      if (op === "session.get") payload = { outcome: "ok", data: { email: "qa-owner@example.test", role: "owner", permissions: [] } };
      else if (op === "categories.list") payload = { outcome: "ok", data: [{ name: "بلوفرات", visible: true }] };
      else if (op === "products.list") payload = { outcome: "ok", data: catalog };
      else if (op === "orders.list") payload = { outcome: "ok", data: args.status === "confirmed" ? [] : orders };
      else if (op === "orders.get") payload = { outcome: "ok", data: { order: orderDetail, fulfillment: null, fulfillment_events: [], activity: [] } };
      else if (op === "products.get") payload = product(catalog.find((x) => x.public_code === args.code) || catalog[0]);
      return route.fulfill({ status: 200, headers: { "access-control-allow-origin": "*", "content-type": "application/json" }, body: JSON.stringify(payload) });
    }
    if (url.hostname.endsWith(".supabase.co") || url.hostname.includes("google")) return route.abort("blockedbyclient");
    return route.continue();
  });
}

await mkdir(OUT, { recursive: true });
const browser = await chromium.launch();
for (const [dev, opts] of [["mobile", devices["Pixel 7"]], ["desktop", { viewport: { width: 1366, height: 900 } }]]) {
  const ctx = await browser.newContext({ ...opts, bypassCSP: true });
  const page = await ctx.newPage();
  await harness(page);
  for (const [name, hash, click] of [["admin-dashboard", ""], ["admin-products", "#/products"], ["admin-product-edit", "#/products", "[data-manage-model]:visible"], ["admin-new", "#/products/new"], ["admin-orders", "#/orders"], ["admin-order-detail", "#/orders/ORD-QA-1"]]) {
    await page.goto("about:blank"); // full load per screen, so an open sheet never leaks into the next shot
    await page.goto(BASE + hash, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(900);
    if (click) { await page.locator(click).first().click().catch(() => {}); await page.waitForTimeout(700); }
    await page.screenshot({ path: `${OUT}/${name}-${dev}.png`, fullPage: process.env.FULL === "1" });
  }
  await ctx.close();
}
await browser.close();
