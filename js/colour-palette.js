// Named colours shared by the Admin colour picker and the storefront swatches.
// The database stores only the colour NAME (an option value); the swatch is derived from it here,
// so no schema change is needed. Unknown names fall back to a neutral swatch.
export const PALETTE = [
  { name: "أسود", hex: "#1F1B1E" }, { name: "أبيض", hex: "#F7F4EE" }, { name: "أوف وايت", hex: "#EFE8DA" },
  { name: "بيج", hex: "#D8C3A5" }, { name: "جملي", hex: "#B8865B" }, { name: "كافيه", hex: "#A47E5E" },
  { name: "بني", hex: "#6E4B3A" }, { name: "رمادي", hex: "#B8B4B0" }, { name: "رصاصي", hex: "#7E8186" },
  { name: "كحلي", hex: "#22304A" }, { name: "بيبي بلو", hex: "#A9C8E8" }, { name: "أزرق", hex: "#3D5A99" },
  { name: "زيتي", hex: "#6B6B3A" }, { name: "أخضر", hex: "#4E7A55" }, { name: "بينك", hex: "#E9B7C3" },
  { name: "روز", hex: "#D4A4AF" }, { name: "موف", hex: "#765268" }, { name: "نبيتي", hex: "#6B2737" },
  { name: "أحمر", hex: "#B0262F" }, { name: "أصفر", hex: "#E3C35A" }, { name: "برتقالي", hex: "#D9823B" },
];

/** Arabic spelling variants (أ/ا, ى/ي, ة/ه) and spaces never split one colour into two. */
export const normName = (s) => String(s || "").trim().replace(/[أإآ]/g, "ا").replace(/ى/g, "ي").replace(/ة/g, "ه")
  .replace(/\s+/g, " ").toLowerCase();

export const hexOf = (name) => PALETTE.find((p) => normName(p.name) === normName(name))?.hex || null;

/** An option whose name says it is the colour (Arabic or English). */
export const isColourName = (name) => /اللون|الالوان|لون|colou?r/i.test(normName(name));
export const isSizeName = (name) => /المقاس|مقاس|size/i.test(normName(name));
