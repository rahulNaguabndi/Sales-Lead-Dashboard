# Contract: GET /api/audit

Auth: session cookie (F02). Roles: MANAGER (team scope), VP (all). REP → 403.

## Request
`GET /api/audit?from=&to=&actorId=&action=lead.*&entity=lead&entityId=&leadRef=EDM-2026-00812&cursor=&limit=50`

## 200
```json
{
  "items": [{
    "id": "01J…", "createdAt": 1759240000000,
    "actor": {"id":"u_lukas","name":"Lukas Becker","role":"MANAGER"},
    "action": "lead.assigned", "entity": "lead", "entityId": "01J…",
    "entityLabel": "EDM-2026-00812 · Anna Schmidt",
    "summary": "Owner: Anna Weber → Jonas Fischer (manual)",
    "before": {"owner_id":"u_anna"}, "after": {"owner_id":"u_jonas"},
    "resolved": {"owner_id":{"u_anna":"Anna Weber","u_jonas":"Jonas Fischer"}}
  }],
  "nextCursor": "MTc1OTI0MDAwMDAwMHwwMUo…"
}
```
Non-user actor: `"actor": {"type": "SYSTEM" | "INTAKE" | "JOB"}`. `nextCursor` is `null` on the last page.

## Errors
| Status | Code | When |
|---|---|---|
| 400 | INVALID_FILTER | bad date, limit, action, entity or cursor |
| 401 | UNAUTHENTICATED | no session |
| 403 | FORBIDDEN | REP |

## Guarantees
Newest first by `(created_at, id)`. No secrets, note text or plaintext emails in any field. Read-only: no other methods exposed (405).

## Page `/audit`
Query params mirror the API filters (FR-011). REP → 403 page. Lead detail link: `/audit?entity=lead&entityId=<id>`.
