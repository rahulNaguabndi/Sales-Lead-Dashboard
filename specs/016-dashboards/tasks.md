# Tasks: F16 — Manager & VP Dashboards

**Input**: `specs/016-dashboards/` (plan.md, spec.md, data-model.md, contracts/dashboard-api.md, research.md, quickstart.md)
**Tests**: Requested (constitution V): pure-logic unit tests are written BEFORE their implementation; RBAC tests for every endpoint; Playwright e2e.
**Paths** are relative to the repo root. Owned paths only; shared files are append-only.

## Phase 1: Setup

- [ ] T001 Create the `apps/web/components/dashboard/`, `apps/web/app/(app)/dashboard/`, `apps/web/app/api/dashboard/`, and `apps/web/tests/unit/dashboard/` folders and confirm `recharts` and `@tanstack/react-query` are already in `apps/web/package.json` (add no dependencies)
- [ ] T002 [P] Add the append-only export `export * from './dashboard'` to `packages/shared/src/index.ts`; confirm `packages/shared/src/source-groups.ts` has the 6-group mapping from spec "Key Entities" (append only if something is missing)

## Phase 2: Foundational (blocks all stories)

- [ ] T003 [P] Write unit tests FIRST in `apps/web/tests/unit/dashboard/metrics.test.ts` for the pure helpers: `resolvePeriod` (presets, mtd, custom, prev period of equal length, Europe/Brussels boundaries, the 23:30 UTC bucket edge, the DST day), custom range > 366 days and from > to → `INVALID_RANGE`, `computeDelta` (abs, %, null prev → "New", lowerIsBetter direction semantics), `safeDiv` (zero denominator → null), and zero-filled day/week bucketing (week when span > 60 d)
- [ ] T004 Implement `packages/shared/src/dashboard.ts`: `DashboardFilterSchema` (Zod: `range` enum, `from`/`to`, `teamId`, `ownerId`, `sourceGroup` ∈ SourceGroup; custom requires from and to), and response types per contracts/dashboard-api.md
- [ ] T005 Implement `apps/web/server/services/dashboard-metrics.ts` to make T003 pass (`resolvePeriod`, `computeDelta`, `safeDiv`, `bucketDays`, `STAGE_AGING_TARGETS` = 3 d NEW/CONTACTED, 7 d others)
- [ ] T006 Build the fixture DB helper `apps/web/tests/unit/dashboard/fixture.ts`: an in-memory SQLite DB with the F01 schema, 3 teams, 1 VP, managers and reps, and ~30 leads with activities, stage_history (incl. backward moves), follow_ups, WON/LOST with reasons, null first_response_at, a NOTE-only lead, and leads created at the Brussels midnight boundary. Document hand-computed expectations in `fixture.expected.ts`
- [ ] T007 Implement `resolveFilters(ctx, filters)` and the shared scope predicate in `apps/web/server/services/dashboard.ts`: intersects team/rep with the F03 scope; out of scope → `AppError OUT_OF_SCOPE` (403); a rep not in the selected team → 400 `INVALID_FILTER` "Rep not in selected team"; a REP is pinned to their own leads. Include a small adapter if F03 `scopeFor` is not yet on the branch
- [ ] T008 [P] Implement `apps/web/lib/dashboard-href.ts` `buildInboxHref(filters, extra)` with a unit test `apps/web/tests/unit/dashboard/href.test.ts` written first (emits only `from,to,team,owner,source,sourceGroup,stage,overdue,sla,view`)
- [ ] T009 [P] Implement the shared UI primitives in `apps/web/components/dashboard/`: `ChartCard.tsx` (title, View-as-table toggle, skeleton, empty state "No leads in this period · Try Last 90 days", inline error with Retry), `formatters.ts` (EUR `de-DE`, humanized durations, one-decimal %), `palette.css` tokens (light + dark), `useDashboardFilters.ts` (URL state, default `30d`)
- [ ] T010 [P] Create `apps/web/components/dashboard/tabs.ts` (append-only `{id,label,roles,component}` array, with Overview registered) and the `apps/web/app/(app)/dashboard/page.tsx` shell (role-driven layout, filter bar slot, tab host)

## Phase 3: US1 — Manager sees team health (P1) 🎯 MVP

**Independent test**: Lukas's KPI tiles equal the fixture expectations; `?range=7d` recomputes.

- [ ] T011 [US1] Write failing tests FIRST in `apps/web/tests/unit/dashboard/summary.test.ts`: every KPI (newLeads, coveragePct excluding NOTE-only leads, avgFrtMinutes excluding null, conversionPct by `closed_at`, revenueCents, overdueFollowUps), prev values, the empty period → nulls, strip (slaBreaches, pipelineValueCents, goingCold), scoping to Team DACH
- [ ] T012 [US1] Implement `getSummary(ctx, filters)` in `apps/web/server/services/dashboard.ts` (SQL per plan; the previous period in the same query; daily series zero-filled; includes `scope`, `period`, `generatedAt`)
- [ ] T013 [US1] Add RBAC tests FIRST in `apps/web/tests/unit/dashboard/rbac.summary.test.ts` (REP requesting another teamId → 403, MANAGER another team → 403, VP any team OK, rep not in team → 400, invalid range → 400, unauthenticated → 401), then the route `apps/web/app/api/dashboard/summary/route.ts` (authenticate → Zod → service → JSON error shape)
- [ ] T014 [P] [US1] Implement `KpiTile.tsx`, `KpiRow.tsx`, `StatStrip.tsx` (value, delta chip with icon + text + lower-is-better inversion, "New" when prev is null, "—" with tooltip on null, sparkline, keyboard focus, Enter drills down via `buildInboxHref`) and `FilterBar.tsx` (presets, Team for VP, Rep, Source group, custom range validation message)
- [ ] T015 [US1] Wire `page.tsx` with TanStack Query `['dashboard','summary',filters]` and the Overview tab for MANAGER; the hero tile is New leads

## Phase 4: US2 — Leaderboard and neglected leads (P1)

**Independent test**: the leaderboard rows match the fixture; the overdue cell drills to the matching inbox count.

- [ ] T016 [US2] Write failing tests FIRST in `apps/web/tests/unit/dashboard/leaderboard.test.ts` (all columns, current-owner attribution, a rep with no leads → nulls, sorted data) and RBAC cases (REP → 403; MANAGER of another team → 403; VP requires `teamId`)
- [ ] T017 [US2] Implement `getLeaderboard(ctx, filters)` and `apps/web/app/api/dashboard/leaderboard/route.ts`
- [ ] T018 [P] [US2] Implement `LeaderboardTable.tsx` (TanStack Table, sortable by any column, sticky header, tabular numerals, coverage meter, status icons for overdue/SLA, tooltip on current-owner attribution, cell click → `buildInboxHref` with `owner`, `overdue=1`/`sla=breached`)
- [ ] T019 [US2] Add the e2e test `apps/web/tests/e2e/dashboard.drilldown.spec.ts` (respect `PORT`): Lukas → 6 tiles → click Felix's overdue cell → inbox count equals the cell value

## Phase 5: US3 — VP comparison and sources (P1)

**Independent test**: Isabelle sees org KPIs and 3 team rows; the Team South filter scopes everything.

- [ ] T020 [US3] Write failing tests FIRST in `apps/web/tests/unit/dashboard/sources.test.ts` and `team-comparison.test.ts` (source volume/won/lost/win rate, orgWinRate, division by zero → null, per-team aggregation equals the sum of the leaderboard rows, MANAGER → 403 on team-comparison)
- [ ] T021 [US3] Implement `getSources`, `getLeadsOverTime` (source-group columns, week buckets > 60 d), `getLostReasons` and `getTeamComparison` in `dashboard.ts`, plus routes under `app/api/dashboard/charts/{sources,leads-over-time,lost-reasons}/route.ts` and `app/api/dashboard/team-comparison/route.ts`
- [ ] T022 [P] [US3] Implement `TeamComparisonTable.tsx` (highlights the selected team row), `SourcePerformanceChart.tsx` (two aligned horizontal bar charts, no dual axis, the org average line), `LeadsOverTimeChart.tsx` (stacked columns, 6 fixed group colors, legend, crosshair tooltip), `LostReasonsChart.tsx` (horizontal bars, count + %); each with drill-down, the table toggle and the tooltip
- [ ] T023 [US3] Compose the VP layout (Hero = Revenue won; Row A/B/C) in `page.tsx` and pass the Team filter through all widgets

## Phase 6: US4 — Funnel and stage flow (P1)

**Independent test**: reached and current counts match the fixture, including backward moves.

- [ ] T024 [US4] Write failing tests FIRST in `apps/web/tests/unit/dashboard/funnel.test.ts` (reach via stage_history with distinct leads and backward moves counted once, NEW = all leads in the period, COLD excluded, the current count matches the inbox filter) and `stage-aging.test.ts` (window-function averages, open intervals end at now, the target constants)
- [ ] T025 [US4] Implement `getFunnel`, `getStageAging` and routes `app/api/dashboard/charts/{funnel,stage-aging}/route.ts`
- [ ] T026 [P] [US4] Implement `FunnelChart.tsx` (horizontal bars on a single-hue ordinal ramp, step conversion labels, the tooltip "Reached · Currently here", a click drills down to `stage` + range) and `StageAgingChart.tsx` (emphasis above the threshold, a threshold marker)

## Phase 7: US5 — Rep personal view (P2)

- [ ] T027 [US5] Write failing tests FIRST in `apps/web/tests/unit/dashboard/rep-view.test.ts` (open leads, due today, own coverage/FRT/won/revenue, touches per day, and no other rep's data; REP → 403 on leaderboard/team-comparison/MANAGER-only chart endpoints)
- [ ] T028 [US5] Extend `getSummary` for the REP variant (`openLeads`, `dueToday`, `touchesPerDay`) and gate the MANAGER/VP-only endpoints in the routes
- [ ] T029 [P] [US5] Implement the REP layout in `page.tsx` and a `TouchesPerDayChart.tsx` (single-series column, no legend), with the personal funnel; no leaderboard rendered

## Phase 8: US6 — Live refresh (P2)

- [ ] T030 [US6] Write a failing test FIRST in `apps/web/tests/unit/dashboard/live-refresh.test.ts` (fake timers: a burst of 50 events yields exactly one invalidation per 5 s window, trailing edge; unsubscribes on unmount)
- [ ] T031 [US6] Implement `useLiveRefresh.ts` (subscribes via the F12 SSE hook for `lead.created`, `lead.assigned`, `lead.updated`, `activity.created`; injectable subscriber, a no-op fallback when F12 is absent) and `LiveIndicator.tsx` ("Live ●" pulse, "Updated N s ago" from `generatedAt`)
- [ ] T032 [US6] Extend the e2e `apps/web/tests/e2e/dashboard.live.spec.ts`: submit a Showroom lead routed to Team DACH → the New leads tile increments within 7 s without a reload (skips with a clear message if intake/SSE are not on the branch)

## Phase 9: Polish and cross-cutting

- [ ] T033 [P] Add a palette validator check for the light and dark token sets (`apps/web/tests/unit/dashboard/palette.test.ts`, calling `validate_palette.js` if it exists in the repo, else the contrast checks in TS) and assert that every chart offers the table toggle
- [ ] T034 [P] Empty-data and error states: a test for a team with no leads (tiles "—", charts show the empty state) and a per-widget failure that leaves the other widgets rendered
- [ ] T035 [P] Performance check: a script/test that runs each widget function against the seed DB (`SEED=42`) and logs timings against the < 500 ms budget; add indexes only via an F01 request (log it in REPORT.md)
- [ ] T036 Run `npm run typecheck`, `npm run lint`, `npm test`, and `npm run test:e2e`; walk through quickstart.md; write REPORT.md

## Dependencies and order

- Phase 1 → Phase 2 (T003 before T005; T006 before any service test) → stories.
- US1 is the MVP. US2, US3 and US4 depend only on Phase 2 and on US1's `page.tsx` shell (T015). US5 depends on T012. US6 depends on T015.
- Within each story: tests → service → route → components.
- Parallel: T002, T003, T008, T009 and T010 are mutually independent; component tasks marked [P] can run alongside the service work of the same story.

## Implementation strategy

MVP = Phases 1–3 (manager KPIs). Then add the leaderboard and drill-down, the VP view, the funnel, the REP view, and live refresh. Validate each story at its checkpoint with the quickstart.
