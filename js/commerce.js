/* SELECT SHOP WOMEN — static commerce over trusted Supabase Edge API.
 * One approved Claude design. Browser stores ONLY public versioned selectors.
 * NO service-role credentials, client prices, variant UUIDs or direct table writes.
 * All totals and the transaction are authoritative on Supabase.
 */
const API = "https://byluoipdunralsurwebt.supabase.co/functions/v1/women-checkout";

// Anonymous first-party product-view tracking for the Owner dashboard.
// No name, phone, email, IP address or buyer/order details are sent or stored.
// The server deduplicates this random browser key per product for 24 hours.
// Never block rendering, cart or checkout when tracking is unavailable.
const PRODUCT_VIEWS_API = "https://byluoipdunralsurwebt.supabase.co/functions/v1/women-product-views";
const PRODUCT_VIEW_KEY = "women.anonymous-product-views.v1";
async function recordAnonymousProductView(code) {
  if (!validCode(code)) return;
  try {
    if (navigator.globalPrivacyControl === true || navigator.doNotTrack === "1") return;
    let visitorKey = localStorage.getItem(PRODUCT_VIEW_KEY);
    if (!/^[0-9a-f]{64}$/.test(visitorKey || "")) {
      const bytes = crypto.getRandomValues(new Uint8Array(32));
      visitorKey = Array.from(bytes, b => b.toString(16).padStart(2, "0")).join("");
      localStorage.setItem(PRODUCT_VIEW_KEY, visitorKey);
    }
    await fetch(PRODUCT_VIEWS_API, {
      method: "POST",
      mode: "cors",
      credentials: "omit",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, visitorKey }),
      keepalive: true,
      signal: AbortSignal.timeout(6000),
    });
  } catch { /* Analytics must never block shopping. */ }
}

const CART_KEY = "women.cart.v1";
const ORDER_KEY = "women.order.idempotency.v1";
const GA_PURCHASE_KEY = "women.ga4.purchase.pending.v1";
function gaEvent(name, fields) {
  // Analytics is optional: blockers must never affect checkout.
  try { if (typeof window.gtag === "function") window.gtag("event", name, fields); }
  catch { /* Tracking cannot break commerce. */ }
  try {
    const metaName={view_item:"ViewContent",add_to_cart:"AddToCart",begin_checkout:"InitiateCheckout"}[name];
    if(metaName && typeof window.womenMetaEvent==="function") window.womenMetaEvent(metaName,fields);
  } catch { /* Optional tracking. */ }
}
const PHOTO = /^https:\/\/byluoipdunralsurwebt\.supabase\.co\/storage\/v1\/object\/public\/(?:product-media|women-storefront)\//;
// Use only checked-in image derivatives from the public catalog thumbnail manifest.
// New product photos not in that manifest safely fall back to their original URLs.
const LOCAL_THUMBNAILS = new Set(Array.isArray(window.SELECT_THUMBNAILS) ? window.SELECT_THUMBNAILS : []);
const PRODUCT_MEDIA_FILENAME = /^https:\/\/byluoipdunralsurwebt\.supabase\.co\/storage\/v1\/object\/public\/product-media\/media\/([0-9a-f]{32}\.(?:jpg|png|webp))$/;
function displayPhotoUrl(src, small=false) {
  const file = typeof src === "string" ? PRODUCT_MEDIA_FILENAME.exec(src)?.[1] : null;
  if (!file || !LOCAL_THUMBNAILS.has(file)) return src;
  return "/assets/catalog-thumbs/" + encodeURIComponent(file) + (small ? ".w400.webp" : ".webp");
}

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
  img.decoding="async";
  img.fetchPriority="low";
  if (typeof src === "string" && PHOTO.test(src)) img.src=displayPhotoUrl(src,true);
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
async function getProductWithRetry(code) {
  // Retrying is safe for a public read; never retry cart or order writes.
  for (let attempt = 0; attempt < 2; attempt++) {
    try { return await api("/product/" + encodeURIComponent(code)); }
    catch (e) {
      const temporary = !e?.status || e.status === 429 || e.status >= 500;
      if (attempt === 1 || !temporary) throw e;
      await new Promise(resolve => setTimeout(resolve, 350));
    }
  }
}
async function showProduct() {
  const code=new URLSearchParams(location.search).get("code");
  if (!validCode(code)){status("رابط المنتج مش صحيح.",true);$("#productTitle").textContent="المنتج غير موجود";$("#product").setAttribute("aria-busy","false");return;}
  try {
    const {product:p}=await getProductWithRetry(code);
    if (!p || !Array.isArray(p.variants) || !Array.isArray(p.options)) throw new Error("invalid_product_payload");
    $("#product").setAttribute("aria-busy","false");
    $("#productTitle").textContent=p.title;
    $("#productCode").textContent=p.publicCode;
    void recordAnonymousProductView(p.publicCode);
    gaEvent("view_item", {currency:"EGP", items:[{item_id:p.publicCode, item_name:p.title}]});
    $("#productDescription").textContent=p.description||"";
    const photos=Array.isArray(p.media)?p.media.filter(x=>PHOTO.test(x.url)):[], primary=$("#productPhoto"),thumbs=$("#productThumbs");
    if(photos.length){
      const openZoom=$("#openPhoto"),viewer=$("#photoViewer"),zoomed=$("#photoZoomed");
      let currentPhoto=0,touchStart=null;
      const show=index=>{
        currentPhoto=(index+photos.length)%photos.length;
        const src=photos[currentPhoto];
        // Set eager priority before assigning src so the hero image is fetched first.
        primary.loading="eager";primary.fetchPriority="high";primary.decoding="async";
        primary.src=displayPhotoUrl(src.url);primary.alt=src.altText||p.title;primary.hidden=false;
        // The full-resolution asset is reserved for a deliberate zoom action.
        if(viewer.open) zoomed.src=src.url;
        else zoomed.removeAttribute("src");
        zoomed.alt=src.altText||p.title;
        $("#photoCount").textContent="الصورة "+(currentPhoto+1)+" من "+photos.length;
        thumbs.querySelectorAll("button").forEach((b,i)=>b.setAttribute("aria-pressed",String(i===currentPhoto)));
      };
      photos.forEach((im,i)=>{
        const b=make("button");b.type="button";b.setAttribute("aria-pressed",String(i===0));
        b.setAttribute("aria-label","اعرضي الصورة "+(i+1));
        b.append(picture(im.url,im.altText||p.title));
        b.addEventListener("click",()=>show(i));
        thumbs.append(b);
      });
      show(0);openZoom.disabled=false;
      openZoom.addEventListener("click",()=>{
        if(!viewer.open){zoomed.src=photos[currentPhoto].url;viewer.showModal();history.pushState({...(history.state||{}),womenPhotoViewer:true},"");$("#photoClose").focus();}
      });
      $("#photoPrev").addEventListener("click",()=>show(currentPhoto-1));
      $("#photoNext").addEventListener("click",()=>show(currentPhoto+1));
      $("#photoClose").addEventListener("click",()=>viewer.close());
      viewer.addEventListener("keydown",e=>{
        if(e.key==="ArrowLeft"){e.preventDefault();show(currentPhoto+1);}
        if(e.key==="ArrowRight"){e.preventDefault();show(currentPhoto-1);}
      });
      viewer.addEventListener("pointerdown",e=>{touchStart={x:e.clientX,y:e.clientY};});
      viewer.addEventListener("pointerup",e=>{
        if(!touchStart)return;
        const dx=e.clientX-touchStart.x,dy=e.clientY-touchStart.y;touchStart=null;
        if(Math.abs(dx)>55&&Math.abs(dx)>Math.abs(dy)*1.3)show(currentPhoto+(dx>0?-1:1));
      });
      addEventListener("popstate",()=>{if(viewer.open)viewer.close();});
      viewer.addEventListener("close",()=>{
        openZoom.focus({preventScroll:true});
        if(history.state?.womenPhotoViewer)history.back();
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
        saveCart(lines);status("اتضافت للشنطة ✓");$("#viewCartAfterAdd").hidden=false;
        const unitMinor=priceNumber(v.unitPrice);
        gaEvent("add_to_cart", {
          currency:"EGP",
          ...(unitMinor!==null?{value:unitMinor*quantity/100}:{}),
          items:[{item_id:p.publicCode,item_name:p.title,quantity,
            ...(unitMinor!==null?{price:unitMinor/100}:{})}]
        });
      } catch(e){status(msg(e),true);}
      finally {refresh(false);}
    });
  } catch(e){
    const missing = e?.status === 404 || e?.message === "unavailable";
    $("#product").setAttribute("aria-busy","false");
    $("#productTitle").textContent = missing ? "المنتج غير متاح حاليًا" : "تعذر تحميل تفاصيل المنتج";
    status(missing
      ? "المنتج غير متاح حاليًا. تقدري تتصفحي باقي الموديلات."
      : "فيه مشكلة مؤقتة في تحميل التفاصيل. جربي مرة تانية.", true);
    if (!missing) {
      const retry = make("button","إعادة المحاولة","commerce-btn commerce-btn--ghost");
      retry.type = "button";
      retry.addEventListener("click", () => {
        $("#productTitle").textContent = "جارٍ تحميل المنتج…";
        $("#product").setAttribute("aria-busy","true");
        status("بنحاول نحمّل التفاصيل مرة تانية…");
        void showProduct();
      });
      $("#status").append(" ",retry);
    }
  }
}
function cartRow(l,quantityChange) {
  const row=make("div",undefined,"commerce-row");
  const code=l.address?.publicCode;
  const href=validCode(code)?"/p/?code="+encodeURIComponent(code):null;
  if(l.image?.url){
    const image=picture(l.image.url,l.image.altText||l.title);
    if(href){
      const link=make("a",undefined,"commerce-row-product");link.href=href;
      link.setAttribute("aria-label","افتحي تفاصيل "+(l.title||"المنتج"));
      link.append(image);row.append(link);
    }else row.append(image);
  }
  const details=make("div",undefined,"commerce-row-main");
  if(href){
    const productLink=make("a",l.title||"المنتج","commerce-row-title");
    productLink.href=href;details.append(productLink);
  }else details.append(make("b",l.title||"المنتج"));
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
  let orderReady=false;
  // Only the reviewed WOMEN internal protection path may activate checkout.
  // Older backends return 404 here, safely leaving order placement disabled.
  try {
    const cfg=await api("/checkout-config");
    orderReady=cfg.enabled===true && cfg.mode==="internal";
  } catch { /* Fail closed. */ }
  if(!lines.length){status("الشنطة فاضية، ارجعي واختاري منتجاتك.",true);return;}
  if(orderReady) gaEvent("begin_checkout", {currency:"EGP",
    items:lines.map(l=>({item_id:l.publicCode, quantity:l.quantity}))});
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
      btn.disabled=!orderReady;
      status(orderReady ? "الإجمالي مؤكد. راجعي بياناتك وأكّدي الطلب." : "ده إجمالي الطلب؛ استقبال الطلبات لسه تحت التجهيز حاليًا.",!orderReady);
    }catch(e){status(msg(e),true);}
  };
  select.addEventListener("change",refresh);
  await refresh();
  form.addEventListener("submit",async(e)=>{
    e.preventDefault();if(!quote||!orderReady||!form.reportValidity())return;
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
    btn.disabled=true;status("بنراجع الطلب…");
    try{
      const reply=await api("/orders","POST",payload);
      if(!/^ORD-[23456789ABCDEFGHJKMNPQRSTVWXYZ]{8}$/.test(reply.publicOrderCode))throw new Error("write_unconfirmed");
      // Meta Purchase is emitted only here, after the server confirms /orders.
      // The public order code stays local; no buyer or address data goes to Meta.
      try {
        const seenKey="women.meta.purchase.sent.v1";
        const seen=JSON.parse(localStorage.getItem(seenKey)||"[]");
        if(Array.isArray(seen) && !seen.includes(reply.publicOrderCode)
          && typeof window.womenMetaEvent==="function") {
          localStorage.setItem(seenKey,JSON.stringify([...seen,reply.publicOrderCode].slice(-500)));
          window.womenMetaEvent("Purchase", {
            currency:"EGP", value:priceNumber(quote.merchandiseSubtotal)/100,
            items:lines.map(l=>({item_id:l.publicCode,quantity:l.quantity}))
          },crypto.randomUUID());
        }
      } catch { /* Fail closed if deduplication storage is unavailable. */ }
      // Only a real confirmed /orders response may arm a Purchase event.
      // Public order code stays local, never exported to Analytics.
      try {
        sessionStorage.setItem(GA_PURCHASE_KEY,JSON.stringify({
          code:reply.publicOrderCode,
          transaction_id:crypto.randomUUID(),
          currency:"EGP",
          value:priceNumber(quote.merchandiseSubtotal)/100,
          shipping:priceNumber(quote.shippingTotal)/100,
          items:lines.map(l=>({item_id:l.publicCode,quantity:l.quantity}))
        }));
      } catch { /* Tracking is best-effort only. */ }
      sessionStorage.removeItem(ORDER_KEY);
      saveCart([]);
      location.href="/order-success/?order="+encodeURIComponent(reply.publicOrderCode);
    }catch(err){
      status(msg(err),true);
      if(err.message==="checkout_changed"||err.message==="checkout_not_purchasable") await refresh();
      else btn.disabled=!orderReady; // retry uses SAME key; never create duplicate.
    }
  });
}
function success(){
  const code=new URLSearchParams(location.search).get("order")||"";
  $("#orderCode").textContent=/^ORD-[23456789ABCDEFGHJKMNPQRSTVWXYZ]{8}$/.test(code)?code:"رقم الطلب غير متاح";
  // Never count a manually loaded success URL as a conversion.
  try {
    const pending=JSON.parse(sessionStorage.getItem(GA_PURCHASE_KEY)||"null");
    if(pending?.code!==code || !/^ORD-[23456789ABCDEFGHJKMNPQRSTVWXYZ]{8}$/.test(code))return;
    sessionStorage.removeItem(GA_PURCHASE_KEY); // at most one event per confirmed order
    const {code:_localCode,...event}=pending;
    if(Number.isFinite(event.value) && event.value>=0 && typeof event.transaction_id==="string"
      && Array.isArray(event.items)) gaEvent("purchase",event);
  } catch { /* Never interfere with confirmation screen. */ }
}
updateBagCount();
const pathname=location.pathname;
if(pathname.endsWith("/p/")||pathname.endsWith("/p/index.html"))showProduct();
else if(pathname.endsWith("/cart/")||pathname.endsWith("/cart/index.html"))showCart();
else if(pathname.endsWith("/checkout/")||pathname.endsWith("/checkout/index.html"))showCheckout();
else if(pathname.endsWith("/order-success/")||pathname.endsWith("/order-success/index.html"))success();
