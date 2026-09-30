# Implementation Plan: F16 — Manager & VP Dashboards

**Branch**: `016-dashboards` | **Date**: 2026-09-30 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/016-dashboards/spec.md`; technical input from `docs/features/F16-dashboards.md` §9.

## Summary

One role-driven `/dashboard` route backed by per-widget JSON endpoints under `/api/dashboard/*`. A pure-function service (`server/services/dashboard.ts`) runs parameterized Drizzle `sql` aggregates over leads, activities, stage_history and follow_ups, restricted to the viewer's F03 scope. The client fetches each widget independently (TanStack Query, keys `['dashboard', widget, filters]`), renders with Recharts using the dataviz palette tokens, keeps filters in the URL, drills down via `buildInboxHref`, and refetches on F12 SSE events debounced to 5 s.

## Technical Context

**Language/Version**: TypeScript (strict), Node ≥ 20, Next.js App Router

**Primary Dependencies**: Drizzle ORM, better-sqlite3, Zod, TanStack Query, Recharts, shadcn/ui + Tailwind (all already in the stack). **New dependencies: none.**

**Storage**: SQLite (WAL). Read-only. No schema change, no migration.

**Testing**: Vitest (fixture in-memory SQLite, ~30 leads, hand-computed expectations; RBAC), Playwright (drill-down; live tile update), palette validator for light and dark tokens.

**Target Platform**: Web (desktop ≥ 1280 px, tablet 3×2 KPI grid)

**Project Type**: web application (existing monorepo `apps/web` + `packages/shared`)

**Performance Goals**: widget API p95 < 500 ms uncached with seed data (800+ leads, ~7k activities); first meaningful paint < 1.5 s

**Constraints**: scope-restricted queries; Redis optional (F20 may wrap service functions; F16 does not depend on Redis); org timezone Europe/Brussels; money in integer cents

**Scale/Scope**: 8 endpoints, ~12 components, 3 role-specific layouts

## Constitution Check

| Principle | Status |
|---|---|
| I Spec is truth | ✅ Plan follows the F16 doc; deviations get amended in the doc |
| II R1–R3 first | ✅ Read-only feature, cannot break R1–R3 |
| III Layering | ✅ route → Zod (`DashboardFilterSchema`) → scope/authorize → service → SQL. The service imports no Next.js. The F16 doc places the Drizzle `sql` aggregates in the service; if F01 provides a repository layer for aggregates, the SQL moves there without changing signatures |
| IV Security | ✅ Filters intersected with scope, parameterized SQL, 403 OUT_OF_SCOPE |
| V Test-first | ✅ Metric fixture tests precede implementation; RBAC tests per endpoint; Playwright journey |
| VI Integrity | ✅ No writes. Money in cents, time UTC ms, formatted at the edge |
| VII Degradation | ✅ No Redis or AI dependency. SSE falls back to in-process events via F12 |
| VIII Simplicity | ✅ No new dependency, no rollup tables |
| IX Performance | ✅ Indexed aggregates; dashboard < 500 ms cold |
| X UX | ✅ Loading, empty, error states per widget; status = color + icon + text; keyboard focus |

Post-design re-check: no violations.

## Project Structure

### Documentation

```text
specs/016-dashboards/
├── plan.md  research.md  data-model.md  quickstart.md
├── assumptions.md  contracts/dashboard-api.md  checklists/requirements.md
└── tasks.md
```

### Source Code (owned paths only)

```text
packages/shared/src/
├── dashboard.ts          # NEW (append-only export): DashboardFilterSchema, response types
└── source-groups.ts      # F01 ships; F16 may append
apps/web/
├── server/services/dashboard.ts            # getSummary … getTeamComparison
├── server/services/dashboard-metrics.ts    # pure helpers: period resolution, tz buckets, deltas (unit tested)
├── app/api/dashboard/{summary,leaderboard,team-comparison}/route.ts
├── app/api/dashboard/charts/{leads-over-time,funnel,sources,lost-reasons,stage-aging}/route.ts
├── app/(app)/dashboard/page.tsx
├── components/dashboard/   # FilterBar, KpiTile, KpiRow, StatStrip, charts, tables, ChartCard, LiveIndicator, tabs.ts, hooks
├── lib/dashboard-href.ts   # buildInboxHref
└── tests/{unit,e2e}/dashboard*
```

**Structure Decision**: extend the existing `apps/web` + `packages/shared` layout. Shared-file edits are append-only (one export line in `packages/shared/src/index.ts`, and a nav entry only if F01/F03 haven't added "Dashboard").

## Key Design Decisions

1. **Period model**: `resolvePeriod(range, from, to, now)` returns `{from, to, prevFrom, prevTo}` on Brussels-local day boundaries. A custom range is validated to ≤ 366 days and from ≤ to (`INVALID_RANGE`).
2. **Scope**: `ctx = {user, scope}` from F03 `scopeFor(user)`. `resolveFilters(ctx, filters)` intersects team and rep with the scope. Out of scope → `OUT_OF_SCOPE` (403). A rep outside the selected team → 400 "Rep not in selected team". A REP cannot pass a teamId/ownerId other than their own.
3. **Metrics**: SQL per F16 §9 and domain model §6. Contact activity = `kind='USER' AND type<>'NOTE'`. The previous period is computed in the same query with `CASE WHEN created_at >= :from`. Division by zero returns `null` (UI shows "—"); a null prev shows "New".
4. **Funnel**: reach = `COUNT(DISTINCT lead_id)` from stage_history by `to_stage` for leads created in the period; NEW = all leads in the period; plus `current` counts. COLD is not a step.
5. **Stage aging**: `LEAD(changed_at) OVER (PARTITION BY lead_id ORDER BY changed_at)`; open intervals end at `now`. Targets are constants in `dashboard-metrics.ts` (3 d for NEW/CONTACTED, 7 d for others).
6. **Drill-down**: `buildInboxHref(filters, extra)` emits only params defined by F04 (`from`, `to`, `team`, `owner`, `source`, `sourceGroup`, `stage`, `overdue`, `sla`, `view`).
7. **Live**: `useLiveRefresh` subscribes to the F12 SSE hook for the four event types, with a trailing 5 s debounce that invalidates `['dashboard']` keys.
8. **Charts**: Recharts, palette CSS variables (light/dark), one y-axis, no pies. `ChartCard` supplies the tooltip/table-toggle/loading/empty/error states.
9. **Caching (F20)**: every service function has a stable `(ctx, filters)` signature and JSON-serializable output. No cache code in F16.
10. **Tab registry**: `tabs.ts` exports an append-only array with the Overview tab registered; F17 appends Demographics.

## Dependencies on other features (stubs when absent)

- F03 `scopeFor`, `authorize`: if missing at implementation time, use the documented contract via a thin adapter.
- F07 `stage_history` population and WON/LOST fields: read-only; tests use a fixture DB.
- F12 SSE hook: `useLiveRefresh` accepts an injected subscriber, with a no-op fallback.
- F04 inbox query params: the drill-down contract. If a param is unsupported, the inbox ignores it (logged in Known issues).

## Complexity Tracking

No constitution violations.
