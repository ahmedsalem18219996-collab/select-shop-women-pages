/* Node 22+: node --test tests/order-source.test.cjs
 * Tests the SAME js/order-source.js that the deployed storefront loads.
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../js/order-source.js'), 'utf8');

function visit(link, saved = null, { referrer = '', gpc = false, dnt = '0', days = 0 } = {}) {
  const cache = new Map(saved ? [['women.order.source.v1', saved]] : []);
  const initial = Date.parse('2026-10-22T01:40:00+03:00');
  const date = class extends Date { static now() { return initial + days * 86400000; } };
  const context = {
    window: {}, location: new URL(link), document: { referrer },
    navigator: { globalPrivacyControl: gpc, doNotTrack: dnt },
    localStorage: {
      getItem: key => cache.get(key) ?? null,
      setItem: (key, value) => cache.set(key, value),
    },
    Date: date, URL, URLSearchParams,
  };
  vm.runInNewContext(source, context, { timeout: 1500 });
  return { data: context.window.SelectOrderAttribution.read(), saved: cache.get('women.order.source.v1') ?? null };
}
describe('SELECT SHOP WOMEN traffic source', () => {
  it('reads Instagram UTM and retains non-direct traffic across checkout', () => {
    const start = visit('https://selectshopeg.com/?utm_source=instagram&utm_medium=paid_social&utm_campaign=oct-26&utm_content=reel-2');
    assert.equal(start.data.source, 'instagram');
    assert.equal(start.data.campaign, 'oct-26');
    const checkout = visit('https://selectshopeg.com/checkout/', start.saved);
    assert.equal(checkout.data.source, 'instagram');
  });
  it('does not claim Facebook or Instagram from a Meta click ID alone', () => {
    assert.equal(visit('https://selectshopeg.com/p/?code=SS-1011&fbclid=sample').data.source, 'meta');
  });
  it('distinguishes Facebook referrers from an unknown direct visit', () => {
    assert.equal(visit('https://selectshopeg.com/p/', null, { referrer: 'https://l.facebook.com/' }).data.source, 'facebook');
    assert.equal(visit('https://selectshopeg.com/').data.source, 'direct');
  });
  it('expires the campaign after seven days', () => {
    const start = visit('https://selectshopeg.com/?utm_source=google');
    assert.equal(visit('https://selectshopeg.com/checkout/', start.saved, { days: 8 }).data.source, 'direct');
  });
  it('honors privacy signals and never retains raw link click IDs', () => {
    assert.equal(visit('https://selectshopeg.com/?utm_source=facebook', null, { gpc: true }).data, null);
    assert.equal(visit('https://selectshopeg.com/?utm_source=facebook', null, { dnt: '1' }).data, null);
    const meta = visit('https://selectshopeg.com/?fbclid=abcd&utm_campaign=sample');
    assert.equal(meta.saved.includes('abcd'), false);
    assert.equal(meta.saved.includes('fbclid'), false);
  });
  it('bounds campaign strings', () => {
    const result = visit('https://selectshopeg.com/?utm_source=facebook&utm_campaign=' + 'x'.repeat(300));
    assert.equal(result.data.campaign.length, 80);
  });
});
