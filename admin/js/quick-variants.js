export function variantChoices(product, stock = {}) {
  const options = Array.isArray(product?.options) ? product.options : [];
  const variants = Array.isArray(product?.variants) ? product.variants : [];
  return variants.map((v) => {
    const selectionValues = (v.selections || []).map((s) => {
      const o = options.find(o => o.option_id === s.option_id);
      return { name: o?.name || '', value: o?.values?.find(x => x.value_id === s.value_id)?.value || '' };
    }).filter(x => x.value);
    const labels = selectionValues.map(x => [x.name, x.value].filter(Boolean).join(': '));
    const colour = selectionValues.find(x => /اللون|colou?r/i.test(x.name))?.value || null;
    const size = selectionValues.find(x => /المقاس|size/i.test(x.name))?.value || null;
    const base = product.base_price?.amount_minor;
    return {
      position: v.position,
      label: labels.length ? labels.join(' / ') : 'مقاس واحد (مش مسجل مقاس محدد)',
      hasExplicitSize: size !== null,
      colour, size,
      active: v.active === true,
      availability: v.availability === 'available',
      quantity: stock[String(v.position)]?.quantity ?? 100,
      amount_minor: Number.isInteger(v.amount_minor) ? v.amount_minor : (Number.isInteger(base) ? base : null),
      override: v.price_source === 'variant_override'
    };
  });
}
