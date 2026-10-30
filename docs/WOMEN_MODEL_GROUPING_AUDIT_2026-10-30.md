# SELECT SHOP WOMEN — SKU colour-family audit (2026-10-30)

**Status:** REVIEW ONLY, NOT LIVE. This PR changes only the public storefront card list; it does **not** merge, archive, delete, or rename any database product or change product inventory/order identities. It must not be merged before PR CI passes and owner approves publishing.

## Grouped in this PR — colours independently confirmed by descriptions and existing reviewed landing-page configs

| Storefront model | Real product codes and verified colours | Product page | Stock / orders |
|---|---|---|---|
| جاكيت جلد | SS-1008 بني, SS-1009 أسود | /lp/ss-1008/ | Kept per original SKU |
| طقم بالون | SS-1037 نبيتي, SS-1035 بني, SS-1036 رصاصي, SS-1038 أسود, SS-1039 أحمر, SS-1040 رمادي | /lp/ballon-suit/ | Kept per original SKU |

These eight public product codes become two cards **in the storefront only**, reducing 39 public cards to 33 at unchanged catalogue state. Their colour selections use the already-generated, multi-colour direct-COD landing pages and their own product codes; old ad/deep links continue to point to real product SKUs. A group is **not** collapsed if its visible members' price or category differ, or only one member is visible.

## Candidate families — need photograph-to-colour verification BEFORE any more grouping

| Proposed family | Candidate codes | Colour evidence / outstanding work |
|---|---|---|
| بلوفر مقلم تريكو | SS-1042, SS-1043, SS-1044 | Names explicitly say أحمر, بينك, أسود × أبيض. Need reviewed shared multi-colour landing page before collapsing storefront |
| سويت شيرت PRA | SS-1015, SS-1027, SS-1028 | Description lists كحلي, أصفر, بني, but each colour is **not** tied to a specific code. Check photos |
| Chinese jacket | SS-1014, SS-1023, SS-1024, SS-1025, SS-1026 | Same title/copy/price; exact colours absent from text. Check photos |
| بلوفر بزرائر تريكو | SS-1019, SS-1021, SS-1022; SS-1020 is draft | Same title/copy; colour unverified, and draft must remain draft |
| Zebra-print sweater | SS-1012, SS-1029, SS-1030 | Same style/copy; colour mapping unverified |
| جاكيت جبردين كاروهات | SS-1031, SS-1032, SS-1033, SS-1034; SS-1016 is draft | Draft lists مارون، أسود، بيج، كحلي، بني, but mapping between the four public SKUs and five colours is unknown |
| Balloon Suit old SKU | SS-1010 | Similar description to grouped suit, but **not** assigned to any confirmed colour. Do not silently join |
| سويت شيرت قطن | SS-1047, SS-1048 | First description mentions بينك × بني; verify photo/cut before treating as the same model |

Do not merge archived SS-1006/SS-1007 into SS-1017/SS-1018 without reviewing old size structures, prices and sales history. Keep SS-1041 as its own design. Do not merge the Balloon pants SS-1046 with a suit.

## Hard release gates

1. Validate real images and each colour-to-SKU mapping. Do not infer from identical descriptions alone.
2. Preserve all existing product codes, media, attribution links, historical orders and SKU stock. No destructive SQL on production.
3. Server must confirm each selected SKU and stock before COD order.
4. Run GitHub unit, Playwright mobile/desktop and Lighthouse CI against PR (including older Instagram links), inspect failures, then obtain separate go-live approval.
5. If the business goal is **one Admin product with colour × size variants**, this PR is **not** that migration. It needs a separate DB design with old-code redirects, per-colour stock transfer, photo mapping, audit/rollback, and historic order reference preservation.
