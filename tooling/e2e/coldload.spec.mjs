import { test, expect, devices } from "@playwright/test";

// Cold ad-link opens: no cache, throttled network and CPU, Facebook / Instagram in-app browser user agents.
// LCP and CLS are read from the browser's own PerformanceObserver. Mock API only; nothing reaches production.
const ANDROID = "Mozilla/5.0 (Linux; Android 13; SM-A135F Build/TP1A.220624.014; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/129.0.6668.100 Mobile Safari/537.36";
const IN_APP = {
  facebook: ANDROID + " [FB_IAB/FB4A;FBAV/485.0.0.40.75;]",
  instagram: ANDROID + " Instagram 352.0.0.39.89 Android (33/13; 450dpi; 1080x2186; samsung; SM-A135F; a13; exynos850; ar_EG; 649223476)",
};
const NETWORKS = {
  "slow 4G": { latency: 150, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8, lcpMax: 2500 },
  "slow 3G": { latency: 400, downloadThroughput: (400 * 1024) / 8, uploadThroughput: (400 * 1024) / 8, lcpMax: null }, // reported, not gated
};

async function coldOpen(page, url, net) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Network.enable");
  await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });
  await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: net.latency, downloadThroughput: net.downloadThroughput, uploadThroughput: net.uploadThroughput });
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  const response = await page.goto(url, { waitUntil: "load" });
  const metrics = await page.evaluate(() => new Promise(resolve => {
    let lcp = 0, el = "", cls = 0;
    new PerformanceObserver(l => { for (const e of l.getEntries()) { lcp = e.startTime; el = e.element ? e.element.tagName + (e.element.closest("#lpHero") ? "#hero" : "") : ""; } }).observe({ type: "largest-contentful-paint", buffered: true });
    new PerformanceObserver(l => { for (const e of l.getEntries()) if (!e.hadRecentInput) cls += e.value; }).observe({ type: "layout-shift", buffered: true });
    setTimeout(() => resolve({ lcp: Math.round(lcp), el, cls: Number(cls.toFixed(4)) }), 1500);
  }));
  return { response, metrics };
}

test.describe("cold ad-link open", () => {
  test.skip(({ isMobile }) => !isMobile, "throttling via CDP on the mobile project only");

  for (const [app, ua] of Object.entries(IN_APP)) {
    for (const [name, net] of Object.entries(NETWORKS)) {
      for (const path of ["/lp/ballon-suit/", "/lp/ss-1008/", "/lp/?p=SS-1008"]) {
        test(`${app} in-app · ${name} · ${path}`, async ({ browser }) => {
          const { viewport, deviceScaleFactor, isMobile, hasTouch } = devices["Pixel 7"];
          const context = await browser.newContext({ viewport, deviceScaleFactor, isMobile, hasTouch, userAgent: ua, baseURL: "http://127.0.0.1:4173" });
          const page = await context.newPage();
          const { response, metrics } = await coldOpen(page, path, net);
          console.log(`COLD ${app} | ${name} | ${path} | LCP ${metrics.lcp} ms (${metrics.el}) | CLS ${metrics.cls}`);
          test.info().annotations.push({ type: "cold-load", description: `${app} ${name} ${path}: LCP ${metrics.lcp} ms, CLS ${metrics.cls}` });
          expect(response.status()).toBe(200);
          expect(response.request().redirectedFrom()).toBeNull(); // the exact ad URL never redirects
          expect(metrics.el).toBe("IMG#hero"); // the product photo is the largest paint, straight from the HTML
          expect(metrics.cls).toBeLessThanOrEqual(0.1);
          // The automatic page learns its photo from one API read, so it gets +500 ms; ads should prefer /lp/<id>/ pages.
          if (net.lcpMax) expect(metrics.lcp).toBeLessThanOrEqual(net.lcpMax + (path.includes("?p=") ? 500 : 0));
          await expect(page.locator("h1")).not.toBeEmpty();
          await expect(page.locator("#lpOrder")).toBeEnabled({ timeout: 15000 }); // verified with the server, then orderable
          await context.close();
        });
      }
    }
  }

  test("ad URL forms: only the exact https apex URL with the trailing slash avoids a redirect", async ({ request }) => {
    const exact = await request.get("/lp/ballon-suit/", { maxRedirects: 0 });
    expect(exact.status()).toBe(200);
    const noSlash = await request.get("/lp/ballon-suit", { maxRedirects: 0 });
    expect(noSlash.status()).toBe(301); // same behaviour as GitHub Pages: ads must use the slash form
  });
});
