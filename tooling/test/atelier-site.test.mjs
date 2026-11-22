import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = (path) => readFile(new URL("../../" + path, import.meta.url), "utf8");
const storeRoutes = [
  ["index.html", 'href="css/atelier-site.css?v=20261122-wordmark"', 'class="atelier-home"'],
  ["p/index.html", 'href="../css/atelier-site.css?v=20261122-wordmark"', 'class="atelier-product"'],
  ["cart/index.html", 'href="../css/atelier-site.css?v=20261122-wordmark"', 'class="atelier-cart"'],
  ["checkout/index.html", 'href="../css/atelier-site.css?v=20261122-wordmark"', 'class="atelier-checkout"'],
  ["order-success/index.html", 'href="../css/atelier-site.css?v=20261122-wordmark"', 'class="atelier-success"'],
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
    // the home, bag and checkout moved to the Neutral look (light only); the other steps follow in their own PRs
    const color = ["index.html", "cart/index.html", "checkout/index.html"].includes(path) ? "#FAFAF9" : "#050B1C";
    assert.ok(html.includes(`<meta name="theme-color" content="${color}">`), path + " theme-color is not " + color);
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
  assert.match(home, /assets\/hero\/hero-woman-casual-720\.webp/);
  assert.match(home, /width="900" height="1204/);
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
  assert.match(checkout, /هنكلمك نأكد التوافر وميعاد الشحن/);
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
  assert.match(page, /هنكلمك نأكد التوافر وميعاد الشحن قبل ما نبعت الطلب/);
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
  assert.match(html, /data-theme="light"/); // owner choice 2026-11-20: White & Blue Glass, day mode first
  assert.match(html, /atelier-admin\.css\?v=[a-z0-9-]+/);
  assert.match(app, /\|\| 'light'/);
  assert.match(html, /<link rel="stylesheet" href="css\/admin-theme\.css\?v=[a-z0-9-]+">\s*<script type="module"/); // glass layer is the last stylesheet
  assert.match(app, /localStorage\.getItem\('wa\.theme'\)/); // retain staff preference
});

test("bag, checkout and campaign page use the Neutral look: light only, the home's three fonts, one preload, nothing else changed", async () => {
  const home = await source("index.html");
  const faces = (html) => [...html.matchAll(/@font-face\{[^}]*\}/g)].map(m => m[0]);
  const homeFaces = faces(home.match(/<style id="women-neutral-fonts">[^]*?<\/style>/)[0]);
  assert.equal(homeFaces.length, 3);
  for (const path of ["cart/index.html", "checkout/index.html"]) {
    const html = await source(path);
    assert.doesNotMatch(html, /theme-boot|data-theme-toggle|css\/fonts\.css/, path);
    const block = html.match(/<style id="women-neutral-fonts">[^]*?<\/style>/)?.[0];
    assert.ok(block, path + " inline Neutral fonts");
    assert.deepEqual(faces(block), homeFaces.map(f => f.replace(/url\(assets\//, "url(../assets/")), path + " same faces as the home");
    assert.equal(html.split('rel="preload"').length - 1, 1, path + " one font preload");
    assert.ok(html.indexOf('href="../css/neutral-shop.css?v=') > html.indexOf("atelier-site.css"), path + " Neutral sheet loads last");
  }
  assert.match(await source("cart/index.html"), /<span class="shop-wordmark" dir="ltr"><b>select<\/b><small>shop<\/small><\/span>/);
  const campaign = await source("collections/index.html");
  assert.match(campaign, /<meta name="theme-color" content="#FAFAF9">/);
  assert.match(campaign, /style-src 'self'; font-src 'self';/); // CSP unchanged: fonts live in the sheet, not inline
  assert.doesNotMatch(campaign, /<style/);
  assert.ok(campaign.indexOf("../css/neutral-campaign.css?v=") > campaign.indexOf("collections.css?v="));
  const sheet = await source("css/neutral-campaign.css");
  for (const f of homeFaces) assert.ok(sheet.includes(f.replace(/url\(assets\//, "url(/assets/")), "campaign sheet font: " + f.slice(0, 60));
  for (const css of [sheet, await source("css/neutral-shop.css")]) {
    assert.match(css, /#111 linear-gradient\(135deg,#1c1c1c,#000\)/); // the product page's black "تأكيد الطلب" button
    assert.doesNotMatch(css, /#D100D1|#2ED9D1|#050B1C/i, "no Dark Luxury colours");
  }
  assert.match(sheet, /html:not\(\[data-accent\]\) \.cp-add:disabled/); // a campaign colour still paints the buy buttons
});
