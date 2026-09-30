# F04 Build Report
Status: SPECCED
Branch: 004-lead-inbox · Commits: 2 (spec, report)

## Acceptance scenarios
Not built (spec-only run). All US-1…US-7 scenarios are carried over in spec.md and mapped to tasks T003–T023.

## Checks
typecheck: n/a · lint: n/a · unit: n/a · e2e: n/a

## Assumptions made (see assumptions.md)
12 logged, notably: going-cold uses `coalesce(last_contact_at, created_at)`; F03 helper names adapted (`getScope` + `leadScopeWhere` behind a local `scopeFilter` adapter).

## Deviations from spec
None. The spec/analysis pass was done by direct artifact authoring rather than invoking each speckit sub-skill; a manual cross-artifact consistency check found no CRITICAL/HIGH issues.

## Requires F01 / other-feature changes
None. `apps/`/`packages/` are absent on this branch (F01 code not merged yet), so implementation needs F01–F03 merged or stubbed.

## Known issues / follow-ups
- Plan adds `server/services/lead-query.rank.ts` (same owned area) for pure logic.
- `tests/e2e/core-loop.spec.ts` is shared with F05/F06; expect merge conflicts to resolve.
