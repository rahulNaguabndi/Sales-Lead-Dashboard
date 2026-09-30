# F03 Build Report
Status: DONE
Branch: 003-hierarchy-rbac · Commits: see git log

## Acceptance scenarios
| Story/Scenario | Result | Evidence |
|---|---|---|
| US1.1 rep list = own + team pool | ✅ | lead-filter.test "rep sees own leads + team pool" |
| US1.2 out-of-scope lead by id → 404 | ✅ | matrix rows 2, 4, 11; with-authz 404 test |
| US2.1 manager scope | ✅ | scope.test "manager scope" |
| US2.2 manager assign in/out of team | ✅ | matrix rows 19, 20 |
| US3.1 VP scope 16 users / 3 teams | ✅ | scope.test "VP scope" |
| US3.2 VP cross-team assign, newTeamId | ✅ | matrix row 30 |
| US4.1 consistent 404/403 | ✅ | sweep.test, with-authz.test |
| US4.2 36-row matrix | ✅ | authorize.matrix.test (rows 1–35) + scope.test (row 36) |
| US5.1 4-level hierarchy | ✅ | scope.test "4-level fixture" |
| SC-002 perf | ✅ | perf.test (<5 ms seed, <20 ms 1,000 users) |
| SC-003 sweep | ✅ | sweep.test |
| SC-004 no role checks outside policy | ✅ | no-role-checks.test |

## Checks
typecheck: pass · lint: pass · unit: 137/137 (83 in policy) · e2e: n/a (no UI; sweep test replaces it)

## Assumptions made (see assumptions.md)
A1–A12. Policy imports `CurrentUser`/`getCurrentUser` from F01's stub in `server/auth`; F02 replaces the body, not the signature.

## Deviations from spec
None in behavior. Added implementation notes (§11a) and resolved the §11 open question in `docs/features/F03-hierarchy-rbac.md`.

## Requires F01 / other-feature changes
None. F02 may swap `withAuthz`'s default resolver for `requireUser`.

## Known issues / follow-ups
- Mutation-denial warn lines print to stdout during tests (noisy but harmless).
- `React.cache` falls back to no memoization outside the Next runtime (tests).
