# F16 Build Report
Status: SPECCED
Branch: 016-dashboards · Commits: 1 (spec) + 1 (report)
## Acceptance scenarios
| Story/Scenario | Result | Evidence (test name or note) |
|---|---|---|
| US1–US6 | n/a | Spec-only run: planned in tasks.md (T011–T032) |
## Checks
typecheck: n/a · lint: n/a · unit: n/a · e2e: n/a
## Assumptions made (see assumptions.md)
Rep team rank excluded; stage-aging targets 3/7 days; revenue by closed_at; F03/F07 absent on this branch, so planning is against documented contracts.
## Deviations from spec
None.
## Requires F01 / other-feature changes
None. Relies on F04 inbox params (overdue, sla, sourceGroup, owner, stage, from, to) and on F12's SSE hook.
## Known issues / follow-ups
Analyze was done as an inline consistency pass (every story and FR maps to tasks; no CRITICAL/HIGH findings), not via the speckit-analyze skill.
