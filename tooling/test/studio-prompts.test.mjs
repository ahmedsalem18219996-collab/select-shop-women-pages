import test from 'node:test';
import assert from 'node:assert/strict';
import { buildGeminiPrompt, STUDIO_STYLES } from '../admin/js/studio-prompts.js';

test('Gemini prompt preserves product truth and avoids invented claims', () => {
  const prompt = buildGeminiPrompt({ title: 'بلوفر مقلم أحمر', description: 'أكمام طويلة', style: 'model' });
  assert.match(prompt, /بلوفر مقلم أحمر/);
  assert.match(prompt, /preserve the exact garment design, color, cut/);
  assert.match(prompt, /Do not make claims/);
  assert.match(prompt, /No text, no typography, no labels, no watermark/);
});

test('Studio exposes distinct photo compositions', () => {
  assert.deepEqual(STUDIO_STYLES.map(x => x.key), ['model','flatlay','detail','lifestyle']);
  assert.match(buildGeminiPrompt({ title: 'جاكيت', style: 'detail' }), /close-up editorial product photography/);
});
