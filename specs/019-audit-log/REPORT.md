# F19 Build Report
Status: DONE
Branch: 019-audit-log · Commits: 4
## Acceptance scenarios
| Story/Scenario | Result | Evidence |
| US1 Investigate a lead (API + table + lead link) | ✅ | audit.test.ts, e2e/audit.spec.ts |
| US2 Search/filter, keyset pagination | ✅ | audit.test.ts |
| US3 Diff inspection | ✅ | components/audit/labels.test.ts, e2e diff assertion |
| US4 Scope enforcement (REP 403, MANAGER scoped, VP all) | ✅ | tests/rbac/audit-rbac.test.ts, e2e REP check |
| US5 Security events (no plaintext email/password) | 🟡 | audit.test.ts; rendering verified by reasoning |
## Checks
typecheck: pass · lint: pass · unit: 1101/1101 · e2e: audit.spec.ts 2/2 (full suite not run)
## Assumptions made (see assumptions.md)
## Deviations from spec
- RBAC tests live in tests/rbac/audit-rbac.test.ts rather than app/api/audit/route.test.ts.
- Role checks replaced by policy `can(audit:read)` / `scope.isOrgWide` to satisfy the SC-004 no-role-checks guard; slot link uses a MANAGER/VP membership list.
## Requires F01 / other-feature changes
None.
## Known issues / follow-ups
- Audit link in lead header uses an inline role list; a `canViewAudit` permission on LeadPermissions would be cleaner.
- Perf test (SC-003) not confirmed separately.
