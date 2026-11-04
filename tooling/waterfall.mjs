// Slow 3G cold-load waterfall + LCP for one or more pages on the local mock (same throttling as e2e/coldload.spec.mjs).
//   node waterfall.mjs /lp/ballon-suit/ /lp/ss-1008/     (BASE defaults to http://127.0.0.1:4180, RUNS=3)
import { chromium, devices } from "@playwright/test";

const BASE = process.env.BASE || "http://127.0.0.1:4180";
const RUNS = Number(process.env.RUNS || 3);
// PROFILE=4g uses Lighthouse's mobile throttling (150 ms RTT, 1.6 Mbps); default is Slow 3G (400 ms, 400 kbps).
const NET = process.env.PROFILE === "4g" ? { latency: 150, kbps: 1638.4 } : { latency: 400, kbps: 400 };
const browser = await chromium.launch();
for (const path of process.argv.slice(2)) {
  const lcps = [], clss = [];
  for (let run = 0; run < RUNS; run++) {
    const { viewport, deviceScaleFactor, isMobile, hasTouch, userAgent } = devices["Pixel 7"];
    const ctx = await browser.newContext({ viewport, deviceScaleFactor, isMobile, hasTouch, userAgent });
    const page = await ctx.newPage();
    const cdp = await ctx.newCDPSession(page);
    await cdp.send("Network.enable");
    await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });
    await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: NET.latency, downloadThroughput: NET.kbps * 1024 / 8, uploadThroughput: NET.kbps * 1024 / 8 });
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
    await page.goto(BASE + path, { waitUntil: "load" });
    const r = await page.evaluate(() => new Promise(res => {
      let lcp = 0, cls = 0;
      new PerformanceObserver(l => { for (const e of l.getEntries()) if (!e.hadRecentInput) cls += e.value; }).observe({ type: "layout-shift", buffered: true });
      new PerformanceObserver(l => { for (const e of l.getEntries()) lcp = e.startTime; }).observe({ type: "largest-contentful-paint", buffered: true });
      setTimeout(() => res({ cls: +cls.toFixed(4), lcp: Math.round(lcp), res: performance.getEntriesByType("resource").map(e => ({ n: e.name.replace(location.origin, "").slice(0, 70), s: Math.round(e.startTime), e: Math.round(e.responseEnd), kb: Math.round(e.transferSize / 1024) })) }), 1500);
    }));
    lcps.push(r.lcp); clss.push(r.cls);
    if (run === 0 && process.env.WATERFALL !== "0") for (const x of r.res.sort((a, b) => a.s - b.s)) console.log(`  ${String(x.s).padStart(5)}-${String(x.e).padStart(5)} ms ${String(x.kb).padStart(4)} KB ${x.n}`);
    await ctx.close();
  }
  lcps.sort((a, b) => a - b);
  console.log(`${path} ${process.env.PROFILE === "4g" ? "slow 4G" : "slow 3G"} LCP median ${lcps[Math.floor(lcps.length / 2)]} ms (runs: ${lcps.join(", ")}) · CLS max ${Math.max(...clss)}`);
}
await browser.close();
