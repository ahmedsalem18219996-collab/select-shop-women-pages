import assert from 'node:assert/strict';
import test from 'node:test';
import { STUDIO_COPY, getStudioCopyWarnings, getStudioStackCopyWarnings } from '../../admin/js/studio-copy.js';

test('the fixed copy library contains all 24 approved phrases without policy or price warnings', () => {
  assert.deepEqual(Object.values(STUDIO_COPY).map(category => category.phrases.length), [7, 4, 5, 4, 4]);
  for (const category of Object.values(STUDIO_COPY)) {
    for (const phrase of category.phrases) assert.deepEqual(getStudioCopyWarnings(phrase), { restricted: false, price: false }, phrase);
  }
});

test('copy warnings distinguish restricted claims from prices and ordinary numbers', () => {
  for (const text of ['قبل النفَاد', 'قبل-نفاد الكمية', 'آخِر القِطع', 'خصــم', 'ضمان', 'استبدال', 'الإسترجاع', 'خلال ٣ أيام',
    'خلال X أيام', 'خلال يومين', 'خلال واحد وعشرين يومًا', 'خ\u200Bصم']) {
    assert.equal(getStudioCopyWarnings(text).restricted, true, text);
  }
  for (const text of ['١٬٢٥٠ جنيه', '2,400 ج', 'EGP 500', 'السعر ٤٥٠', '450ج.م', 'LE 399']) {
    assert.deepEqual(getStudioCopyWarnings(text), { restricted: false, price: true }, text);
  }
  assert.deepEqual(getStudioCopyWarnings('مقاس ٤٢ وتتوفر بـ ٣ ألوان'), { restricted: false, price: false });
  const stack = { photos: [{ strip: { text: 'خلال ٣ أيام' }, overlays: [{ text: '٤٥٠ جنيه' }] }] };
  assert.deepEqual(getStudioStackCopyWarnings(stack), { restricted: true, price: true });
  assert.deepEqual(getStudioStackCopyWarnings(undefined), { restricted: false, price: false });
});

test('every ready-made and default Studio text avoids tried-on promises, restricted claims and prices', async () => {
  const { TEMPLATES } = await import('../../admin/js/studio-visual-options.js');
  const { DEFAULT_STUDIO_MARQUEE } = await import('../../admin/studio/studio-v2-motion.js');
  const texts = [
    ...Object.values(STUDIO_COPY).flatMap(category => category.phrases),
    ...DEFAULT_STUDIO_MARQUEE.lines.map(line => line.text),
    ...TEMPLATES.flatMap(template => template.items.map(item => item.text)),
  ].filter(text => typeof text === 'string' && text.length);
  assert.ok(texts.length > 40);
  for (const text of texts) {
    assert.doesNotMatch(text, /تجرب|جرّب|جرب/u, text); // no "try it on" promise: she may only inspect before paying
    assert.deepEqual(getStudioCopyWarnings(text), { restricted: false, price: false }, text);
  }
  assert.ok(STUDIO_COPY.subtitles.phrases.includes('شوفي القطعة وعايني قبل ما تدفعي'));
});
