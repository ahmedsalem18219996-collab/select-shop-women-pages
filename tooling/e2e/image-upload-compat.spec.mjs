import { test, expect } from '@playwright/test';

// Real browser Canvas encoders; no backend writes or actual uploads.
async function preparePhotoInBrowser(forceNoWebp) {
  const canvas = document.createElement('canvas');
  canvas.width = 960;
  canvas.height = 960;
  const ctx = canvas.getContext('2d');
  const pixels = ctx.createImageData(canvas.width, canvas.height);
  let seed = 31821;
  for (let i = 0; i < pixels.data.length; i += 4) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    pixels.data[i] = seed >>> 24;
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    pixels.data[i + 1] = seed >>> 24;
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    pixels.data[i + 2] = seed >>> 24;
    pixels.data[i + 3] = 255;
  }
  ctx.putImageData(pixels, 0, 0);
  const originalBlob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.98));
  if (!originalBlob) throw new Error('Cannot prepare synthetic browser test photograph');
  const original = new File([originalBlob], 'team-photo.jpg', { type: 'image/jpeg' });
  const nativeToBlob = HTMLCanvasElement.prototype.toBlob;
  if (forceNoWebp) {
    // Reproduce Safari's standards-compliant PNG fallback even in Chromium.
    HTMLCanvasElement.prototype.toBlob = function (callback, type, quality) {
      return nativeToBlob.call(this, callback, type === 'image/webp' ? 'image/png' : type, quality);
    };
  }
  try {
    const { optimizeUploadImage } = await import('/admin/js/image-optimize.js');
    const result = await optimizeUploadImage(original, 'product');
    const bytes = new Uint8Array(await result.file.slice(0, 12).arrayBuffer());
    const signature = result.file.type === 'image/jpeg'
      ? bytes[0] === 0xff && bytes[1] === 0xd8
      : String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF'
        && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP';
    return {
      originalBytes: original.size,
      outputBytes: result.file.size,
      type: result.file.type,
      name: result.file.name,
      optimized: result.optimized,
      signature,
    };
  } finally {
    HTMLCanvasElement.prototype.toBlob = nativeToBlob;
  }
}

test('photo compression succeeds using real Canvas on mobile and desktop browsers', async ({ page }) => {
  await page.goto('/__mock/log');
  const result = await page.evaluate(preparePhotoInBrowser, false);
  expect(result.originalBytes).toBeGreaterThan(250 * 1024);
  expect(result.outputBytes).toBeLessThanOrEqual(5 * 1024 * 1024);
  expect(['image/webp', 'image/jpeg']).toContain(result.type);
  expect(result.signature).toBe(true);
  expect(result.optimized).toBe(true);
});

test('Safari PNG fallback is re-encoded as JPEG without upload failures', async ({ page }) => {
  await page.goto('/__mock/log');
  const result = await page.evaluate(preparePhotoInBrowser, true);
  expect(result.originalBytes).toBeGreaterThan(250 * 1024);
  expect(result.outputBytes).toBeLessThanOrEqual(5 * 1024 * 1024);
  expect(result.outputBytes).toBeLessThan(result.originalBytes);
  expect(result.type).toBe('image/jpeg');
  expect(result.name).toMatch(/\.jpg$/);
  expect(result.signature).toBe(true);
  expect(result.optimized).toBe(true);
});
