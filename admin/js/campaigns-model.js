export const MIN_COLLECTION_PRODUCTS = 1;

export function normalizeProductCodes(codes) {
  return [...new Set((Array.isArray(codes) ? codes : []).map(x => String(x || '').trim()).filter(Boolean))];
}

export function moveProductCode(codes, code, targetIndex) {
  const ordered = normalizeProductCodes(codes);
  const from = ordered.indexOf(String(code || '').trim());
  if (from < 0 || !Number.isInteger(targetIndex)) return ordered;
  const [moved] = ordered.splice(from, 1);
  const to = Math.max(0, Math.min(ordered.length, targetIndex));
  ordered.splice(to, 0, moved);
  return ordered;
}

export function validateCampaignSelection(codes, productsByCode) {
  const unique = normalizeProductCodes(codes);
  const errors = [];
  if (unique.length < MIN_COLLECTION_PRODUCTS) errors.push('اختار منتج واحد على الأقل.');
  for (const code of unique) {
    const product = productsByCode.get(code);
    if (!product) { errors.push(code + ': المنتج غير موجود في الكتالوج.'); continue; }
    if (product.status !== 'public') errors.push(code + ': المنتج لازم يكون منشورًا.');
  }
  return { ok: errors.length === 0, codes: unique, errors };
}

export function slugFromTitle(title, fallback = 'collection') {
  const ascii = String(title || '').trim().toLowerCase()
    .normalize('NFKD').replace(/[\\u0300-\\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
  return ascii.length >= 3 ? ascii : fallback;
}
