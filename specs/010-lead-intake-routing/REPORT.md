# F10 Build Report
Status: SPECCED
Branch: 010-lead-intake-routing · Commits: 2 (spec + report), spec-only run

## Acceptance scenarios
| Story/Scenario | Result | Evidence |
|---|---|---|
| US-1 … US-7 (all) | ❌ not built | Spec-only run. Covered by tasks T011–T034, T038 |

## Checks
typecheck: n/a · lint: n/a · unit: n/a · e2e: n/a (no implementation in this run)

## Assumptions made (see assumptions.md)
Idempotency replay with a different payload returns the original; client IP from the first `X-Forwarded-For` entry; sticky owner at capacity is skipped; F03/F09 interfaces are assumed as documented.

## Deviations from spec
- Simulator console line shows team/score only when the API response provides them (public response omits them per FR-020). Not yet amended in the F10 doc.

## Requires F01 / other-feature changes
- F01 `lead.assigned` event type needs optional `strategy` and `reason` fields.
- F01 (or F10) must add `libphonenumber-js`, `@faker-js/faker`, `tsx` to `apps/web`.

## Known issues / follow-ups
- Analyze pass fixes applied: guard tests moved before implementation, placeholder team for the MVP lead, sticky-owner eligibility aligned with FR-013, latency task T038 added.
- No code exists yet on this branch (F01 has only specs); implementation needs F01, F03, F09 merged.
