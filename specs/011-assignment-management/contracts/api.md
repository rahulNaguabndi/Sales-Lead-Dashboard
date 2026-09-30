# API Contracts: F11

All endpoints: JSON only, session cookie, Origin check; error shape `{ "error": { "code", "message", ... } }`.

| Method & path | Auth | Body | Success | Errors |
|---|---|---|---|---|
| `POST /api/leads/:id/claim` | REP+ in the lead's team | `{}` | 200 `{lead:{id,ownerId,assignedAt,version}}` | 409 `ALREADY_ASSIGNED {ownerName}`, 422 `CLAIM_LIMIT`, 403/404 out of scope |
| `POST /api/leads/:id/assign` | `lead:assign` (MANAGER in scope, VP) | `{toUserId: string\|null, reason?, version}` | 200 `{lead}` (no-op if the same owner) | 403, 404, 409 `VERSION_CONFLICT`, 422 `TARGET_INACTIVE` |
| `POST /api/leads/assign` | as above, per lead | `{leadIds[≤100], toUserId\|null, reason?}` | 200 `{assigned:n}` | 403 `FORBIDDEN {leadIds}`, 400 too many, 422 |
| `GET /api/teams/:id/assignees?leadId=` | MANAGER/VP in scope | — | 200 `[{id,name,openLeads,languages,languageMatch,atLimit}]`, sorted by languageMatch desc, openLeads asc | 403 |
| `GET /api/teams/settings` | MANAGER (own team), VP (all) | — | 200 `[{id,name,autoAssign,assignStrategy,reps:[{id,name,isActive,maxOpenLeads,openLeads,languages}]}]` | 403 for REP |
| `PATCH /api/teams/:id/settings` | `team:configure` | `{autoAssign, assignStrategy: LOAD_BALANCED\|LANGUAGE_MATCH\|ROUND_ROBIN, reps?:[{id,isActive?,maxOpenLeads?}]}` | 200 updated settings | 400 invalid strategy, 403 |
| `POST /api/teams/:id/rebalance` | `team:configure` | `{}` | 200 `{assigned:n}` | 403 |

**Event** `lead.assigned` `{leadId, fromOwnerId, toOwnerId, by, method, teamId}` published after commit.
