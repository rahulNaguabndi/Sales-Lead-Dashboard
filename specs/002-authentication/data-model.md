# Data Model: F02 — Authentication & Sessions

No schema changes (schema owned by F01).

## Read from `users`
`id, name, email (unique, lowercase), password_hash, role, team_id, manager_id, languages, is_active, token_version`. Team name for the user menu comes from `teams.name` via `team_id`.

## Session claims (JWT payload)
| Claim | Type | Notes |
|---|---|---|
| sub | string | user id (ULID) |
| role | `REP`\|`MANAGER`\|`VP` | routing hint only |
| teamId | string \| null | |
| name | string | |
| tv | number | must equal `users.token_version` |
| jti | string | ULID; denylist key |
| iat / exp | seconds | exp = iat + 28800 |

## CurrentUser
`{ id, name, email, role, teamId, managerId, languages }` — always loaded from the DB.

## Redis keys
| Key | Value | TTL |
|---|---|---|
| `auth:revoked:<jti>` | `1` | `exp − now` seconds |
| `rl:login:<ip>:<emailHash>` | failure counter | 900 s (fixed window from first failure) |

In-memory fallback: `Map<key, { count, resetAt }>` with lazy expiry.

## Audit entries (`audit_log`)
| action | entity / entityId | actorId | meta |
|---|---|---|---|
| `auth.login` | `users` / user id | user id | `actorType:USER, userAgent` |
| `auth.login_failed` | `users` / email hash | null | `emailHash, reason` (`INVALID_CREDENTIALS`\|`ACCOUNT_DISABLED`\|`RATE_LIMITED`) |
| `auth.logout` | `users` / user id | user id | `actorType:USER` |
