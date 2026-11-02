import { test, expect } from '@playwright/test';
// Browser-only live smoke. Orders, product-view writes and Meta events are BLOCKED.
const storefront='https://selectshopeg.com';
const apiHost='byluoipdunralsurwebt.supabase.co';
test.beforeEach(async ({page}) => {
  let attemptedOrders=0;
  page.__attemptedOrders=()=>attemptedOrders;
  await page.route('**/*', async route => {
    const request=route.request(),url=new URL(request.url());
    const method=request.method();
    if(method==='POST' && url.pathname.endsWith('/orders')){
      attemptedOrders++;return route.abort('blockedbyclient');
    }
    // No production analytics/DB writes; allow ONLY read-only public checkout quotes.
    if(method!=='GET' && method!=='HEAD' && !(method==='POST' && url.hostname===apiHost &&
        ['/functions/v1/women-checkout/checkout/quote','/functions/v1/women-checkout/cart/resolve'].includes(url.pathname))){
      return route.abort('blockedbyclient');
    }
    if(!['selectshopeg.com','www.selectshopeg.com',apiHost].includes(url.hostname)){
      return route.abort('blockedbyclient');
    }
    return route.continue();
  });
});
test('live customer can choose colour and see Cairo 90 EGP COD quote without order',async ({page})=>{
  await page.goto(storefront+'/lp/striped-knit/',{waitUntil:'domcontentloaded'});
  await expect(page.locator('#lpTitle')).not.toBeEmpty({timeout:20000});
  await expect(page.locator('#lpFormColors .chip')).toHaveCount(3,{timeout:20000});
  await page.locator('[name=region]').selectOption('cairo');
  await expect(page.locator('#lpShip')).toContainText('٩٠',{timeout:20000});
  await expect(page.locator('#lpOrder')).toBeEnabled({timeout:10000});
  expect(page.__attemptedOrders()).toBe(0);
});
test('live admin sign-in form is actually rendered (no credentials)',async ({page})=>{
  await page.goto(storefront+'/admin/',{waitUntil:'domcontentloaded'});
  await expect(page.locator('#login')).toBeVisible({timeout:20000});
  await expect(page.locator('#email')).toBeVisible();
  expect(page.__attemptedOrders()).toBe(0);
});
