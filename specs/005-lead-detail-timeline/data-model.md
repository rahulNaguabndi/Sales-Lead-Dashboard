# Data Model: F05 (read-only view models)

No schema changes (owned by F01, see `docs/03-domain-model.md`). Money in euro cents, times in UTC ms.

## Read sources
`leads` (all cols) · `customers` · `users` (owner, actors) · `teams` · `activities` (index `lead_id, created_at`) · `follow_ups` (next PENDING by `due_at`, pending count) · previous `leads` for same `customer_id` (excluding current) · `purchases`.

## View models
- **LeadDetail** `{ lead, customer, owner|null, team, history{previousLeads[{id,reference,vehicleModel,stage,createdAt,canView}], purchases[{vehicleModel,amount,purchasedAt}]}, followUps{next|null, pendingCount}, permissions }` — shape in `contracts/api.md`.
- **ActivityItem** `{ id, kind, type, outcome|null, note|null, actor{id,name,avatarColor,isActive}|null, aiAssisted, metadata, createdAt }`.
- **ActivityPage** `{ items[], nextCursor|null }`.
- **LeadPermissions** `{ canRead, canLogActivity, canChangeStage, canAssign, canClaim }`.
- **Cursor**: `base64url("<createdAt>:<id>")`.

## Rules
- `canView` for previous leads = `can(user,'lead:read',prevLead)`.
- `isReturning` from the stored `customers.is_returning`.
- Vehicle name/price from the catalog in `packages/shared`.
- Unknown SYSTEM `type` values pass through unchanged.
