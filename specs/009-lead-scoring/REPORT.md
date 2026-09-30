# F09 Build Report
Status: SPECCED
Branch: 009-lead-scoring · Commits: 2 (spec + report)

## Acceptance scenarios
| Story/Scenario | Result | Evidence |
|---|---|---|
| US-1 (1, 2) | ❌ not built | Planned: T002, T006 |
| US-2 (1) | ❌ not built | Planned: T003, T015, T017 |
| US-3 (1–3) | ❌ not built | Planned: T008–T010 |
| US-4 (1–3) | ❌ not built | Planned: T004, T018 |

## Checks
typecheck: n/a · lint: n/a · unit: n/a · e2e: n/a (spec-only run)

## Assumptions made (see assumptions.md)
Clarify step found no material ambiguity. It applied the F09 §11 proposals (NOT_INTERESTED does not subtract points; HOT thresholds are global).

## Deviations from spec
None.

## Requires F01 / other-feature changes
None. Only the sanctioned `seed/score-step.ts` body replacement is planned. `@leaddesk/shared` barrel gets an append-only export. F01 code is not yet built on this branch (only specs/001 exists), so implementation needs F01 merged first.

## Known issues / follow-ups
- Only the 5-number breakdown is persisted, so reasons are derived on demand via `scoreLead`/`explainScore`.
- Analyze pass done by hand (skill not invoked): every FR and SC maps to a task, and no CRITICAL/HIGH gaps were found.
