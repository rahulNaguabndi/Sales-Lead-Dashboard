# Data Model: F11 (no schema changes; owned by F01)

| Table | Columns used | Written by F11 |
|---|---|---|
| `leads` | id, owner_id, team_id, stage, assigned_at, version | owner_id, team_id (VP move), assigned_at, version |
| `users` | id, name, role, team_id, is_active, languages, max_open_leads, last_assigned_at | is_active, max_open_leads (settings); last_assigned_at (every assignment) |
| `teams` | id, name, auto_assign, assign_strategy, rr_cursor | auto_assign, assign_strategy, rr_cursor |
| `follow_ups` | lead_id, owner_id, status | owner of PENDING rows (via F08 `reassignPending`) |
| `activities` | type ASSIGNED / CLAIMED (system), message, metadata | insert only |
| `audit_log` | action `lead.assign`, `team.settings`, `user.update`; before/after | insert only |

**Open lead** = stage ∈ {NEW, CONTACTED, QUALIFIED, TEST_DRIVE, NEGOTIATION}.

**Transitions**: unowned → owned (claim / assign / auto); owned → owned (reassign); owned → unowned (unassign, manager+); team changes only on a VP cross-team assign.

**Activity metadata**: `{ from, to, method: "AUTO"|"MANUAL"|"CLAIM", reason?, fromTeam?, toTeam?, fallback? }`.

**Requires F01 change**: none expected. If a `follow_ups.owner_id` column is named differently, the stub adapts.
