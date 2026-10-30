// WOMEN verified colour families. Display grouping ONLY: original SKU, stock and order identities stay intact.
// Photo-verified on 2026-10-30. No bulk edit or archive is implied by an admin group.
export const MODEL_FAMILIES = [
  {
    "id": "model-0",
    "name": "جاكيت جلد",
    "colors": [
      {
        "code": "SS-1008",
        "name": "بني",
        "hex": "#5A3B2C"
      },
      {
        "code": "SS-1009",
        "name": "أسود",
        "hex": "#1F1B1E"
      }
    ]
  },
  {
    "id": "model-1",
    "name": "طقم بالون",
    "colors": [
      {
        "code": "SS-1037",
        "name": "نبيتي",
        "hex": "#6B2737"
      },
      {
        "code": "SS-1035",
        "name": "بني",
        "hex": "#6E4B3A"
      },
      {
        "code": "SS-1036",
        "name": "رصاصي",
        "hex": "#7E8186"
      },
      {
        "code": "SS-1038",
        "name": "أسود",
        "hex": "#1F1B1E"
      },
      {
        "code": "SS-1039",
        "name": "أحمر",
        "hex": "#B0262F"
      },
      {
        "code": "SS-1040",
        "name": "رمادي",
        "hex": "#B8B4B0"
      },
      {
        "code": "SS-1010",
        "name": "رمادي زيتي",
        "hex": "#898B7D"
      }
    ]
  },
  {
    "id": "model-2",
    "name": "بلوفر مقلم",
    "colors": [
      {
        "code": "SS-1042",
        "name": "أحمر",
        "hex": "#BB3340"
      },
      {
        "code": "SS-1043",
        "name": "بينك",
        "hex": "#D9A5B9"
      },
      {
        "code": "SS-1044",
        "name": "أسود × أبيض",
        "hex": "#28282A"
      }
    ]
  },
  {
    "id": "model-3",
    "name": "سويت شيرت PRA",
    "colors": [
      {
        "code": "SS-1015",
        "name": "أصفر",
        "hex": "#DEE957"
      },
      {
        "code": "SS-1027",
        "name": "بني",
        "hex": "#49352D"
      },
      {
        "code": "SS-1028",
        "name": "كحلي",
        "hex": "#263654"
      }
    ]
  },
  {
    "id": "model-4",
    "name": "جاكيت Chinese",
    "colors": [
      {
        "code": "SS-1014",
        "name": "أحمر",
        "hex": "#AE1E30"
      },
      {
        "code": "SS-1023",
        "name": "بيج",
        "hex": "#C7B39C"
      },
      {
        "code": "SS-1024",
        "name": "بني",
        "hex": "#503027"
      },
      {
        "code": "SS-1025",
        "name": "زيتي",
        "hex": "#52523E"
      },
      {
        "code": "SS-1026",
        "name": "أسود",
        "hex": "#242426"
      }
    ]
  },
  {
    "id": "model-5",
    "name": "بلوفر أزرار",
    "colors": [
      {
        "code": "SS-1019",
        "name": "نبيتي",
        "hex": "#722536"
      },
      {
        "code": "SS-1021",
        "name": "أوف وايت",
        "hex": "#EEEADF"
      },
      {
        "code": "SS-1022",
        "name": "كحلي",
        "hex": "#273451"
      }
    ]
  },
  {
    "id": "model-6",
    "name": "بلوفر Zebra",
    "colors": [
      {
        "code": "SS-1012",
        "name": "أبيض × أسود",
        "hex": "#EEEDE7"
      },
      {
        "code": "SS-1029",
        "name": "بيج × أسود",
        "hex": "#C3AD85"
      },
      {
        "code": "SS-1030",
        "name": "أسود × أبيض",
        "hex": "#222225"
      }
    ]
  },
  {
    "id": "model-7",
    "name": "جاكيت كاروهات",
    "colors": [
      {
        "code": "SS-1031",
        "name": "بيج",
        "hex": "#B7A6A0"
      },
      {
        "code": "SS-1032",
        "name": "بني",
        "hex": "#504840"
      },
      {
        "code": "SS-1033",
        "name": "كحلي",
        "hex": "#2B3652"
      },
      {
        "code": "SS-1034",
        "name": "أسود",
        "hex": "#212025"
      }
    ]
  }
];
/** The protected Admin models.list response becomes authoritative when installed. */
export function adminFamiliesFromApi(models) {
  if (!Array.isArray(models)) return null;
  return models.filter(m => m && m.active === true && typeof m.id === "string" &&
    typeof m.name === "string" && Array.isArray(m.colors))
    .map(m => ({
      id: m.id, name: m.name.trim().slice(0,160),
      category: m.category, version: m.version, persisted: true,
      colors: m.colors.filter(c => c && c.active === true &&
        /^SS-[0-9]{4,19}$/.test(c.code || "") && typeof c.name === "string" &&
        /^#[0-9a-fA-F]{6}$/.test(c.hex || "")).map(c => ({
          id: c.id, code: c.code, name: c.name.trim().slice(0,80), hex: c.hex,
          optionValueId: c.optionValueId || null,
        })),
    })).filter(m => m.colors.length > 0);
}

/** Group filtered list entries without losing any SKU. */
export function groupAdminProducts(products, apiModels = null) {
  const families = adminFamiliesFromApi(apiModels) || MODEL_FAMILIES;
  const byCode = new Map(families.flatMap(f => f.colors.map(c => [c.code,f])));
  const lookup = new Map(products.map(p => [p.public_code,p]));
  const emitted = new Set();
  const output = [];
  for (const product of products) {
    const family = byCode.get(product.public_code);
    // One SKU with multiple colour option values belongs in its native product
    // variant editor; never fabricate multiple independent stock/SKU rows.
    const repeatedSku = family && new Set(family.colors.map(c => c.code)).size !== family.colors.length;
    if (!family || repeatedSku) {
      output.push({ key: product.public_code, family: null, name: product.title, members: [{ product, color: null }] });
      continue;
    }
    if (emitted.has(family.id)) continue;
    emitted.add(family.id);
    const members = family.colors.filter(c => lookup.has(c.code)).map(color => ({ color, product: lookup.get(color.code) }));
    // A filtered list with only one SKU must remain a normal editable row.
    if (members.length < 2) {
      output.push({ key: product.public_code, family: null, name: product.title, members: [{ product, color: members[0]?.color || null }] });
      continue;
    }
    output.push({ key: family.id, family, name: family.name, members });
  }
  return output;
}
