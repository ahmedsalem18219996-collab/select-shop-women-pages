import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, access } from "node:fs/promises";
import { readableAccent, whiteContrast, campaignView, DEFAULT_ACCENT } from "../../js/home-campaign.js";

const source = (p) => readFile(new URL("../../" + p, import.meta.url), "utf8");
const PHOTO = "https://byluoipdunralsurwebt.supabase.co/storage/v1/object/public/product-media/media/0a6d19bfb3de428688b7b4d801e18c9f.jpg";

test("css/fonts-neutral.css: Alexandria, IBM Plex Sans Arabic and Manrope, self-hosted, every file present, licences shipped", async () => {
  const css = await source("css/fonts-neutral.css");
  const urls = [...css.matchAll(/url\(['"]?([^'")]+)['"]?\)/g)].map(m => m[1]);
  assert.ok(urls.length >= 11);
  for (const u of urls) {
    assert.match(u, /^\.\.\/assets\/fonts\/neutral\/[\w.-]+\.woff2$/, u);
    await access(new URL("../../css/" + u, import.meta.url));
  }
  const families = new Set([...css.matchAll(/font-family:\s*['"]?([^;'"]+)/g)].map(m => m[1].trim()));
  assert.deepEqual([...families].sort(), ["Alexandria", "IBM Plex Sans Arabic", "Manrope"]);
  assert.equal((css.match(/unicode-range/g) || []).length, urls.length, "each face is limited to its script");
  assert.doesNotMatch(css, /googleapis|gstatic|https?:/);
  for (const f of ["alexandria", "ibm-plex-sans-arabic", "manrope"]) await access(new URL(`../../assets/fonts/neutral/LICENSE-${f}.txt`, import.meta.url));
});

test("campaign colour: white text on the marker band is always 4.5:1 or better", () => {
  assert.equal(readableAccent("#C8102E"), "#C8102E"); // store default already passes
  assert.equal(readableAccent(""), DEFAULT_ACCENT);
  assert.equal(readableAccent("red"), DEFAULT_ACCENT);
  assert.equal(readableAccent("#2f5d50"), "#2F5D50");
  assert.equal(readableAccent("#D100D1"), "#D100D1"); // 4.53:1, passes as is
  for (const light of ["#FFFFFF", "#E8A0B0", "#F5D90A", "#2ED9D1"]) {
    const out = readableAccent(light);
    assert.ok(whiteContrast(out) >= 4.5, light + " → " + out);
    assert.notEqual(out, light);
  }
});

test("campaign view: server prices only, safe codes and photos, at most 4 models, accent only from an enabled theme", () => {
  const items = [
    { publicCode: "SS-1023", title: "طقم 23 رمادي", priceMinor: 159900, image: PHOTO },
    { publicCode: "SS-1012", title: "جاكيت", priceMinor: null, image: "https://evil.example/x.jpg" },
    { publicCode: "<b>", title: "x", priceMinor: 100, image: PHOTO },
    { publicCode: "SS-1011", title: "بلوفر", priceMinor: 55000, image: PHOTO },
    { publicCode: "SS-1013", title: "a", priceMinor: 1, image: null },
    { publicCode: "SS-1014", title: "b", priceMinor: 1, image: null },
  ];
  const v = campaignView({ collection: { title: "حملة", description: "سطر" }, theme: { enabled: true, accent: "#E8A0B0" }, items }, "tracksuit-23");
  assert.equal(v.items.length, 4);
  assert.deepEqual(v.items.map(i => i.code), ["SS-1023", "SS-1012", "SS-1011", "SS-1013"]);
  assert.deepEqual(v.items.map(i => i.price), [1599, null, 550, 0.01]);
  assert.equal(v.items[0].url, "/lp/?p=SS-1023");
  assert.equal(v.items[1].image, "");
  assert.equal(v.url, "/collections/?slug=tracksuit-23");
  assert.ok(whiteContrast(v.accent) >= 4.5);
  assert.equal(campaignView({ collection: { title: "x" }, theme: { enabled: false, accent: "#2F5D50" }, items }, "x").accent, DEFAULT_ACCENT);
  assert.equal(campaignView({ collection: { title: "x" }, items: [] }, "x"), null);
  assert.equal(campaignView({ items }, "x"), null);
});

test("home: Neutral sheet and fonts, light only (no theme boot or switch), campaign slug in the site config", async () => {
  const home = await source("index.html");
  assert.ok(home.includes('<meta name="theme-color" content="#FAFAF9">'));
  assert.doesNotMatch(home, /theme-boot|data-theme-toggle/);
  const sheets = [...home.matchAll(/<link rel="stylesheet" href="([^"]+)"/g)].map(m => m[1]);
  assert.deepEqual(sheets, ["css/atelier-site.css?v=20261114-luxe", "css/fonts-neutral.css?v=20261121", "css/neutral.css?v=20261121"]);
  assert.match(home, /<script type="module" src="js\/home-campaign\.js\?v=[\w-]+"><\/script>/);
  assert.match(home, /assets\/fonts\/neutral\/ibm-plex-sans-arabic-arabic-400-normal\.woff2/);
  assert.match(await source("js/config.js"), /campaignSlug: '[a-z0-9-]*'/);
  const css = await source("css/neutral.css");
  assert.match(css, /--bg:#FAFAF9/);
  assert.match(css, /--ink:#111111/);
  assert.match(css, /--nx-accent:#C8102E/);
  assert.match(css, /prefers-reduced-motion:reduce/);
  assert.doesNotMatch(css, /https?:/);
});
