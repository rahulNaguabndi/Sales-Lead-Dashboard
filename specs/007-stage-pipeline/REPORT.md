# F07 Build Report
Status: SPECCED
Branch: 007-stage-pipeline · Commits: 1 (spec)
## Acceptance scenarios
| Story/Scenario | Result | Evidence |
|---|---|---|
| US1–US6 | ❌ not built | spec-only run; covered by tasks T003–T021 |
## Checks
typecheck: n/a · lint: n/a · unit: n/a · e2e: n/a
## Assumptions made (see assumptions.md)
Cold manual = manager+ only; `GET /api/pipeline` dedicated endpoint; F09/F15 behind local stubs.
## Deviations from spec
None. Analysis pass: all FRs (001–013) and SC-001–003 map to tasks; SC-004 belongs to F16. No CRITICAL/HIGH findings.
## Requires F01 / other-feature changes
Optional: DB CHECK for WON deal_value / LOST reason (SC-003) would need an F01 migration; service-level enforcement used instead.
## Known issues / follow-ups
Implementation not started.
