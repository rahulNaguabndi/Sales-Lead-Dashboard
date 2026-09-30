# F15 Build Report
Status: SPECCED
Branch: 015-offers · Commits: 1 (spec)
## Acceptance scenarios
| Story/Scenario | Result | Evidence |
|---|---|---|
| US1–US5 | not built | Spec-only run; see spec.md and tasks.md |
## Checks
typecheck: n/a · lint: n/a · unit: n/a · e2e: n/a
## Assumptions made (see assumptions.md)
Nine inferred or doc-sourced answers, recorded in assumptions.md.
## Deviations from spec
None.
## Requires F01 / other-feature changes
Verify the seed has the six FR-011 offers (task T001). F07 consumes `validateAppliedOffer`. F03 must define `offer:manage`.
## Known issues / follow-ups
Analyze pass found 0 CRITICAL. The 2 HIGH findings were fixed: the ambiguous `status` filter in the contract, and the missing seed check.
