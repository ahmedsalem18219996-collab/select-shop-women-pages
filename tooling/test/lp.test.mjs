import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { lineOk, findVariant, sellableValues, priceLabel, egMobile, checkBuyer, photoSet, photoFiles, openValues, colourIndex, colourMedia, variantColourChoices } from "../../lp/runtime.js";
import { render, renderShell, shellRoutes, photos, esc, AB_SNIPPET, PREFETCH, colorsOf, colorData, readexFaces } from "../build-lp.mjs";

test("landing copy states availability is pending and makes no inspection promise", () => {
  const html = renderShell("", {});
  assert.match(html, /الطلب خاضع لتأكيد توافر القطعة وميعاد الشحن بعد التسجيل/);
  assert.doesNotMatch(html, /المعاينة متاحة عند الاستلام/);
  assert.doesNotMatch(html, /هنكلمك على رقمك لتأكيد الطلب قبل الشحن/);
});

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
  assert.equal(c.dir, "img/SS-9001/");
  assert.equal(c.zoom.length, 2); // one original per gallery photo, same order
  assert.deepEqual(photoFiles(c.dir, 0), { src: "img/SS-9001/0-800.webp", thumb: "img/SS-9001/0-320.webp",
    avif: "img/SS-9001/0-480.avif 480w, img/SS-9001/0-800.avif 800w", webp: "img/SS-9001/0-480.webp 480w, img/SS-9001/0-800.webp 800w" });
  assert.deepEqual(photoFiles(c.dir, 1), { src: "img/SS-9001/1-800.webp", thumb: "img/SS-9001/1-320.webp" });
  // reused colour pages point at the original page's photos
  assert.equal(colorData({ id: "m", reuse_images: true, colors: [{ code: "SS-9001", name: "a", hex: "#000000" }, { code: "SS-9002", name: "b", hex: "#111111" }] },
    { "SS-9001": { ...sized, media: [media(1, true)] }, "SS-9002": { ...sized, media: [media(2, true)] } })[1].dir, "../ss-9002/img/SS-9002/");
});

test("gallery markup: one photo has no arrows, counter or thumbnails; several photos get all three, first one current", () => {
  const page = { id: "t", code: "SS-9001", benefits: ["x"], video: null };
  const one = render(page, { "SS-9001": { ...sized, media: [media(1, true)] } });
  assert.match(one, /id="lpPrev"[^>]* hidden/);
  assert.match(one, /id="lpCount"[^>]* hidden>1\/1</);
  assert.match(one, /<div class="gallery" id="lpGallery" aria-label="صور القطعة"><\/div>/);
  const many = render(page, { "SS-9001": { ...sized, media: [media(1, true), media(2, false), media(3, false)] } });
  assert.doesNotMatch(many, /id="lpPrev"[^>]* hidden/);
  assert.match(many, /id="lpCount" dir="ltr" aria-live="polite">1\/3</);
  assert.equal((many.match(/<button type="button" data-i="/g) || []).length, 3);
  assert.match(many, /data-i="0" aria-label="اعرضي الصورة 1 من 3" aria-current="true"><img src="img\/SS-9001\/0-320.webp"/);
  assert.match(many, /<img src="img\/SS-9001\/0-800.webp"[^>]* width="800" height="1067"/); // 3:4, the uncropped photo shape
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

// Every pre-rendered landing page (one per advertised product or model): default colour = first configured code.
const PAGES = await Promise.all((await readdir(new URL("../pages/", import.meta.url))).filter(f => f.endsWith(".json")).map(async f => {
  const c = JSON.parse(await readFile(new URL("../pages/" + f, import.meta.url), "utf8"));
  return [c.id, c.colors?.[0]?.code || c.code];
}));
test("every page config has a committed page", () => assert.ok(PAGES.length >= 33, String(PAGES.length)));
for (const [id, code] of PAGES) {
  test(`committed ${id} page shows its default colour's real title and price in the HTML`, async () => {
    const html = await readFile(new URL(`../../lp/${id}/index.html`, import.meta.url), "utf8");
    const { product } = JSON.parse(await readFile(new URL(`../fixtures/${code}.product.json`, import.meta.url), "utf8"));
    assert.ok(html.includes(new Intl.NumberFormat("ar-EG").format(product.price.minAmountMinor / 100)));
    assert.ok(html.includes(`img/${code}/0-800.webp`) && html.includes('fetchpriority="high"'));
    assert.ok(!/<script[^>]+src="https?:/.test(html), "no third-party script in the landing page HTML");
    assert.ok(html.includes('id="lpForm"') && html.includes('form="lpForm"'), "the order form is in the page, the bar button submits it");
  });
}

test("generated pages retain optional cart except explicitly focused direct-only campaigns", async () => {
  const html = renderShell("");
  assert.match(html, /id="lpAddCart"/);
  assert.match(html, /id="lpCartLink"/);
  assert.match(html, /id="lpCartCount"/);
  assert.match(html, /id="lpOrder"/);
  assert.match(html, /\/lp\/runtime\.js\?v=20261114-auto-zoom/);
  assert.match(html, /\/lp\/image-zoom\.js\?v=20261114-auto-zoom/);
  const generated = await readdir(new URL("../../lp/", import.meta.url), { withFileTypes:true });
  const dirs = generated.filter(d => d.isDirectory() && (d.name.startsWith("ss-") || d.name === "ballon-suit"));
  assert.equal(dirs.length, 39);
  for (const d of dirs) {
    const page = await readFile(new URL("../../lp/" + d.name + "/index.html", import.meta.url), "utf8");
    assert.match(page, /id="lpAddCart"/, d.name);
    assert.match(page, /id="lpOrder"/, d.name);
    if (page.includes('"directOnly":true')) assert.doesNotMatch(page, /id="lpCartLink"/, d.name);
    else assert.match(page, /id="lpCartLink"/, d.name);
  }
});

test("Admin never marks a failed price as complete, and colour drafts keep what was typed without Enter", async () => {
  const admin = await readFile(new URL("../../admin/js/views/products.js", import.meta.url), "utf8");
  const colours = await readFile(new URL("../../admin/js/views/model-colours.js", import.meta.url), "utf8");
  assert.match(admin, /if \(pr\.outcome !== 'saved'\)/);
  assert.match(admin, /goToDraft\('details', 'الموديل اتحفظ مسودة، لكن السعر محتاج مراجعة/);
  assert.match(colours, /box\.addEventListener\('input'/, "names and prices are kept on every keystroke");
  assert.match(colours, /checkDrafts\(/, "checked in Egyptian Arabic before any call");
});

test("admin creates one multi-colour product and attaches each colour photo to that colour's own Variant", async () => {
  const colours = await readFile(new URL("../../admin/js/views/model-colours.js", import.meta.url), "utf8");
  assert.match(colours, /planNewModel\(clean, model\.base\)/);
  assert.match(colours, /fields: photoTarget\(match\)/, "new colour images bind to fetched Variant");
  assert.match(colours, /fields: photoTarget\(current\)/, "edited colour images bind to selected Variant");
  assert.match(colours, /checkSourceImage\(file\)/, "invalid images are filtered before upload");
  const media = await readFile(new URL("../../admin/js/views/products.js", import.meta.url), "utf8");
  assert.match(media, /fields: \{ variant_position: variantPos \}/);
});

test("automatic shell: same form and runtime, no product data baked in, committed file is current", async () => {
  const html = renderShell("");
  assert.ok(html.includes('id="lpForm"') && html.includes('"auto":true') && html.includes("/js/catalog-thumbs.js"));
  assert.ok(!html.includes('"code":') && html.includes('<h1 id="lpTitle"></h1>'), "no product baked into the shell");
  const faces = readexFaces(await readFile(new URL("../../css/fonts.css", import.meta.url), "utf8"));
  const committed = await readFile(new URL("../../lp/index.html", import.meta.url), "utf8");
  const generated = renderShell(faces, await shellRoutes());
  let firstDifference = 0;
  while (firstDifference < Math.min(committed.length, generated.length)
    && committed[firstDifference] === generated[firstDifference]) firstDifference++;
  assert.ok(committed === generated,
    `committed shell differs from generator at offset ${firstDifference}; committed: ${JSON.stringify(committed.slice(Math.max(0, firstDifference - 100), firstDifference + 180))}; generated: ${JSON.stringify(generated.slice(Math.max(0, firstDifference - 100), firstDifference + 180))}`);
});

test("every generated product page: zoomable original photos, trust strip, in-form colours under the form heading", async () => {
  const generated = await readdir(new URL("../../lp/", import.meta.url), { withFileTypes: true });
  for (const d of generated.filter(x => x.isDirectory() && !["img"].includes(x.name))) {
    const page = await readFile(new URL("../../lp/" + d.name + "/index.html", import.meta.url), "utf8").catch(() => null);
    if (!page) continue;
    assert.match(page, /src="\/lp\/image-zoom\.js/, d.name);
    const data = JSON.parse(page.match(/<script type="application\/json" id="lp-data">([^<]*)<\/script>/)[1]);
    for (const c of data.colors) assert.ok(c.zoom.length >= 1 && c.zoom.every(u => u.startsWith("https://byluoipdunralsurwebt.supabase.co/storage/v1/object/public/product-media/media/")), d.name);
    if (!data.campaign) assert.match(page, /<ul class="trust"/, d.name);
    const header = page.slice(page.indexOf('<header class="top">'), page.indexOf("</header>"));
    assert.match(header, /class="browse-home browse-home--top"/, d.name);
    if (header.includes('id="lpCartLink"')) assert.match(header, /id="lpCartLink"[\\s\\S]*?class="browse-home browse-home--top"/, d.name);
    assert.match(header, /aria-label="للرجوع للرئيسية لاختيار موديلات أكثر"/, d.name);
    assert.ok(page.indexOf('id="lpMore"') < page.indexOf('id="lpForm"'), d.name + ": product details must precede the order form");
    assert.match(page, /\.browse-home\{[^}]*background:transparent[^}]*color:var\(--ink\)/, d.name + ": theme-safe catalogue link");
    const form = page.slice(page.indexOf('id="lpForm"'));
    if (form.includes('id="lpFormColors"')) assert.ok(form.indexOf("</h2>") < form.indexOf('id="lpFormColors"'), d.name);
  }
});

test("a chosen colour keeps only its own buyable sizes, and brings its own photos (never another shade)", async () => {
  const { product } = JSON.parse(await readFile(new URL("../fixtures/SS-9101.product.json", import.meta.url), "utf8"));
  assert.equal(colourIndex(product), 0);
  assert.deepEqual([...openValues(product, [1, -1], 1)], [3], "brown: One Size only");
  assert.deepEqual([...openValues(product, [0, -1], 1)].sort(), [0, 1, 2], "baby blue: S, M, L");
  assert.deepEqual([...openValues(product, [-1, 1], 0)], [0], "size M: pink is not purchasable");
  const urls = (list) => list.map((m) => m.url.split("/").pop().slice(0, 4));
  assert.deepEqual(urls(colourMedia(product.media, 0, 0)), ["b1b1", "b2b2", "aaaa"]);
  assert.deepEqual(urls(colourMedia(product.media, 0, 1)), ["c1c1", "aaaa"]);
  assert.deepEqual(colourMedia(product.media, 0, 2), [], "no photo of pink: keep what is shown");
  assert.equal(colourIndex({ options: [{ name: "المقاس" }] }), -1);
});

test("new Admin model: colour and size choices share a public code but never a variant selection", async () => {
  const { product } = JSON.parse(await readFile(new URL("../fixtures/SS-9101.product.json", import.meta.url), "utf8"));
  const choices = variantColourChoices(product);
  assert.equal(choices.length, 4);
  assert.equal(new Set(choices.map(c => c.key)).size, 4);
  assert.deepEqual([...new Set(choices.map(c => c.colorName))], ["بيبي بلو", "بني"]);
  assert.ok(choices.every(c => c.product.publicCode === "SS-9101" && c.variant.purchasable));
  assert.deepEqual(choices[3].variant.selection, [{ optionPosition: 0, valuePosition: 1 }, { optionPosition: 1, valuePosition: 3 }]);
  assert.deepEqual(variantColourChoices({ ...product, options: [] }), []);
});
