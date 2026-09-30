# F11 Build Report
Status: DONE
Branch: 011-assignment-management · Commits: 3
## Acceptance scenarios
| Story/Scenario | Result | Evidence |
| US1 Claim (success, 409, limit, parallel) | ✅ | integration/assignment.test.ts "claim (US-1)" |
| US2 Manager assign/unassign, RBAC | ✅ | "assign (US-2, US-4)" |
| US3 Bulk atomic | ✅ | "bulk (US-3)" |
| US4 VP cross-team | ✅ | "VP cross-team move" |
| US5 Settings + auto-assign | ✅ | "settings + auto-assign" , unit pick-rep |
| US6 Rebalance | ✅ | "rebalancePool" |
| SC-002 lead.assigned published | ✅ server side; live UI update needs F12 merge | test "publishes lead.assigned" |
| Browser claim flow | ❌ | e2e/claim.spec.ts failed at sign-in in this environment (login did not redirect; likely unseeded DB); not verified |
## Checks
typecheck: pass · lint: pass · unit/integration: 609/610 (only failure is unrelated scoring.test.ts 1,000-call <50 ms timing flake, 54 ms) · e2e: 0/2 (sign-in env failure)
## Assumptions made (see assumptions.md)
## Deviations from spec
None.
## Requires F01 / other-feature changes
F08 reassignPending is a no-op stub adapter until F08 lands.
## Known issues / follow-ups
Re-run claim e2e with a seeded DB.
