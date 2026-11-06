// Private WOMEN Admin supplier picker. Never send these names to the public catalog.
// Uses existing authenticated women-admin operations; no migration or API keys.
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const norm = text => String(text || '').trim().replace(/\s+/g, ' ').toLocaleLowerCase('ar');

export function supplierChoice({ selected = '', newName = '', suppliers = [], owner = false } = {}) {
  const name = String(newName || '').trim().replace(/\s+/g, ' ');
  const list = Array.isArray(suppliers) ? suppliers : [];
  if (name && !owner) return { ok: false, error: 'إضافة مورد جديد متاحة للمالك فقط.' };
  if (name && name.length < 2) return { ok: false, error: 'اسم المورد الجديد لازم يكون حرفين على الأقل.' };
  if (name.length > 200) return { ok: false, error: 'اسم المورد الجديد طويل جدًا.' };
  const matched = name ? list.find(s => norm(s.name) === norm(name) && s.active !== false && uuid.test(s.id)) : null;
  if (name) return { ok: true, id: matched?.id || null, create: matched ? '' : name };
  if (!selected) return { ok: true, id: null, create: '' };
  if (!list.some(s => s.id === selected && s.active !== false)) return { ok: false, error: 'المورد المختار مش متاح لحسابك. اختاري موردًا من القائمة.' };
  return { ok: true, id: selected, create: '' };
}

export function initSupplierPicker({ root, selectId, statusId, currentId = null, call, isOwner = false } = {}) {
  const select = root?.querySelector(selectId);
  const status = root?.querySelector(statusId);
  const state = { items: [], loaded: false };
  if (!select) { state.ready = Promise.resolve(); return state; }
  select.replaceChildren(new Option('بدون مورد محدد', ''));
  select.disabled = true;
  state.ready = (async () => {
    try {
      const result = await call('suppliers.list');
      if (result?.outcome !== 'ok' || !Array.isArray(result.data)) throw new Error('supplier list unavailable');
      state.items = result.data.filter(s => s && uuid.test(String(s.id || '')) && typeof s.name === 'string' && s.active !== false);
      if (!root.contains(select)) return;
      for (const s of state.items) select.add(new Option(s.name, s.id));
      if (currentId && state.items.some(s => s.id === currentId)) select.value = currentId;
      const hidden = Boolean(currentId && !state.items.some(s => s.id === currentId));
      if (hidden) {
        select.add(new Option('مورد مرتبط غير متاح في صلاحياتك', currentId));
        select.value = currentId;
      }
      if (status) status.textContent = hidden
        ? 'المورد الحالي مش ظاهر في صلاحيات حسابك. المسؤول يقدر يراجعه.'
        : state.items.length ? 'المورد ده معلومات داخلية ومش هيظهر للعميلات.'
        : isOwner ? 'مفيش موردين مسجلين. اكتبي اسم مورد جديد في الخانة الجاية.'
          : 'مفيش مورد متاح لحسابك. ارفعي مسودة وخلّي المالك يحدد المورد.';
      state.loaded = true;
      select.disabled = !isOwner && hidden;
      if (!hidden) select.disabled = false;
    } catch {
      if (root.contains(select)) {
        if (status) status.textContent = 'تعذّر تحميل الموردين. تقدري تكمّلي المنتج كمسودة من غير مورد.';
        // Never reset or silently clear an already assigned supplier.
        select.disabled = true;
      }
    }
  })();
  return state;
}

export async function createSupplierIfNeeded({ call, choice }) {
  if (!choice?.ok) return { ok: false, error: choice?.error || 'اختيار المورد غير صحيح.' };
  if (!choice.create) return { ok: true, id: choice.id };
  try {
    const result = await call('suppliers.create', { name: choice.create });
    if (result?.outcome === 'created' && uuid.test(String(result.supplier_id || ''))) {
      return { ok: true, id: result.supplier_id };
    }
    return { ok: false, error: 'المورد الجديد ما اتحفظش. افتحي المنتج وراجعي المورد من تبويب البيانات.' };
  } catch {
    return { ok: false, error: 'في مشكلة اتصال أثناء إضافة المورد. المنتج هيفضل مسودة لحين المراجعة.' };
  }
}
