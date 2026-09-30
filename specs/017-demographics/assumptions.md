# F17 Assumptions & Self-Answered Clarifications

| # | Question | Answer | Source |
|---|---|---|---|
| 1 | Channel mix per lead or per customer? | Per lead | docs/features/F17 §11 default, Decision 5 |
| 2 | Are thresholds 20 / 30 / 5 configurable by the VP? | No, fixed constants `DEMOGRAPHICS_MIN_SAMPLE` in `packages/shared` | F17 FR-006, §11 default |
| 3 | Country breakdown as a chart or only a filter? | Filter only | F17 §11 default |
| 4 | Is the channel-mix threshold applied to the band's lead count (created in period), and conversion to closed leads? | Yes: conversion uses closed-in-period leads (n = WON+LOST); channel mix and heatmap use leads created in period | F17 FR-003/004/005 |
| 5 | What does the heatmap row n (for row share) include? | Leads of the band created in period **with a model**; leads without a model are excluded and counted in `excluded.noModel` | F17 FR-005, §9 response shape |
| 6 | Is the row-level n of the heatmap suppressed too? | Only cells under 5 are suppressed. The row n is shown (it is an aggregate ≥ any cell). Row share is computed from the full row, so suppressed cells don't distort the others | inferred |
| 7 | Which filters apply to conversion (closed-in-period) vs. the created-in-period charts? | The same filter row (range, team, sourceGroup, country) applies to all; only the date column differs (`closed_at` vs `created_at`) | F17 FR-007, domain model §6 |
| 8 | How is "org average" conversion computed for the reference line? | Conversion over all in-scope closed leads in the period, including customers with UNKNOWN age, using the same filters; a suppressed org average (0 closed) is hidden | inferred from F17 §7/§9 (`orgConversionPct`) |
| 9 | Is `orgConversionPct` subject to suppression? | Not on a minimum sample (it is a total), but it is `null` when there are 0 closed leads | inferred |
| 10 | F16 not yet merged: how are the scope predicate, period resolver, `ChartCard`, `FilterBar`, `useLiveRefresh` and the tab registry treated? | Code against the F16 names in the README/F16 spec. If absent at build time, add thin stubs inside F17-owned paths (`components/dashboard/demographics/_f16-stubs.ts`) replaced at merge. `tabs.ts` gets an append-only entry | docs/features/README.md same-wave rule |
| 11 | Who is allowed on the API? | MANAGER and VP. REP gets 403 `FORBIDDEN`. Unauthenticated gets 401 | F17 FR-001, F02/F03 conventions |
| 12 | Manager `teamId` filter passed explicitly? | Ignored/rejected: a manager's scope is always their team; a foreign `teamId` returns an empty result set within scope (intersection), not an error | F17 US-4.1, inferred |
| 13 | Insight line wording/selection on ties | Highest value wins, ties broken by band order then model/channel catalog order (deterministic) | inferred (FR-009) |
| 14 | "Fewer than X" comparison: strict? | Suppressed when `n < threshold`, so 19 suppressed / 20 shown, 29 / 30, 4 / 5 | F17 §9 tests |
| 15 | Table view representation | A toggle "Chart / Table" per chart card rendering an accessible `<table>` | F17 FR-008 |
| 16 | Live refresh | Reuses F16 `useLiveRefresh`; no new events | F17 §9 |
| 17 | Caching | None in F17 (F20 candidate) | F17 §9 |
