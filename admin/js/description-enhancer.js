// SELECT SHOP WOMEN: free, offline, deterministic description polishing.
// Runs locally in Admin. It never calls an external service, invents garment
// attributes, saves an order, or publishes a product.
//
// This is template-based rewriting, NOT a generative-AI model.
const collapse = (s) => String(s || '').replace(/\r/g, '').replace(/[ \t]+/g, ' ').trim();
const unmark = (s) => s.replace(/^[\s•\-*]+/, '').replace(/[\s.!؟،;؛]+$/, '').trim();
const MAX_DESCRIPTION = 10000;

export function improveProductDescription({ title = '', description = '' } = {}) {
  const raw = collapse(description);
  if (raw.length < 6) {
    return { ok: false, message: 'اكتبي تفاصيل بسيطة عن المنتج الأول، زي الخامة أو اللون أو المقاس.' };
  }
  if (/^اكتشفي .+ من SELECT SHOP\.\n\nتفاصيل المنتج:/s.test(raw)) {
    return { ok: false, message: 'الوصف متحسّن بالفعل. تقدري تعدّليه يدويًا أو تحفظيه.' };
  }
  const name = unmark(collapse(title)) || 'الموديل';
  // Only reorder the staff-supplied claims. Never infer fabric, comfort,
  // availability, sizing, provenance, or colors from a product category.
  const parts = raw.split(/\n+|[،,؛;]+|[.!؟]+(?=\s|$)/u).map(unmark).filter(Boolean);
  const unique = [];
  const seen = new Set();
  for (const part of parts) {
    const key = part.toLocaleLowerCase('ar').replace(/\s+/g,' ');
    if (!seen.has(key)) { unique.push(part); seen.add(key); }
  }
  if (!unique.length) return { ok: false, message: 'اكتبي تفاصيل المنتج الأول.' };
  const facts = unique.map(x => '• ' + x).join('\n');
  const text = `اكتشفي ${name} من SELECT SHOP.

تفاصيل المنتج:
${facts}

راجعي الألوان والمقاسات المتاحة على صفحة المنتج واختاري الأنسب ليكي.`;
  if (text.length > MAX_DESCRIPTION) {
    return { ok: false, message: 'الوصف طويل جدًا للتحسين التلقائي. اختصري التفاصيل الأول من غير حذف المعلومات المهمة.' };
  }
  if (text === raw) return { ok: false, message: 'الوصف الحالي جاهز.' };
  return { ok: true, text };
}

// The DOM changes are local to the draft textarea. Saving is still exclusively
// handled by the existing create/update-text handlers and Admin permissions.
export function mountDescriptionEnhancer(root, { textarea, titleInput }) {
  const field = root.querySelector(textarea);
  const title = root.querySelector(titleInput);
  const wrap = field?.closest('.field')?.nextElementSibling;
  const improve = wrap?.querySelector('[data-desc-improve]');
  const undo = wrap?.querySelector('[data-desc-undo]');
  const status = wrap?.querySelector('[data-desc-message]');
  if (!field || !improve || !undo || !status) return;
  if (field.disabled) { improve.disabled = true; return; }

  let before = null;
  let generated = null;
  improve.addEventListener('click', () => {
    const suggestion = improveProductDescription({ title: title?.value || '', description: field.value });
    if (!suggestion.ok) { status.textContent = suggestion.message; return; }
    before = field.value;
    generated = suggestion.text;
    field.value = generated;
    field.dispatchEvent(new Event('input', { bubbles: true }));
    undo.hidden = false;
    status.textContent = 'الوصف اتحسّن في الخانة. راجعيه وعدّليه براحتك، وبعدها اضغطي حفظ. مفيش نشر تلقائي.';
    field.focus();
  });
  undo.addEventListener('click', () => {
    if (before === null) return;
    field.value = before;
    field.dispatchEvent(new Event('input', { bubbles: true }));
    generated = null;
    before = null;
    undo.hidden = true;
    status.textContent = 'رجعنا للوصف الأصلي. التعديل مش محفوظ لحد ما تضغطي حفظ.';
    field.focus();
  });
  field.addEventListener('input', () => {
    if (before !== null && field.value !== generated && field.value !== before) {
      // Do not make undo discard edits that staff typed after polishing.
      before = null;
      generated = null;
      undo.hidden = true;
      status.textContent = 'عدّلتي الوصف بنفسك. اضغطي حفظ لما تخلصي.';
    }
  });
}
