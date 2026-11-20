// QA screenshots of the motion modes on the local mock (no production): node motion-shots.mjs <outDir> [mode]
// Needs the mock running: node serve.mjs
import { chromium, devices } from "@playwright/test";
const BASE = "http://127.0.0.1:4173";
const out = process.argv[2] || "preview-output";
const mode = process.argv[3] || "cinematic";
const design = { title: "", motion: { mode, dirs: ["side", "top", "side"], hint: "تفاصيل أكتر تحت" }, accent: "#d0021b" };
await fetch(BASE + "/__mock/landing", { method: "POST", body: JSON.stringify({ code: "SS-1008", design }) });
const browser = await chromium.launch({ channel: process.env.PW_CHANNEL || undefined });
const page = await (await browser.newContext({ ...devices["Pixel 7"] })).newPage();
await page.goto(BASE + "/lp/ss-1008/");
await page.locator(".mo-stack .mo-sec").first().waitFor();
await page.waitForTimeout(1200);
await page.screenshot({ path: `${out}/motion-${mode}-open.png` });
await page.waitForTimeout(1500);
await page.screenshot({ path: `${out}/motion-${mode}-hint.png` });
for (const [i, y] of [600, 1100, 1700].entries()) {
  await page.mouse.wheel(0, y - (i ? [600, 1100, 1700][i - 1] : 0));
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${out}/motion-${mode}-scroll${i + 1}.png` });
}
await fetch(BASE + "/__mock/landing", { method: "POST", body: JSON.stringify({ code: "SS-1008", design: null }) });
await browser.close();
console.log("shots in", out);
