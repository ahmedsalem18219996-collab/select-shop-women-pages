import {test,expect} from "@playwright/test";

// Isolated model/colour changes are held in the QA server's memory only.
// NO production Supabase orders, stock, permissions or ads are touched.
const model = {
  slug:"striped-knit",name:"بلوفر مقلم مطور",category:"بلوفر",
  colors:[
    {code:"SS-1042",name:"نبيتي جديد",hex:"#772233"},
    {code:"SS-1043",name:"بينك",hex:"#D9A5B9"},
    {code:"SS-1044",name:"أسود × أبيض",hex:"#28282A"},
    {code:"SS-1046",name:"بيج جديد",hex:"#AFA58B"}
  ]
};
const setModels=(request,override) => request.post("/__mock/models",{
  data:override||{models:[model],items:{"SS-1046":{category:"بلوفر"}}}
});
test.beforeEach(async ({page,request})=>{
  await setModels(request);
  page.externalWrites=[];
  page.on("request",r=>{
    if(new URL(r.url()).hostname!=="127.0.0.1"&&r.method()!=="GET")page.externalWrites.push(r.url());
  });
  // Product photos can be externally hosted: block even accidental outbound GET
  // so the CI test NEVER reaches real customer/production services.
  await page.route("https://**/*",route=>route.abort());
});
test.afterEach(async ({request})=>{await setModels(request,{models:null});});
test("Admin-model mock rename + attached fourth SKU show in photo and COD colour pickers",async ({page})=>{
  await page.goto("/lp/striped-knit/");
  await expect(page.locator("#lpTitle")).toHaveText(model.name);
  await expect(page.locator("#lpColors .chip")).toHaveCount(4);
  await expect(page.locator("#lpFormColors .chip")).toHaveCount(4);
  await expect(page.locator("#lpFormColorName")).toHaveText("نبيتي جديد");
  await page.locator('#lpFormColors [data-code="SS-1046"]').click();
  await expect(page.locator("#lpColorName")).toHaveText("بيج جديد");
  await expect(page.locator("#lpColors .chip[aria-pressed=true]")).toHaveAttribute("data-code","SS-1046");
  await expect(page.locator("#lpFormColors .chip[aria-pressed=true]")).toHaveAttribute("data-code","SS-1046");
  await expect(page.locator("#lpPrice")).toHaveText("٧٠٠");
  await page.locator("[name=region]").selectOption("cairo");
  await expect(page.locator("#lpShip")).toHaveText("٧٠ ج");
  await expect(page.locator("#lpTotal")).toHaveText("٧٧٠ ج");
  await expect(page.locator("#lpOrder")).toBeEnabled();
  expect(page.externalWrites).toEqual([]);
});
test("renamed colours remain separate SKUs in ONE local COD multi-colour order",async ({page,request})=>{
  const before=(await (await request.get("/__mock/log")).json()).orders.length;
  await page.goto("/lp/striped-knit/");
  await expect(page.locator("#lpMixToggle")).toBeVisible();
  await page.locator("#lpMixToggle").click();
  await page.locator('#lpMixRows button[data-mix-code="SS-1043"][data-delta="1"]').click();
  await page.locator('[name=region]').selectOption("cairo");
  await expect(page.locator("#lpSub")).toHaveText("١٬٣٠٠ ج");
  await expect(page.locator("#lpShip")).toHaveText("٧٠ ج");
  await expect(page.locator("#lpTotal")).toHaveText("١٬٣٧٠ ج");
  await page.fill("[name=name]","عميلة وهمية");
  await page.fill("[name=phone]","01012345678");
  await page.fill("[name=address]","عنوان وهمي فقط");
  await page.locator("#lpOrder").dblclick();
  await expect(page.locator("#lpDone")).toBeVisible();
  await expect(page.locator("#lpDoneText")).toContainText("نبيتي جديد");
  await expect(page.locator("#lpDoneText")).toContainText("بينك");
  const after=(await (await request.get("/__mock/log")).json()).orders;
  expect(after.length-before).toBe(1);
  expect(after.at(-1).lines.map(l=>[l.publicCode,l.quantity])).toEqual([["SS-1042",1],["SS-1043",1]]);
  expect(after.at(-1).shipping).toBe(7000);
  expect(page.externalWrites).toEqual([]);
});
