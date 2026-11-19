# SELECT SHOP WOMEN — supplier-confirmed collections and product Studio

Date: 2026-11-19
Status: implementation plan; isolated branches only.

## Goal
Keep the current WOMEN storefront and its existing catalog untouched while building a separate workflow for supplier-confirmed products, product landing-page preparation, and campaign collections containing 3–5 different models.

## Product decisions
- The public catalog remains independent from campaign collections. A product may stay on the website without being in an ad collection.
- Each product keeps its own existing product landing URL: `/lp/?p=SS-...`.
- A campaign collection is a separate landing page that displays 3–5 different products and links each card to that product's own landing page.
- Supplier availability is a separate, timestamped supplier snapshot. It must never reuse or overwrite the virtual variant quantity (currently defaulted to 100).
- A collection can only be published when every selected product is public, has an active assigned supplier, has a positive supplier quantity, and the supplier quantity was confirmed within the last 24 hours. This 24-hour freshness window is the safe default.
- The product Studio generates a Gemini-ready prompt from product data, lets the owner copy it and open Google AI Studio, then upload the generated image into product media as hidden. The owner must review and explicitly unhide/choose a cover before the image appears publicly.
- No Gemini image API calls are enabled in this phase. Google's current image API pricing lists no free tier for Nano Banana image models; use the AI Studio UI/manual upload flow to avoid surprise spend. Revisit API automation only after explicit budget approval.

## Frontend work (this repository)
1. Add supplier picker to product creation and product editor; display supplier name in Admin only.
2. Add supplier-availability quantity, last-confirmed time, and stale/mismatch states without changing virtual stock or checkout behavior.
3. Add a Product Studio view with product photo selection, clothing-safe prompt templates, copy/open AI Studio actions, hidden upload, review/unhide, and product LP preview link.
4. Add Campaign Collections Admin: draft/list/edit/archive, select/reorder 3–5 eligible products, show stock blockers, and publish only after validation.
5. Add public `/collections/?slug=...` page. It displays published collection products only, preserves UTM parameters, and links each product to `/lp/?p=CODE`. It must never return supplier names, supplier quantities, costs, or private IDs.
6. Add unit and Playwright tests with an in-memory mock only. Add CI coverage for Admin and collection-page changes.

## Backend work (backend repository)
1. Additive, review-only SQL migration for supplier stock snapshots and campaign collection headers/items.
2. RLS enabled; no browser-role table grants; privileged access only through existing authenticated Admin dispatcher.
3. Add fail-closed Admin operations for supplier stock and collection management; enforce permissions, supplier scope, positive/fresh stock, product publication, 3–5 item bounds, audit logging, and optimistic version checks.
4. Add a public read-only RPC that returns only published collection metadata and product codes after rechecking current supplier-stock freshness.
5. Extend the existing WOMEN bridge with a public GET collection route that returns safe catalog fields only.
6. Add rollback and SQL regression tests.

## Safety boundaries
- Do not merge either branch.
- Do not deploy frontend, Edge Functions, or database migrations.
- Do not touch the live WOMEN storefront, the SS-DEALS project, the CLEAN project, orders, ads, budgets, DNS, or secrets.
- Do not place supplier name, supplier quantity, cost, or internal identifiers in public payloads.
- No auto-publish of products, collections, or generated images.
- Test only with mocks and isolated CI.

## Acceptance criteria
- Existing live storefront remains unchanged.
- Product supplier and supplier stock are distinct from virtual variant stock.
- Stale/missing/mismatched supplier stock blocks collection publishing.
- Collections contain 3–5 different products; each product card links to its own product LP.
- Gemini output remains hidden until manually reviewed and accepted.
- All available CI checks pass; no production action occurs.

## Update — Product Landing Studio (replaces the Gemini-to-gallery Studio above)
- The Studio no longer uploads anything into the product gallery. Per product there are 3 marketing image slots (Hero, Features, Closing), uploaded by hand; supplier/gallery photos stay separate. Nothing calls any image-generation service (the prompt helper is copy-only).
- Controls: template, section order and visibility, background, font, title/description/features, CTA (text, colour, position, shape, size, animation), dividers, order-card style and field layout. Live Mobile + Desktop preview = the real landing page in an iframe fed the unsaved draft; ordering is disabled inside the preview.
- Lifecycle: save draft (Staff with edit rights or Owner), reopen, preview, publish/unpublish (Owner only). The old link `/lp/?p=SS-XXXX` is unchanged; a design never carries a price, shipping or stock value.
- Orders: the CTA scrolls to the existing order form; the order is the unchanged checkout flow. After a confirmed order the visit's ad parameters (utm_*, ad set) are recorded separately, fire-and-forget, never with buyer data; Admin order detail shows them.
- Supplier confirmation validity is Owner-configurable (default 24h). Products that have a supplier confirmation can only take new orders while it is valid and covers the quantity; products without one behave as before. No automatic deduction.
- Server work (migrations, rollback, bridge routes) lives in the private backend repository and is NOT applied or deployed.
