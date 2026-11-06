// Named garment colours shared by Admin and storefront. Existing names and HEX values are preserved.
// DB stores a single colour NAME. "أسود × أبيض" is ONE option value (not two SKUs or sizes).
// HEX / dual swatches are approximate UI hints; product photos remain the source of truth.
const ENTRIES = [
  [
    "أسود",
    "#1F1B1E",
    "الأساسية والمحايدة"
  ],
  [
    "أبيض",
    "#F7F4EE",
    "الأساسية والمحايدة"
  ],
  [
    "أوف وايت",
    "#EFE8DA",
    "الأساسية والمحايدة"
  ],
  [
    "رمادي",
    "#B8B4B0",
    "الأساسية والمحايدة"
  ],
  [
    "رصاصي",
    "#7E8186",
    "الأساسية والمحايدة"
  ],
  [
    "كحلي",
    "#22304A",
    "الأساسية والمحايدة"
  ],
  [
    "سكري",
    "#F5EDD9",
    "الأساسية والمحايدة"
  ],
  [
    "عاجي",
    "#F2EDE1",
    "الأساسية والمحايدة"
  ],
  [
    "كريمي",
    "#F4E7D3",
    "الأساسية والمحايدة"
  ],
  [
    "فحمي",
    "#46484C",
    "الأساسية والمحايدة"
  ],
  [
    "بيج",
    "#D8C3A5",
    "البيج والبني"
  ],
  [
    "جملي",
    "#B8865B",
    "البيج والبني"
  ],
  [
    "كافيه",
    "#A47E5E",
    "البيج والبني"
  ],
  [
    "بني",
    "#6E4B3A",
    "البيج والبني"
  ],
  [
    "رملي",
    "#CBB697",
    "البيج والبني"
  ],
  [
    "هافان",
    "#92664B",
    "البيج والبني"
  ],
  [
    "تاوب",
    "#9A877F",
    "البيج والبني"
  ],
  [
    "بني فاتح",
    "#A4775C",
    "البيج والبني"
  ],
  [
    "بني غامق",
    "#49352C",
    "البيج والبني"
  ],
  [
    "شوكولاتة",
    "#533123",
    "البيج والبني"
  ],
  [
    "موكا",
    "#806859",
    "البيج والبني"
  ],
  [
    "كراميل",
    "#BD8453",
    "البيج والبني"
  ],
  [
    "بسكوتي",
    "#CFB38D",
    "البيج والبني"
  ],
  [
    "بينك",
    "#E9B7C3",
    "الوردي والأحمر"
  ],
  [
    "روز",
    "#D4A4AF",
    "الوردي والأحمر"
  ],
  [
    "أحمر",
    "#B0262F",
    "الوردي والأحمر"
  ],
  [
    "نبيتي",
    "#6B2737",
    "الوردي والأحمر"
  ],
  [
    "روز غامق",
    "#A76778",
    "الوردي والأحمر"
  ],
  [
    "نود",
    "#CBA6A0",
    "الوردي والأحمر"
  ],
  [
    "سيمون",
    "#F2B19C",
    "الوردي والأحمر"
  ],
  [
    "خوخي",
    "#EDB6A2",
    "الوردي والأحمر"
  ],
  [
    "كورال",
    "#E87770",
    "الوردي والأحمر"
  ],
  [
    "فوشيا",
    "#D52987",
    "الوردي والأحمر"
  ],
  [
    "عنابي",
    "#7D243B",
    "الوردي والأحمر"
  ],
  [
    "بطيخي",
    "#ED6F79",
    "الوردي والأحمر"
  ],
  [
    "وردي ترابي",
    "#B9888C",
    "الوردي والأحمر"
  ],
  [
    "موف",
    "#765268",
    "الموف والبنفسجي"
  ],
  [
    "موف فاتح",
    "#B49DB6",
    "الموف والبنفسجي"
  ],
  [
    "لافندر",
    "#B9A4D5",
    "الموف والبنفسجي"
  ],
  [
    "ليلكي",
    "#C3ADD6",
    "الموف والبنفسجي"
  ],
  [
    "بنفسجي",
    "#653B85",
    "الموف والبنفسجي"
  ],
  [
    "باذنجاني",
    "#482D48",
    "الموف والبنفسجي"
  ],
  [
    "برقوقي",
    "#70405D",
    "الموف والبنفسجي"
  ],
  [
    "بيبي بلو",
    "#A9C8E8",
    "الأزرق"
  ],
  [
    "أزرق",
    "#3D5A99",
    "الأزرق"
  ],
  [
    "لبني",
    "#8CBCE3",
    "الأزرق"
  ],
  [
    "سماوي",
    "#78C8E7",
    "الأزرق"
  ],
  [
    "أزرق ملكي",
    "#244BA0",
    "الأزرق"
  ],
  [
    "جينز",
    "#517AA5",
    "الأزرق"
  ],
  [
    "بترولي",
    "#226B75",
    "الأزرق"
  ],
  [
    "تركواز",
    "#34AAA7",
    "الأزرق"
  ],
  [
    "أزرق فاتح",
    "#A7D4EA",
    "الأزرق"
  ],
  [
    "زيتي",
    "#6B6B3A",
    "الأخضر"
  ],
  [
    "أخضر",
    "#4E7A55",
    "الأخضر"
  ],
  [
    "مينت",
    "#B7DCC8",
    "الأخضر"
  ],
  [
    "فستقي",
    "#A0BB76",
    "الأخضر"
  ],
  [
    "زمردي",
    "#147B64",
    "الأخضر"
  ],
  [
    "ساج",
    "#9CAC94",
    "الأخضر"
  ],
  [
    "كاكي",
    "#9F9367",
    "الأخضر"
  ],
  [
    "أخضر غامق",
    "#254F3B",
    "الأخضر"
  ],
  [
    "أصفر",
    "#E3C35A",
    "ألوان إضافية"
  ],
  [
    "برتقالي",
    "#D9823B",
    "ألوان إضافية"
  ],
  [
    "مستردة",
    "#C3A040",
    "ألوان إضافية"
  ],
  [
    "طوبي",
    "#B95B42",
    "ألوان إضافية"
  ],
  [
    "نحاسي",
    "#B87352",
    "ألوان إضافية"
  ],
  [
    "ذهبي",
    "#C8A353",
    "ألوان إضافية"
  ],
  [
    "فضي",
    "#C0C5C9",
    "ألوان إضافية"
  ],
  [
    "خردلي",
    "#AE912C",
    "ألوان إضافية"
  ],
  [
    "أوف جراي",
    "#C2BEB5",
    "ألوان إضافية"
  ]
];
export const PALETTE = ENTRIES.map(([name, hex, group]) => ({ name, hex, group }));

/** Arabic spelling variants (أ/ا, ى/ي, ة/ه), spaces and case never split one colour. */
export const normName = (s) => String(s || "").trim().replace(/[أإآ]/g, "ا").replace(/ى/g, "ي").replace(/ة/g, "ه")
  .replace(/\s+/g, " ").toLowerCase();

export const namedColour = (name) => PALETTE.find((p) => normName(p.name) === normName(name)) || null;
export const pairName = (first, second) => `${first} × ${second}`;

/** A two-tone garment has one combined colour name and a split swatch. */
export function splitColourPair(name) {
  const parts = String(name || "").split(/\s*×\s*/);
  if (parts.length !== 2) return null;
  const first = namedColour(parts[0]), second = namedColour(parts[1]);
  if (!first || !second || normName(first.name) === normName(second.name)) return null;
  return { first: first.name, second: second.name, firstHex: first.hex, secondHex: second.hex };
}

export const colourKey = (name) => {
  const pair = splitColourPair(name);
  return pair ? [normName(pair.first), normName(pair.second)].sort().join(" × ") : normName(name);
};

/** Safe CSS background value, derived solely from trusted palette HEX entries. */
export const hexOf = (name) => {
  const pair = splitColourPair(name);
  return pair ? `linear-gradient(90deg, ${pair.firstHex} 0 50%, ${pair.secondHex} 50% 100%)` : namedColour(name)?.hex || null;
};

export const isColourName = (name) => /اللون|الالوان|لون|colou?r/i.test(normName(name));
export const isSizeName = (name) => /المقاس|مقاس|size/i.test(normName(name));
