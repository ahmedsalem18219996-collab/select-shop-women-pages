// WOMEN Admin — pure, permission-neutral product lifecycle helpers.
// Server-side Admin authorization and product.publish blockers remain authoritative.
export const PRODUCT_STATES = ['public','draft','hidden','archived'];
export const STATUS_LABELS = Object.freeze({
  public:'منشور', draft:'مسودة', hidden:'مخفي', archived:'مؤرشف'
});
export function countStatuses(items=[]) {
  const counts = Object.fromEntries(PRODUCT_STATES.map(k=>[k,0]));
  for(const item of items) if(item && Object.hasOwn(counts,item.status)) counts[item.status]++;
  return counts;
}
export function statusAction(status) {
  if(status==='public') return {op:'products.hide',label:'إخفاء من المتجر',verb:'الإخفاء',next:'hidden'};
  if(status==='draft'||status==='hidden') return {op:'products.publish',label:'نشر في المتجر',verb:'النشر',next:'public'};
  return null;
}
export function prepublishHints(d) {
  if(!d||!d.product) return ['تعذّر تحميل المنتج، افتحيه من لوحة الإدارة أولًا'];
  const hints=[];
  const photos=(d.media?.media||[]).filter(m=>!m.hidden&&!m.delete_pending);
  if(!photos.length) hints.push('ارفعي صورة ظاهرة واحدة على الأقل');
  if(!d.product.shipping_profile) hints.push('اختاري طريقة الشحن');
  const p=d.product;
  if(!p.variants?.some(v=>v.active&&v.availability==='available')) hints.push('فعّلي اختيارًا متاحًا للتوريد');
  return hints; // Backend still validates all official publish_blockers.
}
