export const SUPPLIER_STOCK_TTL_MS = 24 * 60 * 60 * 1000;

export function supplierStockState(snapshot, now = Date.now()) {
  if (!snapshot) return { state: 'missing', fresh: false, label: 'لم يتم تأكيد كمية المورد' };
  const checked = Date.parse(snapshot.checked_at || '');
  const fresh = Number.isFinite(checked) && checked <= now && now - checked <= SUPPLIER_STOCK_TTL_MS;
  if (snapshot.matches_assigned_supplier === false) return { state: 'supplier_changed', fresh: false, label: 'المورد اتغير — أكد الكمية من جديد' };
  if (!fresh || snapshot.is_fresh === false) return { state: 'stale', fresh: false, label: 'تأكيد المورد أقدم من 24 ساعة' };
  const quantity = Number(snapshot.quantity);
  if (!Number.isInteger(quantity) || quantity <= 0) return { state: 'out_of_stock', fresh: true, label: 'نفد عند المورد' };
  return { state: 'available', fresh: true, label: 'متاح عند المورد: ' + quantity + ' قطعة' };
}

export function productCampaignEligibility(product, snapshot, now = Date.now()) {
  if (!product || product.status !== 'public') return { ok: false, reason: 'المنتج لازم يكون منشورًا' };
  const stock = supplierStockState(snapshot, now);
  if (stock.state !== 'available') return { ok: false, reason: stock.label };
  if (!snapshot?.supplier_id) return { ok: false, reason: 'لا يوجد مورد مرتبط' };
  return { ok: true, reason: stock.label };
}

export function supplierStockSummary(snapshot) {
  return supplierStockState(snapshot).label;
}
