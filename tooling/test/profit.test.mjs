import test from "node:test";
import assert from "node:assert/strict";
import { grossProfit, netProfit, summarizeLines, profitText, costOf } from "../../admin/js/profit.js";

const egp = (m) => `${m / 100} ج.م`;

test("owner example: cost 350, price 550 → gross 200, margin 36.4%", () => {
  assert.deepEqual(grossProfit(55000, 35000), { grossMinor: 20000, marginPct: 36.4, belowCost: false });
  assert.equal(profitText(55000, 35000, egp).text, "ربح مبدئي 200 ج.م (٣٦٫٤%)");
});

test("net estimate subtracts shop-paid shipping, ads and other costs, never adds the customer's shipping fee", () => {
  const n = netProfit(55000, 35000, { shippingMinor: 1500, adMinor: 4000, otherMinor: 500 });
  assert.equal(n.grossMinor, 20000);
  assert.equal(n.netMinor, 14000);
  assert.equal(n.netPct, 25.5);
  assert.equal(netProfit(55000, 35000).netMinor, 20000, "no expenses entered = gross");
  assert.equal(netProfit(55000, 35000, { adMinor: -1 }), null, "invalid expense is not silently ignored");
});

test("unknown cost shows 'incomplete' instead of a number", () => {
  assert.equal(grossProfit(55000, null), null);
  assert.equal(profitText(55000, null, egp).kind, "incomplete");
  assert.equal(profitText(null, 35000, egp).kind, "incomplete");
});

test("selling below supplier cost warns without changing the price", () => {
  const t = profitText(30000, 35000, egp);
  assert.equal(t.kind, "loss");
  assert.match(t.text, /أقل من تكلفة المورد بـ 50 ج.م/);
  assert.equal(grossProfit(30000, 35000).belowCost, true);
});

test("order summary uses the cost frozen on each line, skips returns and cancelled orders, and flags unknown costs", () => {
  const lines = [
    { order_code: "A", status: "delivered", quantity: 2, line_total_minor: 110000, unit_cost_minor: 35000 },
    { order_code: "B", status: "confirmed", quantity: 1, line_total_minor: 55000, discount_minor: 5000, unit_cost_minor: 35000 },
    { order_code: "C", status: "cancelled", quantity: 1, line_total_minor: 55000, unit_cost_minor: 35000 },
    { order_code: "D", status: "delivered", quantity: 1, line_total_minor: 55000, unit_cost_minor: 35000, returned: true },
  ];
  assert.deepEqual(summarizeLines(lines), { orders: 2, units: 3, revenueMinor: 160000, costMinor: 105000, complete: true, incompleteOrders: 0, grossMinor: 55000 });
  const withUnknown = summarizeLines([...lines, { order_code: "E", status: "delivered", quantity: 1, line_total_minor: 55000, unit_cost_minor: null }]);
  assert.equal(withUnknown.complete, false);
  assert.equal(withUnknown.incompleteOrders, 1);
  assert.equal(withUnknown.grossMinor, null);
});

test("variant cost falls back to the model default, else unknown", () => {
  const costs = { product_cost_minor: 35000, variants: [{ position: 2, cost_minor: 40000 }] };
  assert.equal(costOf(costs, 2), 40000);
  assert.equal(costOf(costs, 0), 35000);
  assert.equal(costOf({ variants: [] }, 0), null);
});

// Characterisation, NOT a policy change: pins what the dashboard counts today for every order stage. The server
// (profit.summary in the private backend) sends confirmed orders only: pending and cancelled never arrive; its stage
// mapping is delivered|return_requested → "delivered", returned → returned=true, anything else → "confirmed".
test("profit per order stage, as implemented today", () => {
  const row = (order_code, stage) => ({ order_code, quantity: 1, line_total_minor: 100000, unit_cost_minor: 60000,
    status: ["delivered", "return_requested"].includes(stage) ? "delivered" : "confirmed", returned: stage === "returned" });
  const counted = (stage) => summarizeLines([row("X", stage)]).orders === 1;
  assert.equal(counted(null), true);              // confirmed, not started
  assert.equal(counted("preparing"), true);
  assert.equal(counted("shipped"), true);
  assert.equal(counted("delivered"), true);
  assert.equal(counted("return_requested"), true); // open owner decision: still counted until the return completes
  assert.equal(counted("returned"), false);
  // A cancelled or pending order is never sent by the server; if one ever arrived it would not be counted either.
  assert.equal(summarizeLines([{ ...row("C", null), status: "cancelled" }, { ...row("P", null), status: "pending" }]).orders, 0);
});
