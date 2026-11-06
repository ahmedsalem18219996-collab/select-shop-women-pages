// One product = one model with real colour and size Variants (Admin API `products.structure`).
// Pure helpers: read the server product into colour cards, and plan the exact API calls for a change.
// Database rules the plans respect (product_structure_foundation): options can only be added while the
// draft has NO Variants (PS009); values and Variants can be added later; nothing is deleted, a colour or
// size is retired with set_value_active / set_variant_active. New value / Variant positions are max + 1.
import { hexOf, isColourName, isSizeName, normName, colourKey } from '../../js/colour-palette.js';

export const ONE_SIZE = 'One Size';
export const COLOUR_OPTION = 'اللون';
export const SIZE_OPTION = 'المقاس';
/** Virtual quantity for a colour that is "available from the supplier" (stock is bought after each order). */
export const VIRTUAL_QTY = 20;

const valueAt = (product, variant, option) => option?.values.find((x) => x.value_id === variant.selections?.find((s) => s.option_id === option.option_id)?.value_id);
const nextPos = (list) => list.reduce((m, x) => Math.max(m, x.position), -1) + 1;

/** Server product (+ stock + media) → { colourOption, sizeOption, colours[], shared[], canAddColour, base }. */
export function colourModel(product, stock = {}, media = []) {
  const options = product?.options || [];
  const colourOption = options.find((o) => isColourName(o.name)) || null;
  const sizeOption = options.find((o) => o !== colourOption && isSizeName(o.name)) || null;
  const base = Number.isInteger(product?.base_price?.amount_minor) ? product.base_price.amount_minor : null;
  const colours = colourOption
    ? colourOption.values.map((v) => ({ name: v.value, hex: hexOf(v.value), optionPosition: colourOption.position, valuePosition: v.position, active: v.active !== false, variants: [], media: [] }))
    : (product?.variants || []).length ? [{ name: '', hex: null, optionPosition: null, valuePosition: null, active: true, variants: [], media: [] }] : [];
  for (const v of product?.variants || []) {
    const c = colourOption ? colours.find((x) => x.valuePosition === valueAt(product, v, colourOption)?.position) : colours[0];
    if (!c) continue;
    const quantity = stock?.[String(v.position)]?.quantity ?? null;
    c.variants.push({
      position: v.position, size: sizeOption ? valueAt(product, v, sizeOption)?.value ?? null : null,
      active: v.active === true, available: v.availability === 'available' && Number(quantity) > 0, quantity,
      amountMinor: Number.isInteger(v.amount_minor) ? v.amount_minor : base, override: v.price_source === 'variant_override',
    });
  }
  const shared = [];
  for (const m of [...media].filter((x) => !x.delete_pending).sort((a, b) => a.position - b.position)) {
    const owner = m.scope === 'option_value' && colourOption && m.option_value?.option_position === colourOption.position
      ? colours.find((c) => c.valuePosition === m.option_value.value_position)
      : m.scope === 'variant' ? colours.find((c) => c.variants.some((v) => v.position === m.variant?.position)) : null;
    (owner ? owner.media : shared).push(m);
  }
  for (const c of colours) {
    const live = c.variants.filter((v) => v.active);
    c.sizes = live.map((v) => v.size ?? ONE_SIZE);
    c.available = live.some((v) => v.available);
    const overrides = new Set(live.filter((v) => v.override).map((v) => v.amountMinor));
    c.priceMinor = live.length && live.every((v) => v.override) && overrides.size === 1 ? [...overrides][0] : live.some((v) => v.override) ? 'mixed' : null;
  }
  // A colour option can be added only before the first Variant exists; afterwards only to a model that has one.
  return { colourOption, sizeOption, colours, shared, base, canAddColour: Boolean(colourOption) || !(product?.variants || []).length };
}

const uniq = (list) => list.reduce((acc, s) => (acc.some((x) => normName(x) === normName(s)) ? acc : [...acc, s]), []);

/** Validate colour drafts [{ name, sizes[], priceMinor|null, available }] → error text or ''. */
export function checkDrafts(drafts, { needName = true } = {}) {
  if (!drafts.length) return 'ضيفي لون واحد على الأقل، أو لون واحد من غير اسم لو الموديل لون واحد.';
  const named = drafts.filter((d) => d.name.trim());
  if (needName && named.length !== drafts.length && !(drafts.length === 1 && !named.length)) return 'كل لون محتاج اسم، زي «بيبي بلو».';
  if (new Set(named.map((d) => colourKey(d.name))).size !== named.length) return 'فيه لونين بنفس الاسم، أو نفس اللونين بترتيب مختلف. غيّري اختيار واحد منهم.';
  const duplicateTone = named.find((d) => {
    const parts = d.name.split(/\s*×\s*/);
    return parts.length === 2 && normName(parts[0]) === normName(parts[1]);
  });
  if (duplicateTone) return 'اللون المزدوج لازم يكون فيه لونين مختلفين.';
  const empty = drafts.find((d) => !d.sizes.length);
  if (empty) return `حددي مقاس واحد على الأقل للون «${empty.name || 'الموديل'}»، أو اختاري One Size.`;
  const bad = drafts.find((d) => d.priceMinor !== null && !(Number.isInteger(d.priceMinor) && d.priceMinor >= 100));
  if (bad) return `السعر الخاص للون «${bad.name}» لازم يكون رقم بالجنيه، أو سيبيه فاضي علشان ياخد السعر الأساسي.`;
  if (drafts.reduce((n, d) => n + d.sizes.length, 0) > 200) return 'الألوان والمقاسات أكتر من ٢٠٠ اختيار. قلّلي العدد.';
  return '';
}

// Per-variant commercial writes after the structure exists; `version` is filled in by the runner.
function commercial(drafts, positionsOf, base) {
  const steps = [];
  drafts.forEach((d, i) => {
    for (const position of positionsOf(i)) {
      if (d.priceMinor !== null && d.priceMinor !== base) steps.push({ label: `سعر ${d.name || 'الموديل'}`, op: 'products.set_variant_price', args: { position, amount_minor: d.priceMinor }, need: 'products.price' });
      steps.push(d.available
        ? { label: `توافر ${d.name || 'الموديل'}`, op: 'products.set_stock', args: { position, quantity: VIRTUAL_QTY }, need: 'inventory.manage' }
        : { label: `توافر ${d.name || 'الموديل'}`, op: 'products.set_availability', args: { position, available: false }, need: 'inventory.manage' });
    }
  });
  return steps;
}

/** A draft with no Variants yet: add the colour and size options, then every colour × its own sizes. */
export function planNewModel(drafts, base = null) {
  const named = drafts.filter((d) => d.name.trim()).length > 0;
  const sizes = uniq(drafts.flatMap((d) => d.sizes));
  const steps = [];
  if (named) steps.push({ label: 'الألوان', op: 'products.structure', args: { change: { op: 'add_option', name: COLOUR_OPTION, values: drafts.map((d) => d.name.trim()) } }, need: 'products.edit' });
  steps.push({ label: 'المقاسات', op: 'products.structure', args: { change: { op: 'add_option', name: SIZE_OPTION, values: sizes } }, need: 'products.edit' });
  const selections = [], owners = [];
  drafts.forEach((d, i) => uniq(d.sizes).forEach((s) => {
    const sp = sizes.findIndex((x) => normName(x) === normName(s));
    selections.push(named ? [i, sp] : [sp]); owners.push(i);
  }));
  steps.push({ label: 'تجهيز كل لون بمقاساته', op: 'products.structure', args: { change: { op: 'create_variants', selections } }, need: 'products.edit' });
  // create_variants numbers the new Variants 0..n-1 in the order sent.
  return [...steps, ...commercial(drafts, (i) => owners.flatMap((o, k) => (o === i ? [k] : [])), base)];
}

/** One more colour on a model that already has a colour option. */
export function planAddColour(model, draft) {
  const { colourOption, sizeOption, colours } = model;
  const steps = [{ label: 'اسم اللون', op: 'products.structure', args: { change: { op: 'add_value', option: colourOption.position, text: draft.name.trim() } }, need: 'products.edit' }];
  const colourPos = nextPos(colourOption.values);
  let sizePositions = [null];
  if (sizeOption) {
    let next = nextPos(sizeOption.values);
    sizePositions = uniq(draft.sizes).map((s) => {
      const have = sizeOption.values.find((v) => normName(v.value) === normName(s));
      if (have) return have.position;
      steps.push({ label: 'مقاس ' + s, op: 'products.structure', args: { change: { op: 'add_value', option: sizeOption.position, text: s } }, need: 'products.edit' });
      return next++;
    });
  }
  // Selections follow the option order (position), whatever it is.
  const order = [colourOption, sizeOption].filter(Boolean).sort((a, b) => a.position - b.position);
  const selections = sizePositions.map((sp) => order.map((o) => (o === colourOption ? colourPos : sp)));
  steps.push({ label: 'مقاسات اللون', op: 'products.structure', args: { change: { op: 'create_variants', selections } }, need: 'products.edit' });
  const first = nextPos(colours.flatMap((c) => c.variants));
  return [...steps, ...commercial([draft], () => selections.map((_, k) => first + k), model.base)];
}

/** Turn sizes on/off for one colour: reactivate, create (adding the size value if new) or retire. */
export function planSizes(model, colour, wanted) {
  const { colourOption, sizeOption } = model;
  if (!sizeOption) return [];
  const steps = [], selections = [];
  let next = nextPos(sizeOption.values);
  for (const s of uniq(wanted)) {
    const v = colour.variants.find((x) => normName(x.size ?? '') === normName(s));
    if (v) { if (!v.active) steps.push({ label: 'رجّعي مقاس ' + s, op: 'products.structure', args: { change: { op: 'set_variant_active', variant: v.position, active: true } }, need: 'products.edit' }); continue; }
    let sp = sizeOption.values.find((x) => normName(x.value) === normName(s))?.position;
    if (sp === undefined) { steps.push({ label: 'مقاس ' + s, op: 'products.structure', args: { change: { op: 'add_value', option: sizeOption.position, text: s } }, need: 'products.edit' }); sp = next++; }
    selections.push([colourOption, sizeOption].filter(Boolean).sort((a, b) => a.position - b.position).map((o) => (o === sizeOption ? sp : colour.valuePosition)));
  }
  for (const v of colour.variants) if (v.active && !wanted.some((s) => normName(s) === normName(v.size ?? ''))) {
    steps.push({ label: 'وقّفي مقاس ' + v.size, op: 'products.structure', args: { change: { op: 'set_variant_active', variant: v.position, active: false } }, need: 'products.edit' });
  }
  if (selections.length) steps.push({ label: 'مقاسات جديدة', op: 'products.structure', args: { change: { op: 'create_variants', selections } }, need: 'products.edit' });
  return steps;
}

/** Same special price (or the base price when null) for every live size of one colour. */
export const planColourPrice = (colour, priceMinor) => colour.variants.filter((v) => v.active)
  .map((v) => ({ label: 'سعر ' + (v.size || colour.name), op: 'products.set_variant_price', args: { position: v.position, amount_minor: priceMinor }, need: 'products.price' }));

/** Supplier availability for a colour: virtual quantity on, or every size marked unavailable. */
export const planColourAvailability = (colour, available) => colour.variants.filter((v) => v.active && v.available !== available)
  .map((v) => available
    ? { label: 'متاح ' + (v.size || colour.name), op: 'products.set_stock', args: { position: v.position, quantity: Number(v.quantity) > 0 ? v.quantity : VIRTUAL_QTY }, need: 'inventory.manage' }
    : { label: 'غير متاح ' + (v.size || colour.name), op: 'products.set_availability', args: { position: v.position, available: false }, need: 'inventory.manage' });

/** Upload target for a colour photo: one of the colour's Variants. Every deployed women-admin version accepts
 *  `variant_position`, and the public API maps it back to the colour. The draft Edge (6e96015) refuses a
 *  request that mixes it with option_position/value_position, so only one target is ever sent. */
export function photoTarget(colour) {
  if (!colour || colour.optionPosition === null) return {};
  const v = colour.variants.find((x) => x.active) || colour.variants[0];
  return v ? { variant_position: String(v.position) } : {};
}

/** Run planned steps in order with the structure token; stops at the first refusal. */
export async function runSteps(steps, { call, code, version, can = () => true, onStep = () => {} }) {
  let v = version;
  for (const [i, s] of steps.entries()) {
    if (!can(s.need)) return { ok: false, at: i, step: s, res: { outcome: 'forbidden' }, version: v };
    onStep(i, s, 'busy');
    let res;
    try { res = await call(s.op, { code, version: v, ...s.args }); } catch { res = { outcome: 'network' }; }
    const good = s.op === 'products.structure' ? res?.outcome === 'applied' : res?.outcome === 'saved';
    if (!good) { onStep(i, s, 'failed'); return { ok: false, at: i, step: s, res, version: v }; }
    if (Number.isInteger(res.structure_version)) v = res.structure_version;
    onStep(i, s, 'ok');
  }
  return { ok: true, version: v };
}
