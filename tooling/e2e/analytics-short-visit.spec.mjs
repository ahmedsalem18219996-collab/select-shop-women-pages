import { test, expect, devices } from "@playwright/test";
import { readFile } from "node:fs/promises";

// A phone visitor who leaves after 3 s must still send the Meta PageView, now that GA4 and the Pixel wait for the load
// event (Pixel at the latest 1 s after opening). The real js/analytics.js runs with only its production-host gate opened;
// Meta and Google are fakes that answer after the time their real files (~204KB in 2 requests / ~179KB) take on the
// network. Nothing leaves the QA server. Gate: 4G (DevTools "Fast 4G"); slow 4G (Lighthouse mobile) is reported only.
const NETWORKS = {
  "4G": { latency: 60, downloadThroughput: (9 * 1024 * 1024) / 8, uploadThroughput: (1.5 * 1024 * 1024) / 8, gate: true },
  "slow 4G": { latency: 150, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8, gate: false },
};
const VISIT_MS = 3000;
const SOURCE = (await readFile(new URL("../../js/analytics.js", import.meta.url), "utf8")).replaceAll("location.hostname.toLowerCase()", '"selectshopeg.com"');

for (const [name, net] of Object.entries(NETWORKS)) {
  test(`short 3 s visit to the home · ${name} · Meta PageView ${net.gate ? "is sent" : "timing (reported)"}`, async ({ browser, isMobile }) => {
    test.skip(!isMobile, "throttling via CDP on the mobile project only");
    const transfer = (kb, requests = 1) => Math.round((kb * 1024) / net.downloadThroughput * 1000 + requests * 2 * net.latency);
    const { viewport, deviceScaleFactor, hasTouch, userAgent } = devices["Pixel 7"];
    const context = await browser.newContext({ viewport, deviceScaleFactor, isMobile, hasTouch, userAgent, baseURL: "http://127.0.0.1:4173" });
    const page = await context.newPage();
    const sent = [];
    let t0 = 0;
    await page.route("**/js/analytics.js*", route => route.fulfill({ contentType: "text/javascript", body: SOURCE }));
    await page.route("https://connect.facebook.net/**", async route => {
      await new Promise(r => setTimeout(r, transfer(204, 2))); // fbevents.js + its config file
      await route.fulfill({ contentType: "text/javascript", body: `(fbq.queue||[]).forEach(a=>{if(a[0]==="trackSingle")new Image().src="https://www.facebook.com/tr/?ev="+a[2]})` });
    });
    await page.route("https://www.googletagmanager.com/**", async route => {
      await new Promise(r => setTimeout(r, transfer(179)));
      await route.fulfill({ contentType: "text/javascript", body: `if((dataLayer||[]).some(a=>a[0]==="config"))new Image().src="https://www.google-analytics.com/g/collect?en=page_view"` });
    });
    await page.route(/facebook\.com\/tr|google-analytics\.com\/g\/collect/, route => {
      const u = new URL(route.request().url());
      sent.push({ name: u.searchParams.get("ev") ? "meta:" + u.searchParams.get("ev") : "ga4:" + u.searchParams.get("en"), ms: Date.now() - t0 });
      return route.fulfill({ status: 204 });
    });

    const cdp = await context.newCDPSession(page);
    await cdp.send("Network.enable");
    await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });
    await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: net.latency, downloadThroughput: net.downloadThroughput, uploadThroughput: net.uploadThroughput });
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
    t0 = Date.now();
    await page.goto("/", { waitUntil: "commit" });
    await page.waitForTimeout(Math.max(0, (net.gate ? VISIT_MS : 8000) - (Date.now() - t0)));
    const loadEventMs = await page.evaluate(() => Math.round(performance.getEntriesByType("navigation")[0]?.loadEventStart || 0));
    await context.close(); // she leaves
    console.log(`short visit · ${name}:`, JSON.stringify({ loadEventMs, sent }));
    const pageView = sent.find(e => e.name === "meta:PageView");
    if (net.gate) expect(pageView && pageView.ms <= VISIT_MS, "Meta PageView within " + VISIT_MS + " ms").toBeTruthy();
    else expect(pageView, "Meta PageView is sent eventually").toBeTruthy();
  });
}
