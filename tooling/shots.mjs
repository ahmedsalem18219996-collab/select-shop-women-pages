// QA screenshots of the storefront against the local mock (never the live site, so no GA4/view-count noise).
//   PORT=4180 node serve.mjs &  OUT=dir node shots.mjs
import { chromium, devices } from "@playwright/test";
import { mkdir } from "node:fs/promises";

const BASE = process.env.BASE || "http://127.0.0.1:4180";
const OUT = process.env.OUT || "shots";
const pages = [["home", "/"], ["product", "/p/?code=SS-1008"], ["lp", "/lp/ss-1008/"], ["lp-catalog", "/lp/"]];
await mkdir(OUT, { recursive: true });
const browser = await chromium.launch();
for (const [dev, opts] of [["mobile", devices["Pixel 7"]], ["desktop", { viewport: { width: 1366, height: 900 } }]]) {
  const ctx = await browser.newContext(opts);
  const page = await ctx.newPage();
  for (const [name, path] of pages) {
    await page.goto(BASE + path, { waitUntil: "networkidle" }).catch(() => {});
    await page.waitForTimeout(600);
    await page.screenshot({ path: `${OUT}/${name}-${dev}.png`, fullPage: process.env.FULL === "1" });
  }
  await ctx.close();
}
await browser.close();
