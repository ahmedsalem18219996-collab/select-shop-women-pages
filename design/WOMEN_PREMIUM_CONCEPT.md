# SELECT SHOP WOMEN — premium mobile-first concept (review stage)

Status: **concept for owner review — not implemented, not deployed.** Independent of PR #18.
Visual preview (private canvas): https://claude.ai/artifact/6YqyPJP4ed6uK1cUjQRHYY
Row 1, mobile (390 px): Home, Product, Landing, identity + components. Row 2, desktop (1280 px): Home, Product, Landing.
Both Product artboards have a "multiSizePreview" tweak that previews the future multi-size model (S/M/L/XL, a sold-out size,
and the "اختاري المقاس" order-button state); it is a design preview only, real products stay ONE SIZE.

Scope of this stage: the look and the buying flow for Home, Product page and the ad Landing Page,
designed so one model can later carry several colours and sizes. No database, product or checkout change.

## Identity (new — nothing inherited from the legacy SELECT SHOP design)

| Token | Hex | Use |
|---|---|---|
| Muslin | `#F6F1EF` | page ground (off-white) |
| Mauve mist | `#ECE1E7` | surfaces, image placeholders, footer |
| Dusk mauve | `#7D5A73` | identity colour, display word, secondary button (5.2:1 on Muslin) |
| Aubergine | `#2B1F2A` | text and the primary order button |
| Thread gold | `#A88346` | hairlines and the stitch divider only; gold **text** uses `#7E6131` (5.1:1) |

Type: **Aref Ruqaa** (one or two display words per page, e.g. "بطريقتك.", "جاكيت جلد"),
**IBM Plex Sans Arabic** 400/500/600 for everything else (tabular numbers for prices), **Marcellus** for the SELECT wordmark.

Signature: the **pinking-shears edge** (tailor's zig-zag cut). It appears on the bottom edge of the hero photo,
as a gold stitch divider, and on the colour swatches, which are drawn as cut fabric samples. Everything else stays quiet.

## Buying flow decisions

- One primary action per screen: the sticky order bar (price + chosen colour/size + "اطلبي دلوقتي"), 54 px tall,
  always visible on Product and Landing pages. It hands off to the **existing** cart + `/checkout/` unchanged.
- Colour = fabric swatch (48 px target) with the colour name written next to "اللون:"; choosing it swaps photos and the public code.
- Size = 44 px chips. Today every product is ONE SIZE, so only "مقاس واحد" is shown. The multi-size states
  (available / selected / sold out, crossed) are drawn on the components artboard and marked **future state**.
- Sticky bar states: ready (verified price) · needs a choice ("اختاري المقاس", future) · unavailable ("—", never an unverified price).
- Only real catalog data: titles, prices, descriptions, photos and the store's own payment/shipping notes.
  No ratings or reviews are shown because none exist yet. Colour hex values on swatches are visual approximations of the colour names.
- Grouping the six "Ballon suit" colour products (SS-1035…SS-1040), the two Leather jackets (SS-1008/SS-1009) and the
  three striped pullovers into one model is **shown as a concept only**; merging products is a later, separate data change.

## Performance budget for the implementation

Same budgets the landing-page CI enforces (Lighthouse mobile ≥ 90, LCP ≤ 2.5 s, CLS ≤ 0.1, TBT ≤ 200 ms):
self-hosted, subset WOFF2 fonts (Arabic + Latin only for the weights used), `font-display: swap`, no font preload competing with
the hero photo, AVIF/WebP hero at 480/800 w with explicit width/height, the pinked edge drawn with a CSS mask (no image),
analytics after idle, no new JS framework.

## Next step after approval

1. Implement the tokens and components in the static site on this branch (home, `/p/`, `/lp/`), keeping every URL, the cart
   key and `/checkout/` untouched.
2. Tests in GitHub Actions only, reusing the landing-page workflow pattern (mock API, no production calls): Playwright
   mobile + desktop for links, colour selection, sticky bar and the full order flow; Lighthouse CI with the budgets above.
3. Open a PR for review. No merge or deploy without owner approval.
