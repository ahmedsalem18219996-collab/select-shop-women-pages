export const MIN_COLLECTION_PRODUCTS = 3;
export const MAX_COLLECTION_PRODUCTS = 5;

export function normalizeProductCodes(codes) {
  return [...new Set((Array.isArray(codes) ? codes : []).map(x => String(x || '').trim()).filter(Boolean))];
}

export function validateCampaignSelection(codes, productsByCode) {
  const unique = normalizeProductCodes(codes);
  const errors = [];
  if (unique.length < MIN_COLLECTION_PRODUCTS || unique.length > MAX_COLLECTION_PRODUCTS) {
    errors.push('اختار من 3 إلى 5 موديلات مختلفة.');
  }
  for (const code of unique) {
    const product = productsByCode.get(code);
    if (!product) { errors.push(code + ': المنتج غير موجود في الكتالوج.'); continue; }
    if (product.status !== 'public') errors.push(code + ': المنتج لازم يكون منشورًا.');
  }
  return { ok: errors.length === 0, codes: unique, errors };
}

export function slugFromTitle(title, fallback = 'collection') {
  const ascii = String(title || '').trim().toLowerCase()
    .normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
  return ascii.length >= 3 ? ascii : fallback;
}
