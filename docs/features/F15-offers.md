# F15 — Offers Management & Matching

| Field | Value |
|---|---|
| **ID** | F15 |
| **Priority** | P1 |
| **Build wave** | 3 |
| **Depends on** | F05 (detail page offers slot), F03 (VP-only management) |
| **Blocks** | F18 (the AI draft includes offers), F07 WON dialog (consumes the matcher; F07 can stub it until F15 lands) |
| **Personas** | VP (manage), REP and MANAGER (view/apply) |
| **Challenge req.** | — |
| **Owns (files/areas)** | `apps/web/server/services/offer-matcher.ts`, `packages/shared/src/offer-eligibility.ts` (append-only), `apps/web/app/(app)/offers/**`, `apps/web/app/api/offers/**`, `apps/web/app/api/leads/[id]/offers/route.ts`, `apps/web/components/offers/**` |

## 1. Summary
VPs create and manage dealership promotions (loyalty discounts, trade-in bonuses, 0% finance, seasonal cashback) with simple **eligibility rules**. A pure **matcher** decides which active offers apply to each lead. Reps see matched offers on the lead detail page, and a compact **"active offers" strip** in the top bar, so they never miss a deal lever. Offers applied at WON are recorded, which lets the VP see which offers convert.

## 2. User Stories & Acceptance Scenarios

### US-1 (P1): See offers applicable to a lead
*As a rep, I want to see exactly which offers apply to this customer so I can use them in conversation.*

**Independent test:** Open a returning customer's lead with a trade-in and check that "Loyalty €1.000" and "Winter Trade-in Bonus €1.500" are listed, and that the expired "Summer EV Cashback" is not.

1. **Given** a lead (returning customer, DE, aurora-suv, trade-in, finance) and active offers, **Then** the Offers panel lists each matching offer: title, value ("1.500 €", "0 % APR", "5 %"), validity ("until 31 Dec"), a short description, and **why it matches** ("Returning customer · Has trade-in").
2. **Given** an offer whose `valid_to` is in the past, or `is_active=false`, or whose `valid_from` is in the future, **Then** it is **not** shown.
3. **Given** no offers match, **Then** the panel shows "No offers apply to this lead" plus a link to "See all active offers".
4. Offers ending within 7 days show an "Ends soon" badge.

### US-2 (P1): Active offers strip
1. **Given** any page in the app, **Then** the top bar shows "🔥 4 active offers". Clicking opens a popover listing all currently active offers with value and end date, and a link to `/offers`.
2. **Given** a VP creates or deactivates an offer, **Then** the strip count updates live via `offer.changed` (F12).

### US-3 (P1): VP manages offers
*As a VP, I want to create promotions with targeting rules.*

**Independent test:** As Isabelle, create "Autumn Finance 0,9 %" for requiresFinance=true, countries=[DE,AT], valid today to 30 Nov. Then open a matching DE finance lead as a rep and check that it appears.

1. **Given** `/offers` as a VP, **Then** there's a table of all offers (status: Active / Scheduled / Expired / Inactive, title, value, validity, eligibility summary, times applied, won revenue €) with a "New offer" button.
2. The Create/Edit form has: title (3–80), description (≤ 300), discount type (`AMOUNT` € / `PERCENT` / `APR` / `GIFT`), a value (required unless GIFT), valid from and to (to ≥ from), and eligibility builder controls: customer type (Any / New / Returning), models (multi-select from the catalog), countries (multi-select), requires trade-in, requires finance, minimum budget (€), sources (multi-select).
3. **When** I save, **Then** the offer is stored, audited, `offer.changed` is emitted, and matching leads show it immediately.
4. Deactivate/activate is a toggle. Delete is not offered for offers that have been applied (soft-deactivate only). Unapplied offers can be deleted.
5. **Given** a REP or MANAGER, **Then** `/offers` is read-only (active and scheduled only), and create/edit endpoints return 403.

### US-4 (P1): Apply an offer when winning
1. **Given** the F07 WON dialog, **Then** it lists the offers matched **now** for the lead, and selecting one stores `leads.applied_offer_id` and adds an `OFFER_APPLIED` activity "Applied: Winter Trade-in Bonus (1.500 €)".
2. The server re-validates eligibility and validity at WON time (422 `OFFER_NOT_APPLICABLE` if the offer no longer applies).

### US-5 (P2): Offer performance
1. **Given** `/offers` as a VP, **Then** each offer shows "Applied N times · € revenue of won deals" (the dashboard F16 may reuse this).

## 3. Functional Requirements
- **FR-001**: `matchOffers(lead, customer, offers, now) → Array<{ offer, reasons: string[] }>` MUST be a **pure function** in `packages/shared/src/offer-eligibility.ts`, with no I/O.
- **FR-002**: An offer is **active** when `is_active = 1 AND valid_from ≤ now ≤ valid_to` (valid_to inclusive to 23:59:59 in Europe/Brussels. Stored as UTC ms at the end of the day).
- **FR-003**: Eligibility semantics: every present key must pass (AND). Absent keys impose no restriction.
  - `customerType`: RETURNING → `customer.isReturning`; NEW → `!isReturning`; ANY → pass
  - `models`: `lead.vehicle_model ∈ models` (a lead with no model fails)
  - `countries`: `customer.country ∈ countries`
  - `requiresTradeIn: true` → `lead.has_trade_in`; `requiresFinance: true` → `lead.wants_finance`
  - `minBudget` (cents): `lead.budget_max ≥ minBudget` (unknown budget fails)
  - `sources`: `lead.source ∈ sources`
  - Unknown keys: the offer is treated as **not matching**, and a warning is logged (fail closed).
- **FR-004**: Each passing rule contributes a human-readable reason (for example "Returning customer", "Has trade-in", "Interested in Aurora SUV", "Budget ≥ 30.000 €").
- **FR-005**: The matched offers are sorted by: ends soonest first, then highest € value (AMOUNT), then title.
- **FR-006**: The eligibility JSON MUST be validated with a Zod schema on create/update (`OfferEligibilitySchema`).
- **FR-007**: Offer create/update/deactivate/delete requires `offer:manage` (VP only). Reading active offers requires authentication.
- **FR-008**: `GET /api/leads/:id/offers` authorizes `lead:read`, loads active offers (cacheable; see F20, key `cache:offers:active`) and runs the matcher.
- **FR-009**: Mutations emit `offer.changed {offerId}` and write `audit_log` (`offer.create|update|toggle|delete`).
- **FR-010**: Value display: AMOUNT → `Intl de-DE EUR` ("1.500 €"); PERCENT → "5 %"; APR → "0,9 % APR" (stored as basis points: 90); GIFT → the description (e.g. "Free winter tyres").
- **FR-011**: Seed data (F01) includes ≥ 6 offers: "Loyalty Bonus 1.000 €" (RETURNING), "Winter Trade-in Bonus 1.500 €" (requiresTradeIn), "0 % APR Finance" (requiresFinance, models [luma-ev, aurora-suv]), "Referral Thank-you 500 €" (sources [REFERRAL]), "DACH Winter Tyres" (GIFT, countries [DE,AT,CH]), and **"Summer EV Cashback" (expired)**.

## 4. Key Entities & Data
`offers` (all columns), `leads` (vehicle_model, budget_max, has_trade_in, wants_finance, source, applied_offer_id), `customers` (country, is_returning), `activities` (OFFER_APPLIED), `audit_log`.

## 5. Edge Cases & Error Handling
- An offer's validity ends while a rep has the lead open: the next refetch (or `offer.changed`) removes it, and WON re-validates on the server.
- Timezones: validity is computed on the server in UTC against stored end-of-day values. The UI shows the dates in the user's locale.
- Overlapping offers: all of them are shown. Stacking rules are out of scope, and only one can be applied at WON.
- An eligibility with an empty array (`models: []`): Zod rejects it ("select at least one or remove the rule").
- A PERCENT value > 100 or an APR > 2000 bps: validation error.
- A VP edits eligibility on an offer already applied to won leads: allowed. Historical `applied_offer_id` stays, and the audit log keeps the before/after.

## 6. Success Criteria
- **SC-001**: The matcher has 100% branch coverage in unit tests, including the expired, future and unknown-key cases.
- **SC-002**: A newly created offer appears on matching leads within 2 s (live event plus refetch).
- **SC-003**: An expired seeded offer never appears on any lead or in the strip.
- **SC-004**: A rep can see matched offers without leaving the lead page (0 extra clicks).

## 7. UX Notes
- The Offers panel sits in the lead detail right column under the channel bar. It uses compact cards: a colored value pill (green), the title, "until 31 Dec", and reason chips in muted text. "Use in message" opens the F14 template picker with `offer_share` preselected.
- Top-bar strip: a flame icon plus "4 active offers". The popover list has a max height of 320 px.
- `/offers`: a table with status chips (Active green, Scheduled blue, Expired grey, Inactive outline). The form is a dialog with the eligibility builder in a "Who is eligible?" section. A live preview reads "Currently matches 37 open leads" (a count via the matcher over open leads; P2).

## 8. Decisions
| # | Decision | Alternatives | Rationale |
|---|---|---|---|
| 1 | Declarative eligibility JSON with AND semantics | A rules engine (json-rules-engine); code per offer | It covers realistic dealership promos, is easy to validate and explain, and has no dependencies |
| 2 | A pure shared matcher | SQL-based matching | Testable, reusable (server, WON validation, AI context). The offer count is tiny |
| 3 | Fail closed on unknown keys | Ignore unknown keys | Never show an offer the customer may not be entitled to |
| 4 | Only one applied offer per won lead | Several/stacking | Simplicity. Stacking policy is a business decision for later |
| 5 | Soft-deactivate offers that have been applied | Hard delete | Preserves reporting integrity |
| 6 | VP-only management | Managers manage team offers | It matches personas. Pricing is a senior decision |

## 9. Technical Plan Input
**Endpoints**
```json
// GET /api/offers?status=active|all      (all = VP only)
{ "offers": [ { "id":"o_1","title":"Winter Trade-in Bonus","description":"Extra 1.500 € on your trade-in",
   "discountType":"AMOUNT","value":150000,"validFrom":1790000000000,"validTo":1798761599000,"isActive":true,
   "eligibility":{"requiresTradeIn":true},"status":"ACTIVE","appliedCount":12,"wonRevenue":45200000 } ] }

// POST /api/offers          (VP)
{ "title":"Autumn Finance 0,9 %","description":"0,9 % APR over 48 months","discountType":"APR","value":90,
  "validFrom":1790000000000,"validTo":1796083199000,"eligibility":{"requiresFinance":true,"countries":["DE","AT"]} }
// 201 { "offer": { ... } }

// PATCH /api/offers/:id     (VP)  partial fields or { "isActive": false }
// DELETE /api/offers/:id    (VP)  409 OFFER_IN_USE if it has been applied

// GET /api/leads/:id/offers
{ "offers": [ { "offer": { ... }, "reasons": ["Returning customer","Has trade-in"], "endsSoon": false } ] }
```
**Modules:** `packages/shared/src/offer-eligibility.ts` (`OfferEligibilitySchema`, `isOfferActive`, `matchOffers`, `formatOfferValue`), `server/services/offer-matcher.ts` (loads active offers, with an optional cache from F20, and the lead context), `app/(app)/offers/page.tsx`, `components/offers/{OffersPanel, OffersStrip, OfferForm, EligibilityBuilder}.tsx`.
**Events:** `offer.changed`. **Cache:** `cache:offers:active`, invalidated on `offer.changed` (F20 decides the TTL).
**Tests:** matcher table-driven tests (every rule, AND combos, expired/future/inactive, unknown key), Zod validation tests, RBAC (a rep gets 403 on POST), a WON re-validation test, a Playwright test (VP creates an offer → the rep sees it on a matching lead).

## 10. Out of Scope
- Offer stacking and exclusivity rules, and coupon codes.
- Per-team or manager-created offers.
- A/B testing of offers.

## 11. Open Questions
- Should the offer value be deducted from `deal_value` automatically at WON? Proposed: no. The rep enters the final deal value, and the offer is recorded for attribution.
- Timezone for validity boundaries: is Europe/Brussels acceptable for all markets? Proposed: yes (all the teams use CET, except PT which is 1 h off; acceptable for the demo).

## 12. Spec Kit Prompts
**`/speckit.specify`**
> The VP of Sales creates and manages promotions such as loyalty discounts, trade-in bonuses, low-rate finance, referral rewards and free extras. Each has a value in euros, a percentage or a finance rate, a validity period, and simple rules for who is eligible: new or returning customers, specific car models, countries, customers with a trade-in, customers wanting finance, a minimum budget, or specific lead sources. On every lead, salespeople see exactly which currently valid promotions apply to that customer and why, with ones ending soon highlighted. Expired, future or deactivated promotions never appear. A compact indicator on every screen shows how many promotions are active. When closing a deal as won, the salesperson can record which promotion was used, and the VP can see how often each promotion was used and the revenue of deals that used it. Other roles can view promotions but not change them.

**`/speckit.plan`**
> A pure `matchOffers(lead, customer, offers, now)` plus `OfferEligibilitySchema` (Zod, fail-closed on unknown keys) in `packages/shared/src/offer-eligibility.ts`. Drizzle/SQLite `offers` table from F01, with values in integer cents or basis points. Route handlers `/api/offers` (CRUD, VP-only via F03 `offer:manage`, audited) and `/api/leads/:id/offers`. `offer.changed` is published on the Redis bus for F12 live updates, and the active-offers list is cacheable under `cache:offers:active` (F20). UI: OffersPanel in the F05 detail slot, OffersStrip in the top bar, and a `/offers` table plus a shadcn Dialog form with an EligibilityBuilder. The F07 WON dialog consumes the matcher. Intl de-DE formatting. Vitest table-driven matcher tests, Playwright for VP create → rep sees it.
