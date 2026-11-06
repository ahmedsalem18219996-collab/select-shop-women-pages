// Lighthouse (mobile, same pages as lighthouserc.json + home and cart) in Dark and in Light. LHCI resets storage before each
// run, so it can only measure the default Dark; this keeps a saved Light choice instead (disableStorageReset) on one Chromium.
//   node theme-lighthouse.mjs [runs=3]     (needs the mock on BASE, default http://127.0.0.1:4180)
import { chromium } from "@playwright/test";
import lighthouse from "lighthouse";

const BASE = process.env.BASE || "http://127.0.0.1:4180", RUNS = Number(process.argv[2] || 3), PORT = 9333;
const URLS = ["/", "/lp/ss-1008/?lpv=a", "/lp/ss-1008/?lpv=b", "/lp/ballon-suit/?lpv=a", "/lp/?p=SS-1099&lpv=a", "/cart/", "/checkout/"];
const browser = await chromium.launch({ args: [`--remote-debugging-port=${PORT}`] });
const ctx = browser.contexts()[0] || await browser.newContext();
const page = await ctx.newPage();
const median = (a) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];
const rows = [];
for (const theme of ["dark", "light"]) {
  await page.goto(BASE + "/");
  await page.evaluate(t => localStorage.setItem("ssw.theme.v1", t), theme);
  for (const url of URLS) {
    const r = [];
    for (let i = 0; i < RUNS; i++) {
      const { lhr } = await lighthouse(BASE + url, { port: PORT, disableStorageReset: true, onlyCategories: ["performance", "accessibility", "best-practices"], output: "json", logLevel: "error" });
      r.push({ perf: lhr.categories.performance.score * 100, a11y: lhr.categories.accessibility.score * 100, bp: lhr.categories["best-practices"].score * 100,
        lcp: lhr.audits["largest-contentful-paint"].numericValue, cls: lhr.audits["cumulative-layout-shift"].numericValue, tbt: lhr.audits["total-blocking-time"].numericValue });
    }
    const m = k => median(r.map(x => x[k]));
    rows.push({ theme, url, perf: m("perf"), a11y: m("a11y"), bp: m("bp"), lcp: (m("lcp") / 1000).toFixed(2) + "s", cls: m("cls").toFixed(3), tbt: Math.round(m("tbt")) + "ms" });
    console.log(JSON.stringify(rows.at(-1)));
  }
}
await browser.close();
console.table(rows);
