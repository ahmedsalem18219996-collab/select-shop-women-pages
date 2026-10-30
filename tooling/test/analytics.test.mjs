import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

// js/analytics.js only runs on the production host; run it in a sandbox that pretends to be selectshopeg.com and
// record what GA4 and the Meta Pixel would receive. No network: the injected <script> tags are only collected.
const SOURCE = await readFile(new URL("../../js/analytics.js", import.meta.url), "utf8");
function run(url) {
  const u = new URL(url);
  const scripts = [];
  const window = { location: u };
  const context = { window, location: u, URL, URLSearchParams, Set, Array, Number, Date,
    document: { createElement: () => ({}), head: { appendChild: (s) => scripts.push(s.src) } } };
  window.document = context.document;
  vm.runInNewContext(SOURCE, context);
  const fbq = window.fbq;
  return {
    pixel: !!fbq && (fbq.queue || []).some(args => args[0] === "trackSingle" && args[2] === "PageView"),
    ga: (window.dataLayer || []).some(args => args[0] === "config"),
    gaLocation: (window.dataLayer || []).find(args => args[0] === "config")?.[2]?.page_location,
    scripts,
  };
}

test("Meta Pixel PageView loads on every real ad landing URL", () => {
  for (const url of [
    "https://selectshopeg.com/lp/ss-1008/?fbclid=abc&lpv=a",
    "https://selectshopeg.com/lp/?p=SS-1008&fbclid=abc",                          // automatic page: was silently skipped
    "https://selectshopeg.com/lp/ss-1008/?utm_source=facebook&utm_medium=paid&utm_campaign=c&utm_content=a&utm_id=123&utm_term=s",
    "https://selectshopeg.com/lp/ss-1008/?igshid=x&campaign_id=1&adset_id=2&ad_id=3&placement=Instagram_Stories&site_source_name=ig",
  ]) assert.equal(run(url).pixel, true, url);
});

test("Pixel stays off for unknown parameters, other hosts and the order confirmation page", () => {
  assert.equal(run("https://selectshopeg.com/lp/ss-1008/?email=a@b.c").pixel, false);
  assert.equal(run("https://selectshopeg.com/order-success/?order=ORD-ABCDEFGH").pixel, false);
  assert.equal(run("http://127.0.0.1:4173/lp/ss-1008/").pixel, false);
  assert.equal(run("https://selectshopeg.com/lp/ss-1008/?design-preview=1").pixel, false);
});

test("GA4 page location keeps marketing parameters and drops everything else", () => {
  const r = run("https://selectshopeg.com/lp/?p=SS-1008&utm_id=9&phone=01012345678#x");
  assert.equal(r.ga, true);
  assert.equal(r.gaLocation, "https://selectshopeg.com/lp/?p=SS-1008&utm_id=9");
});
