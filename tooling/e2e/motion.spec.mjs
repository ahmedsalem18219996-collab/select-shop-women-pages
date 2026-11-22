import { test, expect } from "@playwright/test";

// Motion modes, main colour, scroll hint, fly-to-bag and One Size on the local mock only (designs are set through
// /__mock/landing and removed after each test; nothing reaches Supabase).
const SVG = (fill) => '<svg xmlns="http://www.w3.org/2000/svg" width="300" height="400"><rect width="300" height="400" fill="' + fill + '"/></svg>';
const design = (mode, extra = {}) => ({ title: "", motion: { mode, dirs: ["side", "top", "side"], hint: "اسحبي لتحت" }, accent: "#d0021b", ...extra });
const setDesign = (request, code, d) => request.post("/__mock/landing", { data: { code, design: d } });
const used = [];
const withDesign = async (request, code, d) => { used.push(code); await setDesign(request, code, d); };

test.beforeEach(async ({ page }) => {
  await page.route("**/storage/v1/object/public/**", (r) => r.fulfill({ contentType: "image/svg+xml", body: SVG("#D4A4AF") }));
});
test.afterEach(async ({ request }) => {
  for (const code of used.splice(0)) await setDesign(request, code, null);
  await request.post("/__mock/collection", { data: { slug: "motion-e2e", codes: null } });
});

test("cinematic product page: photo stack, main colour, scroll hint that hides on scroll, fly to bag", async ({ page, request }) => {
  await withDesign(request, "SS-1008", design("cinematic"));
  await page.goto("/lp/ss-1008/");
  await expect(page.locator("html")).toHaveAttribute("data-motion", "cinematic");
  await expect(page.locator(".mo-stack .mo-sec").first()).toBeVisible();
  expect(await page.locator(".mo-stack .mo-sec").count()).toBeGreaterThan(1);
  await expect(page.locator(".mo-stack .mo-sec").nth(1)).toHaveAttribute("data-dir", "side");
  await expect(page.locator(".mo-stack .mo-sec").nth(2)).toHaveAttribute("data-dir", "top");
  await expect(page.locator("#lpStage")).toBeHidden();
  await expect(page.locator(".mo-marq").first()).toHaveCSS("background-color", "rgb(208, 2, 27)");
  await expect(page.locator("#lpAddCart")).toHaveCSS("background-color", "rgb(208, 2, 27)");
  await expect(page.locator("#lpAddCart")).toHaveCSS("color", "rgb(255, 255, 255)");
  await expect(page.locator(".mo-hint .mo-txt")).toHaveText("اسحبي لتحت");
  await expect(page.locator(".mo-hint .mo-ico")).toHaveCSS("background-color", "rgb(208, 2, 27)");
  await expect(page.locator(".mo-sec img[src*='pulse'], .mo-pulse")).toHaveCount(0);   // no pulses on the photos
  await page.mouse.wheel(0, 600);
  await expect(page.locator(".mo-hint")).toHaveClass(/hide/);

  await page.evaluate(() => {
    /** @type {any} */ (window).__fly = 0;
    new MutationObserver(list => list.forEach(r => r.addedNodes.forEach(n => {
      if (n instanceof HTMLElement && n.classList.contains("mo-fly")) /** @type {any} */ (window).__fly++;
    }))).observe(document.body, { childList: true });
  });
  await page.locator("#lpAddCart").click();
  await expect.poll(() => page.evaluate(() => /** @type {any} */ (window).__fly)).toBe(1);
  await expect(page.locator("#lpCartLink")).toHaveClass(/mo-shake/);
  await expect(page.locator("#lpCartCount")).toHaveClass(/mo-pop/);
  await expect(page.locator("#lpCartCount")).toHaveText("1");
});

test("a page without a Studio design: the soft stack before the order form, only after load; the gallery stays", async ({ page }) => {
  await page.goto("/lp/ss-1008/");
  const stack = page.locator(".mo-stack[data-mode=soft]");
  await expect(stack.locator(".mo-sec").first()).toBeVisible();
  expect(await stack.evaluate(e => e.nextElementSibling?.id)).toBe("lpForm");
  const y = (s) => page.locator(s).evaluate(e => e.getBoundingClientRect().top);
  expect(await y(".mo-stack")).toBeGreaterThan(await y("#lpTitle"));               // after the details, before the form
  expect(await y(".mo-stack")).toBeLessThan(await y("#lpForm"));
  await expect(page.locator("#lpStage")).toBeVisible();                            // gallery, thumbnails and zoom untouched
  await expect(page.locator("html")).not.toHaveAttribute("data-motion", /.*/);
  await expect(stack.locator(".mo-first .mo-mark")).toHaveText((await page.locator("#lpTitle").textContent() || "").trim());
  await expect(stack.locator(".mo-first .mo-price")).toHaveText((await page.locator("#lpPrice").textContent() || "").trim());
  await expect(stack.locator(".mo-marq")).toHaveCSS("background-color", "rgb(200, 16, 46)");
  await expect(stack.locator(".mo-glint").first()).toBeHidden();
  await expect(page.locator(".mo-hint")).toHaveCount(0);                            // no hint pill, no nudge
  const timing = await page.evaluate(() => ({ load: performance.getEntriesByType("navigation")[0].loadEventEnd,
    motion: performance.getEntriesByType("resource").filter(r => /\/lp\/motion\.js/.test(r.name)).map(r => r.startTime) }));
  expect(timing.motion.length).toBe(1);
  expect(timing.motion[0]).toBeGreaterThanOrEqual(timing.load);                    // never competes with the first paint
  await page.mouse.wheel(0, 3000);
  await expect(stack.locator(".mo-sec").first()).toHaveCSS("filter", "brightness(1)"); // photos stay sharp and bright
  if (test.info().project.name === "mobile") {
    await stack.scrollIntoViewIfNeeded();
    await page.screenshot({ path: test.info().outputPath("soft-stack.png") });
  }
});

test("a published design without motion, and reduced motion, never load the motion files", async ({ page, request }) => {
  const motionRequests = [];
  page.on("request", r => { if (/\/lp\/motion\.(js|css)/.test(r.url())) motionRequests.push(r.url()); });
  const idle = () => page.evaluate(() => new Promise(r => requestIdleCallback(() => setTimeout(r, 300), { timeout: 2500 })));
  await withDesign(request, "SS-1008", design("none"));
  await page.goto("/lp/ss-1008/");
  await page.waitForLoadState("load");
  await expect(page.locator("html")).toHaveAttribute("data-studio-accent", /.*/);
  await idle();
  await setDesign(request, "SS-1008", null);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/lp/ss-1008/");
  await page.waitForLoadState("load");
  await idle();
  await expect(page.locator(".mo-stack")).toHaveCount(0);
  expect(motionRequests).toEqual([]);
});

test("calm and bold modes: each mode is applied", async ({ page, request }) => {
  for (const mode of ["calm", "bold"]) {
    await withDesign(request, "SS-1008", design(mode, { accent: "" }));
    await page.goto("/lp/ss-1008/");
    await expect(page.locator("html")).toHaveAttribute("data-motion", mode);
    await expect(page.locator(".mo-stack .mo-sec").first()).toBeVisible();
    await expect(page.locator("html")).not.toHaveAttribute("data-studio-accent", /.*/);
    await expect(page.locator(".mo-hint .mo-ico")).toHaveCSS("background-color", "rgb(209, 0, 209)"); // store purple without a main colour
  }
});

test("empty bag shows no number on the product page; the first piece shows it (plain and main-colour pages)", async ({ page, request }) => {
  const count = page.locator("#lpCartCount");
  const brackets = () => count.evaluate(e => getComputedStyle(e, "::before").content + getComputedStyle(e, "::after").content);
  await page.goto("/lp/ss-1008/");
  await expect(count).toHaveText("");
  await expect(count).toBeHidden();
  await expect(page.locator("#lpCartLink")).toHaveText("الشنطة");
  await page.locator("#lpAddCart").click();
  await expect(count).toHaveText("1");
  await expect(count).toBeVisible();
  expect(await brackets()).toBe('"("")"');
  await expect(count).toHaveCSS("margin-inline-start", "5px");                  // "الشنطة (1)", not "الشنطة(1)"
  await page.evaluate(() => localStorage.removeItem("women.cart.v1"));
  await withDesign(request, "SS-1008", design("none"));
  await page.goto("/lp/ss-1008/");
  await expect(page.locator("html")).toHaveAttribute("data-studio-accent", /.*/);
  await expect(count).toBeHidden();                                              // no empty accent badge
  await page.locator("#lpAddCart").click();
  await expect(count).toHaveText("1");
  await expect(count).toBeVisible();
  expect(await brackets()).toBe("nonenone");                                     // the badge replaces the brackets
});

test("reduced motion: no sticky stacking, no transforms, no fly; the page stays complete", async ({ page, request }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await withDesign(request, "SS-1008", design("cinematic"));
  await page.goto("/lp/ss-1008/");
  const sec = page.locator(".mo-stack .mo-sec").nth(1);
  await expect(sec).toHaveCSS("position", "relative");
  await page.mouse.wheel(0, 500);
  await expect(page.locator(".mo-stack .mo-wrap").nth(1)).toHaveCSS("transform", "none");
  await page.locator("#lpAddCart").click();
  await expect(page.locator("#lpCartCount")).toHaveText("1");
  await expect(page.locator(".mo-fly")).toHaveCount(0);
});

test("colour drives the photos inside the motion stack, and the bag gets that colour", async ({ page, request }) => {
  await withDesign(request, "SS-9101", design("cinematic"));
  await page.goto("/lp/?p=SS-9101");
  await expect(page.locator(".mo-stack .mo-sec img").first()).toHaveAttribute("src", /aaaa/);
  await page.locator('label:has(input[name="opt0"][value="1"])').click();       // بني
  await expect(page.locator(".mo-stack .mo-sec img").first()).toHaveAttribute("src", /c1c1/);
  for (const src of await page.locator(".mo-stack .mo-sec img").evaluateAll(i => i.map(x => x.getAttribute("src")))) expect(src).not.toMatch(/b1b1|b2b2/);
  await page.locator("#lpAddCart").click();
  await expect(page.locator("#lpCartCount")).toHaveText("1");
  const bag = await page.evaluate(() => JSON.parse(localStorage.getItem("women.cart.v1") || "[]"));
  expect(bag.at(-1).selection).toEqual([{ optionPosition: 0, valuePosition: 1 }, { optionPosition: 1, valuePosition: 3 }]);
});

test("campaign page: motion section with its main colour, colour-linked photos, One Size without a size choice, bag counter", async ({ page, request }) => {
  await withDesign(request, "SS-1013", design("cinematic", { accent: "#2e7d32" }));
  await request.post("/__mock/collection", { data: { slug: "motion-e2e", title: "مجموعة الحركة", codes: ["SS-1013", "SS-9101", "SS-1012"] } });
  await page.goto("/collections/?slug=motion-e2e");
  const [first, colourful, oneSize] = [0, 1, 2].map(i => page.locator(".cp-product").nth(i));
  await expect(first.locator(".mo-stack .mo-sec").first()).toBeVisible();
  await expect(first.locator(".cp-main")).toBeHidden();
  await expect(first.locator(".cp-add")).toHaveCSS("background-color", "rgb(46, 125, 50)");
  await expect(page.locator(".mo-hint .mo-txt")).toHaveText("اسحبي لتحت");
  await expect(colourful.locator(".mo-stack")).toHaveCount(0);                     // a product without motion keeps its gallery
  await expect(page.locator(".cp-fixed .cp-onesize")).toHaveText(["One Size · مقاس واحد", "One Size · مقاس واحد"]);

  await colourful.locator(".cp-option").first().locator("button").nth(1).click(); // بني
  await expect(colourful.locator(".cp-main")).toHaveAttribute("src", /c1c1/);
  await colourful.locator(".cp-option").nth(1).locator("button:not([disabled])").first().click();
  await colourful.locator(".cp-add").click();
  await expect(page.locator("#cpBagCount")).toHaveText("١");
  await expect(page.locator("#cpBagLink")).toHaveClass(/mo-shake/);
  await oneSize.locator(".cp-add").click();                                         // One Size: no size to pick
  await expect(page.locator("#cpBagCount")).toHaveText("٢");
  const bag = await page.evaluate(() => JSON.parse(localStorage.getItem("women.cart.v1") || "[]"));
  expect(bag.map(l => [l.publicCode, l.selection])).toEqual([
    ["SS-9101", [{ optionPosition: 0, valuePosition: 1 }, { optionPosition: 1, valuePosition: 3 }]],
    ["SS-1012", [{ optionPosition: 0, valuePosition: 0 }]],
  ]);
  await page.screenshot({ path: test.info().outputPath("collection-motion.png") });
});
