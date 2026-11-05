import { test, expect } from '@playwright/test';
// Fully intercepted mock Admin. No production login, product updates or stock writes.
const HOME='http://127.0.0.1:4173/admin/';
test.use({ bypassCSP: true });
const makeRow=(code,title,price=65000)=>({
  public_code:code,title,status:'public',category:'بلوفرات',is_new:false,
  image:null,price_min_minor:price,price_max_minor:price,stock_total:20,
  stock_low:false,views_30d:0,updated_at:'2026-11-01T00:00:00Z'
});
async function harness(page, role = 'owner') {
  const calls=[];
  const uploads=[];
  const permissions = role === 'owner' ? [] : ['products.view', 'media.manage'];
  const catalog=[
    makeRow('SS-1042','بلوفر مقلم أحمر'),
    makeRow('SS-1043','بلوفر مقلم بينك'),
    makeRow('SS-1044','بلوفر مقلم أسود × أبيض'),
    makeRow('SS-1011','بلوفر بيبي بلو'),
    makeRow('SS-1088','بلوفر بألوان ومقاسات')
  ];
  const state=Object.fromEntries(catalog.map(p=>[p.public_code,{price:p.price_min_minor,quantity:20,available:true,overrides:{}}]));
  await page.addInitScript(()=>{
    sessionStorage.setItem('wa.session',JSON.stringify({
      access_token:'local-qa-only',refresh_token:'local-qa-refresh',
      expires_at:Date.now()+3600000,email:'qa-owner@example.test'
    }));
  });
  await page.route('**/*',async route=>{
    const req=route.request(),url=new URL(req.url());
    if(url.pathname.endsWith('/women-admin/media/upload')){
      const raw=req.postData()||'';
      const match=raw.match(/name="code"\r?\n\r?\n(SS-\d+)/);
      uploads.push({code:match?.[1]||null,raw});
      return route.fulfill({status:200,headers:{'access-control-allow-origin':'*','content-type':'application/json'},
        body:JSON.stringify({outcome:'saved'})});
    }
    if(url.pathname.endsWith('/women-admin/call')){
      const b=JSON.parse(req.postData()||'{}'),op=b.op,args=b.args||{};
      calls.push({op,args});
      let payload={outcome:'forbidden'};
      if(op==='session.get')payload={outcome:'ok',data:{email:'qa-owner@example.test',role,permissions}};
      else if(op==='categories.list')payload={outcome:'ok',data:[{name:'بلوفرات',visible:true}]};
      else if(op==='products.list')payload={outcome:'ok',data:catalog};
      else if(op==='products.get'){
        const p=catalog.find(x=>x.public_code===args.code);
        if(!p)payload={outcome:'not_found'};
        else{
          const v=state[args.code];
          const unified=args.code==='SS-1088';
          const options=unified ? [
            {option_id:'co',name:'اللون',values:[{value_id:'pink',value:'بينك'},{value_id:'brown',value:'بني'}]},
            {option_id:'sz',name:'المقاس',values:[{value_id:'s',value:'S'},{value_id:'m',value:'M'}]}
          ] : [];
          const variants=unified ? [0,1,2,3].map((position)=>({
            position,active:true,availability:'available',amount_minor:v.overrides[position]??v.price,
            price_source:v.overrides[position]!=null?'variant_override':'base',
            selections:[{option_id:'co',value_id:position<2?'pink':'brown'},
              {option_id:'sz',value_id:position%2?'m':'s'}]
          })) : [{position:0,active:true,availability:v.available?'available':'unavailable',
            amount_minor:v.price,price_source:'base',selections:[]}];
          const stock=unified?{'0':{quantity:20},'1':{quantity:20},'2':{quantity:20},'3':{quantity:20}}:
            {'0':{quantity:v.quantity}};
          payload={outcome:'ok',data:{
            product:{...p,base_price:{amount_minor:v.price},structure_version:1,
              shipping_profile:{key:'women_standard',name:'شحن عادي'},
              variants,options,publish_blockers:[]},
            card:{category:'بلوفرات',is_new:false,image:null},
            stock,
            media:{media:[],structure_version:1},shipping_profiles:[{key:'women_standard',name:'شحن عادي'}],
            views:{today:0,last_7_days:0,last_30_days:0,total:0},activity:[]
          }};
        }
      } else if(op==='products.set_price'){state[args.code].price=args.amount_minor;payload={outcome:'saved'};}
      else if(op==='products.set_variant_price'){
        state[args.code].overrides[args.position]=args.amount_minor;
        payload={outcome:'saved'};
      }
      else if(op==='products.set_stock'){state[args.code].quantity=args.quantity;payload={outcome:'saved',available:state[args.code].available};}
      else if(op==='products.set_availability'){state[args.code].available=args.available;payload={outcome:'saved'};}
      else if(op==='products.hide'){catalog.find(p=>p.public_code===args.code).status='hidden';payload={outcome:'hidden'};}
      else if(op==='products.publish'){catalog.find(p=>p.public_code===args.code).status='public';payload={outcome:'published'};}
      return route.fulfill({status:200,headers:{'access-control-allow-origin':'*','content-type':'application/json'},body:JSON.stringify(payload)});
    }
    if(url.hostname.endsWith('.supabase.co'))return route.abort('blockedbyclient');
    return route.continue();
  });
  await page.goto(HOME,{waitUntil:'domcontentloaded'});
  await expect(page.locator('a[href="#/products"]:visible').first()).toBeVisible();
  await page.locator('a[href="#/products"]:visible').first().click();
  await expect(page.locator('[data-manage-model]:visible').first()).toBeVisible();
  return {calls,state,uploads};
}
test('owner edits EXISTING grouped colour and virtual quantity from one sheet, no mixed SKUs',async ({page})=>{
  const {calls,state}=await harness(page);
  await page.locator('[data-manage-model]:visible').first().click();
  await expect(page.locator('[data-quick-colors] [data-quick-code]')).toHaveCount(3);
  await expect(page.locator('[data-quick-panel]')).toContainText('مش متسجل له مقاسات مختلفة');
  await test.info().attach('legacy-model-editor', { body: await page.screenshot({ animations: 'disabled' }), contentType: 'image/png' });
  await expect(page.locator('[data-quick-price]')).toHaveValue('650');
  await page.locator('[data-quick-price]').fill('690');
  await page.locator('[data-quick-save-footer]').click();
  await expect(page.locator('[data-quick-price]')).toHaveValue('690');
  expect(state['SS-1042'].price).toBe(69000);
  expect(state['SS-1043'].price).toBe(65000);

  await page.locator('[data-quick-code="SS-1043"]').click();
  await expect(page.locator('[data-quick-price]')).toHaveValue('650');
  await page.locator('[data-quick-qty]').fill('12');
  await page.locator('[data-quick-available]').uncheck();
  await page.locator('[data-quick-save-footer]').click();
  await expect(page.locator('[data-quick-qty]')).toHaveValue('12');
  await expect.poll(()=>state['SS-1043'].quantity,{timeout:5000}).toBe(12);
  await expect.poll(()=>state['SS-1043'].available,{timeout:5000}).toBe(false);
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

test('catalogue-only staff can see colour and photos but cannot change price or virtual stock',async ({page})=>{
  const {calls}=await harness(page,'staff');
  await page.locator('[data-manage-model]:visible').first().click();
  await expect(page.locator('[data-quick-colors] [data-quick-code]')).toHaveCount(3);
  await expect(page.locator('[data-quick-price]')).toBeDisabled();
  await expect(page.locator('[data-quick-qty]')).toBeDisabled();
  await expect(page.locator('[data-quick-available]')).toBeDisabled();
  await expect(page.locator('[data-quick-save]')).toHaveCount(0);
  await expect(page.locator('[data-quick-files]')).toHaveCount(1);
  expect(calls.filter(x=>x.op==='products.set_price'||x.op==='products.set_stock')).toHaveLength(0);
});

test('uploading a photo to one legacy colour never attaches it to sibling colour SKU',async ({page})=>{
  const {uploads,calls}=await harness(page);
  await page.locator('[data-manage-model]:visible').first().click();
  await expect(page.locator('[data-quick-panel]')).toContainText('صور اللون ده');
  const image=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9bR4sAAAAASUVORK5CYII=','base64');
  await page.locator('[data-quick-files]').setInputFiles({name:'red.png',mimeType:'image/png',buffer:image});
  await expect.poll(()=>uploads.length).toBe(1);
  expect(uploads[0].code).toBe('SS-1042');
  expect(uploads[0].raw).not.toContain('variant_position');

  await page.locator('[data-quick-code="SS-1043"]').click();
  await expect(page.locator('[data-quick-panel]')).toContainText('صور اللون ده');
  await page.locator('[data-quick-files]').setInputFiles({name:'pink.png',mimeType:'image/png',buffer:image});
  await expect.poll(()=>uploads.length).toBe(2);
  expect(uploads[1].code).toBe('SS-1043');
  expect(uploads[1].raw).not.toContain('variant_position');
  expect(calls.filter(x=>x.op==='products.create'||x.op==='products.structure')).toHaveLength(0);
});

test('new unified SKU: select real colour then real size, and attach photo to EXACT variant',async ({page})=>{
  const {uploads}=await harness(page);
  await page.goto(HOME+'#/products/SS-1088');
  await expect(page.locator('[data-quick-single]')).toBeVisible();
  await page.locator('[data-quick-single]').click();
  await expect(page.locator('[data-quick-internal-colour]')).toHaveCount(2);
  await expect(page.locator('[data-quick-position]')).toHaveCount(2);
  await page.locator('[data-quick-internal-colour="بني"]').click();
  await expect(page.locator('[data-quick-position="2"]')).toHaveAttribute('aria-pressed','true');
  await page.locator('[data-quick-position="3"]').click();
  await expect(page.locator('[data-quick-position="3"]')).toHaveAttribute('aria-pressed','true');
  await expect(page.locator('[data-quick-panel]')).toContainText('اختيار اللون والمقاس المحدد فقط');
  await test.info().attach('unified-colour-size-editor', {
    body:await page.screenshot({animations:'disabled'}),contentType:'image/png'
  });
  const image=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9bR4sAAAAASUVORK5CYII=','base64');
  await page.locator('[data-quick-files]').setInputFiles({name:'brown-M.png',mimeType:'image/png',buffer:image});
  await expect.poll(()=>uploads.length).toBe(1);
  expect(uploads[0].code).toBe('SS-1088');
  expect(uploads[0].raw).toMatch(/name="variant_position"\r?\n\r?\n3/);
});

test('owner can hide a published standalone product safely, but incomplete product cannot republish',async ({page},info)=>{
  const {calls}=await harness(page);
  await expect(page.locator('[data-product-count="public"]')).toContainText(/[٥5]/);
  const button=info.project.name==='mobile'
    ?page.locator('[data-mobile-product="SS-1011"] [data-status-action]')
    :page.locator('tr[data-code="SS-1011"] [data-status-action]');
  await expect(button).toBeVisible();
  await button.click();
  await expect(page.locator('#layer [data-yes]')).toBeVisible();
  await page.locator('#layer [data-no]').click();
  expect(calls.filter(x=>x.op==='products.hide')).toHaveLength(0);
  await button.click();
  await page.locator('#layer [data-yes]').click();
  await expect.poll(()=>calls.filter(x=>x.op==='products.hide').length).toBe(1);
  await expect(button).toContainText('نشر');
  await button.click();
  await expect(page.locator('#island')).toContainText('صورة');
  expect(calls.filter(x=>x.op==='products.publish')).toHaveLength(0);
});

test('visitor region and source analytics only use locally imported GA4 CSV, no saved location',async ({page})=>{
  const {calls}=await harness(page);
  await page.goto(HOME+'#/traffic');
  await expect(page.getByRole('heading',{name:'المحافظات ومصادر الزيارات',level:2})).toBeVisible();
  const csv='Country,Region,Sessions\nEgypt,Cairo,100\nEgypt,Giza,30\nFrance,Paris,99\n';
  await page.locator('#traffic-region-file').setInputFiles({name:'region.csv',mimeType:'text/csv',buffer:Buffer.from(csv)});
  await expect(page.locator('#traffic-region-results')).toContainText('Cairo');
  await expect(page.locator('#traffic-region-results')).toContainText('Giza');
  await expect(page.locator('#traffic-region-results')).not.toContainText('Paris');
  const sources='Session source / medium,Sessions\n"facebook / paid",80\n"instagram / social",20\n';
  await page.locator('#traffic-source-file').setInputFiles({name:'source.csv',mimeType:'text/csv',buffer:Buffer.from(sources)});
  await expect(page.locator('#traffic-source-results')).toContainText('facebook / paid');
  await expect(page.locator('#traffic-source-results')).toContainText('Facebook');
  await expect(page.locator('#traffic-source-results')).toContainText('Instagram');
  const events='Event name,Event count\npage_view,900\nview_item,1000\nadd_to_cart,120\nbegin_checkout,60\npurchase,20\n';
  await page.locator('#traffic-events-file').setInputFiles({name:'events.csv',mimeType:'text/csv',buffer:Buffer.from(events)});
  await expect(page.locator('#traffic-events-results')).toContainText('حدث بدء الطلب');
  await expect(page.locator('#traffic-events-results')).toContainText('نسبة أحداث الشراء إلى مشاهدة المنتج: ٢%');
  expect(calls.filter(x=>x.op.includes('geo')||x.op.includes('traffic')||x.op==='products.publish')).toHaveLength(0);
});


test('owner hides one model colour with inline confirmation and keeps editor open',async ({page})=>{
  const {calls}=await harness(page);
  await page.locator('[data-manage-model]:visible').first().click();
  await expect(page.locator('[data-quick-colors] [data-quick-code]')).toHaveCount(3);
  await page.locator('[data-quick-status]').click();
  await expect(page.locator('[data-quick-status-confirm]')).toBeVisible();
  await page.locator('[data-quick-status-confirm] button').first().click();
  await expect(page.locator('[data-quick-status-confirm]')).toHaveCount(0);
  expect(calls.filter(c=>c.op==='products.hide')).toHaveLength(0);
  await page.locator('[data-quick-status]').click();
  await page.locator('[data-quick-status-yes]').click();
  await expect.poll(()=>calls.filter(c=>c.op==='products.hide').length).toBe(1);
  expect(calls.find(c=>c.op==='products.hide').args.code).toBe('SS-1042');
  await expect(page.locator('[data-quick-colors] [data-quick-code]')).toHaveCount(3);
  await expect(page.locator('[data-quick-status]')).toContainText('نشر');
  await expect(page.locator('#layer .sheet')).toBeVisible();
});


test('variant price saves only after explicit click and is confirmed from a fresh server read; colour selector opens',async ({page})=>{
  const {calls}=await harness(page);
  await page.goto(HOME+'#/products/SS-1088');
  await page.locator('[data-v="variants"]').click();
  const row=page.locator('tr[data-pos="2"]');
  await expect(row.locator('[data-vprice]')).toHaveAttribute('placeholder','650');
  await row.locator('[data-vprice]').fill('730');
  await row.locator('[data-vprice]').blur();
  expect(calls.filter(x=>x.op==='products.set_variant_price')).toHaveLength(0);
  await row.locator('[data-save-vprice]').click();
  await expect(row.locator('[data-price-feedback]')).toContainText('اتحفظ');
  const writes=calls.filter(x=>x.op==='products.set_variant_price');
  expect(writes).toHaveLength(1);
  expect(writes[0].args).toMatchObject({code:'SS-1088',position:2,amount_minor:73000});
  await page.locator('[data-v="details"]').click();
  await page.locator('[data-v="variants"]').click();
  await expect(page.locator('tr[data-pos="2"] [data-vprice]')).toHaveValue('730');
  await page.locator('[data-open-quick-colours]').click();
  await expect(page.locator('[data-quick-internal-colour]')).toHaveCount(2);
  expect(calls.filter(x=>x.op==='products.create')).toHaveLength(0);
});
