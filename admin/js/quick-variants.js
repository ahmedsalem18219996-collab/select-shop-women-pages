export function variantChoices(product, stock = {}) {
  const options = Array.isArray(product?.options) ? product.options : [];
  const variants = Array.isArray(product?.variants) ? product.variants : [];
  return variants.map((v) => {
    const labels = (v.selections || []).map((s) => {
      const o = options.find(o => o.option_id === s.option_id);
      const value = o?.values?.find(x => x.value_id === s.value_id)?.value;
      return [o?.name, value].filter(Boolean).join(': ');
    }).filter(Boolean);
    const base = product.base_price?.amount_minor;
    return {
      position: v.position,
      label: labels.length ? labels.join(' / ') : 'مقاس واحد (مش مسجل مقاس محدد)',
      hasExplicitSize: labels.length > 0,
      active: v.active === true,
      availability: v.availability === 'available',
      quantity: stock[String(v.position)]?.quantity ?? null,
      amount_minor: Number.isInteger(v.amount_minor) ? v.amount_minor : (Number.isInteger(base) ? base : null),
      override: v.price_source === 'variant_override'
    };
  });
}
