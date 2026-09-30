# Data Model: F15 (no schema changes)

Uses F01 tables only (see `docs/03-domain-model.md`).

## offers
`id, title, description, discount_type (AMOUNT|PERCENT|APR|GIFT), value (cents | percent integer | bps | null for GIFT), valid_from (UTC ms), valid_to (UTC ms, end of day Brussels), eligibility json, is_active, created_by, created_at`

Validation: title 3–80; description ≤ 300; value required unless GIFT; PERCENT 1–100; APR 0–2000 bps; AMOUNT > 0; `valid_to >= valid_from`.

## Eligibility JSON (strict schema)
`customerType: ANY|NEW|RETURNING`, `models: string[] (min 1)`, `countries: string[] (min 1, ISO-2)`, `requiresTradeIn: true`, `requiresFinance: true`, `minBudget: int cents > 0`, `sources: string[] (min 1)`. Unknown keys rejected on write, and cause no-match on read.

## Derived
- `status`: ACTIVE | SCHEDULED | EXPIRED | INACTIVE (from flag, now, dates).
- `appliedCount`, `wonRevenue`: aggregated from `leads.applied_offer_id` where stage WON.
- `endsSoon`: active and `valid_to - now <= 7 days`.

## Writes elsewhere
`leads.applied_offer_id` and `activities(type=OFFER_APPLIED)` are written by F07's WON transaction; F15 supplies validation and the activity text. `audit_log` rows `offer.create|update|toggle|delete`.
