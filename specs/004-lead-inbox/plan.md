# Implementation Plan: F04 Lead Inbox

**Branch**: `004-lead-inbox` | **Date**: 2026-09-30 | **Spec**: [spec.md](spec.md)

## Summary
Server-side, scope-enforced lead list. `GET /api/leads` and an RSC page share `listLeads(user, query)` in `server/services/lead-query.ts`. Ranking, SLA breach, overdue, tab counts and search are computed in SQL. The client `InboxTable` (TanStack Table + Query, key `['leads', params]`, `keepPreviousData`) takes over from RSC `initialData`. URL params hold all state.

## Technical Context
**Language**: TypeScript strict · **Framework**: Next.js App Router (Node runtime) in `apps/web` · **Storage**: SQLite + Drizzle (read-only) · **Validation**: Zod `LeadListQuerySchema` (packages/shared) · **UI**: Tailwind + shadcn/ui, TanStack Table/Query · **Testing**: Vitest (unit + integration), Playwright e2e · **Performance**: p95 < 300 ms at ~800 leads · **New dependencies**: none.

## Constitution Check
| Principle | Status |
|---|---|
| I Spec is truth | Doc F04 authoritative; deviations logged in assumptions.md |
| II R1 first | This feature IS R1; core-loop e2e included |
| III Layering | route → Zod → session → service → Drizzle; service has no Next/React imports. Repo-level SQL kept in `lead-query.ts` (read-only query builder; no separate repository file, to stay in owned paths) — noted as accepted simplification |
| IV Security | `requireUser` + scope SQL on every path; filters intersected; no PII logged |
| V Test-first | Pure logic (rank comparator, SLA, params, search normalize) tested before implementation; RBAC matrix; e2e |
| VI Integrity | Read-only, no writes |
| VII Degradation | No Redis/AI dependency |
| VIII Simplicity | No new deps; live-slot stub only |
| IX Perf | Indexed subqueries, single aggregate for counts, perf test |
| X UX | Loading/empty/error states, text with colour, keyboard nav |
**Result**: PASS.

## Project Structure
```text
specs/004-lead-inbox/   spec, plan, research, data-model, contracts/, quickstart, tasks, assumptions
apps/web/
├── app/(app)/inbox/page.tsx, loading.tsx, error.tsx
├── app/api/leads/route.ts                    (GET only)
├── components/leads/inbox/
│   ├── InboxTabs, StatChips, InboxFilters, InboxSearch, InboxTable, LeadRow,
│   │   PriorityDot, SourceBadge, StageChip, RelativeTime, EmptyState (.tsx)
│   ├── useInboxParams.ts, live-slot.ts
│   └── (rank/format helpers)
├── server/services/lead-query.ts             (listLeads, countTabs, buildOrderBy)
├── server/services/lead-query.rank.ts        (pure: comparator, SLA, tz day bounds, search normalize wrapper)  ← owned area, same feature
└── tests: server/services/__tests__/lead-query.*.test.ts, tests/e2e/core-loop.spec.ts
```
Shared files touched append-only: nav entry for Inbox (F01 layout, if not already present), optional refinements to `lead-filters.ts`.

## Stubs for same-wave/earlier dependencies
If F02/F03 code is absent at build time: local stub of `requireUser` / `getScope` + `leadScopeWhere` behind the names in F02/F03 specs; replaced at merge.

## Key design
1. **Scope**: `leadScopeWhere(getScope(user))`; owner/team/unassigned filters are intersected with scope IDs in TS before SQL.
2. **Computed columns** via correlated subqueries (`next_follow_up_at`, `has_contact_activity`, latest USER activity via ordered LIMIT 1 subquery / join on max created_at).
3. **Rank** ORDER BY per FR-003; other sorts per FR-005.
4. **Counts**: one `SELECT SUM(CASE…)` over the user's default scope.
5. **Paging**: count query + offset page; page clamped to last; effective page echoed.
6. **Search**: normalize via F01 shared normalizer; ≥ 2 chars; phone digit terms ≥ 4.
7. **Page**: RSC parses params leniently (bad → defaults), calls `listLeads`, passes `initialData`. Owner options from users limited to scope.
8. **Client**: `useInboxParams` ↔ URL (router.replace), 250 ms search debounce, `<640/1024px` card layout, keyboard nav.

## Complexity Tracking
None beyond the noted repository-layer simplification.
