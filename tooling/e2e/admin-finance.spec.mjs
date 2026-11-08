import { test, expect } from '@playwright/test';
test.use({ bypassCSP: true });
const url = 'http://127.0.0.1:4173/admin/';
const order = (code, price) => ({ public_order_code: code, grand_total_minor: price });
async function openAs(page, role) {
  const seen = [];
  await page.addInitScript(() => {
    sessionStorage.setItem('wa.session', JSON.stringify({
      access_token: 'local-qa-only', refresh_token: 'local-qa-only-refresh',
      expires_at: Date.now() + 3600_000, email: 'qa@example.test'
    }));
  });
  await page.route('**/*', async route => {
    const req = route.request(), target = new URL(req.url());
    if (target.pathname.endsWith('/women-admin/call')) {
      const body = JSON.parse(req.postData() || '{}');
      const { op, args } = body;
      seen.push({ op, args });
      let r = { outcome: 'forbidden' };
      if (op === 'session.get') r = { outcome:'ok', data: { email:'qa@example.test', role, permissions: ['dashboard.view','orders.view','products.view'] } };
      if (role === 'owner' && op === 'profit.summary') r = { outcome:'ok', data:{ lines: [
        { order_code:'A',status:'delivered',quantity:1,line_total_minor:60000,unit_cost_minor:40000 },
        { order_code:'B',status:'delivered',quantity:1,line_total_minor:100000,unit_cost_minor:40000 },
      ]}};
      if (role === 'owner' && op === 'orders.list') {
        const data = args?.stage === 'return_requested' ? [order('B',108500)]
          : args?.stage === 'returned' ? [order('C',70000)]
          : args?.status === 'cancelled' ? [order('D',90000)]
          : args?.status === 'pending' ? [order('E',55000)] : [];
        r = { outcome:'ok', data };
      }
      return route.fulfill({ status:200, contentType:'application/json',
        headers:{ 'access-control-allow-origin':'*' }, body:JSON.stringify(r) });
    }
    if (target.hostname.endsWith('.supabase.co')) return route.abort('blockedbyclient');
    return route.continue();
  });
  await page.goto(url + '#/finance', { waitUntil:'domcontentloaded' });
  return seen;
}
test('owner sees private finance, excludes open return and does not trigger any write', async ({ page }) => {
  const calls = await openAs(page,'owner');
  await expect(page.getByRole('heading', {name:'الأرباح والمرتجعات', level:2})).toBeVisible();
  await expect(page.getByText('قيمة المنتجات بعد الخصم (30 يوم)')).toBeVisible();
  await expect(page.getByText('مبالغ مستردة للعملاء فعلًا')).toBeVisible();
  await expect(page.locator('a[href="#/orders?stage=return_requested"]')).toBeVisible();
  expect(calls.filter(x=>x.op==='profit.summary')).toHaveLength(1);
  expect(calls.filter(x=>x.op==='orders.list')).toHaveLength(4);
  expect(calls.every(x=>['session.get','profit.summary','orders.list'].includes(x.op))).toBe(true);
});
test('staff is never offered finance route and cannot trigger cost read', async ({ page }) => {
  const calls = await openAs(page,'staff');
  await expect(page).not.toHaveURL(/#\/finance$/);
  await expect(page.locator('a[href="#/finance"]')).toHaveCount(0);
  expect(calls.filter(x=>x.op==='profit.summary')).toHaveLength(0);
});

