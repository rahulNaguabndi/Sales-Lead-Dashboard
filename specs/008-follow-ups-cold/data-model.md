# Data Model: F08 (no schema changes; tables owned by F01)

## follow_ups
`id, lead_id, assigned_to, due_at (UTC ms), status, note, created_by, created_at, completed_at, completed_by_activity_id`. Index `(assigned_to, status, due_at)`.

### State transitions
```
PENDING → DONE       (complete: with activity or "Mark done")
PENDING → CANCELLED  (cancel, superseded, lead closed)
PENDING → MISSED     (sweeper: due_at < now − MISSED_AFTER_HOURS)
PENDING → PENDING    (snooze: due_at changes)
```
DONE, MISSED and CANCELLED are terminal.

### Invariants
- At most one PENDING per `(lead_id, assigned_to)`.
- `due_at` in `(now − 60 s, now + 90 d]` at create/snooze.
- Overdue = PENDING and `due_at < now` (derived).

## Reads / writes on other entities
| Entity | Access |
|---|---|
| leads | read `stage, owner_id, last_contact_at, created_at, attempt_count`; stage change only through F07 service |
| activities | insert SYSTEM `FOLLOW_UP_SCHEDULED` (metadata.action: scheduled/snoozed/done_without_activity/cancelled/superseded), `FOLLOW_UP_MISSED`, `AUTO_COLD` |
| customers | read `preferred_channel, best_time` for cadence and list rows |
| stage_history | written by F07 with `changed_by = null`, reason "No activity 7 days" / "3 unanswered attempts" |

## Constants (`packages/shared/src/followup-rules.ts`)
`AT_RISK_DAYS=3`, `COLD_AFTER_DAYS=7`, `COLD_AFTER_UNANSWERED=3`, `MISSED_AFTER_HOURS=24`, `DUE_SOON_MINUTES=5`, `CADENCE` (5 steps), env-overridable except `DUE_SOON_MINUTES` and `CADENCE`.
