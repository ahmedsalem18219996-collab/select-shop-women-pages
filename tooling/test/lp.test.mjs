import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { lineOk, mergeLine, findVariant, sellableValues } from "../../lp/runtime.js";
import { render, photos, esc, AB_SNIPPET } from "../build-lp.mjs";

const line = (q = 1, sel = []) => ({ publicCode: "SS-1008", structureVersion: 2, quantity: q, selection: sel });
const sized = {
  publicCode: "SS-9001", structureVersion: 3, purchasable: true, title: "Test", price: { minAmountMinor: 50000 },
  options: [{ name: "المقاس", values: [{ position: 0, value: "S" }, { position: 1, value: "M" }] }],
  variants: [
    { selection: [{ optionPosition: 0, valuePosition: 0 }], purchasable: false, unitPrice: { amountMinor: 50000 } },
    { selection: [{ optionPosition: 0, valuePosition: 1 }], purchasable: true, unitPrice: { amountMinor: 55000 } },
  ],
};

test("cart lines: same address merges and caps at 99, junk is dropped", () => {
  assert.equal(lineOk(line()), true);
  assert.equal(lineOk({ ...line(), quantity: 0 }), false);
  assert.equal(lineOk({ ...line(), publicCode: "X-1" }), false);
  const merged = mergeLine([line(98), { junk: true }], line(5));
  assert.deepEqual(merged, [line(99)]);
  assert.equal(mergeLine([line(1)], line(1, [{ optionPosition: 0, valuePosition: 1 }])).length, 2);
});

test("variant lookup and sellable sizes", () => {
  assert.equal(findVariant(sized, [1]).unitPrice.amountMinor, 55000);
  assert.equal(findVariant(sized, [2]), undefined);
  assert.deepEqual([...sellableValues(sized, 0)], [1]);
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

test("generator: escapes text, primary photo first, refuses missing price", () => {
  assert.equal(esc(`<b>"x"&'`), "&lt;b&gt;&quot;x&quot;&amp;&#39;");
  const media = (n, primary) => ({ url: `https://byluoipdunralsurwebt.supabase.co/storage/v1/object/public/product-media/media/${String(n).repeat(32)}.jpg`, position: n, isPrimary: primary });
  assert.equal(photos({ media: [media(1, false), media(2, true), { url: "https://evil.example/x.jpg" }] })[0].position, 2);
  const page = { id: "t", code: "SS-9001", benefits: ["x"], video: null };
  assert.throws(() => render(page, { ...sized, media: [media(1, true)], price: {} }), /no real price/);
  const html = render(page, { ...sized, title: "<script>", media: [media(1, true)] });
  assert.ok(html.includes("<h1>&lt;script&gt;</h1>"));
});

test("committed pilot page matches its real fixture data", async () => {
  const html = await readFile(new URL("../../lp/ss-1008/index.html", import.meta.url), "utf8");
  const { product } = JSON.parse(await readFile(new URL("../fixtures/SS-1008.product.json", import.meta.url), "utf8"));
  assert.ok(html.includes(product.title));
  assert.ok(html.includes(new Intl.NumberFormat("ar-EG").format(product.price.minAmountMinor / 100)));
});
