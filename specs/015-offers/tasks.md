# Tasks: Offers Management & Matching

**Input**: `specs/015-offers/` (plan.md, spec.md, data-model.md, contracts/offers-api.md, research.md)
**Tests**: Required (Constitution V): pure-logic tests first, RBAC tests for endpoints, one e2e journey.
**Format**: `- [ ] Tnnn [P?] [US?] Description with file path`. Paths are relative to the repo root.

## Phase 1: Setup

- [X] T001 Confirm F01 scaffolding: locate `packages/shared/src/index.ts`, the `offers` Drizzle table, the cache interface, event bus, audit writer, `authorize`/policy action list and the F05 `components/leads/detail/slots.tsx`. Verify the F01 seed contains the six offers from FR-011 (incl. the expired "Summer EV Cashback"); if not, do not edit the seed and log it under "Requires F01 change". Record stubs needed (missing `offer:manage`, slots, top bar slot) in `specs/015-offers/assumptions.md`.

## Phase 2: Foundational (blocks all stories)

- [X] T002 [P] Write failing Vitest table-driven tests in `packages/shared/src/offer-eligibility.test.ts` for `OfferEligibilitySchema` (valid rules; reject empty arrays, unknown keys, wrong types, `minBudget <= 0`), `OfferInputSchema` (title 3–80, description ≤ 300, value required unless GIFT, PERCENT ≤ 100, APR ≤ 2000, `validTo >= validFrom`), `isOfferActive` (inactive, future, expired, boundary inclusive), `offerStatus`, `formatOfferValue` (1.500 €, 5 %, 0,9 % APR, GIFT description) and `matchOffers` (every rule pass/fail, AND combinations, absent rules, no model fails, unknown budget fails, unknown key fail-closed with warning, reasons text, sort order, endsSoon). Target 100% branch coverage.
- [X] T003 Implement `packages/shared/src/offer-eligibility.ts` (`OfferEligibilitySchema`, `OfferInputSchema`, `isOfferActive`, `offerStatus`, `matchOffers`, `formatOfferValue`, `endOfDayBrussels`) until T002 passes; append its export to `packages/shared/src/index.ts`.
- [X] T004 Write failing service tests in `apps/web/server/services/offer-matcher.test.ts` against a seeded test DB: `listActiveOffers` excludes the seeded expired "Summer EV Cashback"; `getOffersForLead` for a returning DE lead with trade-in returns Loyalty and Winter Trade-in; `validateAppliedOffer` throws `OfferNotApplicableError` for expired, inactive or ineligible offers; applied count and won revenue aggregation; delete of an applied offer throws `OfferInUseError`.
- [X] T005 Implement `apps/web/server/services/offer-matcher.ts` (repository queries, read-through `cache:offers:active` with invalidation on mutation and no-op cache fallback, `listOffers`, `createOffer`/`updateOffer`/`toggleOffer`/`deleteOffer` each in one transaction with an audit entry `offer.create|update|toggle|delete` and an `offer.changed` publish, `getOffersForLead`, `validateAppliedOffer`, `buildOfferAppliedActivity`) until T004 passes.

## Phase 3: US1 — Offers on a lead (P1)

**Independent test**: returning-customer lead with trade-in shows Loyalty and Winter Trade-in, not the expired offer.

- [X] T006 [US1] Write failing RBAC route tests in `apps/web/app/api/leads/[id]/offers/route.test.ts`: REP in scope 200, REP out of scope 403, MANAGER in team 200, VP 200, unauthenticated 401.
- [X] T007 [US1] Implement `apps/web/app/api/leads/[id]/offers/route.ts` (GET: authenticate → `authorize(user,'lead:read',lead)` → `getOffersForLead`).
- [X] T008 [P] [US1] Build `apps/web/components/offers/OffersPanel.tsx`: compact cards (green value pill, title, "until 31 Dec", reason chips, "Ends soon" badge), loading/empty ("No offers apply to this lead" + link to `/offers`)/error states, refetch on `offer.changed`, and a "Use in message" button that opens the F14 picker when available (hidden otherwise).
- [X] T009 [US1] Register `OffersPanel` in `apps/web/components/leads/detail/slots.tsx` (append-only).

## Phase 4: US2 — Active offers strip (P1)

**Independent test**: the top bar shows the count and a popover; the count updates after a VP toggles an offer.

- [X] T010 [US2] Implement `apps/web/app/api/offers/route.ts` GET (`status=active|all|visible`; `all` requires `offer:manage`) and write its RBAC tests in `apps/web/app/api/offers/route.test.ts` (REP/MANAGER `all` → 403, `active` → 200).
- [X] T011 [P] [US2] Build `apps/web/components/offers/OffersStrip.tsx` (flame icon, count, popover max height 320 px, link to `/offers`, subscribe to `offer.changed` via the F12 hook if present, else refetch every 30 s and on focus) and mount it in the top bar (append-only edit of the top-bar slot/registration).

## Phase 5: US3 — VP manages offers (P1)

**Independent test**: the VP creates "Autumn Finance 0,9 %" and a matching lead shows it; a REP gets 403.

- [X] T012 [US3] Write failing RBAC and validation tests in `apps/web/app/api/offers/route.test.ts` and `apps/web/app/api/offers/[id]/route.test.ts`: POST/PATCH/DELETE as REP/MANAGER → 403, VP → 201/200/204, invalid body → 400, delete of applied offer → 409 `OFFER_IN_USE`, audit row written, `offer.changed` published.
- [X] T013 [US3] Implement POST in `apps/web/app/api/offers/route.ts` and PATCH/DELETE in `apps/web/app/api/offers/[id]/route.ts` (validate with Zod → `authorize(user,'offer:manage')` → service).
- [X] T014 [P] [US3] Build `apps/web/components/offers/EligibilityBuilder.tsx` ("Who is eligible?": customer type, models, countries, trade-in, finance, minimum budget €, sources; empty multi-selects omit the rule).
- [X] T015 [US3] Build `apps/web/components/offers/OfferForm.tsx` (dialog; Zod client validation; date inputs converted with `endOfDayBrussels`) and `apps/web/components/offers/OffersTable.tsx` (status chips with text, value, validity, eligibility summary, applied count, won revenue, activate/deactivate toggle, delete only when unapplied; read-only for non-VP).
- [X] T016 [US3] Build `apps/web/app/(app)/offers/page.tsx` (VP sees all, others see active and scheduled, read-only) and append the "Offers" nav entry.

## Phase 6: US4 — Apply offer at WON (P1)

**Independent test**: an ineligible or expired offer is rejected with `OFFER_NOT_APPLICABLE` (422).

- [X] T017 [US4] Add tests in `apps/web/server/services/offer-matcher.test.ts` for WON re-validation (expired between dialog open and submit, deactivated, ineligible lead changes) and for the `OFFER_APPLIED` activity text "Applied: Winter Trade-in Bonus (1.500 €)".
- [X] T018 [US4] Ensure `validateAppliedOffer` and `buildOfferAppliedActivity` are exported and mapped to 422 `OFFER_NOT_APPLICABLE` by a shared `toHttpError` helper entry in the offers service (append-only). If F07 has landed, wire the WON dialog offer picker through `GET /api/leads/:id/offers`. If not, document the interface in the report (F07 consumes it at merge).

## Phase 7: US5 — Offer performance (P2)

- [X] T019 [US5] Verify the table shows "Applied N times · € won revenue" using the aggregation from T005 (seed a WON lead with an applied offer in the test); add a service test for the aggregate counting only WON leads.

## Phase 8: Polish & cross-cutting

- [X] T020 Write the Playwright journey in `apps/web/e2e/offers.spec.ts` (uses `PORT`): the VP creates "Autumn Finance 0,9 %" (finance, DE/AT); the rep opens a matching DE finance lead and sees it; the rep's `POST /api/offers` returns 403; the expired seeded offer never appears in the strip.
- [ ] T021 [P] Run `npm run typecheck`, `npm run lint`, `npm test`, `npm run test:e2e`; verify Redis-off degradation (cache falls through) and fix issues in owned paths.
- [ ] T022 [P] Run the `specs/015-offers/quickstart.md` scenarios and mark each spec acceptance scenario in the report.

## Dependencies

- T001 → T002 → T003 → T004 → T005 → all story phases.
- US1, US2 and US3 depend only on Phase 2. US4 depends on T005. US5 depends on T005 and T015.
- T020 depends on T007, T011, T013, T016.

## Parallel opportunities

T002 ‖ T004 (tests written before their implementations); T008 ‖ T011 ‖ T014.

## Implementation strategy

MVP = Phase 2 + US1 (matcher plus the lead panel). Then the strip, VP management, WON validation, and reporting.
