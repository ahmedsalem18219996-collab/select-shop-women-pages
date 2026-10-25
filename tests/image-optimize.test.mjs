import test from 'node:test';
import assert from 'node:assert/strict';
import { checkSourceImage, imageDimensions, IMAGE_PRESETS, MAX_UPLOAD_BYTES, MAX_SOURCE_BYTES, optimizeUploadImage, optimizationSummary } from '../admin/js/image-optimize.js';
const sample = (size, type = 'image/jpeg', name = 'photo.jpg') => ({ size, type, name, lastModified: 1 });
test('preserves quality with per-use budgets', () => {
  assert.equal(IMAGE_PRESETS.product.quality, 0.86);
  assert.equal(IMAGE_PRESETS.product.maxEdge, 1600);
  assert.ok(IMAGE_PRESETS.product.targetBytes < MAX_UPLOAD_BYTES);
  assert.ok(IMAGE_PRESETS.storefront.maxEdge > IMAGE_PRESETS.logo.maxEdge);
});
test('rejects empty, unsupported, and oversized source', () => {
  assert.ok(checkSourceImage(sample(0)));
  assert.ok(checkSourceImage(sample(10, 'image/svg+xml')));
  assert.ok(checkSourceImage(sample(MAX_SOURCE_BYTES + 1)));
  assert.equal(checkSourceImage(sample(5 * 1024 * 1024)), null);
});
test('dimensions preserve aspect ratio and do not upscale', () => {
  assert.deepEqual(imageDimensions(4000, 3000, 1600), { width: 1600, height: 1200 });
  assert.deepEqual(imageDimensions(800, 600, 1600), { width: 800, height: 600 });
  assert.deepEqual(imageDimensions(1500, 3000, 1600), { width: 800, height: 1600 });
});
test('small images pass through untouched', async () => {
  const file = sample(145 * 1024, 'image/png', 'suit.png');
  const result = await optimizeUploadImage(file, 'product');
  assert.equal(result.file, file); assert.equal(result.optimized, false);
});
test('WebP passes through untouched including animation; large WebP rejected', async () => {
  const file = sample(2 * 1024 * 1024, 'image/webp', 'animated.webp');
  assert.equal((await optimizeUploadImage(file)).file, file);
  await assert.rejects(optimizeUploadImage(sample(MAX_UPLOAD_BYTES + 1, 'image/webp')), /5MB/);
});
test('large images fail safely in browsers without createImageBitmap', async () => {
  await assert.rejects(optimizeUploadImage(sample(4 * 1024 * 1024)), /متصفحك لا يدعم/);
});
test('browser canvas optimization makes WebP, keeps original unmodified', async () => {
  const oldBitmap = globalThis.createImageBitmap;
  const oldDocument = globalThis.document;
  const oldFile = globalThis.File;
  const original = sample(7 * 1024 * 1024);
  let closed = false;
  let outputSize = 0;
  const canvas = {
    width: 0, height: 0,
    getContext: () => ({ drawImage: () => { outputSize = 340_000; }, imageSmoothingEnabled: false, imageSmoothingQuality: '' }),
    toBlob: (cb) => cb(new Blob([new Uint8Array(outputSize)], { type: 'image/webp' })),
  };
  try {
    globalThis.createImageBitmap = async () => ({ width: 4000, height: 3000, close: () => { closed = true; } });
    globalThis.document = { createElement: () => canvas };
    globalThis.File = class {
      constructor(parts, name, opts) {
        this.name = name; this.type = opts.type; this.lastModified = opts.lastModified; this.size = parts[0].size;
      }
    };
    const result = await optimizeUploadImage(original, 'product');
    assert.equal(result.optimized, true);
    assert.equal(result.uploadedBytes, 340_000);
    assert.equal(result.file.name, 'photo.webp');
    assert.equal(result.file.type, 'image/webp');
    assert.equal(result.file.lastModified, 1);
    assert.equal(closed, true);
    assert.equal(original.size, 7 * 1024 * 1024);
    assert.match(optimizationSummary(result), /تم تصغير الصورة/);
  } finally {
    globalThis.createImageBitmap = oldBitmap;
    globalThis.document = oldDocument;
    globalThis.File = oldFile;
  }
});
