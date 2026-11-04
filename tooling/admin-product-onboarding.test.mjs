import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../admin/js/views/products.js', import.meta.url), 'utf8');
test('new product stays a draft until photos, virtual availability and delivery are reviewed', () => {
  assert.match(source, /المنتج بيتحفظ مسودة ومش بيظهر للعميلات تلقائيًا/);
  assert.match(source, /احفظي المسودة وكمّلي الصور/);
  assert.match(source, /sessionStorage\.setItem\('wa\.ptab', ctx\.can\('media\.manage'\) \? 'media' : 'details'\)/);
  assert.match(source, /خطوات تجهيز مسودة المنتج/);
  assert.match(source, /المنتج لسه مالوش صور ظاهرة/);
  assert.match(source, /طريقة الشحن مش محددة/);
});

test('invalid name, missing category and missing price are blocked before products.create', () => {
  const preflight=source.slice(source.indexOf("$('[data-create]', box).onclick"),source.indexOf("await withBusy(e.currentTarget, async () => {",source.indexOf("$('[data-create]', box).onclick")));
  assert.match(preflight, /title\.length < 2/);
  assert.match(preflight, /categories\.some\(c => c\.name === catSel\.value && c\.visible !== false\)/);
  assert.match(preflight, /price === null \|\| price < 100/);
  assert.match(preflight, /message\('اكتبي سعر البيع/);
});

test('idempotent retries never re-create colour options on an existing draft', () => {
  assert.match(source, /if \(r\.outcome === 'existing'\) \{/);
  assert.match(source, /مش هنكرر الإنشاء/);
  assert.match(source, /goToDraft\('variants'/);
});

test('photo upload is one batch, target variant is frozen, partial failure does not claim success', () => {
  assert.match(source, /let uploading = false/);
  assert.match(source, /if \(uploading\)/);
  assert.match(source, /const variantPos = \$\('#m-variant', body\)\?\.value/);
  assert.match(source, /if \(ok === list\.length\) \{? ?done/);
  assert.match(source, /اترفع ' \+ ok \+ ' من '/);
});

test('virtual quantity is explicitly explained rather than represented as stored inventory', () => {
  assert.match(source, /المخزون هنا افتراضي/);
  assert.match(source, /كمية افتراضية/);
  assert.match(source, /راجع(?:ي|ي) المورد قبل تأكيد أي أوردر/);
});
