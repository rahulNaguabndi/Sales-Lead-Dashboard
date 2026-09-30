# Research: F16 Dashboards

No NEEDS CLARIFICATION items. Decisions follow F16 doc §8 and §11 defaults (see assumptions.md).

| Topic | Decision | Rationale | Alternatives |
|---|---|---|---|
| Aggregation | Compute-on-read SQL aggregates | Small data; F20 can wrap | Rollup tables, materialized views |
| Timezone buckets | Offset of each bucket's date for Europe/Brussels computed in TS (`Intl`), day index in SQL | SQLite has no tz support; DST days may be 23/25 h (documented) | Per-row tz conversion |
| Stage aging | SQLite window function `LEAD()` | Supported by SQLite ≥ 3.25 | Self-join |
| Charts | Recharts | Already in the stack | Visx, ECharts |
| Endpoints | Per widget | Independent errors/loading; finer cache keys | One endpoint |
| Live refresh | SSE event → debounced refetch (5 s, trailing) | Stateless server, bounded load | Push metrics, polling |
| Sparkline series | Daily zero-filled series from the aggregate query | One query per KPI group | Separate queries |
| Overdue follow-ups | `follow_ups.status='PENDING' AND due_at < now` scoped by lead owner; `prev` is null (point in time) | Matches F16 doc sample | Historical snapshots |
| SLA breaches (strip) | Point in time per domain model §6 | Current state | Period-based |
| New dependencies | None | Constitution VIII | — |
