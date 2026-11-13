import test from 'node:test';
import assert from 'node:assert/strict';
import { checkSourceImage, imageDimensions, IMAGE_PRESETS, MAX_UPLOAD_BYTES, MAX_SOURCE_BYTES, optimizeUploadImage, optimizationSummary, isAnimatedWebp, sizeLabel } from '../admin/js/image-optimize.js';
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

// Fake browser canvas: toBlob size depends on the requested quality, so the ladder can be observed.
async function withCanvas(sizeAt, run) {
  const saved = [globalThis.createImageBitmap, globalThis.document, globalThis.File];
  const asked = [];
  globalThis.createImageBitmap = async () => ({ width: 6000, height: 7500, close() {} });
  globalThis.document = { createElement: () => ({ width: 0, height: 0,
    getContext: () => ({ drawImage() {} }),
    toBlob(cb, type, q) { asked.push(q); cb(new Blob([new Uint8Array(sizeAt(q))], { type })); } }) };
  globalThis.File = class { constructor(parts, name, o) { Object.assign(this, { name, type: o.type, lastModified: o.lastModified, size: parts[0].size }); } };
  try { return await run(asked); } finally { [globalThis.createImageBitmap, globalThis.document, globalThis.File] = saved; }
}
const webp = (animated, size) => { // minimal RIFF/WEBP/VP8X header; flag 0x02 = animation
  const b = new Uint8Array(32); b.set([...'RIFF'].map(c => c.charCodeAt(0)), 0); b.set([...'WEBPVP8X'].map(c => c.charCodeAt(0)), 8); b[20] = animated ? 0x02 : 0;
  const blob = new Blob([b], { type: 'image/webp' });
  return { size, type: 'image/webp', name: 'look.webp', lastModified: 1, slice: (s, e) => blob.slice(s, e) };
};
test('20MB camera photo: steps quality down to reach the 250KB goal, stops as soon as it fits', async () => {
  await withCanvas((q) => (q >= 0.86 ? 420_000 : q >= 0.82 ? 300_000 : 230_000), async (asked) => {
    const r = await optimizeUploadImage(sample(20 * 1024 * 1024), 'product');
    assert.deepEqual(asked, [0.86, 0.82, 0.78]);
    assert.equal(r.uploadedBytes, 230_000); assert.equal(r.width, 1280); assert.equal(r.height, 1600);
  });
});
test('quality never drops below the floor that keeps fabric detail, even if still over the goal', async () => {
  await withCanvas(() => 600_000, async (asked) => {
    const r = await optimizeUploadImage(sample(10 * 1024 * 1024), 'product');
    assert.ok(Math.min(...asked) >= IMAGE_PRESETS.product.floor);
    assert.equal(r.optimized, true); assert.equal(r.uploadedBytes, 600_000);
  });
});
test('large still WebP is compressed; animated WebP is never flattened', async () => {
  assert.equal(await isAnimatedWebp(webp(true, 1)), true);
  assert.equal(await isAnimatedWebp(webp(false, 1)), false);
  await withCanvas(() => 200_000, async () => {
    const still = await optimizeUploadImage(webp(false, 12 * 1024 * 1024), 'product');
    assert.equal(still.optimized, true); assert.equal(still.uploadedBytes, 200_000);
    const anim = webp(true, 2 * 1024 * 1024);
    assert.equal((await optimizeUploadImage(anim, 'product')).file, anim);
  });
});
test('failed compression throws and never returns a replacement file', async () => {
  await withCanvas(() => 0, async () => {
    await assert.rejects(optimizeUploadImage(sample(10 * 1024 * 1024), 'product'), /تعذّر ضغط الصورة/);
  });
});
test('Safari WebP-to-PNG fallback becomes JPEG with a white background for transparency', async () => {
  const saved = [globalThis.createImageBitmap, globalThis.document, globalThis.File];
  const encodings = [];
  let whitened = false;
  globalThis.createImageBitmap = async () => ({ width: 3000, height: 2000, close() {} });
  globalThis.document = { createElement: () => ({ width: 0, height: 0,
    getContext: () => ({
      drawImage() {},
      fillRect() { whitened = true; },
      fillStyle: '',
      globalCompositeOperation: '',
    }),
    toBlob(callback, type) {
      encodings.push(type);
      callback(new Blob([new Uint8Array(type === 'image/webp' ? 500_000 : 200_000)],
        { type: type === 'image/webp' ? 'image/png' : type }));
    },
  }) };
  globalThis.File = class { constructor(parts, name, opts) { Object.assign(this, { size: parts[0].size, name, type: opts.type }); } };
  try {
    const result = await optimizeUploadImage(sample(3 * 1024 * 1024, 'image/png', 'transparent.png'));
    assert.deepEqual(encodings, ['image/webp', 'image/jpeg']);
    assert.equal(whitened, true);
    assert.equal(result.file.type, 'image/jpeg');
    assert.equal(result.file.name, 'transparent.jpg');
    assert.equal(result.file.size, 200_000);
  } finally {
    [globalThis.createImageBitmap, globalThis.document, globalThis.File] = saved;
  }
});
test('size labels read naturally', () => {
  assert.equal(sizeLabel(20 * 1024 * 1024), '20.0MB');
  assert.equal(sizeLabel(212 * 1024), '212KB');
});
