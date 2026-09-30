# Data Model: F06 — Activity Logging

No schema changes. Tables per `docs/03-domain-model.md`.

## Writes per save
| Table | Operation | Fields |
|---|---|---|
| `activities` | INSERT ×(1 + N system) | USER row: `kind=USER, type, outcome, note, actor_id, ai_assisted, metadata.clientRequestId`. SYSTEM rows: `STAGE_CHANGED {from,to,reason}`, `FOLLOW_UP_SCHEDULED {followUpId,dueAt}`, `SCORE_CHANGED {fromPriority,toPriority,fromScore,toScore}` |
| `leads` | UPDATE | `attempt_count`, `first_response_at`, `last_activity_at`, `last_contact_at`, `stage`, `score`, `priority`, `score_breakdown`, `version+1`, `updated_at` |
| `stage_history` | INSERT (0–2) | auto-advance (`auto:first_activity` / `auto:revive`) and explicit change |
| `follow_ups` | INSERT (0–1) / UPDATE (0–1) | new PENDING with `assigned_to = owner_id ?? actor`; completion sets `status=DONE, completed_at, completed_by_activity_id` |
| `audit_log` | INSERT | `action='activity.create'`, entity `lead`, before/after of changed lead fields |

## Validation (CreateActivitySchema)
- `clientRequestId`: ULID. `type`: 7 values. `outcome`: optional enum; required for CALL/WHATSAPP/SMS/EMAIL, forbidden for NOTE.
- `note`: control chars (except `\n`, `\t`) stripped, trimmed, 1–2000 chars.
- `nextFollowUp.dueAt`: ≥ now + 1 min and ≤ now + 90 days; `note` ≤ 200.
- `stageChange.to`: open stages only (not WON/LOST/COLD).
- `completeFollowUpId`: ULID, optional. `expectedVersion`: int, optional. `aiAssisted`: boolean, default false.

## Attempt counter truth table
| Type / outcome | Result |
|---|---|
| contact type + NO_ANSWER/VOICEMAIL | +1 |
| any CONNECTED/INTERESTED/NOT_INTERESTED/CALLBACK_REQUESTED, or MEETING/TEST_DRIVE | 0 |
| NOTE | unchanged |

## State transitions
Auto-advance: NEW + contact → CONTACTED; COLD + contact → CONTACTED; NOTE never. Closed (WON/LOST) leads never change stage from F06.
