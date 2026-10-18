/* SELECT SHOP WOMEN — static commerce over trusted Supabase Edge API.
 * One approved Claude design. Browser stores ONLY public versioned selectors.
 * NO service-role credentials, client prices, variant UUIDs or direct table writes.
 * All totals and the transaction are authoritative on Supabase.
 */
const API = "https://byluoipdunralsurwebt.supabase.co/functions/v1/women-checkout";
const CART_KEY = "women.cart.v1";
const ORDER_KEY = "women.order.idempotency.v1";
const PHOTO = /^https:\/\/byluoipdunralsurwebt\.supabase\.co\/storage\/v1\/object\/public\/(?:product-media|women-storefront)\//;
const $ = (s) => document.querySelector(s);
const money = (m) => m && Number.isSafeInteger(m.amountMinor) && m.currency === "EGP"
  ? new Intl.NumberFormat("ar-EG").format(m.amountMinor / 100) + " ج.م"
  : "—";
const make = (tag, text, klass) => {
  const e = document.createElement(tag);
  if (text !== undefined && text !== null) e.textContent = String(text);
  if (klass) e.className = klass;
  return e;
};
const status = (message, error=false) => {
  const out = $("#status");
  if (out) { out.textContent = message; out.setAttribute("role", error ? "alert" : "status"); }
};
const validCode = (x) => typeof x === "string" && /^SS-\d{4,19}$/.test(x);
const priceNumber = (v) => v && v.currency === "EGP" && Number.isSafeInteger(v.amountMinor) ? v.amountMinor : null;
function lineOk(x) {
  return x && validCode(x.publicCode)
    && Number.isInteger(x.structureVersion) && x.structureVersion > 0
    && Number.isInteger(x.quantity) && x.quantity >= 1 && x.quantity <= 99
    && Array.isArray(x.selection) && x.selection.length <= 100
    && x.selection.every(v=> Number.isInteger(v.optionPosition) && Number.isInteger(v.valuePosition)
      && v.optionPosition >= 0 && v.valuePosition >= 0);
}
function cart() {
  try {
    const v = JSON.parse(localStorage.getItem(CART_KEY) || "[]");
    return Array.isArray(v) ? v.filter(lineOk).slice(0,50) : [];
  } catch { return []; }
}
function updateBagCount() {
  const count=cart().reduce((sum,line)=>sum+line.quantity,0);
  document.querySelectorAll("[data-cart-count]").forEach(dot=>{
    dot.textContent=String(count);
    dot.hidden=count===0;
  });
}
function saveCart(lines) {
  localStorage.setItem(CART_KEY,JSON.stringify(lines.slice(0,50)));
  updateBagCount();
}
async function api(path, method="GET", body=null) {
  const opts = {method, cache:"no-store", headers:{Accept:"application/json"}, signal:AbortSignal.timeout(15000)};
  if (body !== null) { opts.headers["Content-Type"]="application/json"; opts.body=JSON.stringify(body); }
  const r=await fetch(API + path,opts);
  let data={};try { data=await r.json(); } catch {}
  if (!r.ok) {
    const e=new Error(String(data.error || "service_unavailable"));
    e.status=r.status;
    throw e;
  }
  return data;
}
function picture(src,alt,klass) {
  const img=make("img",undefined,klass);
  img.alt=alt||"";
  img.loading="lazy";
  if (typeof src === "string" && PHOTO.test(src)) img.src=src;
  return img;
}
const addressKey = x => x.publicCode + "@" + x.structureVersion + ":" +
  x.selection.map(y=>y.optionPosition+"."+y.valuePosition).join(",");
const msg = e => ({
  unavailable:"الموديل مش متاح دلوقتي.",
  selection_changed:"المقاس اتغير، افتحي المنتج من جديد.",
  checkout_changed:"السعر أو الشحن اتغير؛ راجعي الإجمالي الأول.",
  checkout_not_purchasable:"فيه قطعة مش متاحة حاليًا.",
  orders_not_enabled:"بنجهز استقبال الطلبات بشكل آمن. جرّبي تاني قريب.",
  write_unconfirmed:"تعذر تأكيد حالة الطلب. متعيديش طلب جديد؛ أعيدي المحاولة بنفس الصفحة.",
  idempotency_conflict:"فيه طلب سابق مرتبط بنفس عملية الشراء. راجعي رقمه قبل المحاولة.",
  rate_limited:"تم تجاوز الحد المسموح لمحاولات الطلب. حاولي لاحقًا أو تواصلي مع خدمة العملاء.",
  captcha_required:"كمّلي التحقق من الأمان قبل إرسال الطلب.",
  captcha_invalid:"تعذر التحقق من الأمان. أعيدي المحاولة.",
  invalid_request:"راجعي البيانات والمقاسات المدخلة.",
  service_unavailable:"الخدمة مؤقتًا تحت التجهيز.",
  internal:"حصلت مشكلة اتصال، جربي مرة تانية.",
})[e?.message] || "الخدمة مؤقتًا مش متاحة. جربي مرة تانية.";
function selectedVariant(product, fields) {
  const values=[...fields].map((f)=>Number(f.value));
  return product.variants.find(v=>v.selection.every((x,i)=>x.valuePosition===values[i]));
}
async function showProduct() {
  const code=new URLSearchParams(location.search).get("code");
  if (!validCode(code)){status("رابط المنتج مش صحيح.",true);$("#productTitle").textContent="المنتج غير موجود";return;}
  try {
    const {product:p}=await api("/product/"+encodeURIComponent(code));
    if (!p || !p.variants || !p.options) throw new Error("unavailable");
    $("#product").setAttribute("aria-busy","false");
    $("#productTitle").textContent=p.title;
    $("#productCode").textContent=p.publicCode;
    $("#productDescription").textContent=p.description||"";
    const photos=Array.isArray(p.media)?p.media.filter(x=>PHOTO.test(x.url)):[], primary=$("#productPhoto"),thumbs=$("#productThumbs");
    if(photos.length){
      const show=src=>{primary.src=src.url;primary.alt=src.altText||p.title;primary.hidden=false;};
      show(photos[0]);
      photos.forEach((im,i)=>{
        const b=make("button");b.type="button";b.setAttribute("aria-pressed",String(i===0));
        b.setAttribute("aria-label","الصورة "+(i+1));
        b.append(picture(im.url,im.altText||p.title));
        b.addEventListener("click",()=>{show(im);thumbs.querySelectorAll("button").forEach(x=>x.setAttribute("aria-pressed",String(x===b)));});
        thumbs.append(b);
      });
    }
    const fields=[],holder=$("#optionFields");
    p.options.forEach((o,i)=>{
      const label=make("label",undefined,"commerce-field");label.append(make("span",o.name||"المقاس"));
      const s=make("select");s.setAttribute("aria-label",o.name||"المقاس");
      o.values.forEach(v=>{const option=make("option",v.value);option.value=String(v.position);s.append(option);});
      label.append(s);holder.append(label);fields.push(s);
    });
    const btn=$("#addToCart");
    const refresh=(resetMessage=true)=>{
      const selected=selectedVariant(p,fields);
      $("#productPrice").textContent=money(selected?.unitPrice);
      btn.disabled=!selected?.purchasable;
      if(!selected?.purchasable) status("المقاس ده مش متاح حاليًا.",true);
      else if(resetMessage) status("");
    };
    fields.forEach(f=>f.addEventListener("change",refresh));refresh();
    btn.addEventListener("click",async()=>{
      const v=selectedVariant(p,fields),quantity=Number($("#quantity").value);
      if(!v||!v.purchasable||!Number.isInteger(quantity)||quantity<1||quantity>99){status("اختاري المقاس والكمية الصح.",true);return;}
      const line={publicCode:p.publicCode,structureVersion:p.structureVersion,selection:v.selection,quantity};
      btn.disabled=true;status("بنضيف القطعة للشنطة…");
      try {
        await api("/cart/add","POST",line);
        const lines=cart(),pos=lines.findIndex(x=>addressKey(x)===addressKey(line));
        if(pos>=0)lines[pos].quantity=Math.min(99,lines[pos].quantity+quantity);
        else lines.push(line);
        saveCart(lines);status("اتضافت للشنطة ✓");
      } catch(e){status(msg(e),true);}
      finally {refresh(false);}
    });
  } catch(e){$("#productTitle").textContent="المنتج مش متاح";$("#product").setAttribute("aria-busy","false");status(msg(e),true);}
}
function cartRow(l,quantityChange) {
  const row=make("div",undefined,"commerce-row");
  if(l.image?.url)row.append(picture(l.image.url,l.image.altText||l.title));
  const details=make("div",undefined,"commerce-row-main");
  details.append(make("b",l.title||"المنتج"));
  details.append(make("div",(l.options||[]).map(o=>o.value).join(" • ")||"One Size","commerce-note"));
  details.append(make("div",money(l.lineTotal||l.unitPrice),"commerce-price"));
  const controls=make("div",undefined,"commerce-controls");
  const dec=make("button","−");dec.type="button";dec.setAttribute("aria-label","نقص الكمية");
  const qty=make("span",l.quantity);
  const inc=make("button","+");inc.type="button";inc.setAttribute("aria-label","زود الكمية");
  dec.addEventListener("click",()=>quantityChange(l,-1));
  inc.addEventListener("click",()=>quantityChange(l,1));
  controls.append(dec,qty,inc);details.append(controls);row.append(details);
  if(l.status!=="ok")row.append(make("p","محتاج تحديث المقاس أو المنتج.","commerce-note"));
  return row;
}
async function showCart(){
  const holder=$("#cartItems"),go=$("#toCheckout"),sum=$("#subtotal");
  const refresh=async()=>{
    const lines=cart();holder.replaceChildren();
    if(!lines.length){holder.append(make("p","الشنطة فاضية. اختاري اللي يعجبك من المتجر."));sum.textContent="—";go.setAttribute("aria-disabled","true");go.style.pointerEvents="none";return;}
    try{
      const data=await api("/cart/resolve","POST",{lines});
      data.lines.forEach(l=>holder.append(cartRow(l,(_item,change)=>{
        const orig=cart(),i=orig.findIndex(x=>addressKey(x)===addressKey(l.address));
        if(i<0)return;
        orig[i].quantity+=change;
        if(orig[i].quantity<=0)orig.splice(i,1);
        saveCart(orig);refresh();
      })));
      sum.textContent=money(data.subtotal);
      go.setAttribute("aria-disabled",String(!data.checkoutReady));go.style.pointerEvents=data.checkoutReady?"auto":"none";
      status(data.checkoutReady?"راجعي بيانات التوصيل في الخطوة الجاية.":"فيه قطعة مش متاحة، راجعي المقاسات.",!data.checkoutReady);
    }catch(e){holder.append(make("p","تعذر تحديث الشنطة."));go.setAttribute("aria-disabled","true");go.style.pointerEvents="none";status(msg(e),true);}
  };
  await refresh();
}
async function showCheckout(){
  const lines=cart(),form=$("#orderForm"),select=$("#region"),btn=$("#placeOrder");
  let quote=null;
  let captchaEnabled=false, captchaWidgetId=null;
  const captchaArea=$("#captchaArea");
  // A public site key is retrieved from Supabase only once server-side
  // protection is configured. No CAPTCHA service credentials in static JS.
  try {
    const config=await api("/captcha-config");
    if(config.enabled===true && /^[A-Za-z0-9_-]{12,80}$/.test(config.sitekey||"")){
      captchaEnabled=true;
      captchaArea.hidden=false;
      const script=document.createElement("script");
      script.src="https://js.hcaptcha.com/1/api.js?render=explicit";
      script.async=true;
      script.defer=true;
      document.head.append(script);
      script.addEventListener("load",()=>{
        if(window.hcaptcha?.render){
          captchaWidgetId=window.hcaptcha.render("captchaWidget",{sitekey:config.sitekey});
          if(quote?.purchasable) btn.disabled=false;
        }
      });
      script.addEventListener("error",()=>status("التحقق من الأمان مش متاح دلوقتي.",true));
    }
  } catch { /* Endpoint unavailable while orders disabled; server refuses writes. */ }
  if(!lines.length){status("الشنطة فاضية، ارجعي واختاري منتجاتك.",true);return;}
  try{
    const regions=await api("/regions");
    regions.regions.forEach(r=>{const op=make("option",r.label);op.value=r.key;select.append(op);});
  }catch(e){status(msg(e),true);return;}
  const refresh=async()=>{
    quote=null;btn.disabled=true;
    $("#subtotal").textContent="—";$("#shipping").textContent="—";$("#grandTotal").textContent="—";
    $("#checkoutItems").replaceChildren();
    if(!select.value){status("اختاري المحافظة لعرض سعر الشحن.");return;}
    status("بنحسب السعر والشحن من السيرفر…");
    try{
      const q=await api("/checkout/quote","POST",{lines,deliveryRegionKey:select.value});
      q.lines.forEach(l=>$("#checkoutItems").append(make("p",(l.title||l.address?.publicCode||"قطعة")+" × "+l.quantity)));
      $("#subtotal").textContent=money(q.merchandiseSubtotal);
      $("#shipping").textContent=money(q.shippingTotal);
      $("#grandTotal").textContent=money(q.grandTotal);
      if(!q.purchasable||priceNumber(q.grandTotal)===null){status("مش متاح إتمام الطلب للمحافظة أو المقاس الحالي.",true);return;}
      quote=q;
      btn.disabled=!(captchaEnabled && captchaWidgetId!==null);
      status(captchaEnabled ? "الإجمالي مؤكد. كمّلي التحقق من الأمان قبل إرسال الطلب." : "ده إجمالي الطلب؛ استقبال الطلبات لسه تحت التجهيز حاليًا.",!captchaEnabled);
    }catch(e){status(msg(e),true);}
  };
  select.addEventListener("change",refresh);
  await refresh();
  form.addEventListener("submit",async(e)=>{
    e.preventDefault();if(!quote||!form.reportValidity())return;
    if(!crypto?.randomUUID){status("المتصفح لا يدعم الطلب الآمن. افتحي الموقع من متصفح أحدث.",true);return;}
    let key=sessionStorage.getItem(ORDER_KEY);
    if(!key){key=crypto.randomUUID().replace(/-/g,"");sessionStorage.setItem(ORDER_KEY,key);}
    const data=new FormData(form);
    const buyer={
      name:String(data.get("name")||"").trim(),
      phone:String(data.get("phone")||"").trim(),
      area:String(data.get("area")||"").trim(),
      address:String(data.get("address")||"").trim(),
      notes:String(data.get("notes")||"").trim(),
    };
    const payload={
      idempotencyKey:key,lines,deliveryRegionKey:select.value,buyer,paymentMethod:"cod",
      confirmedMerchandiseSubtotalPiastres:priceNumber(quote.merchandiseSubtotal),
      confirmedShippingTotalPiastres:priceNumber(quote.shippingTotal),
      confirmedGrandTotalPiastres:priceNumber(quote.grandTotal),
    };
    if(captchaEnabled){
      const token=captchaWidgetId!==null && window.hcaptcha?.getResponse(captchaWidgetId);
      if(!token){status("كمّلي التحقق من الأمان قبل تأكيد الطلب.",true);return;}
      payload.captchaToken=token;
    }
    btn.disabled=true;status("بنراجع الطلب…");
    try{
      const reply=await api("/orders","POST",payload);
      if(!/^ORD-[23456789ABCDEFGHJKMNPQRSTVWXYZ]{8}$/.test(reply.publicOrderCode))throw new Error("write_unconfirmed");
      sessionStorage.removeItem(ORDER_KEY);
      saveCart([]);
      location.href="/order-success/?order="+encodeURIComponent(reply.publicOrderCode);
    }catch(err){
      // Verified tokens are one-time: any retry uses the SAME checkout
      // idempotency key, but gets a NEW CAPTCHA answer.
      if(captchaEnabled && captchaWidgetId!==null) window.hcaptcha?.reset(captchaWidgetId);
      status(msg(err),true);
      if(err.message==="checkout_changed"||err.message==="checkout_not_purchasable") await refresh();
      else btn.disabled=!(captchaEnabled && captchaWidgetId!==null); // retry uses SAME key; never create duplicate.
    }
  });
}
function success(){
  const code=new URLSearchParams(location.search).get("order")||"";
  $("#orderCode").textContent=/^ORD-[23456789ABCDEFGHJKMNPQRSTVWXYZ]{8}$/.test(code)?code:"رقم الطلب غير متاح";
}
updateBagCount();
const pathname=location.pathname;
if(pathname.endsWith("/p/")||pathname.endsWith("/p/index.html"))showProduct();
else if(pathname.endsWith("/cart/")||pathname.endsWith("/cart/index.html"))showCart();
else if(pathname.endsWith("/checkout/")||pathname.endsWith("/checkout/index.html"))showCheckout();
else if(pathname.endsWith("/order-success/")||pathname.endsWith("/order-success/index.html"))success();
