export const SUPPLIER_STOCK_TTL_MS = 24 * 60 * 60 * 1000; // default; the Owner may change it (snapshot.valid_hours)
const hoursOf = (snapshot) => (Number.isInteger(snapshot?.valid_hours) && snapshot.valid_hours >= 1 && snapshot.valid_hours <= 168 ? snapshot.valid_hours : SUPPLIER_STOCK_TTL_MS / 3600000);

export function supplierStockState(snapshot, now = Date.now()) {
  if (!snapshot) return { state: 'missing', fresh: false, label: 'لم يتم تأكيد كمية المورد' };
  const checked = Date.parse(snapshot.checked_at || '');
  // Same rule as the server: within the window, at most 5 minutes in the future.
  const fresh = Number.isFinite(checked) && checked <= now + 5 * 60 * 1000 && now - checked <= hoursOf(snapshot) * 3600000;
  if (snapshot.supplier_active === false) return { state: 'supplier_inactive', fresh: false, label: 'المورد موقوف — راجع تعيين مورد آخر' };
  if (snapshot.matches_assigned_supplier === false) return { state: 'supplier_changed', fresh: false, label: 'المورد اتغير — أكد الكمية من جديد' };
  if (!fresh || snapshot.is_fresh === false) return { state: 'stale', fresh: false, label: 'تأكيد المورد أقدم من ' + hoursOf(snapshot) + ' ساعة' };
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
