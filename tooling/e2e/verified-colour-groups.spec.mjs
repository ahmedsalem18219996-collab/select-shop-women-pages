import { test, expect } from "@playwright/test";

// Offline mock-only: verify each new grouped model route & preserved legacy colour code.
const groups = [
  {path:"striped-knit",codes:["SS-1042","SS-1043","SS-1044"]},
  {path:"pra-sweatshirt",codes:["SS-1015","SS-1027","SS-1028"]},
  {path:"chinese-jacket",codes:["SS-1014","SS-1023","SS-1024","SS-1025","SS-1026"]},
  {path:"button-knit",codes:["SS-1019","SS-1021","SS-1022"]},
  {path:"zebra-knit",codes:["SS-1012","SS-1029","SS-1030"]},
  {path:"checked-jacket",codes:["SS-1031","SS-1032","SS-1033","SS-1034"]},
];
test.beforeEach(async ({page}) => {
  page.external = [];
  page.on("request", r => { if (new URL(r.url()).hostname !== "127.0.0.1") page.external.push(r.url()); });
});
for (const g of groups) {
  test(g.path + " displays one model with every real colour", async ({page}) => {
    await page.goto("/lp/" + g.path + "/");
    await expect(page.locator("#lpColors .chip")).toHaveCount(g.codes.length);
    await expect(page.locator("#lpFormColors .chip")).toHaveCount(g.codes.length);
    await expect(page.locator("#lpOrder")).toBeEnabled();
    await page.locator('[data-code="' + g.codes.at(-1) + '"]').first().click();
    await expect(page.locator("#lpColors [aria-pressed=true]")).toHaveAttribute("data-code", g.codes.at(-1));
    await expect(page.locator("#lpFormColors [aria-pressed=true]")).toHaveAttribute("data-code", g.codes.at(-1));
    await expect(page.locator("#lpHero img")).toHaveAttribute("src", new RegExp(g.codes.at(-1)));
    await expect(page.locator("#lpOrder")).toBeEnabled();
    await page.locator('[name=region]').selectOption("cairo");
    await expect(page.locator("#lpShip")).toHaveText("٧٠ ج");
    expect(page.external).toEqual([]);
  });
  test(g.path + " old direct SKU link redirects to chooser with selected colour and tracking", async ({page}) => {
    const code = g.codes.at(-1);
    await page.goto("/lp/ss-" + code.slice(3).toLowerCase() + "/?utm_source=facebook&fbclid=old-model");
    await expect(page).toHaveURL(u => u.pathname === "/lp/" + g.path + "/" &&
      u.searchParams.get("color") === code &&
      u.searchParams.get("fbclid") === "old-model" &&
      u.searchParams.get("utm_source") === "facebook");
    await expect(page.locator("#lpFormColors [aria-pressed=true]")).toHaveAttribute("data-code", code);
    await expect(page.locator("#lpOrder")).toBeEnabled();
    expect(page.external).toEqual([]);
  });
}
