# Tasks: F03 — Org Hierarchy, Scope & RBAC Policy

**Branch**: `003-hierarchy-rbac` | **Input**: `specs/003-hierarchy-rbac/` (spec.md, plan.md, contracts/policy-api.md)
**Owned paths**: `apps/web/server/policy/**` only. Tests-first per Constitution V. No Playwright journey: F03 has no UI; the RBAC/sweep integration tests (T013) are its e2e-equivalent, and F04–F06 own the browser journeys.

Format: `[ID] [P?] [Story] description with path`. All paths under `apps/web/server/policy/`.

## Phase 1: Setup

- [x] T001 Create `types.ts` (Scope, Resource, AuthzResult, local type-only `CurrentUser` alias matching F02 `{ id, name, email, role, teamId, managerId, languages }`) and `actions.ts` (`ACTIONS`, `Action`, `MUTATION_ACTIONS`)
- [x] T002 Create `__tests__/fixtures.ts`: temp-file SQLite migrated with F01 schema; personas (Isabelle VP; Lukas, Marco MGR; Anna, Jonas, Lea, Felix under Lukas; Sofia under Marco; an inactive DACH rep); leads L1–L5; builders for a 4-level tree, a cycle, and a 1,000-user tree

**Checkpoint**: fixtures load, types compile.

## Phase 2: Tests first (red)

- [x] T003 [P] [US2,US3,US5] `__tests__/scope.test.ts`: Lukas scope = {Lukas, Anna, Jonas, Lea, Felix} / {DACH}; Isabelle = 16 users / 3 teams / `isOrgWide`; manager with no reports = self + own team; 4-level fixture (matrix row 36); cycle fixture terminates and logs an error; `scopeCacheKey` format
- [x] T004 [P] [US1] `__tests__/lead-filter.test.ts`: `leadScopeWhere` returns exactly the visible ids for rows 1–4, 16–17, 29; SQL result equals `isLeadVisible` for every seeded lead and persona; org-wide returns all
- [x] T005 [P] [US4] `__tests__/authorize.matrix.test.ts`: the 36-row table from plan.md (status + code + `newTeamId` for row 30; `CLAIM_LIMIT_REACHED` message contains the limit for row 10)
- [x] T006 [P] [US4] `__tests__/authorize.edge.test.ts`: closed-lead write (non-NOTE denied, NOTE allowed) for every role; unassign `null` target; assign to inactive user forbidden; assign to a MANAGER target other than self forbidden for MANAGER; claim of an owned visible lead → 403; `can()` returns booleans; mutation denial logs a warn with no PII, non-mutation denial does not; deactivated owner's leads stay visible to manager; manager-peer-team assignment denied
- [x] T007 [P] [US4] `__tests__/with-authz.test.ts`: happy path passes `{ user, scope, resource, req, params }`; 401 when the resolver throws `UnauthorizedError`; 404 for an out-of-scope lead; 403 for a forbidden action; missing resource → 404; unknown errors → 500 without stack

## Phase 3: Implementation (green)

- [x] T008 [US5] `scope.ts`: `resolveScope` (CTE with `UNION`, depth < 10, bound params, depth-limit error log, unknown user → `NotFoundError`), `getScope = cache(resolveScope)`, `scopeCacheKey` → T003 green
- [x] T009 [US1] `lead-filter.ts`: `leadScopeWhere`, `isLeadVisible` → T004 green
- [x] T010 [US2,US3,US4] `authorize.ts`: rule table per action, visibility-first 404, closed-lead rule, claim limit (resource count or DB count + `users.max_open_leads`), assign rules + `newTeamId`, `can`, mutation denial logging → T005, T006 green
- [x] T011 [US4] `with-authz.ts`: `withAuthz` with injectable `resolveUser` (default F02 `requireUser`), `toErrorResponse` mapping → T007 green
- [x] T012 `index.ts` barrel exporting the public API from `contracts/policy-api.md`

## Phase 4: Cross-cutting checks

- [x] T013 [P] [US4] `__tests__/sweep.test.ts` (SC-003): every seeded lead id × every persona: `authorize('lead:read')` succeeds iff the lead is in `leadScopeWhere` results, else `NotFoundError`; RBAC cases for REP / MANAGER / VP, in-scope and out-of-scope, on all lead actions
- [x] T014 [P] `__tests__/perf.test.ts` (SC-002): scope < 5 ms on seed (median of 50 runs), < 20 ms on the 1,000-user tree
- [x] T015 [P] `__tests__/no-role-checks.test.ts` (SC-004): scan `apps/web/**` (excluding `server/policy/**`, tests, `node_modules`) for `role ===` / `role !==` and fail with file list; allowlist documented in the test
- [x] T016 Run `npm run typecheck`, `npm run lint`, `npx vitest run apps/web/server/policy`; fix failures from this feature only

## Phase 5: Wrap-up

- [x] T017 Verify each acceptance scenario (US1–US5) against tests, write `REPORT.md`; amend `docs/features/F03-hierarchy-rbac.md` if behavior deviated (e.g. resolution of §11 open question, `resolveUser` option)

## Dependencies

T001 → T002 → T003–T007 (parallel) → T008 → T009 → T010 → T011 → T012 → T013–T015 (parallel) → T016 → T017.
Story coverage: US1 (T004, T009, T013), US2 (T003, T005), US3 (T003, T005), US4 (T005–T007, T010, T011, T013), US5 (T003, T008).
Requirement coverage: FR-001/002/003 (T003, T008), FR-004/005 (T004, T009), FR-006–FR-011 (T005, T006, T010), FR-012 (T007, T011), FR-013 (T006, T010), FR-014 (T010, T011).
MVP: Phases 1–3 (scope + filter + authorize) unblock F04–F06.
