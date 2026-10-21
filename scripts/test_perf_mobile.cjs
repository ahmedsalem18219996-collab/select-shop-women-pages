/* Performance candidate smoke test. Runs entirely inside CI with local files.
 * Never sends real orders, and blocks analytics and external writes.
 */
const fs = require("node:fs/promises");
const path = require("node:path");
const { chromium } = require("playwright");

const candidateDir = path.resolve(process.argv[2]);
const baselineDir = path.resolve(process.argv[3]);
const catalogPath = path.resolve(process.argv[4]);
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const extMimes = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".webp": "image/webp",
  ".jpg": "image/jpeg",
  ".png": "image/png",
  ".woff2": "font/woff2",
  ".svg": "image/svg+xml",
  ".json": "application/json"
};
function median(values) {
  const a = [...values].sort((x, y) => x-y);
  return a[Math.floor(a.length/2)];
}
async function runPage(browser, root, catalog, label) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    locale: "ar-EG",
    serviceWorkers: "block"
  });
  const page = await context.newPage();
  let catalogCalls = 0;
  let blockedWrites = 0;
  const badResponses = [];
  page.on("response", response => {
    if (response.status() >= 400 && response.url().startsWith("https://selectshopeg.com/")) {
      badResponses.push(response.url() + " -> " + response.status());
    }
  });
  await page.route("**/*", async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.hostname === "selectshopeg.com") {
      const fileRelative = decodeURIComponent(url.pathname === "/" ? "/index.html" :
        url.pathname.endsWith("/") ? url.pathname + "index.html" : url.pathname);
      const dest = path.resolve(root, "." + fileRelative);
      if (!dest.startsWith(root + path.sep) || request.method() !== "GET") {
        return route.fulfill({ status: 403, body: "Forbidden" });
      }
      try {
        const body = await fs.readFile(dest);
        return route.fulfill({ status: 200, contentType: extMimes[path.extname(dest)] || "application/octet-stream", body });
      } catch {
        return route.fulfill({ status: 404, body: "Not found" });
      }
    }
    if (url.hostname === "byluoipdunralsurwebt.supabase.co" && url.pathname.endsWith("/catalog")) {
      catalogCalls++;
      return route.fulfill({ status: 200, contentType: "application/json", headers: {
        "access-control-allow-origin": "*",
        "cache-control": "no-store"
      }, body: JSON.stringify(catalog) });
    }
    if (url.hostname === "byluoipdunralsurwebt.supabase.co" && request.method() === "GET" &&
      url.pathname.startsWith("/storage/v1/object/public/product-media/media/")) {
      return route.continue();
    }
    if (request.method() !== "GET") blockedWrites++;
    // No Meta/GA analytics, cookies, checkout submissions, or third-party scripts in the CI smoke test.
    return route.abort();
  });
  await page.addInitScript(() => {
    window.__qaLCP = 0;
    try {
      new PerformanceObserver(list => {
        for (const entry of list.getEntries()) window.__qaLCP = entry.startTime;
      }).observe({ type: "largest-contentful-paint", buffered: true });
    } catch {}
  });
  const navigationStart = Date.now();
  const res = await page.goto("https://selectshopeg.com/", { waitUntil: "domcontentloaded", timeout: 40000 });
  if (!res || res.status() !== 200) throw Error(label + " home did not return HTTP 200");
  const expected = catalog.items.filter(item => item && /^SS-\d{4,19}$/.test(String(item.publicCode || "")) &&
    Number.isSafeInteger(item.priceMinor) && item.priceMinor > 0 &&
    /^https:\/\/byluoipdunralsurwebt\.supabase\.co\/storage\/v1\/object\/public\/product-media\/media\/[0-9a-f]{32}\.(png|jpg|webp)$/.test(item.image || "")).length;
  await page.waitForFunction(n => document.querySelectorAll("#feed article.card").length === n, expected, { timeout: 45000 });
  const count = await page.locator("#feed article.card").count();
  if (count !== expected || !count) throw Error(label + ": product count mismatch " + count + "/" + expected);
  await page.waitForFunction(() => [...document.querySelectorAll("#feed article.card img")].slice(0, 2).every(img => img.complete && img.naturalWidth > 0), null, { timeout: 45000 });
  await wait(1500);
  const result = await page.evaluate(() => {
    const imgs = [...document.querySelectorAll("#feed article.card img")];
    return {
      lcpMs: Math.round(window.__qaLCP || 0),
      firstImage: imgs[0]?.currentSrc || imgs[0]?.src,
      firstTwoLoaded: imgs.slice(0,2).every(im => im.complete && im.naturalWidth > 0),
      productCount: imgs.length,
      productLink: document.querySelector("#feed article.card a.shot-link")?.href,
      widths: imgs.slice(0,2).map(im => [im.getAttribute("width"), im.getAttribute("height")])
    };
  });
  if (catalogCalls !== 1) throw Error(label + " catalog requested " + catalogCalls + " times");
  if (!result.firstTwoLoaded) throw Error(label + " first product images not visible");
  if (!result.productLink || !result.productLink.startsWith("https://selectshopeg.com/p/?code=SS-")) {
    throw Error(label + " product detail link invalid: " + result.productLink);
  }
  if (label === "candidate" && !result.firstImage.includes("/assets/catalog-thumbs/")) {
    throw Error("Candidate image is not the static WebP thumbnail: " + result.firstImage);
  }
  if (badResponses.length) throw Error(label + " local assets failed: " + badResponses.join("; "));
  await page.locator("[data-open-bag]").first().click();
  await page.waitForURL("https://selectshopeg.com/cart/", { timeout: 15000 });
  if (!(await page.locator("h1").first().textContent()).includes("شنطتك")) {
    throw Error(label + " cart page did not open correctly");
  }
  await context.close();
  return { label, ...result, catalogCalls, elapsedMs: Date.now() - navigationStart, blockedWrites };
}
(async () => {
  const catalog = JSON.parse(await fs.readFile(catalogPath, "utf8"));
  if (!Array.isArray(catalog.items) || catalog.items.length < 1) throw Error("Catalog fixture missing");
  const browser = await chromium.launch({
    executablePath: process.env.CHROME_BIN || undefined,
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage"]
  });
  try {
    const baseline = await runPage(browser, baselineDir, catalog, "baseline");
    const candidate = await runPage(browser, candidateDir, catalog, "candidate");
    console.log("WOMEN mobile smoke: " + JSON.stringify({ baseline, candidate }));
    if (candidate.productCount !== baseline.productCount) throw Error("Candidate lost products");
    if (candidate.lcpMs > 0 && baseline.lcpMs > 0) {
      console.log("LCP local test: baseline " + baseline.lcpMs + "ms, candidate " + candidate.lcpMs + "ms (indicative only; not live PageSpeed)");
    }
    console.log("PASS: one catalog request, valid first 2 images, product links, cart and all products.");
  } finally {
    await browser.close();
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
