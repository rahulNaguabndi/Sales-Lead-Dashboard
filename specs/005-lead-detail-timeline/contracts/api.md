# Contracts: F05

## GET /api/leads/:id
- 200: `LeadDetail` (see `docs/features/F05-lead-detail-timeline.md` §9 for the full JSON example).
- 401 `{error:{code:"UNAUTHENTICATED"}}` · 404 `{error:{code:"NOT_FOUND",message:"Lead not found"}}` for both missing, malformed id and out-of-scope (byte-identical).
- Side-effect free.

## GET /api/leads/:id/activities
Query (Zod): `order=desc|asc` (default desc) · `kind=ALL|USER|SYSTEM` (default ALL) · `limit` 1–100 (default 50) · `cursor` opaque.
- 200: `{ items: ActivityItem[], nextCursor: string|null }`, ordered by `(created_at, id)` in `order`.
- 400 `VALIDATION` bad query/cursor · 401 · 404 as above (same authorization check as detail).

## UI extension contract
`leadSlots` in `components/leads/detail/slots.tsx`: keys `composer, channels, followUps, offers, ai, customerExtras, headerActions`; value `React.ComponentType<LeadSlotProps> | null`; `LeadSlotProps = { lead, customer, permissions, currentUser }`. Later features change only their own key.

## Query keys
`['lead', id]`, `['lead', id, 'activities', {order, kind}]`.
