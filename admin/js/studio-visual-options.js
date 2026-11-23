// Layer and photo presets adapted from the approved Studio handoff.
const STRIP_TEXT = "اختاري مقاسك واطلبي";
export const TEMPLATES = [
  { name: "صفحة: عنوان وطلب", full: true, shade: "bottom", items: [
    { type: "text", x: 50, y: 6, text: "{name}", fx: "block", font: "Cairo", size: 0.62, in: "drop" },
    { type: "text", x: 50, y: 62, text: "مش هتحتار تلبس إيه النهارده!", fx: "marker", font: "Cairo", size: 1.2, sh: "soft", in: "slide" },
    { type: "text", x: 50, y: 71, text: "طقم جاهز يخلّي طلتك ملفتة في ثواني", font: "Cairo", size: 0.55, sh: "strong", in: "pop", delay: 0.9 },
    { type: "badge", x: 50, y: 79, text: "الدفع عند الاستلام", size: 1.1, in: "pop", delay: 1.2 },
    { type: "badge", x: 50, y: 86, text: "احجزي قطعتك", color: "#ffffff", size: 0.8, in: "pop", delay: 1.5 }] },
  { name: "صفحة: راحة وشياكة", full: true, shade: "bottom", items: [
    { type: "text", x: 50, y: 66, text: "راحة طول اليوم.. وشياكة من غير مجهود", fx: "underline", font: "Changa", size: 1.05, sh: "soft", in: "slide" },
    { type: "text", x: 50, y: 76, text: "قصّة واسعة مريحة", font: "Cairo", size: 0.6, sh: "strong", in: "pop", delay: 0.9 },
    { type: "badge", x: 50, y: 84, text: "احجزي قطعتك", size: 1.05, in: "pop", delay: 1.2 }] },
  { name: "صفحة: تفاصيل", full: true, shade: "both", items: [
    { type: "text", x: 70, y: 9, text: "تفاصيل تفرق عن أي طقم تاني", fx: "sticker", font: "Lalezar", size: 0.5, rot: -4, in: "spin" },
    { type: "dot", x: 44, y: 38, anim: "pulse", delay: 0.6 }, { type: "callout", x: 44, y: 38, x2: 20, y2: 28, text: "سوستة بتصميم جريء", in: "slide", delay: 0.7 },
    { type: "dot", x: 64, y: 47, anim: "pulse", delay: 1 }, { type: "callout", x: 64, y: 47, x2: 78, y2: 58, text: "تطريز بارز", in: "slide", delay: 1.1 },
    { type: "text", x: 50, y: 80, text: "تفاصيل تخطف العين من أول ثانية", fx: "glow", font: "Lalezar", size: 1.1, in: "zoom", delay: 1.4 }] },
  { name: "دعوة للطلب", strip: STRIP_TEXT, items: [
    { type: "badge", x: 50, y: 7, text: "اختيارنا", in: "pop" },
    { type: "text", x: 50, y: 80, text: "اختاري اللي يشبهك", size: 1.2, in: "slide", font: "Lalezar" },
    { type: "arrow", x: 20, y: 62, x2: 30, y2: 74, anim: "shake", delay: 1.4 }] },
  { name: "تفاصيل", items: [
    { type: "dot", x: 40, y: 30, anim: "pulse" }, { type: "callout", x: 40, y: 30, x2: 76, y2: 40, text: "تطريز بارز", in: "slide" },
    { type: "dot", x: 58, y: 56, anim: "pulse", delay: 0.8 }, { type: "callout", x: 58, y: 56, x2: 24, y2: 66, text: "خامة تقيلة", in: "slide", delay: 0.9 }] },
  { name: "جديد وصل", strip: "جديد • وصل النهارده", items: [
    { type: "badge", x: 50, y: 8, text: "جديد", size: 1.4, in: "spin", anim: "heart", color: "#ff2d8a" },
    { type: "text", x: 50, y: 82, text: "وصل الموديل اللي مستنيينه", in: "slide", font: "Changa" }] },
  { name: "اختيارنا", items: [
    { type: "badge", x: 50, y: 88, text: "اختيارنا", size: 1.2, in: "pop" }] },
  { name: "دفع عند الاستلام", items: [
    { type: "badge", x: 50, y: 9, text: "الدفع عند الاستلام", in: "drop", anim: "float", color: "#16a34a" },
    { type: "badge", x: 50, y: 90, text: "عايني قبل ما تدفعي", size: 1.1, in: "pop", delay: 0.8 }] },
  { name: "نيون", items: [
    { type: "text", x: 50, y: 15, text: "ستايلك يبدأ هنا", size: 1.3, in: "zoom", anim: "neon", color: "#ff2d8a", font: "Lalezar" }] },
  { name: "فخامة", items: [
    { type: "circle", x: 50, y: 35, size: 1.3, color: "#ffffff", anim: "pulse" },
    { type: "text", x: 50, y: 86, text: "قطعة واحدة.. ستايل كامل", color: "#ffffff", in: "type", font: "Aref Ruqaa" }] },
  { name: "لفت نظر", items: [
    { type: "circle", x: 50, y: 40, size: 1.1, anim: "pulse" },
    { type: "arrow", x: 18, y: 62, x2: 36, y2: 46, anim: "shake", delay: 0.6 },
    { type: "text", x: 30, y: 70, text: "شوف التفصيلة دي", size: 0.9, in: "slide", delay: 0.9, font: "Marhey" }] },
  { name: "مقاس واحد", items: [
    { type: "badge", x: 50, y: 8, text: "One Size", in: "drop", anim: "swing" },
    { type: "text", x: 50, y: 84, text: "مقاس واحد يناسب أغلب الأجسام", size: 0.9, in: "slide" }] },
  { name: "بسيط", items: [{ type: "badge", x: 50, y: 6, text: "جديد", in: "pop", anim: "float" }] },
  { name: "شريط بس", strip: STRIP_TEXT, items: [] },
];

export const EFFECTS = [
  ['', 'بدون'], ['marker', 'ماركر'], ['block', 'بلوك'], ['underline', 'خط تحت'], ['outline', 'مفرّغ'],
  ['gradient', 'تدرّج'], ['neon', 'نيون'], ['3d', '3D'], ['sticker', 'ستيكر'], ['ribbon', 'شريط'],
  ['split', 'نصّين'], ['glow', 'توهّج'], ['box', 'إطار'], ['pop', 'ظل بارز'], ['shiny', 'لامع'],
  ['aurora', 'شفق'], ['lines', 'ظل مخطّط'], ['glitch', 'جليتش'], ['sparkle', 'نجوم'], ['comic', 'كوميك'],
];
export const ENTRIES = [
  ['', 'افتراضي'], ['side', 'من الجنب'], ['top', 'من فوق'], ['zoom', 'زووم'], ['flip', 'قلب كارت'],
  ['curtain', 'ستارة'], ['rise', 'طلوع'], ['blur', 'تمويه'], ['slide', 'انزلاق'], ['fade', 'ظهور تدريجي'],
];
export const TEXT_ENTRIES = [['pop','نطّة'], ['slide','انزلاق'], ['zoom','زووم'], ['spin','لفّة'], ['drop','سقوط'], ['type','كتابة'], ['blur','تمويه'], ['flip','قلب']];
export const LOOPS = [['none','ثابت'], ['pulse','نبض'], ['float','طفو'], ['swing','تمايل'], ['bounce','نطّ']];
export const TEXT_LOOPS = [...LOOPS, ['shake','هزّة'], ['neon','نيون'], ['heart','قلب']];
export const FONTS = [['','افتراضي'], ['Cairo','كايرو'], ['Changa','تشانجا'], ['El Messiri','المسيري'], ['Aref Ruqaa','عارف رقعة'], ['Marhey','مرحي'], ['Lalezar','لاليزار']];
export const FITS = [['auto','تلقائي'], ['fill','الصورة كاملة'], ['cover','ملء الإطار']];
export const SHADES = [['','بدون'], ['bottom','أسفل'], ['top','أعلى'], ['both','أعلى وأسفل'], ['full','كامل']];
export const SCROLL_HINTS = [
  ['pill','كبسولة زجاجية'], ['arrow','سهم بيتنطط'], ['finger','إصبع بيسحب'], ['shine','نص لامع'],
  ['dots','نقاط جانبية'], ['progress','خط تقدّم'], ['none','من غير'],
];
export const ELEMENTS = [
  ['text','كتابة','T'], ['badge','شارة','★'], ['dot','دايرة بتنوّر','◉'], ['callout','خط شرح','⟋'],
  ['arrow','سهم','➜'], ['circle','دايرة تحديد','◯'], ['icon','أيقونة','✦'], ['strip','شريط كلام','≋'],
];
