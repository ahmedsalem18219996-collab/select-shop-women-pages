import test from "node:test";
import assert from "node:assert/strict";
import { MODEL_FAMILIES, groupAdminProducts } from "../../admin/js/model-families.js";

const p = code => ({ public_code: code, title: code, status: "public", stock_total: 20, price_min_minor: 65000, price_max_minor: 65000 });
const all = MODEL_FAMILIES.flatMap(f => f.colors.map(c => p(c.code)));
test("verified groups contain unique real SKUs and valid swatches", () => {
  assert.equal(MODEL_FAMILIES.length, 8);
  assert.equal(new Set(all.map(p => p.public_code)).size, all.length);
  assert.equal(all.length, 30);
  for (const family of MODEL_FAMILIES) {
    assert.ok(family.colors.length >= 2);
    for (const c of family.colors) {
      assert.match(c.code, /^SS-\\d{4,19}$/);
      assert.match(c.hex, /^#[0-9A-Fa-f]{6}$/);
      assert.ok(c.name.trim());
    }
  }
});
test("every grouped SKU survives and unrelated models stay independent", () => {
  const input = [p("SS-1041"), ...all];
  const grouped = groupAdminProducts(input);
  assert.equal(grouped.length, 9);
  const codes = grouped.flatMap(g => g.members.map(m => m.product.public_code));
  assert.deepEqual(new Set(codes), new Set(input.map(x => x.public_code)));
  assert.equal(grouped[0].members[0].product.public_code, "SS-1041");
  assert.equal(grouped.filter(g => g.family).length, 8);
});
test("search filters and hidden status never fabricate or suppress products", () => {
  const only = groupAdminProducts([p("SS-1039")]);
  assert.equal(only.length,1);
  assert.equal(only[0].family,null);
  assert.equal(only[0].members[0].product.public_code,"SS-1039");
  const mixed = groupAdminProducts([p("SS-1042"),p("SS-1043"),p("SS-1011")]);
  assert.equal(mixed.length,2);
  assert.equal(mixed[0].members.length,2);
  assert.equal(mixed[1].members[0].product.public_code,"SS-1011");
});
