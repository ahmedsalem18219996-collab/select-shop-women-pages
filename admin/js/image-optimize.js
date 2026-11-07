/** SELECT SHOP WOMEN — browser-side optimization before owner/staff image uploads.
 * No API, dependency, storage migration, or changes to existing media.
 * Server-side image signature, file-size and authorization checks stay authoritative.
 */
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
export const MAX_SOURCE_BYTES = 25 * 1024 * 1024;
export const IMAGE_PRESETS = Object.freeze({
  // targetBytes is a goal, not a cut: quality steps down 0.04 at a time but never below `floor`, so fabric
  // texture and colour stay true even when a busy photo ends a little over the goal.
  product: Object.freeze({ maxEdge: 1600, targetBytes: 250 * 1024, quality: 0.86, floor: 0.78 }),
  storefront: Object.freeze({ maxEdge: 1920, targetBytes: 650 * 1024, quality: 0.86, floor: 0.80 }),
  logo: Object.freeze({ maxEdge: 800, targetBytes: 250 * 1024, quality: 0.90, floor: 0.86 }),
});
const TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
export function checkSourceImage(file) {
  if (!file || !TYPES.has(file.type) || !Number.isFinite(file.size) || file.size <= 0)
    return 'اختيار صورة صالحة بصيغة JPG أو PNG أو WebP.';
  if (file.size > MAX_SOURCE_BYTES) return 'الصورة الأصلية أكبر من 25MB؛ يرجى اختيار ملف أصغر.';
  return null;
}
export function imageDimensions(width, height, maxEdge) {
  if (![width, height, maxEdge].every(Number.isFinite) || width < 1 || height < 1 || maxEdge < 1)
    throw new Error('أبعاد الصورة غير صالحة.');
  const scale = Math.min(1, maxEdge / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}
const fromBytes = (bytes) => Math.max(1, Math.round(bytes / 1024));
export const sizeLabel = (bytes) => bytes >= 1024 * 1024 ? (bytes / 1048576).toFixed(1) + 'MB' : fromBytes(bytes) + 'KB';
/** Animated WebP (VP8X header with the animation flag) must never be flattened to one frame. Unknown → treat as animated. */
export async function isAnimatedWebp(file) {
  if (typeof file?.slice !== 'function') return true;
  try {
    const b = new Uint8Array(await file.slice(0, 21).arrayBuffer());
    const tag = (i) => String.fromCharCode(b[i], b[i + 1], b[i + 2], b[i + 3]);
    return b.length < 21 || tag(0) !== 'RIFF' || tag(8) !== 'WEBP' || (tag(12) === 'VP8X' && (b[20] & 0x02) !== 0);
  } catch { return true; }
}
const limitError = () => new Error('تعذّر ضغط الصورة للجودة المطلوبة. يرجى استخدام صورة أصغر من 5MB أو بصيغة JPG/WebP.');
/** @param {File} source @param {'product'|'storefront'|'logo'} preset */
export async function optimizeUploadImage(source, preset = 'product') {
  const policy = IMAGE_PRESETS[preset];
  if (!policy) throw new Error('إعداد ضغط الصور غير معروف.');
  const invalid = checkSourceImage(source);
  if (invalid) throw new Error(invalid);
  // Preserve fine fabric details in already-light photos; never flatten animated WebP.
  if (source.size <= policy.targetBytes || (source.type === 'image/webp' && await isAnimatedWebp(source))) {
    if (source.size > MAX_UPLOAD_BYTES) throw limitError();
    return { file: source, originalBytes: source.size, uploadedBytes: source.size, optimized: false };
  }
  if (typeof createImageBitmap !== 'function' || typeof document === 'undefined')
    throw new Error('متصفحك لا يدعم ضغط الصور تلقائيًا؛ يلزم استخدام متصفح حديث.');
  let bitmap;
  let canvas;
  try {
    bitmap = await createImageBitmap(source);
    if (!bitmap.width || !bitmap.height || bitmap.width * bitmap.height > 70_000_000)
      throw new Error('أبعاد الصورة كبيرة جدًا. يرجى تجربة صورة أصغر.');
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
    for (let q = policy.quality - 0.04; candidate.size > policy.targetBytes && q >= policy.floor - 1e-9; q -= 0.04) {
      const alternative = await toBlob(Math.round(q * 100) / 100);
      if (alternative?.type === 'image/webp' && alternative.size > 0 && alternative.size < candidate.size) candidate = alternative;
    }
    if (candidate.size >= source.size && source.size <= MAX_UPLOAD_BYTES)
      return { file: source, originalBytes: source.size, uploadedBytes: source.size, optimized: false };
    if (candidate.size > MAX_UPLOAD_BYTES) throw limitError();
    const name = source.name.replace(/\.[^.]+$/, '').slice(0, 110) + '.webp';
    const file = new File([candidate], name, { type: 'image/webp', lastModified: source.lastModified });
    return { file, originalBytes: source.size, uploadedBytes: file.size, optimized: true, width: size.width, height: size.height };
  } catch (e) {
    if (e instanceof Error && /^(أبعاد الصورة|تعذّر ضغط الصورة)/.test(e.message)) throw e;
    throw new Error('مش قادرين نعالج الصورة دي. يرجى استخدام صورة أخرى بصيغة JPG أو PNG.');
  } finally {
    bitmap?.close?.();
    if (canvas) { canvas.width = 0; canvas.height = 0; }
  }
}
/** Optional before/after size hint. */
export function optimizationSummary(result) {
  if (!result.optimized) return '';
  return `تم تصغير الصورة: ${sizeLabel(result.originalBytes)} ← ${sizeLabel(result.uploadedBytes)}`;
}

/** Upload preview tile: the chosen photo shows at once with its own progress and result.
 * Text is set with textContent only (file names never become HTML). */
export function previewTile(grid, before, file) {
  const url = URL.createObjectURL(file);
  const fig = document.createElement('figure');
  fig.className = 'media upload-tile';
  fig.innerHTML = '<img alt=""><div class="upload-state"><progress max="3" value="0"></progress><small role="status"></small></div>';
  fig.querySelector('img').src = url;
  const bar = fig.querySelector('progress'), msg = fig.querySelector('small');
  grid.insertBefore(fig, before || null);
  const set = (state, value, text) => { fig.dataset.state = state; if (value === null) bar.removeAttribute('value'); else bar.value = value; msg.textContent = text; };
  set('wait', 0, 'في الانتظار');
  return {
    preparing: () => set('busy', 1, 'بنجهّز الصورة… ' + sizeLabel(file.size)),
    uploading: (bytes) => set('busy', null, 'بترفع… ' + sizeLabel(bytes)),
    ok: (text) => set('ok', 3, text),
    failed: (text) => set('failed', 3, text),
    release: () => URL.revokeObjectURL(url),
  };
}
