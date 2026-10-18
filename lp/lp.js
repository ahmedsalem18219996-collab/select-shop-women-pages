/* Product landing page for ads: /women/lp/?p=SS-1001
   Reads the public WOMEN catalog only. No prices are calculated here: the order is placed on the secure
   checkout, which quotes the price and shipping on the server. Text is always set with textContent. */
(() => {
  "use strict";
  const API = "https://byluoipdunralsurwebt.supabase.co/functions/v1/women-store-bridge/catalog";
  const CHECKOUT = location.origin + "/select-shop-women-pages"; // Pages checkout goes live only after secure Supabase order API is ready.
  const PHOTO = /^https:\/\/byluoipdunralsurwebt\.supabase\.co\/storage\/v1\/object\/public\/product-media\/media\/[0-9a-f]{32}\.(png|jpg|webp)$/;
  const main = document.getElementById("main");
  const bar = document.getElementById("bar");
  const cta = document.getElementById("cta");
  const wa = document.getElementById("wa");
  const code = String(new URLSearchParams(location.search).get("p") || "").toUpperCase();

  const el = (tag, props, ...kids) => {
    const n = document.createElement(tag);
    Object.entries(props || {}).forEach(([k, v]) => (k === "text" ? (n.textContent = v) : n.setAttribute(k, v)));
    kids.forEach(k => n.append(k));
    return n;
  };
  const note = text => {
    main.replaceChildren(el("p", { class: "note", text }), el("p", { class: "note" }, el("a", { href: "/", text: "شوفي كل المنتجات" })));
    bar.hidden = true;
  };
  const egp = minor => (minor / 100).toLocaleString("en-US", { maximumFractionDigits: 2 });

  async function run() {
    if (!/^SS-\d{4,19}$/.test(code)) return note("اللينك ده مش مكتمل. افتحي المتجر واختاري القطعة.");
    let data;
    try {
      const r = await fetch(API, { headers: { Accept: "application/json" }, cache: "no-store", signal: AbortSignal.timeout(12000) });
      if (!r.ok) throw new Error("http");
      data = await r.json();
    } catch (_) { return note("مش قادرين نحمّل القطعة دلوقتي. جرّبي تاني بعد شوية."); }

    const brand = data.brand || {};
    if (/^\+?[1-9]\d{6,14}$/.test(brand.whatsapp || "")) {
      wa.href = "https://wa.me/" + String(brand.whatsapp).replace(/^\+/, "");
      wa.hidden = false;
    }
    const item = (data.items || []).find(i => i && i.publicCode === code);
    if (!item || !Number.isSafeInteger(item.priceMinor) || item.priceMinor <= 0 || !PHOTO.test(item.image || "")) {
      return note("القطعة دي مش متاحة دلوقتي.");
    }
    const title = String(item.title || "").trim().slice(0, 200);
    document.title = title + " · SELECT SHOP WOMEN";
    const photo = el("div", { class: "photo" }, el("img", { src: item.image, alt: title, width: "800", height: "1000", fetchpriority: "high" }), el("i", { class: "tape" }));
    if (item.isNew) photo.append(el("span", { class: "tag", text: "جديد" }));
    const price = el("div", { class: "price" }, document.createTextNode(egp(item.priceMinor)), el("small", { text: "جنيه" }));
    const points = el("ul", null,
      ...["الدفع عند الاستلام", "الشحن لكل المحافظات. تكلفته بتظهر قبل ما تأكدي الطلب", "هتختاري المقاس في الخطوة الجاية"]
        .map(t => el("li", null, el("b", { text: "✓", "aria-hidden": "true" }), el("span", { text: t }))));
    main.replaceChildren(photo, el("h1", { text: title }), price, points);

    if (item.purchasable === true) {
      cta.href = CHECKOUT + "/select-shop-women-pages/p/?code=" + encodeURIComponent(code);
      cta.removeAttribute("aria-disabled");
    } else {
      cta.textContent = "غير متاح حاليًا";
    }
    bar.hidden = false;
  }
  run();
})();
