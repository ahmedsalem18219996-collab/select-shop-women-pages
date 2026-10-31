import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { render } from '../build-lp.mjs';
const { product } = JSON.parse(await readFile(new URL('../fixtures/SS-1011.product.json', import.meta.url)));
const base = { id: 'ss-1011', code: 'SS-1011' };
test('focused campaign shows escaped product-led headline and a direct COD jump without changing SKU or form', () => {
  const html = render({ ...base, campaign: { headline: 'تقليم <مميز>', colourNote: 'بيبي بلو × بني', directOnly: true, zoom: true } }, { 'SS-1011': product });
  assert.match(html, /تقليم &lt;مميز&gt;/);
  assert.match(html, /class="campaign-jump" href="#lpForm"/);
  assert.match(html, /data-campaign="focused"/);
  assert.match(html, /بيبي بلو × بني/);
  assert.match(html, /"code":"SS-1011"/);
  assert.match(html, /id="lpForm"/);
  assert.match(html, /id="lpAddCart" hidden/);
  assert.match(html, /src="\/lp\/image-zoom.js/);
  assert.doesNotMatch(html, /data-code="SS-1043"/);
});
test('ordinary landing page keeps its existing presentation', () => {
  const html = render(base, { 'SS-1011': product });
  assert.match(html, /تفاصيل تكمّل إطلالتك/);
  assert.doesNotMatch(html, /data-campaign="focused"|class="campaign-jump"/);
});
