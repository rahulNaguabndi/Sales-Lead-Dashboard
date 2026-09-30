# F05 Build Report
Status: SPECCED
Branch: 005-lead-detail-timeline · Commits: 1 (spec)

## Acceptance scenarios
| Story/Scenario | Result | Evidence |
|---|---|---|
| US-1 – US-6 | ❌ not built | spec-only run; tasks T011–T036 define the tests |

## Checks
typecheck: n/a · lint: n/a · unit: n/a · e2e: n/a

## Assumptions made (see assumptions.md)
Four self-answered clarifications (no view logging, read-only claim prompt, score labels without F09, per-browser order preference).

## Deviations from spec
None.

## Requires F01 / other-feature changes
None. Soft dependencies: F02 session user, F03 `can`/`authorize`, F04 `RelativeTime` (optional), F09 score labels. Code is planned against their interfaces.

## Known issues / follow-ups
- Analyze pass: 0 CRITICAL/HIGH; 2 MEDIUM fixed (T001 wording, SC-001 timing task).
- The `create-new-feature` script was not used; the spec directory was created directly as `specs/005-lead-detail-timeline`.
