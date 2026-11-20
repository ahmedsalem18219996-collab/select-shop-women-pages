import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { mergeAdParams, readAdParams } from "../../lp/runtime.js";
import { cleanPageTheme, parseDesignImport, normalizeDesign, campaignAccent } from "../../lp/studio-design.js";

test("ad attribution is first touch per ad click: same ad keeps the original landing and ad product", () => {
  const first = readAdParams("?utm_source=meta&utm_medium=paid_social&utm_campaign=c1&utm_content=SS-1013&adset=a1", "c-group");
  const sameAd = readAdParams("?utm_source=meta&utm_medium=paid_social&utm_campaign=c1&utm_content=SS-1012&adset=a1", "p-ss-1012");
  assert.equal(mergeAdParams(first, sameAd), first);
  assert.equal(mergeAdParams(first, null), first, "a page without ad parameters keeps the stored ad");
  const otherAd = readAdParams("?utm_source=meta&utm_campaign=c2", "p-ss-1012");
  assert.equal(mergeAdParams(first, otherAd), otherAd, "a new ad click replaces it");
  assert.equal(mergeAdParams(null, first), first);
});

test("page theme keeps whitelisted values only, defaults otherwise, never extra keys", () => {
  const t = cleanPageTheme({ enabled: true, background: "light", spacing: "airy", font: "<script>", price: 1 });
  assert.deepEqual(Object.keys(t).sort(), ["accent", "background", "ctaAnimation", "ctaColor", "ctaShape", "divider", "enabled", "font", "spacing", "titleSize"]);
  assert.equal(t.background, "light"); assert.equal(t.spacing, "airy"); assert.equal(t.font, "readex");
  assert.equal(cleanPageTheme("x").enabled, false);
  assert.equal(cleanPageTheme({ enabled: "true" }).enabled, false, "only a real boolean switches it on");
});

test("campaign colour (PR #65 contract): #RRGGBB lowercased, anything else empty; empty falls back to ctaColor", () => {
  assert.equal(cleanPageTheme({ accent: "#C62828" }).accent, "#c62828");
  for (const bad of ["red", "#abc", "#c62828; x", "url(x)", 5, null]) assert.equal(cleanPageTheme({ accent: bad }).accent, "");
  assert.equal(campaignAccent(cleanPageTheme({ enabled: true, accent: "#C62828", ctaColor: "gold" })), "#c62828");
  assert.equal(campaignAccent(cleanPageTheme({ enabled: true, ctaColor: "gold" })), "#d9b45a");
  assert.equal(campaignAccent(cleanPageTheme({ enabled: true })), "#d100d1");
});

test("page theme title sizes and spacing match the server migration (women_campaign_theme_clean)", async () => {
  const sql = await readFile(new URL("../../lp/studio-design.js", import.meta.url), "utf8");
  assert.ok(sql.includes('titleSize: ["md", "sm", "lg"]') && sql.includes('spacing: ["normal", "compact", "airy"]'));
});

test("structured design import: JSON only, markup and unknown keys dropped, nothing executed", () => {
  assert.deepEqual(parseDesignImport("<div onload=x>"), { ok: false, error: "not_json" });
  assert.equal(parseDesignImport("").error, "empty");
  assert.equal(parseDesignImport("x".repeat(20001)).error, "too_large");
  assert.equal(parseDesignImport('{"format":"other"}').error, "unknown_format");
  const landing = parseDesignImport(JSON.stringify({ format: "ssw.landing.v1", design: {
    title: "<b>عنوان</b>", description: "سطر\nسطر", features: ["خامة ناعمة"], background: "navy", script: "alert(1)", price: 1,
    images: { hero: "https://evil.example/x.webp" }, cta: { text: "اطلب الآن", color: "cyan", onclick: "x" } } }));
  assert.equal(landing.ok, true); assert.equal(landing.kind, "landing");
  assert.equal(landing.design.title, "bعنوان/b");
  assert.equal(landing.design.background, "navy");
  assert.equal(landing.design.images.hero, null, "foreign image URLs are never imported");
  assert.equal(landing.design.cta.color, "cyan");
  assert.deepEqual(landing.dropped, ["script", "price"]);
  assert.deepEqual(landing.design, normalizeDesign(landing.design), "result is already a normalized design");
  const page = parseDesignImport(JSON.stringify({ format: "ssw.page.v1", page: { title: "صفحة", products: ["SS-1012", "SS-1012", "bad", 5], theme: { enabled: true, ctaShape: "square" } } }));
  assert.deepEqual(page.page.codes, ["SS-1012"]);
  assert.equal(page.page.theme.ctaShape, "square");
});

test("collection page and analytics: no HTML injection sinks, tracking on the campaign page allowed", async () => {
  const js = await readFile(new URL("../../collections/collections.js", import.meta.url), "utf8");
  assert.ok(!/innerHTML|insertAdjacentHTML|document\.write|eval\(|new Function/.test(js));
  assert.ok(js.includes("/cart/add") && js.includes("women.cart.v1"), "same first-party bag and server validation");
  const analytics = await readFile(new URL("../../js/analytics.js", import.meta.url), "utf8");
  assert.ok(analytics.includes('location.pathname !== "/collections/"'));
});

test("an ad URL without utm_content credits the landing product as the ad's product", () => {
  assert.equal(readAdParams("?utm_source=meta&utm_campaign=x", "ss-1008", "SS-1008").content, "SS-1008");
  assert.equal(readAdParams("?utm_source=meta&utm_content=SS-1011", "ss-1008", "SS-1008").content, "SS-1011");
  assert.equal(readAdParams("?p=SS-1008", "ss-1008", "SS-1008"), null); // no ad click, no attribution
  assert.equal(readAdParams("?utm_source=meta", "c-x", "").content, undefined);
});
