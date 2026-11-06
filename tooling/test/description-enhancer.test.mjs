import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const js = await readFile(new URL('../../admin/js/description-enhancer.js', import.meta.url), 'utf8');
const { improveProductDescription } = await import('data:text/javascript;base64,' + Buffer.from(js).toString('base64'));

test('free polishing only rearranges confirmed staff facts and never invents clothing attributes', () => {
  const product = improveProductDescription({ title:'بلوفر حريمي مخطط', description:'لون بيبي بلو وبني، مقاس واحد' });
  assert.equal(product.ok, true);
  assert.match(product.text, /اكتشفي بلوفر حريمي مخطط/);
  assert.match(product.text, /• لون بيبي بلو وبني\n• مقاس واحد/);
  for (const unverified of ['قطن','مريح','خامة ناعمة','مستورد','100%']) assert.doesNotMatch(product.text, new RegExp(unverified));
  assert.ok(product.text.length < 10000);
});

test('free polishing respects original meaningful words and avoids duplicate bullet claims', () => {
  const product=improveProductDescription({title:'جاكيت جلد',description:'الخامة جلد،  اللون أسود، اللون أسود\nالمقاس L'});
  assert.equal(product.ok,true);
  assert.equal(product.text.match(/• اللون أسود/g)?.length,1);
  assert.match(product.text,/• الخامة جلد/);
  assert.match(product.text,/• المقاس L/);
});

test('blank and already polished descriptions do not fabricate details or add duplicate templates', () => {
  assert.equal(improveProductDescription({title:'فستان',description:'  '}).ok,false);
  assert.equal(improveProductDescription({title:'فستان',description:'جامد'}).ok,false);
  const first=improveProductDescription({title:'فستان',description:'لون أسود، مقاس M'});
  assert.equal(improveProductDescription({title:'فستان',description:first.text}).ok,false);
});

test('oversized text is rejected rather than silently truncated or losing factual claims', () => {
  const huge='الموديل '+Array.from({length:230}, (_,i)=>'خامة '+i+' '+ 'حرف'.repeat(15)).join('، ');
  const result=improveProductDescription({title:'بلوفر',description:huge});
  assert.equal(result.ok,false);
  assert.match(result.message,/طويل/);
});

test('source is local only and does not request external AI or persist without explicit save', () => {
  assert.doesNotMatch(js,/fetch\s*\(|XMLHttpRequest|navigator\.sendBeacon|localStorage\s*\.|sendTo\w+\s*\(/);
  assert.doesNotMatch(js,/products\.publish|products\.update_text|products\.create/);
});

test('free helper never breaks essential new product initialization or close handlers', async () => {
  const src = await readFile(new URL('../../admin/js/views/products.js', import.meta.url), 'utf8');
  const closeHandlers = src.split('\n').filter(line => line.includes("[data-close]") && line.includes(".forEach"));
  assert.ok(closeHandlers.length >= 2);
  for (const line of closeHandlers) assert.ok(line.includes("$$("), "Close handlers must receive a node list, not a single element");
  assert.match(src, /const catSel = \$\('#c-cat', box\)/);
  assert.match(src, /if \(btn\) btn\.disabled = true/);
});
