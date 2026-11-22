import { test, expect } from "@playwright/test";

// Trust strip, WhatsApp and the Admin's home campaign (2026-11-22) on the local mock (tooling/serve.mjs):
// the storefront settings come from POST /__mock/storefront; nothing external is reached and nothing is ordered.
const setStorefront = (request, data) => request.post("/__mock/storefront", { data });
const text = (href) => decodeURIComponent(new URL(href).searchParams.get("text") || "");
/** Two visible boxes overlap (a hidden or absent element never covers anything). */
const overlap = async (a, b) => {
  const [x, y] = [await a.boundingBox(), await b.boundingBox()];
  if (!x || !y || !(await a.isVisible()) || !(await b.isVisible())) return false;
  return x.x < y.x + y.width && y.x < x.x + x.width && x.y < y.y + y.height && y.y < x.y + x.height;
};

test.beforeEach(async ({ page }) => {
  await page.route("https://byluoipdunralsurwebt.supabase.co/storage/**", route => route.fulfill({ contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" width="4" height="5"/>' }));
});
test.afterEach(async ({ request }) => { await setStorefront(request, null); });

test("product page: WhatsApp with this model's question, the store's number after her first scroll, never over the order button", async ({ page, request }) => {
  await setStorefront(request, { whatsappNumbers: ["0100", "201012345678"], homeCampaignSlug: "" });
  await page.goto("/lp/ss-1014/");
  const fab = page.locator("a.wa-fab");
  await expect(fab).toHaveAttribute("aria-label", "كلمينا على واتساب");
  const before = await fab.getAttribute("href");
  expect(before).toMatch(/^https:\/\/wa\.me\/201289437444\?text=/);
  expect(text(before)).toMatch(/^أهلًا، عندي سؤال عن .+ \(كود SS-1014\)\.$/);
  await expect(page.locator(".wa-size")).toBeHidden(); // SS-1014 comes in one size: no size question
  await expect(page.locator("ul.trust li")).toHaveText(["الدفع عند الاستلام", "عايني قبل ما تدفعي", "شحن لكل المحافظات"]);
  const box = await fab.boundingBox();
  expect(box.width).toBeGreaterThanOrEqual(44);
  expect(box.height).toBeGreaterThanOrEqual(44);
  for (const y of [0, 900, 2000, 99999]) {
    await page.evaluate(top => scrollTo(0, top), y);
    await page.waitForTimeout(150);
    expect(await overlap(fab, page.locator("#lpOrder")), "fab over #lpOrder at " + y).toBe(false);
    expect(await overlap(fab, page.locator("#lpBarChoice")), "fab over the size bar at " + y).toBe(false);
  }
  await expect(fab).toHaveAttribute("href", /^https:\/\/wa\.me\/201012345678\?text=/);
  expect(text(await page.locator(".wa-size").getAttribute("href"))).toBe(text(before));
});

test("product page with sizes: «محتارة في المقاس؟» next to the sizes, with this model's question", async ({ page }) => {
  await page.goto("/lp/ss-1017/");
  const ask = page.locator(".wa-size");
  await expect(ask).toBeVisible();
  await expect(ask).toHaveText("محتارة في المقاس؟ اسألينا على واتساب");
  expect(text(await ask.getAttribute("href"))).toMatch(/\(كود SS-1017\)\.$/);
  expect((await ask.boundingBox()).height).toBeGreaterThanOrEqual(44);
});

test("the first WhatsApp click on the automatic product page already has the name and SKU", async ({ page }) => {
  await page.route("**/js/store-contact.js?*", route => route.abort()); // the lazy contact module may still be downloading on the first tap
  await page.route("https://wa.me/**", route => route.fulfill({ body: "WhatsApp", contentType: "text/plain" }));
  await page.goto("/lp/?p=SS-1099");
  await expect(page.locator("#lpAddCart")).toBeEnabled();
  const name = (await page.locator("#lpTitle").textContent()).trim();
  expect(name).toBeTruthy();
  await page.locator("a.wa-fab").click();
  await expect(page).toHaveURL(/^https:\/\/wa\.me\/201289437444\?text=/);
  expect(text(page.url())).toBe(`أهلًا، عندي سؤال عن ${name} (كود SS-1099).`);
});

test("home: general WhatsApp message, three trust items, shipping link, fab clear of the tab bar", async ({ page }) => {
  await page.goto("/");
  const fab = page.locator("a.wa-fab");
  await expect(fab).toHaveAttribute("aria-label", "كلمينا على واتساب");
  await expect(fab).toHaveAttribute("href", /^https:\/\/wa\.me\/201289437444\?text=/);
  expect(text(await fab.getAttribute("href"))).toBe("أهلًا، عندي سؤال عن طلب من SELECT SHOP.");
  await expect(page.locator(".nx-trust li")).toHaveCount(3);
  await expect(page.locator(".nx-trust")).not.toContainText("الطلب في دقيقة");
  await expect(page.locator('footer a[data-link="shipping"]')).toHaveAttribute("href", "#shipping");
  await expect(page.locator("#shipping")).toHaveCount(1);
  await expect(page.getByRole("link", { name: "اسألينا عن المقاس" })).toHaveAttribute("href", /^https:\/\/wa\.me\//);
  for (const y of [0, 99999]) {
    await page.evaluate(top => scrollTo(0, top), y);
    await page.waitForTimeout(150);
    expect(await overlap(fab, page.locator(".tabbar")), "fab over the tab bar at " + y).toBe(false);
  }
  expect(await page.title()).toBe("SELECT SHOP · ملابس حريمي أونلاين، والدفع عند الاستلام");
  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute("content", "https://selectshopeg.com/assets/og/og-share.jpg");
});

test("home campaign from the Admin: a homeCampaignSlug opens that campaign as the hero; empty keeps the brand hero", async ({ page, request }) => {
  await request.post("/__mock/collection", { data: { slug: "sf-camp", title: "تشكيلة من الأدمن", description: "وصف الحملة.", codes: ["SS-1023", "SS-1012"] } });
  try {
    await setStorefront(request, { whatsappNumbers: ["201112345678"], homeCampaignSlug: "sf-camp" });
    await page.goto("/");
    await expect(page.locator("#hero")).toHaveAttribute("data-campaign", "1");
    await expect(page.locator("#hero h1")).toHaveText("تشكيلة من الأدمن");
    await expect(page.locator("#heroCampaign")).toHaveAttribute("href", "/collections/?slug=sf-camp");
    await expect(page.locator("a.wa-fab")).toHaveAttribute("href", /^https:\/\/wa\.me\/201112345678\?text=/); // the same one read

    await setStorefront(request, { whatsappNumbers: ["201112345678"], homeCampaignSlug: "" });
    await page.goto("/");
    await page.locator("#feed .card").first().waitFor();
    await expect(page.locator("#hero")).not.toHaveAttribute("data-campaign", "1");
    await expect(page.locator("#hero .hero-lead")).toHaveText("تشكيلة الشتا وصلت. عايني القطعة قبل ما تدفعي، والدفع عند الاستلام.");
  } finally {
    await request.post("/__mock/collection", { data: { slug: "sf-camp", codes: null } });
  }
});

test("campaign page: trust strip instead of the old server note, WhatsApp asks about the first model", async ({ page, request }) => {
  await request.post("/__mock/collection", { data: { slug: "trust-camp", title: "صفحة trust-camp", codes: ["SS-1012", "SS-1013"] } });
  try {
    await page.goto("/collections/?slug=trust-camp");
    await expect(page.locator(".cp-trust").first()).toBeVisible();
    await expect(page.locator(".cp-trust").first().locator("li")).toHaveText(["الدفع عند الاستلام", "عايني قبل ما تدفعي", "شحن لكل المحافظات"]);
    await expect(page.locator("body")).not.toContainText("السيرفر");
    await expect.poll(async () => text(await page.locator("a.wa-fab").getAttribute("href"))).toMatch(/\(كود SS-1012\)\.$/);
    for (let y = 0; y <= 6000; y += 150) {
      await page.evaluate(top => scrollTo(0, top), y);
      await page.waitForTimeout(60);
      for (const b of await page.locator(".cp-add").all())
        expect(await overlap(page.locator("a.wa-fab"), b), "fab over an add/confirm button at " + y).toBe(false);
      expect(await overlap(page.locator("a.wa-fab"), page.locator(".cp-bag")), "fab over the bag bar at " + y).toBe(false);
    }
  } finally {
    await request.post("/__mock/collection", { data: { slug: "trust-camp", codes: null } });
  }
});

test("empty bag: a short message and «تسوقي دلوقتي» back to the products", async ({ page }) => {
  await page.goto("/cart/");
  await expect(page.locator("#cartItems")).toContainText("شنطتك فاضية لسه.");
  const shop = page.getByRole("link", { name: "تسوقي دلوقتي" });
  await expect(shop).toHaveAttribute("href", "/#products");
  await shop.click();
  await expect(page).toHaveURL(/\/#products$/);
  await expect(page.locator("#products")).toBeInViewport();
});

test("bag with items: WhatsApp never covers «إتمام الطلب»", async ({ page, request }) => {
  await request.post("/__mock/collection", { data: { slug: "bag-wa", title: "صفحة bag-wa", codes: ["SS-1012", "SS-1013"] } });
  try {
    await page.goto("/collections/?slug=bag-wa");
    for (const code of ["SS-1012", "SS-1013"]) {
      await page.locator(`.cp-product[data-code="${code}"] .cp-add`).click();
      await expect(page.locator(`.cp-product[data-code="${code}"] .cp-status`)).toContainText("اتضافت للشنطة");
    }
    await page.goto("/cart/");
    await page.locator("#cartItems .commerce-row").first().waitFor();
    const fab = page.locator("a.wa-fab");
    for (let y = 0; y <= 2400; y += 120) {
      await page.evaluate(top => scrollTo(0, top), y);
      await page.waitForTimeout(60);
      expect(await overlap(fab, page.locator("#toCheckout")), "fab over the checkout button at " + y).toBe(false);
    }
  } finally {
    await request.post("/__mock/collection", { data: { slug: "bag-wa", codes: null } });
  }
});

test("no WhatsApp on checkout or order success", async ({ page }) => {
  for (const path of ["/checkout/", "/order-success/"]) {
    await page.goto(path);
    await expect(page.locator("a[data-wa], a[href*='wa.me']")).toHaveCount(0);
  }
});

test("404: an unbuilt /lp/ss-NNNN/ opens the automatic product page with its ad tags; other paths get a light page", async ({ page }) => {
  await page.goto("/lp/ss-1071/?utm_source=meta&utm_content=SS-1071");
  await expect(page).toHaveURL(/\/lp\/\?p=SS-1071&utm_source=meta&utm_content=SS-1071$/);
  const res = await page.goto("/no-such-page/");
  expect(res.status()).toBe(404);
  await expect(page.getByRole("heading", { name: "الصفحة دي مش موجودة" })).toBeVisible();
  await expect(page.getByRole("link", { name: "ارجعي للمتجر" })).toHaveAttribute("href", "/");
});
