import test from "node:test";
import assert from "node:assert/strict";
import { sourceGroup, groupSources, parseGa4Events } from "../../admin/js/ga4-report.js";

test("GA4 source/medium rows group into the channels the owner budgets for", () => {
  const cases = { "facebook / paid": "Facebook", "l.facebook.com / referral": "Facebook", "fb / cpc": "Facebook",
    "ig / paid": "Instagram", "l.instagram.com / referral": "Instagram", "google / organic": "Google",
    "(direct) / (none)": "مباشر", "bing / organic": "تانية", "figma / referral": "تانية" };
  for (const [raw, group] of Object.entries(cases)) assert.equal(sourceGroup(raw), group, raw);
  assert.deepEqual(groupSources([{ name: "facebook / paid", value: 80 }, { name: "m.facebook.com / referral", value: 5 },
    { name: "instagram / social", value: 20 }]), [{ name: "Facebook", value: 85 }, { name: "Instagram", value: 20 }]);
});

test("events CSV gives the measured funnel and conversion; missing steps stay unknown, never zero", () => {
  const full = parseGa4Events("# GA4\nEvent name,Event count,Total users\npage_view,900,1\nview_item,\"1,000\",1\nadd_to_cart,120,1\nbegin_checkout,60,1\npurchase,20,1\n");
  assert.deepEqual(full.steps.map((s) => s.count), [1000, 120, 60, 20]);
  assert.equal(full.conversion, 0.02);
  const partial = parseGa4Events("Event name,Event count\nview_item,50\n");
  assert.deepEqual(partial.steps.map((s) => s.count), [50, null, null, null]);
  assert.equal(partial.conversion, null);
  assert.throws(() => parseGa4Events("Region,Sessions\nCairo,1\n"), /Event name/);
});
