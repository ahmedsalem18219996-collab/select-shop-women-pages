import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeDesign, defaultDesign, inkFor, suggestAccent, isEmptyDesign, MAX_MOTION_IMAGES } from '../../lp/studio-design.js';

test('motion and main colour pass the whitelist; anything else falls back to safe values', () => {
  const d = normalizeDesign({ motion: { mode: 'cinematic', hint: '  اسحبي لتحت  ', dirs: ['top', 'side', 'spin', 3] }, accent: '#D0021B' });
  assert.deepEqual(d.motion, { mode: 'cinematic', hint: 'اسحبي لتحت', dirs: ['top', 'side', 'side', 'side'] });
  assert.equal(d.accent, '#d0021b');
  const bad = normalizeDesign({ motion: { mode: 'explode', hint: '<script>x</script>'.repeat(9), dirs: Array(20).fill('top') }, accent: 'red;background:url(x)' });
  assert.equal(bad.motion.mode, 'none');
  assert.ok(bad.motion.hint.length <= 60);
  assert.equal(bad.motion.dirs.length, MAX_MOTION_IMAGES);
  assert.equal(bad.accent, '');
  for (const accent of ['#fff', 'rgb(1,2,3)', '#12345g', '']) assert.equal(normalizeDesign({ accent }).accent, '');
  const def = defaultDesign();
  assert.equal(normalizeDesign(def).motion.mode, 'none');
  assert.equal(normalizeDesign(def).accent, '');
  assert.ok(isEmptyDesign(normalizeDesign(def)), 'a default design (no motion, no colour) still leaves the page as it is');
});

test('text on the main colour stays readable', () => {
  assert.equal(inkFor('#d0021b'), '#FFFFFF');
  assert.equal(inkFor('#2e7d32'), '#FFFFFF');
  assert.equal(inkFor('#ffd400'), '#050B1C');
  assert.equal(inkFor('#a9c8e8'), '#050B1C');
});

test('suggested main colour: the dominant garment colour, ignoring white, grey and black backgrounds', () => {
  const px = (list) => new Uint8ClampedArray(list.flatMap(([r, g, b, a = 255]) => [r, g, b, a]));
  const photo = [...Array(60).fill([244, 246, 250]), ...Array(20).fill([20, 20, 20]), ...Array(20).fill([200, 16, 46])];
  assert.equal(suggestAccent(px(photo)), '#c8102e');
  assert.equal(suggestAccent(px(Array(100).fill([128, 128, 128]))), '', 'a grey photo suggests nothing');
  assert.equal(suggestAccent(px(Array(100).fill([200, 16, 46, 0]))), '', 'transparent pixels are ignored');
});
