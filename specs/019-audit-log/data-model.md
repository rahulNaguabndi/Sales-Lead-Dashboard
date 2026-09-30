# Data Model: F19 Audit Log

F19 owns **no schema**. It reads F01's tables (see `docs/03-domain-model.md`).

## audit_log (F01, append-only)
`id` (ULID) · `actor_id` (nullable) · `action` · `entity` · `entity_id` · `before` json · `after` json · `meta` json · `ip` · `created_at` (unix ms). Indexes: `(entity, entity_id)`, `(created_at)`. Triggers reject UPDATE/DELETE.

## Read joins
- `users` (id, name, role, team) → actor names/roles, subtree scope
- `leads` (id, reference, team_id, customer name) → scope and `entityLabel`
- `offers` (id, title) → offer labels
- `teams` (id, name) → settings scope

## Derived view types (service output)
- **AuditItem**: `{id, createdAt, actor: {id,name,role} | {type}, action, entity, entityId, entityLabel, summary, before, after, resolved}`
- **AuditFilters**: `{from?, to?, actorId?, action?, entity?, entityId?, leadRef?, cursor?, limit}`
- **Cursor**: base64url(`created_at|id`)

## Validation rules
`limit` 1–100 (default 50); `from ≤ to`; `action` matches `^[a-z_]+\.([a-z_]+|\*)$`; `entity` in AuditEntity; cursor must decode to `<int>|<id>`.

## Actor type mapping
`actor_id` null → `meta.actorType` SYSTEM ("System") / INTAKE ("Website intake") / JOB ("System").
