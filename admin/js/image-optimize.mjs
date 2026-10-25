/** SELECT SHOP WOMEN — browser-side optimization before owner/staff image uploads.
 * No API, dependency, storage migration, or changes to existing media.
 * Server-side image signature, file-size and authorization checks stay authoritative.
 */
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
export const MAX_SOURCE_BYTES = 25 * 1024 * 1024;
export const IMAGE_PRESETS = Object.freeze({
  product: Object.freeze({ maxEdge: 1600, targetBytes: 450 * 1024, quality: 0.86 }),
  storefront: Object.freeze({ maxEdge: 1920, targetBytes: 650 * 1024, quality: 0.86 }),
  logo: Object.freeze({ maxEdge: 800, targetBytes: 250 * 1024, quality: 0.90 }),
});
const TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
export function checkSourceImage(file) {
  if (!file || !TYPES.has(file.type) || !Number.isFinite(file.size) || file.size <= 0)
    return 'اختاري صورة JPG أو PNG أو WebP صالحة.';
  if (file.size > MAX_SOURCE_BYTES) return 'الصورة الأصلية أكبر من 25MB؛ اختاري ملفًا أصغر.';
  return null;
}
export function imageDimensions(width, height, maxEdge) {
  if (![width, height, maxEdge].every(Number.isFinite) || width < 1 || height < 1 || maxEdge < 1)
    throw new Error('أبعاد الصورة غير صالحة.');
  const scale = Math.min(1, maxEdge / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}
const fromBytes = (bytes) => Math.max(1, Math.round(bytes / 1024));
const limitError = () => new Error('تعذّر ضغط الصورة للجودة المطلوبة. جرّبي صورة أصغر من 5MB أو صيغة JPG/WebP.');
/** @param {File} source @param {'product'|'storefront'|'logo'} preset */
export async function optimizeUploadImage(source, preset = 'product') {
  const policy = IMAGE_PRESETS[preset];
  if (!policy) throw new Error('إعداد ضغط الصور غير معروف.');
  const invalid = checkSourceImage(source);
  if (invalid) throw new Error(invalid);
  // Preserve fine fabric details in already-light photos; never flatten animated WebP.
  if (source.size <= policy.targetBytes || source.type === 'image/webp') {
    if (source.size > MAX_UPLOAD_BYTES) throw limitError();
    return { file: source, originalBytes: source.size, uploadedBytes: source.size, optimized: false };
  }
  if (typeof createImageBitmap !== 'function' || typeof document === 'undefined')
    throw new Error('متصفحك لا يدعم ضغط الصور تلقائيًا؛ استخدمي متصفحًا حديثًا.');
  let bitmap;
  let canvas;
  try {
    bitmap = await createImageBitmap(source);
    if (!bitmap.width || !bitmap.height || bitmap.width * bitmap.height > 70_000_000)
      throw new Error('أبعاد الصورة كبيرة جدًا. جرّبي صورة أصغر.');
    const size = imageDimensions(bitmap.width, bitmap.height, policy.maxEdge);
    canvas = document.createElement('canvas');
    canvas.width = size.width;
    canvas.height = size.height;
    const context = canvas.getContext('2d', { alpha: source.type !== 'image/jpeg' });
    if (!context) throw limitError();
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    context.drawImage(bitmap, 0, 0, size.width, size.height);
    const toBlob = (quality) => new Promise((resolve) => canvas.toBlob(resolve, 'image/webp', quality));
    let candidate = await toBlob(policy.quality);
    if (!candidate || candidate.type !== 'image/webp' || candidate.size === 0) throw limitError();
    if (candidate.size > policy.targetBytes) {
      const alternative = await toBlob(Math.max(0.80, policy.quality - 0.05));
      if (alternative?.type === 'image/webp' && alternative.size > 0 && alternative.size < candidate.size) candidate = alternative;
    }
    if (candidate.size >= source.size && source.size <= MAX_UPLOAD_BYTES)
      return { file: source, originalBytes: source.size, uploadedBytes: source.size, optimized: false };
    if (candidate.size > MAX_UPLOAD_BYTES) throw limitError();
    const name = source.name.replace(/\.[^.]+$/, '').slice(0, 110) + '.webp';
    const file = new File([candidate], name, { type: 'image/webp', lastModified: source.lastModified });
    return { file, originalBytes: source.size, uploadedBytes: file.size, optimized: true };
  } catch (e) {
    if (e instanceof Error && /^(أبعاد الصورة|تعذّر ضغط الصورة)/.test(e.message)) throw e;
    throw new Error('مش قادرين نعالج الصورة دي. جرّبي JPG أو PNG تانية.');
  } finally {
    bitmap?.close?.();
    if (canvas) { canvas.width = 0; canvas.height = 0; }
  }
}
/** Optional before/after size hint. */
export function optimizationSummary(result) {
  if (!result.optimized) return '';
  return `تم تصغير الصورة: ${fromBytes(result.originalBytes)}KB ← ${fromBytes(result.uploadedBytes)}KB`;
}
