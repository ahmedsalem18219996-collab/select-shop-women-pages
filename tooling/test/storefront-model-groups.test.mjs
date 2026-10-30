import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Script } from "node:vm";
import test from "node:test";

// Execute the exact catalog grouping block from the browser source in isolation.
// No network or Supabase calls: only read-only fixture objects.
const src = readFileSync(new URL("../../js/store-adapter.js", import.meta.url), "utf8");
const start = src.indexOf("  const VERIFIED_MODEL_FAMILIES = [");
const end = src.indexOf("  const safeText", start);
assert.ok(start > 0 && end > start, "verified model grouping block must exist");
const factory = new Script("(function(origin, products) {\nconst SECURE_CHECKOUT_ORIGIN = origin;\n" +
  src.slice(start, end) + "\nreturn groupVerifiedModels(products);\n})").runInNewContext();
const group = products => factory("https://www.selectshopeg.com", products);
const item = (id, price, cat, purchasable = true) => ({
  id, name: id, cat, price, c: "#EFEFEF", sw: [], out: [], isNew: false,
  image: "/image.jpg", purchasable, url: "/lp/?p=" + id
});
const balloon = ["SS-1035", "SS-1036", "SS-1037", "SS-1038", "SS-1039", "SS-1040", "SS-1010"]
  .map(id => item(id, 1000, "أطقم"));

test("one card for each verified colour family, unrelated SKU unchanged", () => {
  const out = group([item("SS-1008", 1200, "جاكيت"), item("SS-1009", 1200, "جاكيت"),
    ...balloon, item("SS-1041", 700, "سويت شيرت")]);
  assert.equal(out.length, 3);
  assert.equal(out[0].name, "جاكيت جلد");
  assert.equal(out[0].sw.length, 2);
  assert.equal(out[0].url, "https://www.selectshopeg.com/lp/ss-1008/");
  assert.equal(out[1].name, "طقم بالون");
  assert.equal(out[1].sw.length, 7);
  assert.equal(out[1].url, "https://www.selectshopeg.com/lp/ballon-suit/");
  assert.equal(out[2].id, "SS-1041");
});

test("price or category mismatch falls back to separate real products", () => {
  assert.equal(group([item("SS-1008", 1200, "جاكيت"),
    item("SS-1009", 1100, "جاكيت")]).length, 2);
  assert.equal(group([item("SS-1008", 1200, "جاكيت"),
    item("SS-1009", 1200, "أطقم")]).length, 2);
});

test("missing sibling stays standalone; never display an unavailable colour", () => {
  const out = group([item("SS-1009", 1200, "جاكيت")]);
  assert.equal(out.length, 1);
  assert.equal(out[0].id, "SS-1009");
  assert.equal(out[0].sw.length, 0);
});

test("sold-out default keeps sibling SKUs separate to avoid broken group LP", () => {
  const out = group([item("SS-1008", 1200, "جاكيت", false),
    item("SS-1009", 1200, "جاكيت", true)]);
  assert.equal(out.length, 2);
  assert.equal(out[0].id, "SS-1008");
  assert.equal(out[1].id, "SS-1009");
  assert.equal(out[1].purchasable, true);
});

test("hidden default SKU also keeps remaining colours separate", () => {
  const out = group([item("SS-1035", 1000, "أطقم"),
    item("SS-1036", 1000, "أطقم"), item("SS-1038", 1000, "أطقم")]);
  assert.equal(out.length, 3);
  assert.equal(out[0].url, "/lp/?p=SS-1035");
});

test("every verified colour family is a single storefront card with its own live landing page", () => {
  const fixture = [
    ["SS-1042", "SS-1043", "SS-1044"],
    ["SS-1015", "SS-1027", "SS-1028"],
    ["SS-1014", "SS-1023", "SS-1024", "SS-1025", "SS-1026"],
    ["SS-1019", "SS-1021", "SS-1022"],
    ["SS-1012", "SS-1029", "SS-1030"],
    ["SS-1031", "SS-1032", "SS-1033", "SS-1034"],
  ];
  const categories = ["بلوفر", "سويت شيرت", "جاكيت", "بلوفر", "بلوفر", "جاكيت"];
  const prices = [650, 750, 750, 650, 550, 1000];
  const expected = ["/lp/striped-knit/", "/lp/pra-sweatshirt/", "/lp/chinese-jacket/", "/lp/button-knit/", "/lp/zebra-knit/", "/lp/checked-jacket/"];
  fixture.forEach((codes, i) => {
    const output = group(codes.map(code => item(code, prices[i], categories[i])));
    assert.equal(output.length, 1, "must show one card, group " + i);
    assert.equal(output[0].sw.length, codes.length, "must show all colours, group " + i);
    assert.ok(output[0].url.endsWith(expected[i]));
  });
});
