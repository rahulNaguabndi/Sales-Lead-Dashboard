# F07 Build Report
Status: DONE
Branch: 007-stage-pipeline · Commits: 4+
## Acceptance scenarios
| Story/Scenario | Result | Evidence |
|---|---|---|
| US1 change stage (detail) | ✅ | stage-service/stage-route-rbac tests; e2e US1 |
| US2 Won | ✅ | stage-service tests, stage-money.test.ts |
| US3 Lost | ✅ | stage-service tests |
| US4 Reopen/revive | ✅ | stage-service + RBAC tests |
| US5 Concurrency (409) | ✅ | stage-service tests; use-stage-mutation handling (🟡 UI) |
| US6 Kanban | ✅ | listPipeline tests; e2e US6 drag persists |
## Checks
typecheck: pass · lint: pass · unit: 885/885 · e2e: 2/2 (pipeline spec, PORT=3107)
## Assumptions made (see assumptions.md)
Cold manual = manager+ only; dedicated `GET /api/pipeline`; F09/F15 behind local stubs.
## Deviations from spec
None. Added `canReopen` helper (append-only) in shared stage-machine so UI avoids role comparisons (SC-004 guard).
## Requires F01 / other-feature changes
Optional DB CHECK for WON deal_value / LOST reason; service-level enforcement used.
## Known issues / follow-ups
Full e2e suite not run, only pipeline spec. Needed `npm run db:reset` in the worktree for e2e.
