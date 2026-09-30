# F12 Build Report
Status: SPECCED
Branch: 012-live-updates · Commits: 1 (spec, plan, tasks)

## Acceptance scenarios
| Story/Scenario | Result | Evidence |
|---|---|---|
| US-1 to US-5 | ❌ not built | spec-only run. Tasks T009–T028 will cover them |

## Checks
typecheck: n/a · lint: n/a · unit: 0/0 · e2e: n/a

## Assumptions made (see assumptions.md)
Scope semantics for reps, `followup.due` assignee, toast summary fallback, logout probe.

## Deviations from spec
None yet. F01's event contract differs from F12 §9's wire example (flat fields, no id). The plan follows F01.

## Requires F01 / other-feature changes
- F10/F11: include a lead summary in `lead.assigned` (optional, the toast has a fallback).
- F04 (`live-slot.ts`), F02 (`/api/auth/me`), F03 (`scopeFor`) are not on this branch. They must be merged or stubbed at implement time.

## Known issues / follow-ups
Hard dependencies F04/F10 (wave 2) have no specs on this branch. Implementation must wait for them or stub them.
