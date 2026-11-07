// Supplier cost and profit (Owner only). All money is integer piastres (EGP minor units), like the rest of the Admin.
// Gross profit  = selling price − supplier cost.
// Margin %      = gross ÷ selling price × 100.
// Net estimate  = selling price − supplier cost − shipping the SHOP pays − ad cost per order − packaging/payment/other.
// The shipping fee a customer pays is a pass-through, never counted as profit. Any unknown base cost → "incomplete",
// never a misleading number.

const isMoney = (x) => Number.isInteger(x) && x >= 0;

export function grossProfit(sellMinor, costMinor) {
  if (!isMoney(sellMinor) || sellMinor === 0 || !isMoney(costMinor)) return null;
  return { grossMinor: sellMinor - costMinor, marginPct: Math.round(((sellMinor - costMinor) / sellMinor) * 1000) / 10, belowCost: costMinor > sellMinor };
}

/** expenses: { shippingMinor, adMinor, otherMinor } per order; missing ones count as 0 only when explicitly 0. */
export function netProfit(sellMinor, costMinor, expenses = {}) {
  const g = grossProfit(sellMinor, costMinor);
  const parts = [expenses.shippingMinor ?? 0, expenses.adMinor ?? 0, expenses.otherMinor ?? 0];
  if (!g || !parts.every(isMoney)) return null;
  const netMinor = g.grossMinor - parts.reduce((a, b) => a + b, 0);
  return { ...g, netMinor, netPct: Math.round((netMinor / sellMinor) * 1000) / 10 };
}

/** Profit of confirmed/delivered orders from the server summary rows (one row per order line, cost frozen at order time). */
export function summarizeLines(lines, statuses = ['confirmed', 'delivered']) {
  const out = { orders: new Set(), revenueMinor: 0, costMinor: 0, incompleteOrders: new Set(), units: 0 };
  for (const l of lines) {
    if (!statuses.includes(l.status) || l.returned) continue;
    out.orders.add(l.order_code);
    out.units += l.quantity;
    out.revenueMinor += l.line_total_minor - (l.discount_minor || 0);
    if (isMoney(l.unit_cost_minor)) out.costMinor += l.unit_cost_minor * l.quantity;
    else out.incompleteOrders.add(l.order_code);
  }
  const complete = out.incompleteOrders.size === 0;
  return { orders: out.orders.size, units: out.units, revenueMinor: out.revenueMinor, costMinor: out.costMinor, complete,
    incompleteOrders: out.incompleteOrders.size, grossMinor: complete ? out.revenueMinor - out.costMinor : null };
}

/** Readable line for a price/cost pair (Egyptian Arabic). */
export function profitText(sellMinor, costMinor, money) {
  if (!isMoney(costMinor)) return { kind: 'incomplete', text: 'الربح غير مكتمل: تكلفة المورد مش متسجلة.' };
  const g = grossProfit(sellMinor, costMinor);
  if (!g) return { kind: 'incomplete', text: 'الربح غير مكتمل: سعر البيع مش متحدد.' };
  if (g.belowCost) return { kind: 'loss', text: `تنبيه: سعر البيع أقل من تكلفة المورد بـ ${money(-g.grossMinor)}. السعر ما اتغيرش؛ يرجى مراجعته قبل النشر.` };
  return { kind: 'ok', text: `ربح مبدئي ${money(g.grossMinor)} (${g.marginPct.toLocaleString('ar-EG')}%)` };
}

// ---- API (new Owner-only operations; the database migration ships for review in the PR, not applied) ----
export const COST_OPS_MISSING = new Set(['unknown_operation', 'not_found']);

export async function loadCosts(call, code) {
  let r;
  try { r = await call('costs.get', { code }); } catch { r = { outcome: 'network' }; }
  if (r?.outcome === 'ok') return { ready: true, data: r.data };
  return { ready: false, missing: COST_OPS_MISSING.has(r?.outcome), outcome: r?.outcome };
}

/** position null = the model's default cost; cost null clears it (back to "unknown"). */
export const saveCost = (call, code, position, costMinor) => call('costs.set', { code, position, cost_minor: costMinor });

/** Effective supplier cost for one Variant: its own cost, else the model default, else unknown (null). */
export const costOf = (costs, position) => {
  const own = costs?.variants?.find((v) => v.position === position)?.cost_minor;
  return isMoney(own) ? own : isMoney(costs?.product_cost_minor) ? costs.product_cost_minor : null;
};
