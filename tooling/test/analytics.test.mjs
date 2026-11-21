import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

// js/analytics.js only runs on the production host; run it in a sandbox that pretends to be selectshopeg.com and
// record what GA4 and the Meta Pixel would receive. No network: the injected <script> tags are only collected.
const SOURCE = await readFile(new URL("../../js/analytics.js", import.meta.url), "utf8");
function run(url, store = new Map(), { readyState = "complete" } = {}) {
  const u = new URL(url);
  const scripts = [], onLoad = [], idle = [], timers = [];
  const window = { location: u, addEventListener: (type, fn) => type === "load" && onLoad.push(fn), requestIdleCallback: (fn, opts) => idle.push([fn, opts]) };
  const localStorage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
  const context = { window, location: u, localStorage, setTimeout: (fn, ms) => timers.push([fn, ms]), URL, URLSearchParams, Set, Array, Number, Date,
    document: { readyState, createElement: () => ({}), head: { appendChild: (s) => scripts.push(s.src) } } };
  window.document = context.document;
  vm.runInNewContext(SOURCE, context);
  const flushIdle = () => idle.splice(0).forEach(([fn]) => fn());
  if (readyState === "complete") flushIdle();
  const fbq = window.fbq;
  return {
    load: () => { onLoad.splice(0).forEach(fn => fn()); }, flushIdle, idle, timers,
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

test("?notrack=1 keeps this browser's test orders out of GA4 and the Pixel on every later page; ?notrack=0 undoes it", () => {
  const store = new Map();
  const off = run("https://selectshopeg.com/lp/ss-1008/?notrack=1", store);
  assert.equal(off.ga || off.pixel || off.scripts.length > 0, false);
  const later = run("https://selectshopeg.com/lp/ss-1008/?fbclid=abc", store); // same browser, next page
  assert.equal(later.ga || later.pixel, false);
  const back = run("https://selectshopeg.com/lp/ss-1008/?notrack=0", store);
  assert.equal(back.ga, true);
  assert.equal(run("https://selectshopeg.com/lp/ss-1008/?fbclid=abc", store).pixel, true);
});

test("tracking scripts wait for the load event: Pixel at load or 1 s after opening (first wins, once), GA4 at idle after load (2 s at most); PageView queued before either loads", () => {
  const META = "https://connect.facebook.net/en_US/fbevents.js", GA = "https://www.googletagmanager.com/gtag/js?id=G-NB8PZCX35Z";
  const r = run("https://selectshopeg.com/?fbclid=abc", new Map(), { readyState: "interactive" });
  assert.deepEqual(r.scripts, [], "nothing downloads before load");
  assert.equal(r.pixel, true, "PageView already waits in fbq.queue");
  assert.equal(r.ga, true, "GA4 config already waits in dataLayer");
  assert.equal(r.timers.length, 1);
  assert.equal(r.timers[0][1], 1000, "Pixel cap: 1 s after the page opened");
  r.load();
  assert.deepEqual(r.scripts, [META], "Pixel right after load, GA4 not yet");
  assert.equal(r.idle.length, 1);
  assert.equal(r.idle[0][1].timeout, 2000);
  r.timers[0][0](); // the 1 s cap fires later: no second Pixel
  r.flushIdle();
  assert.deepEqual(r.scripts, [META, GA]);

  const slow = run("https://selectshopeg.com/", new Map(), { readyState: "interactive" });
  slow.timers[0][0](); // load is late: the Pixel goes at 1 s, GA4 still waits for load
  assert.deepEqual(slow.scripts, [META]);
  slow.load(); slow.flushIdle();
  assert.deepEqual(slow.scripts, [META, GA], "no second Pixel at load");
});
