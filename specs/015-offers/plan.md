# Implementation Plan: Offers Management & Matching

**Branch**: `015-offers` | **Date**: 2026-09-30 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/015-offers/spec.md`; technical input from `docs/features/F15-offers.md` §9.

## Summary

A pure `matchOffers` plus `OfferEligibilitySchema` (Zod, strict, fail-closed) live in `packages/shared/src/offer-eligibility.ts`. A thin service (`server/services/offer-matcher.ts`) loads offers and lead context, and exposes `getOffersForLead`, `listOffers`, offer CRUD and `validateAppliedOffer` (for F07's WON flow). Route handlers under `/api/offers` and `/api/leads/[id]/offers` validate, authorize (`offer:manage` for VP, `lead:read` for lead offers), call the service, write audit, and publish `offer.changed`. UI: `OffersPanel` (registered in F05 slots), `OffersStrip` (top bar), `/offers` page with table and dialog form incl. `EligibilityBuilder`.

## Technical Context

**Language/Version**: TypeScript strict, Node 20+
**Primary Dependencies**: existing only — Next.js App Router, Zod, Drizzle ORM, shadcn/ui + Tailwind, TanStack Query (if the shell uses it), ioredis via F01 bus. **No new dependencies.**
**Storage**: SQLite `offers`, `leads.applied_offer_id`, `activities` (OFFER_APPLIED), `audit_log`. All F01-owned, **no schema change**.
**Testing**: Vitest (table-driven matcher tests, Zod tests, service/RBAC route tests, WON re-validation test), Playwright (VP creates offer, rep sees it).
**Target Platform**: Web (Next.js server + browser)
**Project Type**: web application (monorepo)
**Performance Goals**: lead offers endpoint p95 < 300 ms (Constitution IX); a handful of offers, so in-memory matching.
**Constraints**: money in integer cents (APR in bps), time in UTC ms; must work with Redis stopped (cache falls through, bus falls back in-process).
**Scale/Scope**: tens of offers, hundreds of leads.

## Constitution Check

| Principle | Status |
|---|---|
| I Spec is truth | Pass. Doc amended if behavior deviates. |
| II Mandatory R1–R3 first | Pass. Additive slot only; no R1–R3 files touched. |
| III Layering | Pass. Routes → Zod → authorize → service → repository; matcher is pure and shared. |
| IV Security | Pass. `authorize` on lead route; `offer:manage` on mutations; Zod at boundaries; no PII logged. |
| V Test-first | Pass. Matcher/schema tests precede implementation; RBAC tests for REP/MANAGER/VP; e2e. |
| VI Integrity | Pass. Mutation plus audit in one transaction; cents/UTC ms. |
| VII Degradation | Pass. Cache optional; bus falls back. |
| VIII Simplicity | Pass. No new deps; declarative JSON rules. |
| IX Performance | Pass. |
| X UX | Pass. Loading/empty/error states; text chips; `Intl` formatting. |

Post-design re-check: pass, no violations.

## Project Structure

### Documentation (this feature)

```text
specs/015-offers/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── assumptions.md
├── contracts/offers-api.md
├── checklists/requirements.md
└── tasks.md
```

### Source Code (owned paths only)

```text
packages/shared/src/offer-eligibility.ts      # OfferEligibilitySchema, isOfferActive, matchOffers, formatOfferValue, offerStatus (append-only, exported via shared index: append one line)
packages/shared/src/offer-eligibility.test.ts
apps/web/server/services/offer-matcher.ts     # loaders, CRUD, getOffersForLead, validateAppliedOffer
apps/web/server/services/offer-matcher.test.ts
apps/web/app/api/offers/route.ts              # GET, POST
apps/web/app/api/offers/[id]/route.ts         # PATCH, DELETE
apps/web/app/api/leads/[id]/offers/route.ts   # GET
apps/web/app/(app)/offers/page.tsx
apps/web/components/offers/{OffersPanel,OffersStrip,OfferForm,EligibilityBuilder,OffersTable}.tsx
apps/web/e2e/offers.spec.ts
```

Append-only shared edits: `components/leads/detail/slots.tsx` (register OffersPanel), top bar slot/nav entry for strip and "Offers" link, `packages/shared` index export, policy action `offer:manage` (F03 defines; if absent, a local VP-role check stub is used and logged in the report).

**Structure Decision**: follow the architecture doc layout; the pure logic in `packages/shared` so server, WON validation and AI context share it.

## Design decisions

- **Active test** (`isOfferActive`): `isActive && validFrom <= now <= validTo`; `validTo` stored as end-of-day Europe/Brussels UTC ms, computed by a helper `endOfDayBrussels(dateStr)` used by form/API when a date (not instant) is supplied.
- **Status**: `INACTIVE` if off; else `SCHEDULED` if now < validFrom; `EXPIRED` if now > validTo; else `ACTIVE`.
- **Unknown keys**: the stored eligibility is parsed loosely by the matcher (`safeParse` with strict schema). Failure → no match plus `console.warn` (no PII). The API create/update uses the strict schema (rejects unknown keys and empty arrays).
- **Sorting**: validTo asc, AMOUNT value desc (non-AMOUNT as 0), title asc.
- **Cache**: `listActiveOffers` reads through F01's cache interface under `cache:offers:active` if available, TTL short (30 s default, F20 may change); invalidated on every mutation. Works with the no-op cache.
- **Applied stats**: `appliedCount` and `wonRevenue` via one grouped query on `leads` where `applied_offer_id` is set and stage WON (sum of `deal_value`).
- **WON integration**: F07 owns the endpoint; F15 exports `validateAppliedOffer(leadId, offerId, now)` throwing `OfferNotApplicableError` (mapped to 422 `OFFER_NOT_APPLICABLE`). Recording the lead's `applied_offer_id` and the `OFFER_APPLIED` activity happens inside F07's WON transaction using the helper `buildOfferAppliedActivity` exported from the service.
- **Live**: publish `offer.changed {offerId}`; the strip and panel subscribe via F12's client hook if present, otherwise poll every 30 s (refetch on focus).
- **Audit**: `offer.create|update|toggle|delete` via F01's `audit.ts` writer in the same transaction.

## Complexity Tracking

No constitution violations. No new dependencies.
