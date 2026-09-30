# Wave 1 integration report

## Branches
| Branch | Report status | Result |
|---|---|---|
| 002-authentication | DONE | merged, no conflicts |
| 003-hierarchy-rbac | DONE | merged, no conflicts |
| 009-lead-scoring | PARTIAL (seed score distribution off SC-003; no detail page yet) | merged, no conflicts |
| 013-showroom-app | DONE | merged, no conflicts |

## Integration fixes
- `apps/web/server/auth/next-path.ts`: F02's `role === 'REP'` tripped F03's SC-004 guard; replaced with a `ROLE_HOME` map.
- `vitest.config.ts`: added `hookTimeout: 60000`; DB-setup hooks timed out at 10s under parallel load (pass in isolation).

## Checks
install ✅ · db:reset ✅ · typecheck ✅ · lint ✅ · unit/integration 205/205 ✅ · e2e 5/5 ✅ (PORT=3412 with a pre-started dev server; the default webServer start timed out on Windows because of a Next lockfile-patch warning)

## Gate
- ✅ Login works (auth e2e, integration tests)
- ✅ `scopeFor(user)` tested (scope.test, authorize matrix)
- ✅ `scoreLead()` tested (scoring.test.ts)
- ✅ Showroom form validates against the shared contract (Enquiry.flow tests)

## Follow-ups
- F09 seed score distribution (SC-003).
- Showroom→inbox e2e skipped until the intake API lands (wave 2).
- Playwright webServer start on Windows is flaky without a pre-started server.
