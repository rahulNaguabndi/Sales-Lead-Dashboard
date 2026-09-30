# F11 Build Report
Status: SPECCED
Branch: 011-assignment-management · Commits: 1 (spec)
## Acceptance scenarios
| Story/Scenario | Result | Evidence |
|---|---|---|
| US-1..US-6 | not built (spec-only) | tasks T007–T025 |
## Checks
typecheck: n/a · lint: n/a · unit: n/a · e2e: n/a
## Assumptions made (see assumptions.md)
Reps-only auto-assign candidates; rep release out of scope; F04/F10/F08 stubbed until merge; extra endpoints (`GET /api/teams/settings`, `GET /api/teams/:id/assignees`, `POST /api/teams/:id/rebalance`) added under the teams API area.
## Deviations from spec
None. The spec adds FR-011..013 to make the doc's settings, picker and rebalance behaviour explicit.
## Requires F01 / other-feature changes
None expected. Needs F08 `reassignPending`, F04 row/selection slots, and F10's use of `autoAssign`.
## Known issues / follow-ups
Hard dependencies F04/F10 (wave 2) are not on this branch; that is fine for spec-only, but they must be merged before implementation.
Analyze: 0 CRITICAL/HIGH; 1 MEDIUM (SC-002 coverage) fixed in T026.
