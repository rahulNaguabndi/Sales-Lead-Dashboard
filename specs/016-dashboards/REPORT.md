# F16 Build Report
Status: PARTIAL
Branch: 016-dashboards · Commits: 6
## Acceptance scenarios
| Story/Scenario | Result | Evidence (test name or note) |
|---|---|---|
| US1 Manager KPIs + period compare | ✅ | service.test.ts (getSummary), e2e "manager sees KPI tiles" |
| US2 Leaderboard + drill-down | ✅ | service.test.ts, rbac cases, e2e drill-down to inbox `overdue=1` |
| US3 VP comparison / sources | ✅ | service.test.ts, e2e "VP sees team comparison" |
| US4 Funnel + stage aging | ✅ | service.test.ts (funnel/aging) |
| US5 Rep personal view | ✅ | service.test.ts, e2e "rep sees personal view without leaderboard" |
| US6 Live refresh | 🟡 | F12 already invalidates `['dashboard']` keys (5 s debounce); the dashboard uses those query keys and LiveStatusDot. No dedicated live e2e. |
## Checks
typecheck: pass · lint: pass · unit: all pass after fixing the SC-004 guard · e2e: 4/4 dashboard spec (full suite not run)
## Assumptions made (see assumptions.md)
Rep team rank excluded; stage-aging targets 3/7 days; revenue by closed_at.
## Deviations from spec
- Live refresh reuses F12's invalidator instead of a separate `useLiveRefresh` hook (T030–T032 not implemented separately).
- Layout is chosen via `can('dashboard:org'|'dashboard:team')`, not role names (SC-004 guard).
- Inbox drill-down uses the inbox's real params (`createdFrom/createdTo`).
- Charts are simple Recharts bars; the crosshair tooltip and the org-average line are basic.
- Not done: T033 palette contrast test, T034 empty/error-state tests, T035 performance timing script, dedicated RBAC route test files (RBAC covered in service.test.ts).
## Requires F01 / other-feature changes
None.
## Known issues / follow-ups
Full `test:e2e` suite not run. Untested: dark-mode palette contrast, the custom-range UI.
