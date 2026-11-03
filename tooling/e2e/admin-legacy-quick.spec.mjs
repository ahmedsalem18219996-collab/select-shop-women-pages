import { test, expect } from '@playwright/test';
// Fully intercepted mock Admin. No production login, product updates or stock writes.
const HOME='http://127.0.0.1:4173/admin/';
test.use({ bypassCSP: true });
const makeRow=(code,title,price=65000)=>({
  public_code:code,title,status:'public',category:'بلوفرات',is_new:false,
  image:null,price_min_minor:price,price_max_minor:price,stock_total:20,
  stock_low:false,views_30d:0,updated_at:'2026-11-01T00:00:00Z'
});
async function harness(page) {
  const calls=[];
  const catalog=[
    makeRow('SS-1042','بلوفر مقلم أحمر'),
    makeRow('SS-1043','بلوفر مقلم بينك'),
    makeRow('SS-1044','بلوفر مقلم أسود × أبيض'),
    makeRow('SS-1011','بلوفر بيبي بلو')
  ];
  const state=Object.fromEntries(catalog.map(p=>[p.public_code,{price:p.price_min_minor,quantity:20,available:true}]));
  await page.addInitScript(()=>{
    sessionStorage.setItem('wa.session',JSON.stringify({
      access_token:'local-qa-only',refresh_token:'local-qa-refresh',
      expires_at:Date.now()+3600000,email:'qa-owner@example.test'
    }));
  });
  await page.route('**/*',async route=>{
    const req=route.request(),url=new URL(req.url());
    if(url.pathname.endsWith('/women-admin/call')){
      const b=JSON.parse(req.postData()||'{}'),op=b.op,args=b.args||{};
      calls.push({op,args});
      let payload={outcome:'forbidden'};
      if(op==='session.get')payload={outcome:'ok',data:{email:'qa-owner@example.test',role:'owner',permissions:[]}};
      else if(op==='categories.list')payload={outcome:'ok',data:[{name:'بلوفرات',visible:true}]};
      else if(op==='products.list')payload={outcome:'ok',data:catalog};
      else if(op==='products.get'){
        const p=catalog.find(x=>x.public_code===args.code);
        if(!p)payload={outcome:'not_found'};
        else{
          const v=state[args.code];
          payload={outcome:'ok',data:{
            product:{...p,base_price:{amount_minor:v.price},structure_version:1,
              shipping_profile:{key:'women_standard',name:'شحن عادي'},
              variants:[{position:0,active:true,availability:v.available?'available':'unavailable',
                amount_minor:v.price,price_source:'base',selections:[]}],options:[],publish_blockers:[]},
            card:{category:'بلوفرات',is_new:false,image:null},
            stock:{'0':{quantity:v.quantity}},
            media:{media:[],structure_version:1},shipping_profiles:[{key:'women_standard',name:'شحن عادي'}],
            views:{today:0,last_7_days:0,last_30_days:0,total:0},activity:[]
          }};
        }
      } else if(op==='products.set_price'){state[args.code].price=args.amount_minor;payload={outcome:'saved'};}
      else if(op==='products.set_stock'){state[args.code].quantity=args.quantity;payload={outcome:'saved',available:state[args.code].available};}
      else if(op==='products.set_availability'){state[args.code].available=args.available;payload={outcome:'saved'};}
      return route.fulfill({status:200,headers:{'access-control-allow-origin':'*','content-type':'application/json'},body:JSON.stringify(payload)});
    }
    if(url.hostname.endsWith('.supabase.co'))return route.abort('blockedbyclient');
    return route.continue();
  });
  await page.goto(HOME,{waitUntil:'domcontentloaded'});
  await expect(page.locator('a[href="#/products"]:visible').first()).toBeVisible();
  await page.locator('a[href="#/products"]:visible').first().click();
  await expect(page.locator('[data-manage-model]:visible').first()).toBeVisible();
  return {calls,state};
}
test('owner edits EXISTING grouped colour and virtual quantity from one sheet, no mixed SKUs',async ({page})=>{
  const {calls,state}=await harness(page);
  await page.locator('[data-manage-model]:visible').first().click();
  await expect(page.locator('[data-quick-colors] [data-quick-code]')).toHaveCount(3);
  await expect(page.locator('[data-quick-panel]')).toContainText('مش متسجل له مقاسات مختلفة');
  await expect(page.locator('[data-quick-price]')).toHaveValue('650');
  await page.locator('[data-quick-price]').fill('690');
  await page.locator('[data-quick-save]').click();
  await expect(page.locator('[data-quick-price]')).toHaveValue('690');
  expect(state['SS-1042'].price).toBe(69000);
  expect(state['SS-1043'].price).toBe(65000);

  await page.locator('[data-quick-code="SS-1043"]').click();
  await expect(page.locator('[data-quick-price]')).toHaveValue('650');
  await page.locator('[data-quick-qty]').fill('12');
  await page.locator('[data-quick-available]').uncheck();
  await page.locator('[data-quick-save]').click();
  await expect(page.locator('[data-quick-qty]')).toHaveValue('12');
  expect(state['SS-1043'].quantity).toBe(12);
  expect(state['SS-1043'].available).toBe(false);
  expect(state['SS-1042'].quantity).toBe(20);
  const writes=calls.filter(x=>x.op.startsWith('products.set_'));
  expect(writes.map(x=>x.args.code)).toEqual(['SS-1042','SS-1043','SS-1043']);
  expect(calls.filter(x=>x.op==='products.create'||x.op==='products.publish')).toHaveLength(0);
  await expect(page.locator('[data-quick-files]')).toHaveCount(1);
});
test('old standalone SKU has an accessible quick edit screen without recreating the product',async ({page})=>{
  const {calls}=await harness(page);
  await page.goto(HOME+'#/products/SS-1011');
  await expect(page.locator('[data-quick-single]')).toBeVisible();
  await page.locator('[data-quick-single]').click();
  await expect(page.locator('[data-quick-colors] [data-quick-code]')).toHaveCount(1);
  await expect(page.locator('[data-quick-panel]')).toContainText('صور اللون ده');
  await expect(page.locator('[data-quick-panel]')).toContainText('مش متسجل له مقاسات مختلفة');
  expect(calls.filter(x=>x.op==='products.create')).toHaveLength(0);
});
