import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = (path) => readFile(new URL("../../" + path, import.meta.url), "utf8");
const storeRoutes = [
  ["index.html", 'href="css/atelier-site.css?v=20261114-luxe"', 'class="atelier-home"'],
  ["p/index.html", 'href="../css/atelier-site.css?v=20261114-luxe"', 'class="atelier-product"'],
  ["cart/index.html", 'href="../css/atelier-site.css?v=20261114-luxe"', 'class="atelier-cart"'],
  ["checkout/index.html", 'href="../css/atelier-site.css?v=20261114-luxe"', 'class="atelier-checkout"'],
  ["order-success/index.html", 'href="../css/atelier-site.css?v=20261114-luxe"', 'class="atelier-success"'],
];

test("Atelier shared style loads on every public storefront step", async () => {
  const sheet = await source("css/atelier-site.css");
  assert.match(sheet, /--ink:#FFFFFF/);
  assert.match(sheet, /--accent:#D100D1/);
  assert.match(sheet, /--mirror:#050B1C/);
  assert.match(sheet, /--cyan:#2ED9D1/);
  assert.match(sheet, /--surface:#F4F6FA/); // product photo canvas stays light: true garment colours
  for (const [path, href, klass] of storeRoutes) {
    const html = await source(path);
    assert.ok(html.includes(href), path + " lacks Atelier stylesheet");
    assert.ok(html.includes(klass), path + " lacks its route scope");
    assert.ok(html.includes('<meta name="theme-color" content="#050B1C">'), path + " theme-color is not Midnight Navy");
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
  assert.match(home, /assets\/hero-woman-luxe\.webp/);
  assert.doesNotMatch(home, /assets\/hero-woman-luxe\.avif/);
  assert.match(await source("css/atelier-site.css"), /luxury-silk-bg\.svg/);
  assert.match(home, /id="shop"/);
  assert.match(product, /id="addToCart"/);
  assert.match(product, /id="product"/);
  assert.match(cart, /id="cartItems"/);
  assert.match(cart, /id="toCheckout"/);
  assert.match(checkout, /id="orderForm"/);
  assert.match(checkout, /id="placeOrder"/);
  assert.match(done, /id="orderCode"/);
  assert.match(admin, /id="app"/);
  assert.match(admin, /css\/atelier-admin\.css\?v=[a-z0-9-]+/);
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
 assert.match(home,/store-adapter\.js\?v=20261106-card-colours/);
});

test("Landing-page Atelier remains independently generated", async () => {
  const page = await source("lp/ss-1041/index.html");
  assert.match(page, /id="lpForm"/);
  assert.match(page, /id="lpOrder"/);
  assert.match(page, /الطلب خاضع لتأكيد توافر القطعة وميعاد الشحن بعد التسجيل/);
  assert.doesNotMatch(page, /css\/atelier-site\.css/);
});

test("all existing and future Admin models display catalog-driven colour names on cards", async () => {
 const adapter = await source("js/store-adapter.js");
 const app = await source("js/app.js");
 const css = await source("css/atelier-site.css");
 assert.match(adapter, /colourNames\(item\)/);
 assert.match(adapter, /swatchNames: colourNames\(item\)/);
 assert.match(adapter, /palette\?\.hexOf\(name\)/);
 assert.match(app, /card-colour-names/);
 assert.match(app, /esc\(p\.swatchNames\.join/);
 assert.match(css, /\.card \.card-colour-names/);
 assert.doesNotMatch(adapter, /SS-1052/, "no hardcoded new model");
});

test("WOMEN Admin and storefront share the Dark Luxury palette without touching commerce", async () => {
  const admin = await source("admin/css/atelier-admin.css");
  const html = await source("admin/index.html");
  const app = await source("admin/js/app.js");
  for (const token of ["--bg:#050B1C", "--surface:#0B1730", "--primary:#D100D1", "--tape:#2ED9D1"]) {
    assert.ok(admin.includes(token), token);
  }
  assert.match(admin, /--bg:#F7F3EC/);
  assert.match(admin, /\.btn-primary:hover:not\(:disabled\)\{background:#AE00B8/);
  assert.match(html, /data-theme="dark"/);
  assert.match(html, /atelier-admin\.css\?v=[a-z0-9-]+/);
  assert.match(app, /\|\| 'dark'/);
  assert.match(app, /localStorage\.getItem\('wa\.theme'\)/); // retain staff preference
});
