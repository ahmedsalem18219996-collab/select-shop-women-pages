// GA4 + Meta Pixel, production only; never buyer data. ?notrack=1 / 0: owner test opt-out for this browser.
window.__womenNoTrack = (() => {
  try {
    const q = new URLSearchParams(location.search).get("notrack");
    if (q === "1") localStorage.setItem("women.notrack", "1");
    if (q === "0") localStorage.removeItem("women.notrack");
    return localStorage.getItem("women.notrack") === "1";
  } catch { return false; }
})();
// Meta ids (_fbp, _fbc or one from the last fbclid) for the server's Conversions API via /orders/attribution.
if (!window.__womenNoTrack) {
  const FB = /^fb\.1\.\d{10,13}\.[\w.-]{1,500}$/;
  try {
    const id = new URLSearchParams(location.search).get("fbclid") || "";
    if (/^[\w-]{10,500}$/.test(id) && JSON.parse(localStorage.getItem("women.fbclid.v1") || "{}").id !== id)
      localStorage.setItem("women.fbclid.v1", JSON.stringify({ id, ms: Date.now() }));
  } catch { /* optional */ }
  window.womenMetaIds = () => {
    try {
      const cookie = (n) => decodeURIComponent((document.cookie.match("(?:^|; )" + n + "=([^;]*)") || [])[1] || "");
      const click = JSON.parse(localStorage.getItem("women.fbclid.v1") || "null");
      const fbp = cookie("_fbp"), fbc = cookie("_fbc") || (click?.id ? "fb.1." + click.ms + "." + click.id : "");
      return { ...(FB.test(fbp) ? { fbp } : {}), ...(FB.test(fbc) ? { fbc } : {}) };
    } catch { return {}; }
  };
}
(() => {
  "use strict";
  if (window.__womenNoTrack) return;
  const measurementId = "G-NB8PZCX35Z";
  const host = location.hostname.toLowerCase();
  if (host !== "selectshopeg.com" && host !== "www.selectshopeg.com") return;
  if (new URLSearchParams(location.search).get("design-preview") === "1") return;

  const cleanUrl = new URL(location.href);
  const allowed = new Set(["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "utm_id", "code", "p", "gclid", "fbclid", "igshid", "igsh", "mibextid", "lpv",
    "campaign_id", "adset_id", "ad_id", "placement", "site_source_name", "slug", "collection"]);
  for (const key of [...cleanUrl.searchParams.keys()]) {
    if (!allowed.has(key)) cleanUrl.searchParams.delete(key);
  }
  cleanUrl.hash = "";
  window.dataLayer = window.dataLayer || [];
  window.gtag = window.gtag || function () { window.dataLayer.push(arguments); };
  window.gtag("js", new Date());
  window.gtag("config", measurementId, { page_location: cleanUrl.toString(), send_page_view: true });

  const script = document.createElement("script");
  script.async = true;
  script.src = "https://www.googletagmanager.com/gtag/js?id=" + encodeURIComponent(measurementId);
  document.head.appendChild(script);
})();

// Meta Pixel: no advanced matching or automatic events; never on order-success (private order reference in its URL).
(() => {
  "use strict";
  if (window.__womenNoTrack) return;
  if (!["selectshopeg.com", "www.selectshopeg.com"].includes(location.hostname.toLowerCase())) return;
  if (new URLSearchParams(location.search).get("design-preview") === "1") return;
  if (!["/", "/index.html", "/p/", "/p/index.html", "/cart/", "/cart/index.html", "/checkout/", "/checkout/index.html"].includes(location.pathname) && !location.pathname.startsWith("/lp/") && location.pathname !== "/collections/") return;
  // Any parameter outside the marketing allowlist keeps the Pixel off.
  const permitted = new Set(["utm_source","utm_medium","utm_campaign","utm_content","utm_term","utm_id","code","p","fbclid","igshid","igsh","mibextid","lpv",
    "campaign_id","adset_id","ad_id","placement","site_source_name","slug","collection"]);
  if ([...new URLSearchParams(location.search).keys()].some(k => !permitted.has(k))) return;
  const pixelId = "992616030526349";
  const fbq = window.fbq = window.fbq || function () {
    fbq.callMethod ? fbq.callMethod.apply(fbq, arguments) : fbq.queue.push(arguments);
  };
  if (!window._fbq) window._fbq = fbq;
  fbq.push = fbq; fbq.loaded = true; fbq.version = "2.0"; fbq.queue = fbq.queue || [];
  fbq("set", "autoConfig", false, pixelId);
  fbq("init", pixelId);
  fbq("trackSingle", pixelId, "PageView");
  window.womenMetaEvent = function (name, fields, eventId) {
    try {
      if (!["ViewContent","AddToCart","InitiateCheckout","Lead"].includes(name)) return; // Purchase: server only
      const items = Array.isArray(fields.items) ? fields.items.filter(i => /^SS-\d{4,19}$/.test(i.item_id || "")) : [];
      if (!items.length) return;
      const params = {currency:"EGP",content_type:"product",
        content_ids:items.map(i=>i.item_id),
        contents:items.map(i=>({id:i.item_id,quantity:Number.isInteger(i.quantity)&&i.quantity>0?i.quantity:1}))};
      if (Number.isFinite(fields.value) && fields.value >= 0) params.value=fields.value;
      fbq("trackSingle", pixelId, name, params, eventId ? {eventID:eventId} : {});
    } catch { /* never interrupt checkout */ }
  };
  const script=document.createElement("script");
  script.async=true; script.src="https://connect.facebook.net/en_US/fbevents.js";
  document.head.appendChild(script);
})();
