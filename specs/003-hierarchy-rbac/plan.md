# Implementation Plan: F03 — Org Hierarchy, Scope & RBAC Policy

**Branch**: `003-hierarchy-rbac` | **Date**: 2026-09-30 | **Spec**: [spec.md](spec.md)

## Summary

A TypeScript module in `apps/web/server/policy/` providing: `getScope` (recursive CTE over `users.manager_id`, `UNION`, depth ≤ 10, memoized per request with React `cache`), `leadScopeWhere` (Drizzle SQL condition), `authorize`/`can` (the FR-008 matrix, throwing F01's `NotFoundError`/`ForbiddenError`), and `withAuthz` (route-handler wrapper). No UI, no schema change. Only `apps/web/server/policy/**` is touched.

## Technical Context

- **Language**: TypeScript strict, Node ≥ 20. **Storage**: SQLite via Drizzle (`db` from F01 `server/db/client.ts`); the CTE runs through `db.all(sql...)` with bound parameters.
- **Dependencies**: none new. Uses `drizzle-orm` (`sql`, `or`, `and`, `inArray`, `isNull`), `react` (`cache`), F01 (`server/http/errors.ts`, `server/http/logger.ts`, `@leaddesk/shared` enums `Role`, `Stage`, `OPEN_STAGES`), F02 (`CurrentUser`, `requireUser`).
- **Testing**: Vitest against a temp-file SQLite migrated with F01's schema; deterministic seed personas; extra fixtures inserted directly.
- **Constraints**: Redis is not used by F03 (only `scopeCacheKey` for F20). No PII in logs (Constitution IV). Perf: scope < 5 ms (16 users), < 20 ms (1,000 users).

## Constitution Check

| Principle | Status |
|---|---|
| I Spec is truth | ✅ Implements F03 doc; deviations get doc amendments |
| II R1–R3 first | ✅ Provides the guard F04–F06 need; no change to their behavior |
| III Layering | ✅ Policy sits between route validation and service; `withAuthz` is the only Next-aware file, pure logic is framework-free |
| IV Security | ✅ Server-side, DB role/hierarchy, 404 for hidden leads, no PII in denial logs |
| V Test-first | ✅ Matrix + fixtures written before implementation (tasks ordered accordingly) |
| VI Integrity | ✅ Read-only module; no schema change |
| VII Degradation | ✅ No Redis/AI dependency |
| VIII Simplicity | ✅ Policy as a TS matrix, no engine, no new deps |
| IX Performance | ✅ Single CTE per request, SQL-side filter, perf tests |
| X UX | n/a (no UI; `can()` provides UI hints) |

## Project Structure

```text
apps/web/server/policy/
├── types.ts         # Scope, Resource, AuthzResult, local CurrentUser alias
├── actions.ts       # ACTIONS tuple + Action type + MUTATION_ACTIONS
├── scope.ts         # getScope (cache), resolveScope (uncached, testable), scopeCacheKey
├── lead-filter.ts   # leadScopeWhere, isLeadVisible (pure, same rule in TS)
├── authorize.ts     # authorize, can, pure rule functions
├── with-authz.ts    # withAuthz wrapper
├── index.ts         # barrel (public API)
└── __tests__/
    ├── fixtures.ts          # DB setup, personas, L1–L5, 4-level, cycle, 1,000-user builders
    ├── scope.test.ts
    ├── lead-filter.test.ts
    ├── authorize.matrix.test.ts   # 36 rows
    ├── authorize.edge.test.ts
    ├── with-authz.test.ts
    ├── sweep.test.ts              # every seeded lead x persona (SC-003)
    ├── perf.test.ts               # SC-002
    └── no-role-checks.test.ts     # SC-004 grep guard
```

## Design

**Scope.** `resolveScope(userId, database = db)` runs the F03 §9 CTE (`UNION`, `depth < 10`), reads role/team/manager of the root user, builds `userIds`, `teamIds` (plus own team), `isOrgWide = managerId === null`. If the recursion reaches depth 10, a structured error is logged (cycle or too deep). `getScope = cache(resolveScope)` gives per-request memoization; `scopeCacheKey(userId)` returns `scope:<userId>`. Unknown user → `NotFoundError`.

**Lead filter.** `leadScopeWhere(scope)` returns an always-true SQL fragment if org-wide, else `or(inArray(leads.ownerId, ids), and(isNull(leads.ownerId), inArray(leads.teamId, teams)))`. `isLeadVisible(scope, lead)` is the identical rule in TypeScript, used by `authorize`; a test asserts SQL and TS agree on all seeded leads.

**Authorize.** Each action maps to a pure rule `(ctx) => Decision` where a decision is allow, allow with `newTeamId`, or deny(code, status). Order for lead actions: not visible → `NotFoundError`; then the action rule → `ForbiddenError` (code `CLAIM_LIMIT_REACHED` for the limit case; the message includes the limit). `lead:claim` by a rep on an unassigned lead of another team is invisible, hence 404 (matrix row 11). The closed-lead rule (FR-009) applies before ownership for `lead:write`. The claim limit uses `resource.openLeadCount`, else counts `leads` in `OPEN_STAGES`, and reads `users.max_open_leads`. `lead:assign` returns `{ allowed: true, newTeamId? }`; target `null` (unassign) is allowed for visible leads by MANAGER/VP. `can()` is `authorize` with NotFound/Forbidden mapped to `false`. Mutation denials call `logger.warn` with `{ userId, action, resourceId }` only.

**withAuthz.** `withAuthz(handler, { action, loadResource, resolveUser? })` returns `(req, { params }) => Response`: user (default F02 `requireUser`) → `loadResource(params, user)` → `authorize` → `handler({ user, scope, resource, req, params })`; errors go through F01 `toErrorResponse` and come back as a JSON `Response` with that status. A loader returning `undefined` → `NotFoundError`.

## Complexity Tracking

No constitution violations. New dependencies: none.

## Test Matrix (source: F03 §9, 36 rows)

Fixture: VP Isabelle; MGR Lukas (DACH), Marco (South); REP Anna (DACH), Sofia (South); Jonas/Lea/Felix under Lukas; one inactive rep in DACH. Leads: L1 owned by Anna, L2 owned by Sofia, L3 unassigned DACH, L4 unassigned South, L5 WON owned by Anna. Rows 1–35 as in the source doc; row 36 is the 4-level fixture. Extras: `leadScopeWhere` result sets equal rows 1–4, 16–17, 29; the cycle fixture terminates and logs; 1,000-user perf.

## Risks

- F01/F02 code may not be merged on this branch when implementing: import via the documented paths; tests mock `requireUser`; a thin type-only shim is replaced at merge.
- The SQLite recursive CTE via `db.all` uses bound parameters only (no string concatenation).
