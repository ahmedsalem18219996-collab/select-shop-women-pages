export const STUDIO_COPY = {
  titles: {
    label: 'عناوين', visual: { fx:'underline', in:'slide', anim:'none' },
    phrases: [
      'ستايل يناسبك بطريقتك', 'إطلالتك الجاية تبدأ من هنا', 'اختاري اللي يشبهك',
      'تفاصيل تكمّل إطلالتك', 'أناقة بسيطة تلبسيها كل يوم', 'قطعة واحدة تغيّر اللوك كله', 'شتا بشياكة',
    ],
  },
  subtitles: {
    label: 'سطر تحت العنوان', visual: { fx:'', in:'blur', anim:'none' },
    phrases: [
      'شوفي القطعة وعايني قبل ما تدفعي', 'ألوان ومقاسات تختاريها قبل ما تأكدي',
      'تتنسّق بسهولة مع هدومك', 'تتلبس في الشغل وفي الخروجة',
    ],
  },
  trust: {
    label: 'ثقة', visual: { fx:'box', in:'pop', anim:'none' },
    phrases: [
      'الدفع عند الاستلام', 'عايني قبل ما تدفعي', 'شحن لكل المحافظات',
      'اختاري لونك ومقاسك قبل التأكيد', 'هنكلمك نأكد طلبك معاكي',
    ],
  },
  cta: {
    label: 'دعوة للطلب', visual: { fx:'block', in:'slide', anim:'pulse' },
    phrases: [
      'اطلبي دلوقتي · الدفع عند الاستلام', 'احجزي قطعتك', 'اختاري مقاسك واطلبي', 'سجّلي طلبك بخطوات بسيطة',
    ],
  },
  badges: {
    label: 'شارات', visual: { fx:'sticker', in:'pop', anim:'none' },
    phrases: ['جديد', 'تشكيلة الشتا', 'اختيارنا', 'موديل مميز'],
  },
};

const RESTRICTED = /قبل[\s\p{P}]+(?:ال)?نفاد|اخر[\s\p{P}]+(?:ال)?قطع|خصم|ضمان|استبدال|استرجاع|خلال[\s\p{P}]+(?:(?:\d+(?:[.,٫]\d+)?|[\p{L}]+(?:\s+[\p{L}]+){0,2})\s+)?(?:ايام|يوم(?:ا|ين)?)(?!\p{L})/u;
const AMOUNT = String.raw`(?:\d+(?:[.,٬٫ ]\d+)*)`;
const CURRENCY = String.raw`(?:جنيه(?:ا|ات)?|ج(?:[.\s]*م\.?)?|egp|l\.?e\.?|[$£€])`;
const PRICE = new RegExp(String.raw`${AMOUNT}\s*${CURRENCY}(?!\p{L})|(?:${CURRENCY}|السعر|سعر)(?!\p{L})[\s:=–-]*${AMOUNT}`, 'u');

export function getStudioCopyWarnings(value) {
  const normalized = String(value ?? '').normalize('NFKC')
    .replace(/[\p{M}\p{Cf}\u0640]/gu, '').replace(/[أإآٱ]/g, 'ا')
    .replace(/[٠-٩]/g, digit => String(digit.charCodeAt(0) - 0x660))
    .replace(/[۰-۹]/g, digit => String(digit.charCodeAt(0) - 0x6f0))
    .toLowerCase();
  return { restricted: RESTRICTED.test(normalized), price: PRICE.test(normalized) };
}

export function getStudioStackCopyWarnings(stack) {
  const texts = (stack?.photos || []).flatMap(photo => [photo.strip, ...(photo.overlays || [])].map(layer => layer?.text));
  const warnings = texts.map(getStudioCopyWarnings);
  return { restricted: warnings.some(warning => warning.restricted), price: warnings.some(warning => warning.price) };
}
