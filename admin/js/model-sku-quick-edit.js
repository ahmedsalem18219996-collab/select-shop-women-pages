// WOMEN review-only Admin SKU quick editor, mounted inside a model colour row.
// Never infer variant position from aggregate stock: read the authoritative product detail.
// Multi-size/variant SKUs must use the full variants editor.
const node = (tag, css = "", text = "") => {
  const e = document.createElement(tag);
  if (css) e.className = css;
  if (text) e.textContent = text;
  return e;
};
const money = minor => (Number.isSafeInteger(minor) && minor > 0 ? (minor / 100).toFixed(2) : "");
const minor = raw => {
  const value = String(raw || "").trim();
  if (!/^(?:0|[1-9]\d{0,6})(?:\.\d{1,2})?$/.test(value)) return null;
  const [whole, decimals = ""] = value.split(".");
  const result = Number(whole) * 100 + Number(decimals.padEnd(2, "0"));
  return Number.isSafeInteger(result) && result >= 100 ? result : null;
};

/** @param {HTMLElement} host
 * @param {string} code
 * @param {(op:string,args:any)=>Promise<any>} api
 * @param {{price:boolean,stock:boolean}} permissions */
export function mountModelSkuQuickEdit(host, code, api, permissions) {
  if (!host || !/^SS-[0-9]{4,19}$/.test(code) ||
      (!permissions?.price && !permissions?.stock)) return;
  const open = node("button", "btn btn-soft btn-sm", "تعديل سريع للسعر والمخزون");
  open.type = "button";
  const panel = node("div", "model-sku-quick-edit");
  panel.hidden = true;
  const status = node("p", "muted");
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");
  panel.append(status);

  let loading = false, saving = false;
  let current = null;
  let inputs = null;

  async function load() {
    const response = await api("products.get", { code });
    if (response?.outcome !== "ok" || !response.data?.product) throw Error("detail_unavailable");
    const product = response.data.product;
    if (!Array.isArray(product.variants) || product.variants.length !== 1) {
      current = null;
      throw Error("multiple_variants");
    }
    const variant = product.variants[0], pos = variant.position;
    if (!Number.isInteger(pos) || pos < 0 || !Number.isInteger(product.structure_version)) {
      throw Error("invalid_variant");
    }
    const row = response.data.stock?.[String(pos)];
    current = {
      code, version: product.structure_version, position: pos,
      price: variant.amount_minor ?? product.base_price?.amount_minor ?? null,
      quantity: Number.isInteger(row?.quantity) ? row.quantity : null,
    };
    return current;
  }

  function inputField(label, type, initial) {
    const field = node("label", "field");
    const title = node("span", "", label);
    const input = node("input", "input", "");
    input.type = type;
    input.value = initial;
    field.append(title, input);
    return { field, input };
  }

  async function update(button, operation, args, done) {
    if (saving) return;
    saving = true; button.disabled = true; status.textContent = "بنحفظ التعديل…";
    try {
      const result = await api(operation, args);
      if (result?.outcome !== "saved") {
        status.textContent = result?.code === "PS002" || result?.outcome === "stale"
          ? "بيانات المنتج اتغيرت. افتحي التعديل السريع تاني قبل الحفظ."
          : "التعديل مش مؤكد. راجعي القيمة قبل إعادة المحاولة.";
        return;
      }
      status.textContent = done;
      // Re-read server state to avoid showing a stale stock/price after concurrent writes.
      const latest = await load();
      if (inputs?.price) inputs.price.value = money(latest.price);
      if (inputs?.qty) inputs.qty.value = latest.quantity === null ? "" : String(latest.quantity);
    } catch {
      status.textContent = "حالة الحفظ غير مؤكدة؛ راجعي القيمة من المنتج قبل المحاولة تاني.";
    } finally { saving = false; button.disabled = false; }
  }

  open.onclick = async () => {
    if (loading || saving) return;
    if (!panel.hidden) { panel.hidden = true; open.setAttribute("aria-expanded", "false"); return; }
    loading = true; open.disabled = true;
    panel.hidden = false; panel.replaceChildren(status); status.textContent = "بنجيب بيانات اللون من لوحة التحكم…";
    try {
      const detail = await load();
      inputs = {};
      if (permissions.price) {
        const price = inputField("سعر اللون بالجنيه", "text", money(detail.price));
        price.input.inputMode = "decimal";
        const save = node("button", "btn btn-primary btn-sm", "حفظ سعر اللون");
        save.type = "button";
        save.onclick = async () => {
          const value = minor(price.input.value);
          if (value === null) { status.textContent = "ادخلي سعر صحيح بالجنيه (1 أو أكتر)."; return; }
          await update(save, "products.set_variant_price", {
            code, version: current.version, position: current.position, amount_minor: value
          }, "اتحفظ سعر اللون.");
        };
        panel.append(price.field, save);
        inputs.price = price.input;
      }
      if (permissions.stock) {
        const qty = inputField("مخزون اللون (قطعة)", "text",
          detail.quantity === null ? "" : String(detail.quantity));
        qty.input.inputMode = "numeric";
        const save = node("button", "btn btn-primary btn-sm", "حفظ مخزون اللون");
        save.type = "button";
        save.onclick = async () => {
          if (!/^(0|[1-9]\d{0,5})$/.test(qty.input.value.trim())) {
            status.textContent = "اكتبي عدد قطع صحيح من 0 إلى 99999."; return;
          }
          await update(save, "products.set_stock", {
            code, version: current.version, position: current.position, quantity: Number(qty.input.value.trim())
          }, "اتحفظ مخزون اللون.");
        };
        panel.append(qty.field, save);
        inputs.qty = qty.input;
      }
      status.textContent = "التعديلات لكل لون فقط. الصور من زر «الصور» الموجود فوق.";
      open.setAttribute("aria-expanded", "true");
    } catch (err) {
      status.textContent = err?.message === "multiple_variants"
        ? "اللون ده فيه أكتر من مقاس/تركيبة. استخدمي «السعر والمخزون» في صفحة المنتج لكل مقاس."
        : "مش قادرين نقرأ بيانات اللون المؤكدة. مفيش أي تغيير اتعمل.";
    } finally { loading = false; open.disabled = false; }
  };
  open.setAttribute("aria-expanded", "false");
  host.append(open, panel);
}
