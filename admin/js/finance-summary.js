// Owner finance calculations: all money in integer piastres. Never infer refunds or collected COD.
const valid = x => Number.isSafeInteger(x) && x >= 0;
export const MAX_ROWS = 100;
export function summarizeStageRows(rows) {
  if (!Array.isArray(rows) || rows.length >= MAX_ROWS) return { complete: false, count: null, orderValueMinor: null, codes: new Set() };
  const unique = new Map();
  for (const row of rows) {
    if (!row || typeof row.public_order_code !== 'string' || !valid(row.grand_total_minor)) {
      return { complete: false, count: null, orderValueMinor: null, codes: new Set() };
    }
    unique.set(row.public_order_code, row.grand_total_minor);
  }
  const amount = [...unique.values()].reduce((a, v) => a + v, 0);
  if (!Number.isSafeInteger(amount)) return { complete: false, count: null, orderValueMinor: null, codes: new Set() };
  return { complete: true, count: unique.size, orderValueMinor: amount, codes: new Set(unique.keys()) };
}
// The server applies fulfillment-stage filtering *after* the 100-order cap.
// Load the whole confirmed order page without a stage filter first; if the
// page is capped, we cannot know whether older return requests are missing.
export function summarizeConfirmedStages(rows) {
  const coverage = summarizeStageRows(rows);
  if (!coverage.complete) return { complete: false, open: { complete: false }, returned: { complete: false } };
  return {
    complete: true,
    open: summarizeStageRows(rows.filter(row => row.stage === 'return_requested')),
    returned: summarizeStageRows(rows.filter(row => row.stage === 'returned'))
  };
}

export function filterOpenReturns(lines, openCodes) {
  if (!Array.isArray(lines) || !(openCodes instanceof Set)) return null;
  return lines.filter(line => !openCodes.has(line.order_code));
}
export function estimateNet(summary, expenses) {
  if (!summary?.complete || !Number.isSafeInteger(summary.grossMinor) || !Number.isSafeInteger(summary.orders) || summary.orders < 0) return null;
  if (!['ship','ad','other'].every(k => valid(expenses?.[k]))) return null;
  const cost = summary.orders * (expenses.ship + expenses.ad + expenses.other);
  const value = summary.grossMinor - cost;
  return Number.isSafeInteger(value) ? value : null;
}
