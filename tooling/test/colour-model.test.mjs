import test from "node:test";
import assert from "node:assert/strict";
import { colourModel, checkDrafts, planNewModel, planAddColour, planSizes, planColourPrice, planColourAvailability, photoTarget, runSteps, VIRTUAL_QTY } from "../../admin/js/colour-model.js";
import { PALETTE, hexOf, normName, colourKey, pairName, splitColourPair } from "../../js/colour-palette.js";

// Shapes as returned by products.get (admin_product_detail + admin media snapshot).
const product = {
  base_price: { amount_minor: 55000 }, structure_version: 7,
  options: [
    { option_id: "oc", name: "اللون", position: 0, values: [{ value_id: "c0", value: "بيبي بلو", position: 0, active: true }, { value_id: "c1", value: "بني", position: 1, active: true }] },
    { option_id: "os", name: "المقاس", position: 1, values: [{ value_id: "s0", value: "S", position: 0, active: true }, { value_id: "s1", value: "M", position: 1, active: true }] },
  ],
  variants: [
    { position: 0, active: true, availability: "available", amount_minor: 55000, price_source: "base", selections: [{ option_id: "oc", value_id: "c0" }, { option_id: "os", value_id: "s0" }] },
    { position: 1, active: true, availability: "available", amount_minor: 55000, price_source: "base", selections: [{ option_id: "oc", value_id: "c0" }, { option_id: "os", value_id: "s1" }] },
    { position: 2, active: true, availability: "unavailable", amount_minor: 60000, price_source: "variant_override", selections: [{ option_id: "oc", value_id: "c1" }, { option_id: "os", value_id: "s1" }] },
  ],
};
const stock = { 0: { quantity: 20 }, 1: { quantity: 0 }, 2: { quantity: 5 } };
const media = [
  { media_id: "m3", position: 3, scope: "product" },
  { media_id: "m1", position: 1, scope: "variant", variant: { position: 2, values: ["بني", "M"] } },
  { media_id: "m0", position: 0, scope: "option_value", option_value: { option_position: 0, value_position: 0, value: "بيبي بلو" } },
  { media_id: "gone", position: 2, scope: "product", delete_pending: true },
];

test("server product becomes colour cards with their own sizes, price, availability and photos", () => {
  const m = colourModel(product, stock, media);
  assert.equal(m.colours.length, 2);
  const [blue, brown] = m.colours;
  assert.deepEqual(blue.sizes, ["S", "M"]);
  assert.equal(blue.available, true, "S has virtual quantity");
  assert.equal(blue.priceMinor, null, "uses the base price");
  assert.deepEqual(blue.media.map((x) => x.media_id), ["m0"]);
  assert.deepEqual(brown.sizes, ["M"]);
  assert.equal(brown.priceMinor, 60000);
  assert.equal(brown.available, false);
  assert.deepEqual(brown.media.map((x) => x.media_id), ["m1"]);
  assert.deepEqual(m.shared.map((x) => x.media_id), ["m3"], "delete-pending photos are left out");
  assert.equal(blue.hex, "#A9C8E8");
  assert.equal(m.canAddColour, true);
});

test("a legacy one-SKU product cannot get a colour option once it has a Variant", () => {
  const legacy = { base_price: { amount_minor: 55000 }, options: [], variants: [{ position: 0, active: true, availability: "available", amount_minor: 55000, price_source: "base", selections: [] }] };
  const m = colourModel(legacy, { 0: { quantity: 3 } }, []);
  assert.equal(m.canAddColour, false);
  assert.equal(m.colours.length, 1);
  assert.deepEqual(m.colours[0].sizes, ["One Size"]);
  assert.equal(colourModel({ options: [], variants: [] }).canAddColour, true, "a fresh draft can");
});

test("drafts are checked in Egyptian Arabic before any call", () => {
  assert.match(checkDrafts([]), /لون واحد/);
  assert.match(checkDrafts([{ name: "بني", sizes: [], priceMinor: null }]), /مقاس واحد/);
  assert.match(checkDrafts([{ name: "بني", sizes: ["S"], priceMinor: null }, { name: "بنى", sizes: ["S"], priceMinor: null }]), /نفس الاسم/);
  assert.match(checkDrafts([{ name: "بني", sizes: ["S"], priceMinor: null }, { name: "", sizes: ["S"], priceMinor: null }]), /محتاج اسم/);
  assert.match(checkDrafts([{ name: "بني", sizes: ["S"], priceMinor: 50 }]), /السعر الخاص/);
  assert.equal(checkDrafts([{ name: "", sizes: ["One Size"], priceMinor: null, available: true }]), "");
});

test("a new model with three colours: options first, then each colour with only its sizes, then price and supply", () => {
  const drafts = [
    { name: "بيبي بلو", sizes: ["S", "M", "L"], priceMinor: null, available: true },
    { name: "بني", sizes: ["One Size"], priceMinor: 60000, available: true },
    { name: "بينك", sizes: ["M"], priceMinor: null, available: false },
  ];
  const steps = planNewModel(drafts, 55000);
  assert.deepEqual(steps[0].args.change, { op: "add_option", name: "اللون", values: ["بيبي بلو", "بني", "بينك"] });
  assert.deepEqual(steps[1].args.change, { op: "add_option", name: "المقاس", values: ["S", "M", "L", "One Size"] });
  assert.deepEqual(steps[2].args.change, { op: "create_variants", selections: [[0, 0], [0, 1], [0, 2], [1, 3], [2, 1]] });
  const after = steps.slice(3);
  assert.deepEqual(after.filter((s) => s.op === "products.set_variant_price").map((s) => s.args), [{ position: 3, amount_minor: 60000 }]);
  assert.deepEqual(after.filter((s) => s.op === "products.set_stock").map((s) => s.args.position), [0, 1, 2, 3]);
  assert.ok(after.filter((s) => s.op === "products.set_stock").every((s) => s.args.quantity === VIRTUAL_QTY));
  assert.deepEqual(after.filter((s) => s.op === "products.set_availability").map((s) => s.args), [{ position: 4, available: false }]);
});

test("every new available variant starts with virtual quantity 100, including added colours and reopened zero-stock variants", () => {
  assert.equal(VIRTUAL_QTY, 100, "shop-wide supplier-on-demand default");
  const fresh = planNewModel([
    { name: "بني", sizes: ["S", "M"], priceMinor: null, available: true },
  ], 55000);
  assert.deepEqual(fresh.filter((s) => s.op === "products.set_stock").map((s) => s.args.quantity), [100, 100]);

  const m = colourModel(product, stock, media);
  const added = planAddColour(m, { name: "بينك", sizes: ["M", "XL"], priceMinor: null, available: true });
  assert.deepEqual(added.filter((s) => s.op === "products.set_stock").map((s) => s.args.quantity), [100, 100]);

  const off = { ...m.colours[1], variants: [{ ...m.colours[1].variants[0], available: false, quantity: 0 }] };
  assert.deepEqual(planColourAvailability(off, true).map((s) => s.args), [{ position: 2, quantity: 100 }]);
  assert.deepEqual(planColourAvailability(m.colours[1], true).map((s) => s.args), [{ position: 2, quantity: 5 }], "never overwrite a positive existing amount");
});

test("a single unnamed colour makes a sizes-only model", () => {
  const steps = planNewModel([{ name: "", sizes: ["One Size"], priceMinor: null, available: true }], 55000);
  assert.equal(steps.filter((s) => s.args.change?.op === "add_option").length, 1);
  assert.deepEqual(steps[1].args.change.selections, [[0]]);
});

test("adding a colour later adds the value, any new size, and only its own Variants", () => {
  const m = colourModel(product, stock, media);
  const steps = planAddColour(m, { name: "بينك", sizes: ["M", "XL"], priceMinor: null, available: true });
  assert.deepEqual(steps.map((s) => s.args.change?.op || s.op), ["add_value", "add_value", "create_variants", "products.set_stock", "products.set_stock"]);
  assert.deepEqual(steps[0].args.change, { op: "add_value", option: 0, text: "بينك" });
  assert.deepEqual(steps[1].args.change, { op: "add_value", option: 1, text: "XL" });
  assert.deepEqual(steps[2].args.change.selections, [[2, 1], [2, 2]]);
  assert.deepEqual(steps.slice(3).map((s) => s.args.position), [3, 4], "new Variants follow the last position");
});

test("changing a colour's sizes reactivates, creates or retires; nothing is deleted", () => {
  const m = colourModel(product, stock, media);
  const brown = m.colours[1];
  const steps = planSizes(m, brown, ["S", "L"]);
  assert.deepEqual(steps.map((s) => s.args.change), [
    { op: "add_value", option: 1, text: "L" },
    { op: "set_variant_active", variant: 2, active: false },
    { op: "create_variants", selections: [[1, 0], [1, 2]] },
  ]);
  assert.ok(steps.every((s) => !/remove|delete/.test(s.args.change.op)));
});

test("colour price and supply touch only that colour's live sizes", () => {
  const m = colourModel(product, stock, media);
  assert.deepEqual(planColourPrice(m.colours[0], 58000).map((s) => s.args), [{ position: 0, amount_minor: 58000 }, { position: 1, amount_minor: 58000 }]);
  assert.deepEqual(planColourPrice(m.colours[1], null).map((s) => s.args), [{ position: 2, amount_minor: null }]);
  assert.deepEqual(planColourAvailability(m.colours[1], true).map((s) => s.args), [{ position: 2, quantity: 5 }], "keeps an existing quantity");
  assert.deepEqual(planColourAvailability(m.colours[0], false).map((s) => s.args), [{ position: 0, available: false }]);
});

test("a colour photo targets one of its own Variants and never mixes upload targets", () => {
  const m = colourModel(product, stock, media);
  assert.deepEqual(photoTarget(m.colours[1]), { variant_position: "2" });
  assert.deepEqual(photoTarget({ optionPosition: null }), {});
});

test("runner sends the latest structure token and stops at the first refusal", async () => {
  const sent = [];
  const call = async (op, args) => { sent.push([op, args.version]); return op === "products.set_stock" ? { outcome: "rejected" } : { outcome: "applied", structure_version: args.version + 1 }; };
  const steps = planNewModel([{ name: "بني", sizes: ["S"], priceMinor: null, available: true }], 55000);
  const r = await runSteps(steps, { call, code: "SS-9876", version: 1 });
  assert.equal(r.ok, false);
  assert.equal(r.step.op, "products.set_stock");
  assert.deepEqual(sent, [["products.structure", 1], ["products.structure", 2], ["products.structure", 3], ["products.set_stock", 4]]);
  const denied = await runSteps(steps, { call, code: "SS-9876", version: 1, can: () => false });
  assert.equal(denied.res.outcome, "forbidden");
});

test("palette names ignore Arabic spelling variants", () => {
  assert.equal(normName("أوف  وايت"), normName("اوف وايت"));
  assert.equal(hexOf("بنى"), "#6E4B3A", "common spelling of بني");
  assert.equal(hexOf("فوشيا"), "#D52987", "expanded colour catalogue includes fuchsia");
  assert.equal(hexOf("لون غير معروف"), null, "an unknown name gets no swatch");
  assert.equal(hexOf("بيبى بلو"), "#A9C8E8");
});

test("expanded palette keeps legacy colours stable and supports two-tone garments as one choice", () => {
  assert.ok(PALETTE.length >= 60);
  assert.ok(new Set(PALETTE.map((p) => normName(p.name))).size === PALETTE.length);
  assert.equal(hexOf("أسود"), "#1F1B1E");
  assert.equal(hexOf("بيبي بلو"), "#A9C8E8");
  assert.equal(hexOf("بني"), "#6E4B3A");
  assert.equal(pairName("أسود", "أبيض"), "أسود × أبيض");
  assert.deepEqual(splitColourPair("اسود × ابيض"), {
    first: "أسود", second: "أبيض", firstHex: "#1F1B1E", secondHex: "#F7F4EE",
  });
  assert.match(hexOf("أسود × أبيض"), /linear-gradient\(90deg, #1F1B1E 0 50%, #F7F4EE 50% 100%\)/);
  assert.equal(colourKey("أسود × أبيض"), colourKey("أبيض × أسود"));
  assert.match(checkDrafts([
    { name: "أسود × أبيض", sizes: ["S"], priceMinor: null },
    { name: "أبيض × أسود", sizes: ["M"], priceMinor: null },
  ]), /نفس الاسم/);
  assert.match(checkDrafts([{ name: "أسود × أسود", sizes: ["S"], priceMinor: null }]), /مختلفين/);
  assert.equal(checkDrafts([{ name: "أسود × أبيض", sizes: ["S"], priceMinor: null }]), "");
});
