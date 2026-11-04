// Where does each home section start on a Pixel 7 (first viewport = 915px tall)?
import { chromium, devices } from "@playwright/test";
const BASE = process.env.BASE || "http://127.0.0.1:4180";
const browser = await chromium.launch();
const ctx = await browser.newContext({ ...devices["Pixel 7"] });
const page = await ctx.newPage();
await page.goto(BASE + "/", { waitUntil: "networkidle" });
const r = await page.evaluate(() => {
  const top = s => { const e = document.querySelector(s); if (!e) return null; const b = e.getBoundingClientRect(); return b.height ? Math.round(b.top + scrollY) : "hidden"; };
  return { vh: innerHeight, announce: top("#womenOwnerAnnouncement"), hdr: top(".hdr"), stories: top("#stories"), hero: top(".hero"), looks: top("#looks"), shop: top("#shop"), tape: top(".tape-dock"), firstCard: top("#feed .card"), firstCardBottom: (() => { const b = document.querySelector("#feed .card")?.getBoundingClientRect(); return b && Math.round(b.bottom + scrollY); })(), firstHref: document.querySelector("#feed .card a")?.getAttribute("href"), docH: document.documentElement.scrollHeight, hscroll: document.documentElement.scrollWidth > innerWidth };
});
console.log(JSON.stringify(r));
if (process.env.SHOT) await page.screenshot({ path: process.env.SHOT });
await browser.close();
