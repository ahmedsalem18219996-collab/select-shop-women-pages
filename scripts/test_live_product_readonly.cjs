/* Read-only public production shopping-flow smoke. NO checkout/order/analytics writes. */
const { chromium } = require("playwright");
const BASE = "https://selectshopeg.com";
const SUPA = "https://byluoipdunralsurwebt.supabase.co";
const selected = ["SS-1008","SS-1011"];
(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.CHROME_BIN || undefined,
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage"]
  });
  const ctx = await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,locale:"ar-EG",serviceWorkers:"block"});
  const page = await ctx.newPage();
  const blockedWrites=[], errors=[], detailStatus=[],blockedAnalytics=[];
  page.on("pageerror", e => errors.push(e.message));
  page.on("response",r=> {
    if (r.url().includes("/functions/v1/women-checkout/product/"))
      detailStatus.push({code:r.url().split("/product/")[1]?.split("?")[0],status:r.status()});
  });
  await page.route("**/*",async route=>{
    const req=route.request();
    let u;
    try {u=new URL(req.url())}catch {return route.abort()};
    const checkoutOrigin = u.hostname==="byluoipdunralsurwebt.supabase.co";
    if(req.method()!=="GET" && req.method()!=="OPTIONS") {
      blockedWrites.push(req.method()+" "+u.pathname);
      return route.abort();
    }
    if(u.origin===BASE) return route.continue();
    if(checkoutOrigin &&
      (u.pathname.startsWith("/functions/v1/women-checkout/product/") ||
       u.pathname === "/functions/v1/women-checkout/checkout-config" ||
       u.pathname === "/functions/v1/women-checkout/captcha-config" ||
       u.pathname.startsWith("/functions/v1/women-store-bridge/catalog") ||
       u.pathname.startsWith("/storage/v1/object/public/product-media/")))
        return route.continue();
    blockedAnalytics.push(u.hostname);
    return route.abort();
  });
  try {
    await page.goto(BASE+"/",{waitUntil:"domcontentloaded",timeout:45000});
    await page.waitForFunction(() => document.querySelectorAll("#feed article.card").length >= 35,null,{timeout:35000});
    const count=await page.locator("#feed article.card").count();
    if(count!==35)throw new Error("Catalog mismatch "+count);
    const href=await page.locator("#feed article.card a.shot-link").first().getAttribute("href");
    if(!href || !href.includes("/p/?code="))throw new Error("First product link invalid");
    const firstCode=new URL(href,BASE).searchParams.get("code");
    const tested=[...new Set([...selected,firstCode])];
    for(const code of tested){
      const resp=await page.goto(BASE+"/p/?code="+encodeURIComponent(code),{waitUntil:"domcontentloaded",timeout:45000});
      if(resp.status()!==200)throw new Error("PDP http "+resp.status());
      await page.waitForFunction(() => document.querySelector("#product")?.getAttribute("aria-busy")==="false",null,{timeout:30000});
      const info=await page.evaluate(()=>{
        const txt=q=>document.querySelector(q)?.textContent.trim()||"";
        return {
          title:txt("#productTitle"),
          code:txt("#productCode"),
          price:txt("#productPrice"),
          optionCount:document.querySelectorAll("#optionFields select, #optionFields button, #optionFields input").length,
          photo:document.querySelector("#productPhoto")?.src||null,
          message:txt("#status"),
          addButton:!!document.querySelector("#addToCart")
        };
      });
      if(info.title.includes("مش متاح")||info.title.includes("غير موجود")||info.code!==code ||
        !info.price || !info.addButton) throw Error("PDP_INVALID "+code+" "+JSON.stringify(info));
      const status=detailStatus.filter(x=>x.code===code);
      if(!status.some(x=>x.status===200))throw Error("No successful product API for "+code+" "+JSON.stringify(status));
      console.log("PASS PDP "+JSON.stringify({code,title:info.title,apiStatus:status.map(x=>x.status),hasPrice:true,hasPhoto:!!info.photo,options:info.optionCount}));
    }
    const cart=await page.goto(BASE+"/cart/",{waitUntil:"domcontentloaded",timeout:45000});
    if(cart.status()!==200 || !(await page.locator("h1").first().innerText()).includes("شنطتك"))
      throw Error("Cart page failed");
    const checkout=await page.goto(BASE+"/checkout/",{waitUntil:"domcontentloaded",timeout:45000});
    if(checkout.status()!==200 || !(await page.locator("h1").first().innerText()).includes("الطلب"))
      throw Error("Checkout page failed");
    console.log("PASS read-only production smoke "+JSON.stringify({catalogProducts:count,pdpCount:tested.length,cart200:true,checkout200:true,writeCount:blockedWrites.length,analyticsHostsBlocked:[...new Set(blockedAnalytics)],pageErrors:errors}));
  } finally {await ctx.close();await browser.close()}
})().catch(e=>{console.error("FAIL "+e.stack);process.exitCode=1});
