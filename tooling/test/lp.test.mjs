import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { lineOk, findVariant, sellableValues, priceLabel, egMobile, checkBuyer, photoSet } from "../../lp/runtime.js";
import { render, renderShell, photos, esc, AB_SNIPPET, PREFETCH, colorsOf, colorData, readexFaces } from "../build-lp.mjs";

const line = (q = 1, sel = []) => ({ publicCode: "SS-1008", structureVersion: 2, quantity: q, selection: sel });
const sized = {
  publicCode: "SS-9001", structureVersion: 3, purchasable: true, title: "Test", price: { currency: "EGP", minAmountMinor: 50000, maxAmountMinor: 55000 },
  options: [{ name: "المقاس", values: [{ position: 0, value: "S" }, { position: 1, value: "M" }] }],
  variants: [
    { selection: [{ optionPosition: 0, valuePosition: 0 }], purchasable: false, unitPrice: { currency: "EGP", amountMinor: 50000 } },
    { selection: [{ optionPosition: 0, valuePosition: 1 }], purchasable: true, unitPrice: { currency: "EGP", amountMinor: 55000 } },
  ],
};
const media = (n, primary) => ({ url: `https://byluoipdunralsurwebt.supabase.co/storage/v1/object/public/product-media/media/${String(n).repeat(32)}.jpg`, position: n, isPrimary: primary });

test("order lines: valid address and quantity only", () => {
  assert.equal(lineOk(line()), true);
  assert.equal(lineOk(line(1, [{ optionPosition: 0, valuePosition: 1 }])), true);
  assert.equal(lineOk({ ...line(), quantity: 0 }), false);
  assert.equal(lineOk({ ...line(), quantity: 100 }), false);
  assert.equal(lineOk({ ...line(), publicCode: "X-1" }), false);
});

test("Egyptian mobile: Arabic digits, spaces and +20 normalise; landlines and junk refused", () => {
  assert.equal(egMobile("01012345678"), "01012345678");
  assert.equal(egMobile("٠١١ ٢٣٤٥ ٦٧٨٩"), "01123456789");
  assert.equal(egMobile("+20 155 123 4567"), "01551234567");
  assert.equal(egMobile("00201212345678"), "01212345678");
  assert.equal(egMobile("01312345678"), null);
  assert.equal(egMobile("0223456789"), null);
  assert.equal(egMobile("abc"), null);
});

test("buyer check: four short fields, one message each", () => {
  assert.deepEqual(checkBuyer({ name: "منى", phone: "01012345678", region: "cairo", address: "مدينة نصر، شارع ١" }), {});
  assert.deepEqual(Object.keys(checkBuyer({ name: " ", phone: "123", region: "", address: "x" })).sort(), ["address", "name", "phone", "region"]);
});

test("automatic page photos: local thumbnails when built, original otherwise, foreign URLs never", () => {
  const url = media(1, true).url, file = "1".repeat(32) + ".jpg";
  assert.deepEqual(photoSet(url, new Set([file])), { src: `/assets/catalog-thumbs/${file}.webp`,
    srcset: `/assets/catalog-thumbs/${file}.w400.webp 400w, /assets/catalog-thumbs/${file}.webp 559w`, small: `/assets/catalog-thumbs/${file}.w400.webp` });
  assert.equal(photoSet(url, new Set()).src, url);
  assert.equal(photoSet("https://evil.example/a.jpg", new Set()), null);
});

test("prefetch snippet: starts product + regions reads for a valid code, sends anything else home", () => {
  const run = (code) => {
    const calls = [], loc = { replace: (u) => calls.push("replace " + u) }, win = {};
    new Function("window", "location", "fetch", PREFETCH(JSON.stringify(code)))(win, loc, (u) => { calls.push(u); return Promise.resolve(); });
    return { calls, win };
  };
  const ok = run("SS-1008");
  assert.ok(ok.calls[0].endsWith("/women-checkout/product/SS-1008") && ok.calls[1].endsWith("/women-checkout/regions"));
  assert.equal(ok.win.__lp.code, "SS-1008");
  assert.deepEqual(run("bad").calls, ["replace /"]);
});

test("variant lookup and sellable sizes", () => {
  assert.equal(findVariant(sized, [1]).unitPrice.amountMinor, 55000);
  assert.equal(findVariant(sized, [2]), undefined);
  assert.deepEqual([...sellableValues(sized, 0)], [1]);
});

test("one price text for page and sticky bar: variant, range, or none", () => {
  assert.equal(priceLabel(sized, sized.variants[1]), "٥٥٠");
  assert.equal(priceLabel(sized, null), "من ٥٠٠");
  assert.equal(priceLabel({ price: { currency: "EGP", minAmountMinor: 120000, maxAmountMinor: 120000 } }, null), "١٬٢٠٠");
  assert.equal(priceLabel({ price: { currency: "USD", minAmountMinor: 100 } }, null), "—");
  assert.equal(priceLabel({ price: {} }, { unitPrice: { currency: "EGP", amountMinor: 0 } }), "—");
});

test("A/B snippet: forced ?lpv wins, then stored bucket, then coin", () => {
  const run = (search, stored, rand) => {
    const doc = { documentElement: { dataset: {} } };
    const env = { localStorage: { getItem: () => stored }, location: { search }, Math: { random: () => rand } };
    new Function("document", "localStorage", "location", "Math", "URLSearchParams", AB_SNIPPET)(doc, env.localStorage, env.location, env.Math, URLSearchParams);
    return doc.documentElement.dataset.v;
  };
  assert.equal(run("?lpv=b", "a", 0.1), "b");
  assert.equal(run("?lpv=zzz", "b", 0.1), "b");
  assert.equal(run("", null, 0.1), "a");
  assert.equal(run("", null, 0.9), "b");
});

test("model colours: legacy single code, validation, per-colour image paths", () => {
  assert.deepEqual(colorsOf({ id: "t", code: "SS-9001" }), [{ code: "SS-9001", name: "", hex: "" }]);
  assert.throws(() => colorsOf({ id: "t", colors: [{ code: "SS-1", name: "x", hex: "#000000" }] }), /bad colour code/);
  assert.throws(() => colorsOf({ id: "t", colors: [{ code: "SS-9001", name: "a", hex: "#000000" }, { code: "SS-9002", name: "b", hex: "red" }] }), /needs a name/);
  assert.throws(() => colorsOf({ id: "t", colors: [{ code: "SS-9001", name: "a", hex: "#000000" }, { code: "SS-9001", name: "b", hex: "#111111" }] }), /duplicate/);
  const [c] = colorData({ id: "t", code: "SS-9001" }, { "SS-9001": { ...sized, media: [media(1, true), media(2, false)] } });
  assert.equal(c.hero.src, "img/SS-9001/0-800.webp");
  assert.deepEqual(c.gallery, ["img/SS-9001/1-320.webp"]);
});

test("generator: escapes text, primary photo first, refuses missing price, inlines only Readex", () => {
  assert.equal(esc(`<b>"x"&'`), "&lt;b&gt;&quot;x&quot;&amp;&#39;");
  assert.equal(photos({ media: [media(1, false), media(2, true), { url: "https://evil.example/x.jpg" }] })[0].position, 2);
  const page = { id: "t", code: "SS-9001", benefits: ["x"], video: null };
  assert.throws(() => render(page, { "SS-9001": { ...sized, media: [media(1, true)], price: {} } }), /no real price/);
  const html = render(page, { "SS-9001": { ...sized, title: "<script>", media: [media(1, true)] } });
  assert.ok(html.includes('<h1 id="lpTitle">&lt;script&gt;</h1>'));
  const faces = readexFaces("@font-face {\n  font-family: 'DM Mono';\n  src: url('../assets/fonts/a.woff2');\n}\n@font-face {\n  font-family: 'Readex Pro';\n  src: url('../assets/fonts/b.woff2');\n}");
  assert.ok(faces.includes("/assets/fonts/b.woff2") && !faces.includes("DM Mono") && !faces.includes("../"));
});

for (const [id, code] of [["ss-1008", "SS-1008"], ["ballon-suit", "SS-1037"]]) {
  test(`committed ${id} page shows its default colour's real title and price in the HTML`, async () => {
    const html = await readFile(new URL(`../../lp/${id}/index.html`, import.meta.url), "utf8");
    const { product } = JSON.parse(await readFile(new URL(`../fixtures/${code}.product.json`, import.meta.url), "utf8"));
    assert.ok(html.includes(new Intl.NumberFormat("ar-EG").format(product.price.minAmountMinor / 100)));
    assert.ok(html.includes(`img/${code}/0-800.webp`) && html.includes('fetchpriority="high"'));
    assert.ok(!/<script[^>]+src="https?:/.test(html), "no third-party script in the landing page HTML");
    assert.ok(html.includes('id="lpForm"') && html.includes('form="lpForm"'), "the order form is in the page, the bar button submits it");
  });
}

test("automatic shell: same form and runtime, no product data baked in, committed file is current", async () => {
  const html = renderShell("");
  assert.ok(html.includes('id="lpForm"') && html.includes('"auto":true') && html.includes("/js/catalog-thumbs.js"));
  assert.ok(!html.includes('"code":') && html.includes('<h1 id="lpTitle"></h1>'), "no product baked into the shell");
  const faces = readexFaces(await readFile(new URL("../../css/fonts.css", import.meta.url), "utf8"));
  assert.equal(await readFile(new URL("../../lp/index.html", import.meta.url), "utf8"), renderShell(faces));
});
