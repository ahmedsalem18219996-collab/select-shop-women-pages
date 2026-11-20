# SELECT SHOP WOMEN — Product Landing Studio + multi-model COD campaigns

Date: 2026-11-19
Status: implementation on isolated review branches only.

## Goal
Prepare four independent product Landing Pages for four separate Meta ads, while letting a shopper discover the other models from the same campaign group and place one combined COD order.

The existing WOMEN storefront, catalog, prices, shipping rules, checkout API, and production data remain the source of truth.

## Agreed product decisions
- Every product keeps its own landing URL: `/lp/?p=SS-XXXX`.
- An Owner-managed campaign group contains 3–5 distinct, already-published product codes. The first launch target is four products.
- Each ad URL points directly to one product LP and includes the same `collection` slug. The LP then shows the other products from that group in a related-products section at the bottom.
- Related-product cards open that product's own LP and preserve the campaign attribution parameters.
- The bottom action bar offers **إضافة للشنطة** and **اطلبي مباشرة**. Direct order remains the existing single-product COD form.
- Adding products from multiple LPs stores them in the same existing cart. The cart and checkout resolve all lines together and submit one COD order with multiple product lines.
- The related-products section explains that shoppers who want more than one model should add each model to the bag, then complete one order from the bag.
- The Owner confirms supplier availability manually by phone before advertising. There is no supplier API, no automated supplier confirmation window, no supplier-based checkout gate, and no automatic supplier-stock deduction.
- Existing virtual variant quantity and current COD order handling are not repurposed as supplier confirmation.
- Each product has three manually uploaded marketing-image slots (Hero, Features, Closing). These stay separate from supplier/gallery photos.
- The Studio does not call Gemini or another image-generation API. Gemini is used manually by the Owner to prepare the three images, then the team uploads them.

## Frontend work
1. Product Landing Studio in Admin: click-to-edit canvas, three marketing image slots, copy/layout/CTA controls, live Mobile + Desktop preview, save draft, Owner-only publish/unpublish.
2. Campaign Collections Admin: create/edit/archive a 3–5 product group, require products to be public, and copy one ad-ready URL per product.
3. Each copied ad URL contains `p`, the shared `collection` slug, and Meta UTM fields.
4. Product LP runtime: fetch the published group and render the other products after the current product page, with responsive cards and safe product-image URLs.
5. Multi-model cart journey: add a model from one LP, open a related model LP, add it, and finish both in one COD checkout.
6. Add Playwright coverage for related cards, attribution-preserving links, the two bottom actions, and one multi-line order.

## Backend work
1. Add review-only migrations for campaign collections and per-product Landing Studio designs.
2. Campaign publishing requires 3–5 products and every product must be public; it does not read supplier snapshots.
3. Public collection reads expose only published collection metadata and public product codes. The bridge returns safe catalog fields only.
4. Landing design writes are audited, versioned, and Owner-published. Price, shipping, stock, supplier data, and buyer data are excluded from the design payload.
5. Keep the existing COD order writer behavior unchanged. The compatibility wrapper is pass-through only; it must not gate orders based on supplier records.
6. Include rollback and isolated SQL contract tests.

## Safety boundaries
- No merge, database migration application, Edge Function deployment, or Production deployment without separate Owner approval.
- Do not change the live WOMEN storefront, existing COD flow, order records, ads, budgets, DNS, or secrets.
- Do not touch SS-DEALS or SELECT-SHOP-CLEAN.
- Public related-product payloads must not include supplier names, supplier quantities, costs, or internal IDs.
- No automatic campaign creation, ad spend, product publish, or Studio publish.
- Test with mocks and isolated CI only until the Owner approves the release.

## Acceptance criteria
- Four separate product LP URLs can be used for four separate ads.
- Every ad URL can render the other products from the same 3–5 product group below the current product.
- Each related card opens the correct product LP and keeps the same campaign group and UTM context.
- A shopper can add at least two different models to the same bag and submit exactly one COD order containing both product lines.
- Direct order remains available for a shopper who wants only the current model.
- Supplier confirmation is a manual phone process and never blocks or alters checkout.
- Mobile and desktop layouts have no horizontal overflow.
- All relevant CI checks pass; no Production action occurs.
