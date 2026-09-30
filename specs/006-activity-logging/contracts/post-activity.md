# Contract: POST /api/leads/:id/activities

Headers: `Content-Type: application/json`, same-origin `Origin` (CSRF), session cookie. Body ≤ 16 KB.

## Request (`CreateActivitySchema`)
```json
{
  "clientRequestId": "01J9ZC…",
  "type": "CALL",
  "outcome": "NO_ANSWER",
  "note": "Called customer, no answer.",
  "aiAssisted": false,
  "nextFollowUp": { "dueAt": "2026-10-01T08:00:00.000Z", "note": "Try WhatsApp" },
  "completeFollowUpId": "01J9…",
  "stageChange": { "to": "QUALIFIED" },
  "expectedVersion": 7
}
```

## 201 Created
```json
{
  "activity": { "id": "…", "kind": "USER", "type": "CALL", "outcome": "NO_ANSWER", "note": "…",
                "actor": { "id": "…", "name": "Sofia Rossi", "avatarColor": "#7c3aed" }, "aiAssisted": false,
                "metadata": { "clientRequestId": "01J9ZC…" }, "createdAt": 0 },
  "systemActivities": [ { "id": "…", "kind": "SYSTEM", "type": "STAGE_CHANGED", "metadata": { "from": "NEW", "to": "CONTACTED", "reason": "auto:first_activity" }, "createdAt": 0 } ],
  "lead": { "id": "…", "stage": "CONTACTED", "score": 58, "priority": "WARM", "scoreBreakdown": {}, "attemptCount": 1,
            "firstResponseAt": 0, "lastActivityAt": 0, "version": 8 },
  "followUp": { "id": "…", "dueAt": 0, "status": "PENDING", "assignedTo": "…" }
}
```
An idempotent replay (same `clientRequestId`, same lead, < 10 min) returns 201 with the original payload and writes nothing.

## Errors
| Status | Code | When |
|---|---|---|
| 400 | `VALIDATION_ERROR` (+ `fields`) | schema failure, body too large/invalid JSON |
| 401 | `UNAUTHENTICATED` | no session |
| 403 | `FORBIDDEN` | readable but not permitted (e.g. rep on pool lead), or bad Origin |
| 404 | `NOT_FOUND` | lead missing or out of scope |
| 409 | `STALE_LEAD` `{currentVersion, updatedBy}` | `expectedVersion` mismatch with a stage change |
| 422 | `INVALID_TRANSITION` / `INVALID_FOLLOW_UP` | illegal stage move (incl. WON/LOST); follow-up not on this lead or not pending |
| 500 | `INTERNAL` | unexpected failure; nothing written |

## Events (after commit)
`activity.created` per inserted activity in order, then `lead.updated { leadId, changed: { stage?, score?, priority?, lastActivityAt, attemptCount } }`.

No PUT/PATCH/DELETE exist (FR-006).
