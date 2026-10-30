/**
 * Legacy WOMEN model families contain several REAL product SKUs. The only
 * supported category mutation today is products.set_display per SKU.
 * Never overwrite the existing is_new flag or claim an atomic batch succeeded.
 * A failed SKU remains untouched; caller must show exact partial progress.
 */
export async function saveFamilyCategory(members, category, call, onProgress = () => {}) {
  if (!Array.isArray(members) || !category) throw new TypeError("invalid group/category");
  const updated = [], failed = [];
  let attempted = 0;
  for (const m of members) {
    const product = m?.product;
    if (!product || !/^SS-\d{4,19}$/.test(product.public_code)) throw new TypeError("invalid SKU");
    if (product.category === category) { updated.push(product.public_code); onProgress(++attempted); continue; }
    try {
      const r = await call('products.set_display', {
        code: product.public_code, category, is_new: product.is_new === true,
      });
      if (r?.outcome === 'saved') updated.push(product.public_code);
      else failed.push({ code: product.public_code, outcome: r?.outcome || 'no_response' });
    } catch {
      failed.push({ code: product.public_code, outcome: 'network' });
    }
    onProgress(++attempted);
  }
  return { updated, failed };
}
