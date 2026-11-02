// Review-only: add several colours to one persisted WOMEN model without publishing any SKU.
// Each new colour is a distinct Draft product; price, images and stock are edited on that SKU.
// The admin registry is authoritative; after an uncertain response, reconcile before retrying.
const el = (tag, className = "", value = "") => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (value) node.textContent = value;
  return node;
};
const field = (caption, type = "text") => {
  const label = el("label", "field");
  label.append(el("span", "", caption));
  const input = el("input", "input");
  input.type = type;
  label.append(input);
  return { label, input };
};
const validCode = code => /^SS-[0-9]{4,19}$/.test(code);
const normalize = name => name.trim().toLocaleLowerCase();
const key = () => Array.from(crypto.getRandomValues(new Uint8Array(16)), x => x.toString(16).padStart(2, "0")).join("");

/** @param {HTMLElement} host
 * @param {any} model
 * @param {(operation:string,args:any)=>Promise<any>} api
 * @param {(message:string)=>Promise<void>|void} onComplete */
export function mountModelColorBatch(host, model, api, onComplete) {
  if (!host || !model?.persisted || !model.id || !Number.isInteger(model.version)) return;
  const frame = el("section", "model-colour-batch");
  frame.append(el("h3", "", "إضافة عدة ألوان للموديل"));
  frame.append(el("p", "muted", "اكتبي كل لون في صف. كل لون جديد بيتعمل كمنتج Draft مستقل بكود SS، وبعدها تظبطي الصور والسعر والمخزون قبل نشره."));
  const rowsHost = el("div", "model-batch-rows");
  const feedback = el("p", "muted");
  feedback.setAttribute("role", "status");
  feedback.setAttribute("aria-live", "polite");
  const rowStates = [];
  let saving = false;
  const save = el("button", "btn btn-primary", "حفظ الألوان");
  save.type = "button";
  const append = el("button", "btn btn-soft", "لون إضافي");
  append.type = "button";

  const addRow = () => {
    if (saving || rowStates.length >= 12) return;
    const item = { key: null, code: "", saved: false, locked: false };
    const wrap = el("div", "model-batch-row");
    const name = field("اسم اللون");
    name.input.maxLength = 80;
    name.input.placeholder = "مثلاً: بيبي بلو";
    const hex = field("درجة اللون", "color");
    hex.input.value = "#829cbb";
    const sku = field("كود منتج موجود (اختياري)");
    sku.input.maxLength = 20;
    sku.input.placeholder = "SS-1050";
    sku.input.dir = "ltr";
    const progress = el("small", "muted");
    progress.setAttribute("role", "status");
    const remove = el("button", "btn btn-ghost", "حذف الصف");
    remove.type = "button";
    remove.addEventListener("click", () => {
      if (saving || item.locked || item.saved) return;
      rowStates.splice(rowStates.indexOf(item), 1);
      wrap.remove();
      append.disabled = rowStates.length >= 12;
    });
    Object.assign(item, { wrap, name: name.input, hex: hex.input, sku: sku.input, progress, remove });
    wrap.append(name.label, hex.label, sku.label, remove, progress);
    rowStates.push(item);
    rowsHost.append(wrap);
    append.disabled = rowStates.length >= 12;
  };
  append.addEventListener("click", addRow);
  addRow(); addRow();
  const report = (row, message) => { row.progress.textContent = message; feedback.textContent = message; };

  const currentModel = async () => {
    const response = await api("models.list", {});
    if (response?.outcome !== "ok" || !Array.isArray(response.data)) throw Error("model_list_unavailable");
    const latest = response.data.find(m => m.id === model.id && m.active === true);
    if (!latest || !Number.isInteger(latest.version) || !Array.isArray(latest.colors)) throw Error("model_missing");
    return latest;
  };

  save.onclick = async () => {
    if (saving) return;
    const selected = rowStates.filter(r => r.name.value.trim() || r.sku.value.trim() || r.saved);
    if (!selected.length) { feedback.textContent = "ضيفي لون واحد على الأقل."; return; }
    const names = new Set((model.colors || []).filter(c => c.active !== false).map(c => normalize(c.name || "")));
    const codes = new Set();
    for (const row of selected) {
      const name = row.name.value.trim();
      const code = row.sku.value.trim().toUpperCase();
      if (!name || name.length > 80 || !/^#[0-9a-f]{6}$/i.test(row.hex.value) ||
          (code && !validCode(code)) || (names.has(normalize(name)) && !row.saved) ||
          (code && codes.has(code))) {
        feedback.textContent = "راجعي أسماء الألوان والكود؛ ممنوع التكرار أو البيانات غير الصحيحة.";
        return;
      }
      names.add(normalize(name)); if (code) codes.add(code);
    }
    saving = true; save.disabled = true; append.disabled = true;
    rowStates.forEach(r => { r.remove.disabled = true; });
    let completed = 0;
    try {
      for (const [i, row] of selected.entries()) {
        if (row.saved) { completed++; continue; }
        report(row, "بنحفظ اللون " + (i + 1) + " من " + selected.length + "…");
        row.locked = true;
        row.name.disabled = row.hex.disabled = row.sku.disabled = true;
        const name = row.name.value.trim(), hex = row.hex.value;
        let sku = row.code || row.sku.value.trim().toUpperCase();
        if (!sku) {
          row.key ||= key(); // Replay the same creation key after a lost network response.
          const created = await api("products.create", {
            idempotency_key: row.key, title: model.name + " " + name,
            description: "", category: model.category, is_new: false
          });
          if (!["created", "existing"].includes(created?.outcome) || !validCode(created.code || "")) {
            throw Error("draft_creation_unconfirmed");
          }
          sku = created.code;
          row.code = sku;
          row.sku.value = sku;
        }
        const latest = await currentModel();
        // If attach succeeded but the response was lost, never attach a second time.
        const registered = latest.colors.find(c => c.code === sku && c.active !== false);
        if (registered) {
          if (registered.name !== name || registered.hex.toLowerCase() !== hex.toLowerCase()) {
            throw Error("sku_attached_differently");
          }
        } else {
          if (latest.colors.some(c => c.active !== false && normalize(c.name) === normalize(name))) {
            throw Error("colour_name_taken");
          }
          const attached = await api("models.attach", {
            modelId: model.id, version: latest.version, code: sku, name, hex
          });
          if (attached?.outcome !== "saved") throw Error(attached?.outcome === "stale" ? "stale" : "attach_unconfirmed");
        }
        row.saved = true;
        completed++;
        report(row, "اتسجل " + name + " بكود " + sku + " (Draft أو حالة المنتج الأصلية).");
      }
      feedback.textContent = "اتسجل " + completed + " لون. راجعي سعر وصور ومخزون كل لون قبل نشره.";
      if (typeof onComplete === "function") await onComplete(feedback.textContent);
    } catch (error) {
      const reasons = {
        draft_creation_unconfirmed: "إنشاء المنتج غير مؤكد؛ إعادة المحاولة بنفس المفتاح آمنة.",
        model_list_unavailable: "مش قادرين نتحقق من حالة الموديل. جرّبي تاني من غير تغيير البيانات.",
        model_missing: "الموديل مش موجود أو اتوقف. حدّثي الصفحة.",
        sku_attached_differently: "الكود مربوط ببيانات لون مختلفة؛ لازم مراجعة.",
        colour_name_taken: "اسم اللون موجود بالفعل في الموديل؛ راجعيه.",
        stale: "الموديل اتعدل أثناء الحفظ؛ جرّبي تاني بعد مراجعة القائمة.",
        attach_unconfirmed: "حالة الربط غير مؤكدة. المحاولة التالية هتراجع الربط الأول."
      };
      feedback.textContent = "اتسجل " + completed + " من " + selected.length + " ألوان. " +
        (reasons[error?.message] || "الاتصال فشل. بنحتفظ بالأكواد للمراجعة وإعادة المحاولة.");
    } finally {
      saving = false; save.disabled = false; append.disabled = rowStates.length >= 12;
      rowStates.forEach(r => { r.remove.disabled = r.locked || r.saved; });
    }
  };
  const actions = el("div", "row");
  actions.append(append, save);
  frame.append(rowsHost, actions, feedback);
  host.append(frame);
}
