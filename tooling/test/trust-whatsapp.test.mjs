import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { pickNumber, waLink, productText, GENERAL, FALLBACK, STOREFRONT } from "../../js/store-contact.js";
import { homeSlug } from "../../js/home-campaign.js";

const source = (p) => readFile(new URL("../../" + p, import.meta.url), "utf8");

test("WhatsApp number: first valid Egyptian mobile of the storefront list, then the older brand number, then the fallback", () => {
  assert.equal(FALLBACK, "201289437444");
  assert.equal(STOREFRONT, "https://byluoipdunralsurwebt.supabase.co/functions/v1/women-admin/public/storefront");
  assert.equal(pickNumber(["201012345678", "201112345678"]), "201012345678");
  assert.equal(pickNumber(["+201012345678", "01012345678", "201312345678", 201012345678, "201512345678"]), "201512345678");
  assert.equal(pickNumber(["x", "y", "z", "w", "v", "201012345678"]), FALLBACK, "only the first five entries count");
  for (const bad of [null, undefined, [], {}, "201012345678", [""], ["2010123456789"]]) assert.equal(pickNumber(bad), FALLBACK);
  assert.equal(pickNumber([], "201112345678"), "201112345678");
  assert.equal(pickNumber(["201212345678"], "201112345678"), "201212345678", "the storefront list wins over the brand number");
  assert.equal(pickNumber(null, "+201112345678"), FALLBACK, "a brand number in another format is not trusted");
});

test("WhatsApp links carry the ready message from the copy file", () => {
  assert.equal(GENERAL, "أهلًا، عندي سؤال عن طلب من SELECT SHOP.");
  assert.equal(productText("طقم شتوي", "SS-1014"), "أهلًا، عندي سؤال عن طقم شتوي (كود SS-1014).");
  const link = waLink("201012345678", productText("بلوفر & جاكت", "SS-1014"));
  assert.ok(link.startsWith("https://wa.me/201012345678?text="));
  assert.equal(decodeURIComponent(new URL(link).searchParams.get("text")), "أهلًا، عندي سؤال عن بلوفر & جاكت (كود SS-1014).");
  assert.equal(new URL(link).searchParams.size, 1, "an & in a name never splits the message");
});

test("home campaign: the Admin's homeCampaignSlug replaces the config line; empty, missing or bad keeps the config", () => {
  assert.equal(homeSlug({ homeCampaignSlug: "winter-23" }, ""), "winter-23");
  assert.equal(homeSlug({ homeCampaignSlug: " winter-23 " }, "old"), "winter-23");
  assert.equal(homeSlug({ homeCampaignSlug: "" }, ""), "");
  assert.equal(homeSlug({ homeCampaignSlug: "" }, "from-config"), "from-config");
  assert.equal(homeSlug(null, "from-config"), "from-config", "a failed read");
  assert.equal(homeSlug({}, ""), "");
  assert.equal(homeSlug({ homeCampaignSlug: "Bad Slug!" }, ""), "");
  assert.equal(homeSlug({ homeCampaignSlug: 42 }, ""), "");
});

test("404 page: an unbuilt /lp/ss-NNNN/ opens the automatic product page with its ad tags; anything else stays", async () => {
  const html = await source("404.html");
  const script = html.match(/<script id="lp-fallback">([^<]*)<\/script>/)[1];
  const run = (pathname, search = "", hash = "") => {
    let to = null;
    new Function("location", script)({ pathname, search, hash, replace: (u) => { to = u; } });
    return to;
  };
  assert.equal(run("/lp/ss-1071/"), "/lp/?p=SS-1071");
  assert.equal(run("/lp/ss-1071"), "/lp/?p=SS-1071");
  assert.equal(run("/lp/ss-1071/", "?utm_source=fb&utm_content=SS-1071"), "/lp/?p=SS-1071&utm_source=fb&utm_content=SS-1071");
  assert.equal(run("/lp/ss-1234567890123456789/"), "/lp/?p=SS-1234567890123456789");
  for (const other of ["/lp/ss-107/", "/lp/ss-12345678901234567890/", "/lp/ss-1071/x", "/lp/SS-1071/", "/lp/ballon-suit-x/", "/admin/x", "/x/lp/ss-1071/"])
    assert.equal(run(other), null, other);
  assert.match(html, /<a href="\/">/);
  assert.doesNotMatch(html, /https?:\/\/|<link|src=/, "tiny: no external requests");
});

test("site files: robots, sitemap of public pages only, favicon.ico holds a 32px PNG", async () => {
  const robots = await source("robots.txt");
  for (const p of ["/admin/", "/order-success/", "/cart/", "/checkout/"]) assert.match(robots, new RegExp("^Disallow: " + p + "$", "m"));
  assert.match(robots, /^Allow: \/$/m);
  assert.match(robots, /^Sitemap: https:\/\/selectshopeg\.com\/sitemap\.xml$/m);
  const sitemap = await source("sitemap.xml");
  const locs = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]);
  const built = (await readdir(new URL("../pages/", import.meta.url))).filter(f => f.endsWith(".json")).map(f => `https://selectshopeg.com/lp/${f.slice(0, -5)}/`);
  assert.deepEqual(locs.slice().sort(), ["https://selectshopeg.com/", ...built].sort(), "every built product page, and a new page needs its line");
  assert.ok(locs.every(u => !/\/(admin|order-success|cart|checkout)\//.test(u)));
  const ico = await readFile(new URL("../../favicon.ico", import.meta.url));
  assert.deepEqual([...ico.subarray(0, 6)], [0, 0, 1, 0, 1, 0]);
  assert.equal(ico[6], 32);
  assert.deepEqual([...ico.subarray(22, 26)], [0x89, 0x50, 0x4e, 0x47]);
});

// Whole words only (a product text may say «يتميز»).
const FORBIDDEN = /(?<![؀-ۿ])(?:السيرفر|الكاش|يرجى|يتم|يمكن|رجالي)(?![؀-ۿ])|\bAPI\b/;
/** What a shopper can read: text and labels, not scripts, styles, comments or URLs. */
const visible = (html) => html.replace(/<script[^]*?<\/script>|<style[^]*?<\/style>|<!--[^]*?-->/g, " ")
  .replace(/<[^>]*?(?:aria-label|alt|title|placeholder|content)="([^"]*)"[^>]*>/g, " $1 ").replace(/<[^>]+>/g, " ");

test("no forbidden words a shopper can read on the built and static customer pages", async () => {
  const pages = ["index.html", "cart/index.html", "checkout/index.html", "collections/index.html", "p/index.html", "order-success/index.html", "404.html", "lp/index.html"];
  for (const d of await readdir(new URL("../../lp/", import.meta.url), { withFileTypes: true }))
    if (d.isDirectory() && d.name !== "img") pages.push(`lp/${d.name}/index.html`);
  for (const p of pages) {
    const html = await source(p).catch(() => null);
    if (html === null) continue;
    const text = visible(html);
    assert.doesNotMatch(text, FORBIDDEN, p);
    assert.doesNotMatch(text, /SHOP WOMEN?\b/, p + ": the brand is SELECT SHOP");
  }
  // The product page brand line drawn by CSS.
  assert.doesNotMatch(await source("lp/ss-1014/index.html"), /content:"SHOP WOMAN"/);
});

test("no forbidden words in the Arabic messages of the customer scripts", async () => {
  const arabic = /(["'`])((?:(?!\1)[^\\\n]|\\.)*[؀-ۿ](?:(?!\1)[^\\\n]|\\.)*)\1/g;
  for (const f of ["js/app.js", "js/commerce.js", "lp/runtime.js", "lp/lp.js", "lp/related.js", "collections/collections.js", "js/store-contact.js", "tooling/build-lp.mjs"]) {
    for (const [, , text] of (await source(f)).matchAll(arabic)) assert.doesNotMatch(text, FORBIDDEN, `${f}: ${text}`);
  }
});

test("trust strip and WhatsApp on every product page; none on checkout or order success", async () => {
  for (const d of await readdir(new URL("../../lp/", import.meta.url), { withFileTypes: true })) {
    if (!d.isDirectory() || d.name === "img") continue;
    const page = await source(`lp/${d.name}/index.html`).catch(() => null);
    if (!page) continue;
    assert.equal(page.match(/<ul class="trust"/g)?.length, 1, d.name + ": one strip");
    assert.match(page, /<ul class="trust"[^>]*><li><svg[^]*?عايني قبل ما تدفعي[^]*?<\/ul>/, d.name);
    assert.match(page, /<a class="wa-fab" href="https:\/\/wa\.me\/201289437444\?text=[^"]+" data-wa rel="noopener" aria-label="كلمينا على واتساب">/, d.name);
    assert.match(page, /<span class="shop-wordmark" dir="ltr"><b>select<\/b><small>shop<\/small><\/span>/, d.name);
    const code = JSON.parse(page.match(/<script type="application\/json" id="lp-data">([^<]*)<\/script>/)[1]).code;
    const og = page.match(/<meta property="og:image" content="([^"]+)">/)[1];
    assert.ok(og.startsWith("https://selectshopeg.com/lp/") && og.endsWith("/0-800.webp"), d.name);
    assert.match(page, new RegExp(`<title>[^<]+ · [^<]+ ج · SELECT SHOP</title>`), d.name);
    const wa = decodeURIComponent(page.match(/class="wa-fab" href="([^"]+)"/)[1].split("?text=")[1]);
    assert.ok(wa.endsWith(`(كود ${code}).`), d.name);
  }
  const shell = await source("lp/index.html");
  assert.match(shell, /<meta property="og:image" content="https:\/\/selectshopeg\.com\/assets\/og\/og-share\.jpg">/);
  for (const p of ["checkout/index.html", "order-success/index.html"]) assert.doesNotMatch(await source(p), /wa\.me|data-wa|store-contact/, p);
  const commerce = await source("js/commerce.js");
  assert.match(commerce, /pathname\.endsWith\("\/cart\/"\)[^]*?store-contact\.js/, "the bag wires WhatsApp; checkout does not");
});
