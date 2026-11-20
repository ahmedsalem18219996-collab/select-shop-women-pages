// QA screenshots of a motion campaign page on the local mock (no production): node collection-shots.mjs <outDir> [mode]
// Needs the mock running: node serve.mjs
import { chromium, devices } from "@playwright/test";
const BASE = "http://127.0.0.1:4173";
const out = process.argv[2] || "preview-output";
const mode = process.argv[3] || "cinematic";
const post = (p, body) => fetch(BASE + p, { method: "POST", body: JSON.stringify(body) });
const codes = ["SS-1013", "SS-9101", "SS-1012"];
await post("/__mock/landing", { code: "SS-1013", design: { title: "", motion: { mode, dirs: ["side", "top", "side"], hint: "اسحبي لتحت" }, accent: "#2e7d32" } });
await post("/__mock/landing", { code: "SS-1012", design: { title: "", motion: { mode, dirs: ["top", "side"] }, accent: "#d0021b" } });
await post("/__mock/collection", { slug: "motion-qa", title: "مجموعة الحركة", codes });
const browser = await chromium.launch({ channel: process.env.PW_CHANNEL || undefined });
const page = await (await browser.newContext({ ...devices["Pixel 7"] })).newPage();
page.on("pageerror", e => console.log("pageerror", e.message));
await page.goto(BASE + "/collections/?slug=motion-qa");
await page.locator(".mo-stack .mo-sec").first().waitFor();
await page.waitForTimeout(1500);
await page.screenshot({ path: `${out}/collection-${mode}-open.png` });
const shot = async (name) => { await page.waitForTimeout(500); await page.screenshot({ path: `${out}/collection-${mode}-${name}.png` }); };
await page.mouse.wheel(0, 700); await shot("scroll1");
await page.mouse.wheel(0, 700); await shot("scroll2");
// Colour switch on SS-9101 then add to bag (fly-to-bag)
const first = page.locator(".cp-product").nth(1);
const chips = first.locator(".cp-option").first().locator("button");
if (await chips.count() > 1) await chips.nth(1).click();
const sizes = first.locator(".cp-option").nth(1).locator("button:not([disabled])");
if (await sizes.count()) await sizes.first().click();
await first.locator(".cp-add").scrollIntoViewIfNeeded();
await shot("colour");
await first.locator(".cp-add").click();
await page.waitForTimeout(250);
await page.screenshot({ path: `${out}/collection-${mode}-fly.png` });
await page.waitForTimeout(1200);
console.log("bag count:", await page.locator("#cpBagCount").textContent(), "bag:", await page.evaluate(() => localStorage.getItem("women.cart.v1")));
// One Size rows
const second = page.locator(".cp-product").nth(2);
await second.locator(".cp-fixed").first().evaluate(e => scrollTo({ top: e.getBoundingClientRect().top + scrollY - innerHeight / 2, behavior: "instant" }));
await page.waitForTimeout(800);
await shot("onesize");
console.log("fixed rows:", await page.locator(".cp-fixed").allTextContents());
await post("/__mock/landing", { code: "SS-1013", design: null });
await post("/__mock/landing", { code: "SS-1012", design: null });
await post("/__mock/collection", { slug: "motion-qa", codes: null });
await browser.close();
console.log("shots in", out);
