# Feature Specification: Offers Management & Matching

**Feature Branch**: `015-offers`

**Created**: 2026-09-30

**Status**: Draft

**Input**: User description: "F15 Offers Management & Matching. The VP of Sales creates and manages promotions with a value, a validity period and simple eligibility rules. Salespeople see exactly which currently valid promotions apply to each lead and why. A compact indicator shows how many promotions are active. When closing a deal as won, the promotion used is recorded and the VP sees per-promotion performance." Source: `docs/features/F15-offers.md`.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - See offers applicable to a lead (Priority: P1)

As a rep, I want to see exactly which offers apply to this customer so I can use them in conversation.

**Why this priority**: It puts the deal levers in front of the rep with zero extra clicks (the core value of the feature).

**Independent Test**: Open a returning customer's lead with a trade-in and check that "Loyalty €1.000" and "Winter Trade-in Bonus €1.500" are listed, and that the expired "Summer EV Cashback" is not.

**Acceptance Scenarios**:

1. **Given** a lead (returning customer, DE, aurora-suv, trade-in, finance) and active offers, **When** the rep opens the lead, **Then** the Offers panel lists each matching offer: title, value ("1.500 €", "0 % APR", "5 %"), validity ("until 31 Dec"), a short description, and **why it matches** ("Returning customer · Has trade-in").
2. **Given** an offer whose validity end is in the past, or that is deactivated, or whose validity start is in the future, **When** any lead is opened, **Then** the offer is **not** shown.
3. **Given** no offers match, **When** the rep opens the lead, **Then** the panel shows "No offers apply to this lead" plus a link to "See all active offers".
4. **Given** an offer ending within 7 days, **When** it is shown, **Then** it carries an "Ends soon" badge.

---

### User Story 2 - Active offers strip (Priority: P1)

As any signed-in user, I want a compact always-visible indicator of how many offers are active so I never forget the current promotions.

**Why this priority**: It keeps offers visible on every screen, including outside the lead page.

**Independent Test**: Sign in, check that the top bar shows the active count, open the popover, and check the list and link. Then have a VP deactivate one offer and check that the count drops without a reload.

**Acceptance Scenarios**:

1. **Given** any page in the app, **When** it loads, **Then** the top bar shows "🔥 4 active offers". Clicking opens a popover listing all currently active offers with value and end date, and a link to the offers page.
2. **Given** a VP creates or deactivates an offer, **When** the change is saved, **Then** the strip count updates live, without a manual reload.

---

### User Story 3 - VP manages offers (Priority: P1)

As a VP, I want to create promotions with targeting rules.

**Why this priority**: Without managed offers there is nothing to match.

**Independent Test**: As the VP, create "Autumn Finance 0,9 %" for requiresFinance=true, countries=[DE,AT], valid today to 30 Nov. Then open a matching DE finance lead as a rep and check that it appears.

**Acceptance Scenarios**:

1. **Given** the offers page as a VP, **Then** there is a table of all offers (status: Active / Scheduled / Expired / Inactive, title, value, validity, eligibility summary, times applied, won revenue) with a "New offer" button.
2. **Given** the Create/Edit form, **Then** it has: title (3–80 characters), description (up to 300), discount type (amount in € / percent / finance rate / gift), a value (required unless gift), valid from and to (to on or after from), and eligibility controls: customer type (Any / New / Returning), car models (multi-select from the catalog), countries (multi-select), requires trade-in, requires finance, minimum budget (€), lead sources (multi-select).
3. **When** the VP saves, **Then** the offer is stored, the change is recorded in the audit trail, a live "offer changed" notification is emitted, and matching leads show the offer immediately.
4. **Given** an offer, **When** the VP toggles it, **Then** it is activated or deactivated. Deleting is not offered for offers that have been applied (deactivate only). Unapplied offers can be deleted.
5. **Given** a REP or MANAGER, **Then** the offers page is read-only (active and scheduled offers only), and create/edit/toggle/delete attempts are refused with a permission error.

---

### User Story 4 - Apply an offer when winning (Priority: P1)

As a rep closing a deal, I want to record which offer was used.

**Why this priority**: It enables attribution and offer performance reporting.

**Independent Test**: Mark a lead WON, choose a matching offer, and check that the lead stores it and the timeline shows "Applied: Winter Trade-in Bonus (1.500 €)".

**Acceptance Scenarios**:

1. **Given** the WON dialog (stage pipeline feature), **Then** it lists the offers matched **at that moment** for the lead, and selecting one stores it as the lead's applied offer and adds an "offer applied" timeline entry "Applied: Winter Trade-in Bonus (1.500 €)".
2. **Given** a selected offer that no longer applies (expired, deactivated or lead changed), **When** the deal is won, **Then** the server rejects it with an "offer not applicable" error (validation, 422).

---

### User Story 5 - Offer performance (Priority: P2)

**Why this priority**: Reporting is valuable but not needed to run offers.

**Independent Test**: Win two leads using an offer and check that the VP's offers table shows "Applied 2 times" and the summed revenue.

**Acceptance Scenarios**:

1. **Given** the offers page as a VP, **Then** each offer shows "Applied N times · € revenue of won deals" (dashboards may reuse this).

---

### Edge Cases

- An offer's validity ends while a rep has the lead open: the next refresh (or live notification) removes it, and WON re-validates on the server.
- Timezones: validity is evaluated on the server against stored end-of-day values (Europe/Brussels end of day). The UI shows the dates in the user's locale.
- Overlapping offers: all are shown. Stacking rules are out of scope and only one offer can be applied at WON.
- Eligibility with an empty list (for example `models: []`) is rejected: "select at least one or remove the rule".
- A percent value above 100 or a finance rate above 20 % (2000 basis points) is a validation error.
- A VP edits eligibility on an offer already applied to won leads: allowed. The historical applied offer stays, and the audit trail keeps the before and after.
- An offer with an unknown eligibility rule is treated as not matching and a warning is logged (fail closed).
- A lead with no model fails a models rule, and a lead with unknown budget fails a minimum budget rule.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST decide which offers apply to a lead through a single side-effect-free matching function of (lead, customer, offers, current time) that returns each matching offer with its reasons. No I/O is allowed inside it.
- **FR-002**: An offer is **active** when it is switched on and the current time is between its start and its end. The end is inclusive to 23:59:59 Europe/Brussels on the end date, stored as an absolute end-of-day instant.
- **FR-003**: Eligibility semantics: every present rule must pass (AND), and absent rules impose no restriction.
  - Customer type: Returning requires a returning customer; New requires a non-returning customer; Any passes.
  - Models: the lead's vehicle model is in the list (a lead with no model fails).
  - Countries: the customer's country is in the list.
  - Requires trade-in: the lead has a trade-in. Requires finance: the lead wants finance.
  - Minimum budget: the lead's maximum budget is at least the minimum (unknown budget fails).
  - Sources: the lead's source is in the list.
  - Unknown rules: the offer does not match, and a warning is logged (fail closed).
- **FR-004**: Each passing rule MUST contribute a human-readable reason (for example "Returning customer", "Has trade-in", "Interested in Aurora SUV", "Budget ≥ 30.000 €").
- **FR-005**: Matched offers MUST be sorted by end date soonest first, then highest euro value (amount offers), then title.
- **FR-006**: Eligibility rules MUST be validated on create and update (empty lists, wrong types and unknown rules are rejected).
- **FR-007**: Creating, updating, deactivating and deleting offers is restricted to the VP role. Reading active offers requires being signed in.
- **FR-008**: Viewing the offers for a lead requires permission to read that lead, uses only active offers, and runs the matcher. The active-offer list may be cached, and the cache must be invalidated when offers change.
- **FR-009**: Every offer mutation MUST emit a live "offer changed" notification and write an audit entry (create, update, toggle, delete).
- **FR-010**: Value display: amount → German-locale euro ("1.500 €"); percent → "5 %"; finance rate → "0,9 % APR" (stored as basis points, 90); gift → the description (for example "Free winter tyres").
- **FR-011**: Seed data MUST include at least six offers: "Loyalty Bonus 1.000 €" (returning customers), "Winter Trade-in Bonus 1.500 €" (requires trade-in), "0 % APR Finance" (requires finance, models luma-ev and aurora-suv), "Referral Thank-you 500 €" (source referral), "DACH Winter Tyres" (gift, countries DE, AT, CH), and "Summer EV Cashback" (expired).
- **FR-012**: When a deal is won with an offer selected, the server MUST re-validate that the offer is active and eligible for the lead at that moment, store it as the lead's applied offer (one only), and add the timeline entry. If invalid, the request is rejected with an "offer not applicable" error.
- **FR-013**: The offers list for the VP MUST show status (Active / Scheduled / Expired / Inactive), applied count and won revenue per offer. Non-VP users see only active and scheduled offers.
- **FR-014**: Deleting an offer that has been applied MUST be refused (conflict, "offer in use"), and the offer can only be deactivated.

### Key Entities

- **Offer**: title, description, discount type (amount, percent, finance rate, gift), value (cents or basis points), validity start and end, active flag, eligibility rules; derived status, applied count, won revenue.
- **Eligibility rules**: customer type, models, countries, requires trade-in, requires finance, minimum budget, sources.
- **Lead / Customer**: the facts matched against (model, budget, trade-in, finance wish, source; customer country and returning flag) and the lead's applied offer.
- **Timeline entry (offer applied)** and **Audit entry** (offer create, update, toggle, delete).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: The matching logic is covered by tests exercising every rule and branch, including the expired, future, deactivated and unknown-rule cases (100% branch coverage).
- **SC-002**: A newly created offer appears on matching leads within 2 seconds.
- **SC-003**: An expired seeded offer never appears on any lead or in the active-offers strip.
- **SC-004**: A rep can see matched offers without leaving the lead page (0 extra clicks).

## Assumptions

- The offer value is **not** deducted from the deal value automatically at WON. The rep enters the final deal value and the offer is recorded for attribution.
- Europe/Brussels is used as the validity boundary time zone for all markets (Portugal is 1 hour off, which is acceptable for the demo).
- Offer stacking, coupon codes, per-team or manager-created offers and A/B testing are out of scope.
- The "Currently matches N open leads" live preview in the form is a P2 nice-to-have.
- Depends on the lead detail page providing an offers slot, on the role-based permissions (VP-only management), and on the stage pipeline's WON dialog consuming the matcher (which may be stubbed until this feature lands).
- The customer message template picker ("Use in message" with the offer-share template) belongs to the customer channels feature. This feature only links to it.
