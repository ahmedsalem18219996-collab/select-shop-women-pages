import { test, expect } from "@playwright/test";

// Neutral home (2026-11-21) on the local mock (tooling/serve.mjs): nothing external is reached and nothing is ordered.
const BRIDGE = "/__mock/functions/v1/women-store-bridge";
const mockLog = async (request) => (await request.get("/__mock/log")).json();
/** Serve js/config.js with a campaign slug, as the owner's one-line change would. */
const withSlug = (page, slug) => page.route("**/js/config.js*", async route => {
  const res = await route.fetch();
  await route.fulfill({ response: res, body: (await res.text()) + `\nwindow.SELECT_CONFIG.campaignSlug = ${JSON.stringify(slug)};\n` });
});
const contrastOnWhite = (page) => page.evaluate(() => {
  const hex = getComputedStyle(document.documentElement).getPropertyValue("--nx-accent").trim();
  const lin = c => { const v = c / 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  const [r, g, b] = [1, 3, 5].map(i => lin(parseInt(hex.slice(i, i + 2), 16)));
  return 1.05 / (0.2126 * r + 0.7152 * g + 0.0722 * b + 0.05);
});

test.beforeEach(async ({ page }) => {
  await page.route(u => u.hostname !== "127.0.0.1", r => r.abort());
});

test("without a campaign: brand hero on the neutral canvas, light only, black CTA to the catalog, self-hosted fonts", async ({ page }) => {
  const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  await page.goto("/");
  await page.locator("#feed .card").first().waitFor();
  const look = await page.evaluate(() => ({
    bg: getComputedStyle(document.documentElement).backgroundColor, theme: document.documentElement.dataset.theme,
    meta: document.querySelector('meta[name="theme-color"]').content, font: getComputedStyle(document.body.querySelector(".app")).fontFamily,
    cta: getComputedStyle(document.querySelector("#heroCta")).color, mark: getComputedStyle(document.querySelector(".hero .hl")).color,
  }));
  expect(look).toMatchObject({ bg: "rgb(250, 250, 249)", theme: undefined, meta: "#FAFAF9", cta: "rgb(255, 255, 255)", mark: "rgb(255, 255, 255)" });
  expect(look.font).toContain("IBM Plex Sans Arabic");
  await expect(page.locator("[data-theme-toggle]")).toHaveCount(0);
  await expect(page.locator(".hero h1")).toContainText("ستايل يناسبك");
  await expect(page.locator("#heroCampaign")).toBeHidden();
  await expect(page.locator(".nx-live")).toBeHidden();
  await expect(page.locator("#campaign")).toBeHidden();
  await expect(page.locator(".hdr .bagdot")).toBeHidden(); // empty bag: no number
  expect(await contrastOnWhite(page)).toBeGreaterThanOrEqual(4.5); // default #C8102E
  expect(await page.evaluate(() => document.fonts.ready.then(() => ["Alexandria", "IBM Plex Sans Arabic", "Manrope"]
    .every(f => [...document.fonts].some(x => x.family.replace(/"/g, "") === f && x.status === "loaded"))))).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.locator("#heroCta").click();
  await expect(page).toHaveURL(/#shop$/);
  expect(errors).toEqual([]);
});

test("campaign hero from js/config.js: photo, marker title, server price, campaign links, models rail, readable accent", async ({ page, request }) => {
  const before = (await mockLog(request)).orders.length;
  await request.post("/__mock/collection", { data: { slug: "home-camp", title: "مش هتحتاري تلبسي إيه النهارده", description: "قطعتين جاهزين يخلّوا طلتك ملفتة.",
    codes: ["SS-1023", "SS-1012", "SS-1011"], theme: { enabled: true, accent: "#E8A0B0" } } });
  try {
    const server = await (await request.get(BRIDGE + "/collections/home-camp")).json();
    const price = (server.items[0].priceMinor / 100).toLocaleString("en-US");
    await withSlug(page, "home-camp");
    await page.goto("/");
    const hero = page.locator("#hero");
    await expect(hero).toHaveAttribute("data-campaign", "1");
    await page.locator("#feed .card").first().waitFor(); // the catalog's brand copy arrived and did not overwrite the campaign
    await expect(hero.locator("h1")).toHaveText("مش هتحتاري تلبسي إيه النهارده");
    await expect(hero.locator(".hero-lead")).toHaveText("قطعتين جاهزين يخلّوا طلتك ملفتة.");
    await expect(page.locator("#heroCta")).toHaveAttribute("href", "/lp/?p=SS-1023");
    await expect(page.locator("#heroCta")).toContainText(price + " ج");
    await expect(page.locator("#heroCampaign")).toHaveAttribute("href", "/collections/?slug=home-camp");
    await expect(page.locator(".nx-live")).toBeVisible();
    await expect(hero).toHaveClass(/is-campaign/);
    await expect(hero.locator(".hero-visual img").first()).toHaveAttribute("src", server.items.find(i => i.image).image);
    const cards = page.locator("#campaign .nx-rail-card");
    await expect(page.locator("#campaign")).toBeVisible();
    await expect(cards).toHaveCount(3);
    await expect(cards.nth(2)).toHaveAttribute("href", "/lp/?p=SS-1011");
    await expect(cards.first().locator(".nx-tag")).toHaveText(price + " ج");
    const accent = await contrastOnWhite(page);
    expect(accent).toBeGreaterThanOrEqual(4.5); // #E8A0B0 is too light for white text: darkened automatically
    expect(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--nx-accent").trim())).not.toBe("#E8A0B0");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await cards.first().click();
    // The legacy route redirects through the code page to the grouped product and its selected color.
    await page.waitForURL(u => u.pathname === "/lp/chinese-jacket/" && u.searchParams.get("color") === "SS-1023");
    await expect(page.locator('#lpColors [data-code="SS-1023"]')).toHaveAttribute("aria-pressed", "true");
    expect((await mockLog(request)).orders.length).toBe(before);
  } finally {
    await request.post("/__mock/collection", { data: { slug: "home-camp", codes: null } });
  }
});

test("an unpublished, ended or broken campaign keeps the brand hero and the store working", async ({ page }) => {
  const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  for (const [slug, status] of [["gone-camp", 404], ["sold-camp", 409], ["Bad Slug!", 0]]) {
    let asked = false;
    await page.route("**/women-store-bridge/collections/**", r => { asked = true; return r.fulfill({ status, json: { error: "not_found" } }); });
    await withSlug(page, slug);
    await page.goto("/");
    await page.locator("#feed .card").first().waitFor();
    await expect(page.locator("#hero")).not.toHaveAttribute("data-campaign", "1");
    await expect(page.locator(".hero h1")).toContainText("ستايل يناسبك");
    await expect(page.locator("#heroCta")).toHaveAttribute("href", "#shop");
    await expect(page.locator("#campaign")).toBeHidden();
    expect(asked, slug).toBe(status !== 0); // an invalid slug is never requested
    await page.unrouteAll({ behavior: "ignoreErrors" });
    await page.route(u => u.hostname !== "127.0.0.1", r => r.abort());
  }
  expect(errors).toEqual([]);
});

test("reduced motion: no border beam, shine, ribbon scroll, pulse or rise", async ({ page, request }) => {
  await request.post("/__mock/collection", { data: { slug: "calm-camp", title: "حملة", codes: ["SS-1023", "SS-1011"] } });
  try {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await withSlug(page, "calm-camp");
    await page.goto("/");
    await expect(page.locator(".nx-live")).toBeVisible();
    const running = await page.evaluate(() => [".nx-beam", ".nx-mq", ".nx-live i", ".nx-hero h1"].map(s => getComputedStyle(document.querySelector(s)).animationName)
      .concat(getComputedStyle(document.querySelector(".nx-beam"), "::after").animationName));
    expect(running).toEqual(["none", "none", "none", "none", "none"]);
  } finally {
    await request.post("/__mock/collection", { data: { slug: "calm-camp", codes: null } });
  }
});
