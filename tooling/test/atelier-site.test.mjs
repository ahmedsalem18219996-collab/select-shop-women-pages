import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = (path) => readFile(new URL("../../" + path, import.meta.url), "utf8");
const storeRoutes = [
  ["index.html", 'href="css/atelier-site.css?v=20261030-1"', 'class="atelier-home"'],
  ["p/index.html", 'href="../css/atelier-site.css?v=20261030-1"', 'class="atelier-product"'],
  ["cart/index.html", 'href="../css/atelier-site.css?v=20261030-1"', 'class="atelier-cart"'],
  ["checkout/index.html", 'href="../css/atelier-site.css?v=20261030-1"', 'class="atelier-checkout"'],
  ["order-success/index.html", 'href="../css/atelier-site.css?v=20261030-1"', 'class="atelier-success"'],
];

test("Atelier shared style loads on every public storefront step", async () => {
  const sheet = await source("css/atelier-site.css");
  assert.match(sheet, /--ink:#22251f/);
  assert.match(sheet, /--pin:#303c2d/);
  assert.match(sheet, /--mirror:#f7f6f2/);
  for (const [path, href, klass] of storeRoutes) {
    const html = await source(path);
    assert.ok(html.includes(href), path + " lacks Atelier stylesheet");
    assert.ok(html.includes(klass), path + " lacks its route scope");
    assert.doesNotMatch(html, /المعاينة متاحة عند الاستلام/, path + " has an unverified promise");
  }
});

test("Atelier preserves storefront controls, legacy checkout and the isolated admin login", async () => {
  const home = await source("index.html");
  const product = await source("p/index.html");
  const cart = await source("cart/index.html");
  const checkout = await source("checkout/index.html");
  const done = await source("order-success/index.html");
  const admin = await source("admin/index.html");
  assert.match(home, /id="feed"/);
  assert.match(home, /id="shop"/);
  assert.match(product, /id="addToCart"/);
  assert.match(product, /id="product"/);
  assert.match(cart, /id="cartItems"/);
  assert.match(cart, /id="toCheckout"/);
  assert.match(checkout, /id="orderForm"/);
  assert.match(checkout, /id="placeOrder"/);
  assert.match(done, /id="orderCode"/);
  assert.match(admin, /id="app"/);
  assert.match(admin, /css\/atelier-admin\.css\?v=20261030-2/);
  assert.match(admin, /script-src 'self'/);
  assert.match(await source("admin/css/atelier-admin.css"), /:root\[data-theme="dark"\]/);
  assert.match(checkout, /التوافر وميعاد الشحن بيتأكدوا بعد تسجيل الطلب/);
  assert.match(done, /التوافر وميعاد الشحن بيتأكدوا بعد تسجيل الطلب/);
  assert.match(home, /التوافر بيتأكد بعد تسجيل الطلب/);
});

test("public product cards link to direct COD, old product links redirect without losing ad tags", async () => {
 const adapter=await source("js/store-adapter.js");
 const html=await source("p/index.html");
 const home=await source("index.html");
 assert.match(adapter,/url: SECURE_CHECKOUT_ORIGIN \+ "\/lp\/\?p="/);
 assert.match(html,/id="women-direct-order-redirect"/);
 assert.match(html,/location\.replace\("\/lp\/\?p="/);
 assert.match(html,/q\.delete\("code"\)/);
 assert.match(home,/store-adapter\.js\?v=direct-order-20261030/);
});

test("Landing-page Atelier remains independently generated", async () => {
  const page = await source("lp/ss-1041/index.html");
  assert.match(page, /id="lpForm"/);
  assert.match(page, /id="lpOrder"/);
  assert.match(page, /الطلب خاضع لتأكيد توافر القطعة وميعاد الشحن بعد التسجيل/);
  assert.doesNotMatch(page, /css\/atelier-site\.css/);
});
