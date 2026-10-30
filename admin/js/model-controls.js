// WOMEN persisted model editor. Rendered ONLY when authenticated models.list
// confirms that the backend registry is installed; legacy static models never
// show inert Add/Rename controls. No unsafe innerHTML from user data.
const create = (tag, className = "", text = "") => {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text) el.textContent = text;
  return el;
};
const labeled = (caption, type = "text", value = "") => {
  const label = create("label", "field");
  label.append(create("span", "", caption));
  const input = create("input", "input");
  input.type = type;
  input.value = value;
  if (type === "text") input.maxLength = 160;
  label.append(input);
  return { label, input };
};
/** @param {HTMLElement} host
 *  @param {any} model
 *  @param {(op:string,args:any)=>Promise<any>} api
 *  @param {(message:string,code?:string)=>Promise<void>|void} saved */
export function mountModelControls(host, model, api, saved) {
  if (!host || !model?.persisted || !model.id || !Number.isInteger(model.version)) return;
  const frame = create("section", "model-live-editor");
  const status = create("p", "muted");
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");
  const action = async (button, op, args, success, navigateCode) => {
    button.disabled = true; status.textContent = "بنحفظ التغيير…";
    try {
      const r = await api(op, { modelId:model.id, version:model.version, ...args });
      if (r?.outcome === "saved") {
        status.textContent = success;
        await saved(success,navigateCode);
      } else if (r?.outcome === "stale") {
        status.textContent = "فيه تعديل أحدث للموديل. حدّثي الصفحة الأول علشان ما نمسحش تغييرات حد تاني.";
      } else status.textContent = "فشل الحفظ (" + String(r?.outcome || "network") + "). البيانات السابقة محفوظة.";
      return r;
    } catch {
      status.textContent = "الاتصال فشل. لم نؤكد حفظ التعديل.";
      return {outcome:"network"};
    } finally { button.disabled = false; }
  };
  frame.append(create("h3", "", "اسم الموديل والألوان"));
  const title = labeled("اسم الموديل", "text", model.name);
  const saveTitle = create("button", "btn btn-soft", "حفظ اسم الموديل");
  saveTitle.type = "button";
  saveTitle.onclick = () => {
    const name = title.input.value.trim();
    if (name.length < 2 || name.length > 160) {status.textContent="اكتبي اسم صحيح للموديل.";return;}
    void action(saveTitle,"models.update",{name,category:model.category},"اتحفظ اسم الموديل");
  };
  frame.append(title.label,saveTitle);
  const list = create("div", "stack");
  for (const color of model.colors || []) {
    const row = create("div", "model-live-row");
    const name = labeled("اسم اللون " + color.code, "text", color.name);
    name.input.maxLength = 80;
    const hex = labeled("درجة اللون", "color", color.hex);
    const save = create("button", "btn btn-soft", "حفظ اللون");
    save.type = "button";
    save.onclick = () => {
      const n=name.input.value.trim();
      if (!n || n.length>80) {status.textContent="اسم اللون غير صحيح.";return;}
      void action(save,"models.rename_colour",
        {colourId:color.id,name:n,hex:hex.input.value},"اتحفظ اسم اللون ودرجته");
    };
    row.append(name.label,hex.label,save);list.append(row);
  }
  frame.append(list);
  frame.append(create("h3", "", "إضافة لون"));
  const name = labeled("اسم اللون الجديد");
  name.input.placeholder = "مثلاً: بيج";name.input.maxLength=80;
  const hex=labeled("درجة اللون","color","#af9e87");
  const code=labeled("كود منتج موجود (اختياري)");
  code.input.placeholder="SS-1234";
  code.input.dir="ltr";code.input.maxLength=20;
  const add=create("button","btn btn-primary","إضافة اللون");
  add.type="button";
  // A lost response must replay the same create attempt, never make another SKU.
  let creationKey=null;
  let createdCode=null;
  add.onclick=async () => {
    if(add.disabled)return;
    const n=name.input.value.trim(),h=hex.input.value;
    let sku=code.input.value.trim().toUpperCase();
    if (!n || n.length>80 || !/^#[0-9a-fA-F]{6}$/.test(h) ||
      (sku && !/^SS-[0-9]{4,19}$/.test(sku))) {
      status.textContent="اكتبي اسم اللون ودرجته، وكود صحيح لو عندك منتج موجود.";
      return;
    }
    add.disabled=true;
    try {
      if (!sku) {
        if(!creationKey) {
          const bytes=crypto.getRandomValues(new Uint8Array(16));
          creationKey=Array.from(bytes,b=>b.toString(16).padStart(2,"0")).join("");
        }
        const created=await api("products.create",{
          idempotency_key:creationKey,title:model.name+" "+n,description:"",
          category:model.category,is_new:false
        });
        if (!["created","existing"].includes(created?.outcome) || !/^SS-[0-9]{4,19}$/.test(created.code||"")) {
          status.textContent="تعذّر إنشاء منتج Draft جديد. لم نربط أي لون.";
          return;
        }
        sku=created.code;
        createdCode=sku;
        code.input.value=sku;
      }
      const attached=await api("models.attach",{
        modelId:model.id,version:model.version,code:sku,name:n,hex:h
      });
      if (attached?.outcome==="saved") {
        status.textContent="اتضاف اللون. اضبطي السعر والصور والمخزون قبل نشر المنتج.";
        await saved(createdCode===sku ? "اتضاف اللون كمنتج Draft، كمّلي السعر والصور والمخزون." : "اتربط اللون بالمنتج "+sku+". راجعي بياناته قبل النشر.",sku);
      } else {
        // No auto-delete: newly created Draft is preserved for safe reconciliation.
        status.textContent="ربط اللون فشل. كود المنتج "+sku+
          (createdCode===sku ? " محفوظ كـDraft للمراجعة." : " لم نغيّر حالة نشره.")+
          " راجعي حالة الربط قبل إعادة المحاولة.";
      }
    } catch {status.textContent="فشل الاتصال. راجعي المنتج قبل إعادة المحاولة."; }
    finally {add.disabled=false;}
  };
  frame.append(name.label,hex.label,code.label,add);
  frame.append(create("p","muted",
    "لو الكود فاضي هيتعمل منتج Draft جديد؛ لازم سعر وصور وشحن ومخزون قبل النشر. مفيش أي أوردر أو إعلان بيتعمل من هنا."));
  frame.append(status);host.append(frame);
}
