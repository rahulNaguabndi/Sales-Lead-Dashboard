# Data Model: F16 Dashboards

Read-only. No schema changes (schema owned by F01, `docs/03-domain-model.md`).

## Tables read
| Table | Columns used | For |
|---|---|---|
| leads | id, created_at, stage, source, owner_id, team_id, first_response_at, deal_value, closed_at, lost_reason, budget_max, priority | all KPIs, charts |
| activities | lead_id, kind, type, actor_id, created_at | coverage, touches per day |
| stage_history | lead_id, to_stage, changed_at | funnel reach, stage aging |
| follow_ups | lead_id, assigned_to, status, due_at | overdue |
| users, teams | id, name, team_id, role | leaderboard, comparison, filter options |

Indexes relied on: `leads(created_at)`, `leads(team_id, owner_id)`, `leads(source)`, `activities(lead_id, created_at)`, `stage_history(lead_id, changed_at)`, `follow_ups(assigned_to, status, due_at)`.

## Derived types — `packages/shared/src/dashboard.ts`
- `DashboardFilter`: `{range, from?, to?, teamId?, ownerId?, sourceGroup?}` (Zod `DashboardFilterSchema`).
- `ResolvedPeriod`: `{from, to, prevFrom, prevTo, tz}` (UTC ms).
- `Kpi`: `{value: number|null, prev: number|null, series?: {d: string, v: number}[], lowerIsBetter?: boolean}`.
- Response types for each endpoint: see [contracts/dashboard-api.md](contracts/dashboard-api.md).

## Validation rules
- `range=custom` requires `from` and `to`; `from ≤ to`; span ≤ 366 days, else `INVALID_RANGE`.
- `teamId`/`ownerId` must be within scope, else `OUT_OF_SCOPE`; `ownerId` must belong to `teamId` if both are given, else 400.
- `sourceGroup` ∈ SourceGroup enum.
