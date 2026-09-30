# Tasks: F04 Lead Inbox

Paths relative to `apps/web/` unless noted. `[P]` = parallelizable. Tests for pure logic come first (red → green).

## Phase 1: Setup
- [ ] T001 Verify F01/F02/F03 interfaces on branch (`requireUser`, `getScope`, `leadScopeWhere`, `LeadListQuerySchema`, `SOURCE_GROUP_OF`, search normalizer); create local stubs in `server/services/lead-query.ts` adapter if missing
- [ ] T002 [P] Add Inbox nav entry (append-only) if absent in `components/layout/**`

## Phase 2: Foundational pure logic (tests first)
- [ ] T003 [P] [US1] Unit tests `server/services/__tests__/lead-query.rank.test.ts`: ranking comparator fixture (overdue, SLA, score ties, created, id) — SC-004
- [ ] T004 [P] [US1] Unit tests for SLA boundaries (14:59/15:01 HOT, 1:59/2:01 WARM, non-NEW, contact vs NOTE)
- [ ] T005 [P] [US4] Unit tests for query-param parsing/normalization (defaults per role, bad values, CSV, page clamp, pageSize) and tz day-end computation (invalid tz fallback)
- [ ] T006 [P] [US4] Unit tests for search normalization (accents, phone digits ≥ 4, min 2 chars, reference prefix)
- [ ] T007 Implement `server/services/lead-query.rank.ts` (comparator, `isSlaBreach`, `endOfDay(tz)`, `normalizeListParams`, `searchTerms`) to pass T003–T006

## Phase 3: US1/US5 API + service (P1) 🎯 MVP
- [ ] T008 [US5] Integration test harness + RBAC matrix `server/services/__tests__/lead-query.rbac.test.ts`: REP Sofia / MANAGER Lukas / VP Isabelle × every view; out-of-scope owner/team filter → 0 foreign rows; unauth 401; bad params 400 — SC-003
- [ ] T009 [US1] Implement `listLeads` in `server/services/lead-query.ts`: scope filter, computed columns, views, filters (FR-006, FR-011, FR-014), sorts (FR-003/005), pagination + clamp (FR-008)
- [ ] T010 [US3] Implement `countTabs` (single aggregate, FR-009)
- [ ] T011 [US5] Implement `app/api/leads/route.ts` GET: `requireUser` → Zod parse (400 VALIDATION_ERROR) → `listLeads` → JSON; 401 handling
- [ ] T012 [US1] Integration tests: pagination totals (SC-005), Sofia 32 open/25-per-page, ranking on seed, going-cold/due-today/unassigned views
- [ ] T013 Performance test: 800 leads, each view 20×, p95 < 300 ms (SC-001)

## Phase 4: US2/US3/US4 UI (P1)
- [ ] T014 [P] [US2] Presentational components: `PriorityDot`, `SourceBadge`, `StageChip`, `RelativeTime`, `EmptyState`
- [ ] T015 [US4] `useInboxParams` (URL ↔ state, debounce 250 ms, bad params ignored) + unit test
- [ ] T016 [US2] `LeadRow` + `InboxTable` (TanStack Table/Query, keepPreviousData, skeletons, error banner+Retry, 40 px rows, keyboard nav ↑/↓/Enter, `/`, card layout <1024 px)
- [ ] T017 [US3] `InboxTabs` (role-aware, counts, My Leads hidden for owner-less manager)
- [ ] T018 [US4] `InboxFilters` (popover, active chips, owner filter manager/VP only, Clear filters keeps tab, Show closed toggle) + `InboxSearch`
- [ ] T019 [US1] `app/(app)/inbox/page.tsx` RSC (lenient params, `listLeads`, owner options in scope, redirect to `/login?next=/inbox` when unauthenticated) + `loading.tsx`/`error.tsx`

## Phase 5: US6/US7 (P2)
- [ ] T020 [P] [US6] `StatChips` with click → tab/filter
- [ ] T021 [P] [US7] `live-slot.ts` `useInboxLive()` stub + `data-highlight` in `LeadRow`

## Phase 6: E2E & polish
- [ ] T022 Playwright `tests/e2e/core-loop.spec.ts` inbox steps (login Sofia → rows ≥ 1 → open first row; later steps appended by F05/F06); use `PORT` env
- [ ] T023 Playwright inbox spec: tabs/filters URL persistence, search, scope
- [ ] T024 Typecheck, lint, tests; walk acceptance scenarios; write REPORT.md

## Dependencies
T001 → T003–T007 → T009 → T010 → T011 → T012/T013; T014/T015 parallel with T009; T016 needs T011; T019 needs T009 and T016–T018; T022 last.
