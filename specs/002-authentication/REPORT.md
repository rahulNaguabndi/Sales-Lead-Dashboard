# F02 Build Report
Status: SPECCED
Branch: 002-authentication · Commits: 1 (spec, plan, tasks, report)
## Acceptance scenarios
| Story/Scenario | Result | Evidence |
|---|---|---|
| US-1..US-5 | ❌ not built | spec-only run; tasks T014–T026 cover them |
## Checks
typecheck: n/a · lint: n/a · unit: 0/0 · e2e: n/a
## Assumptions made (see assumptions.md)
4 self-answered clarifications (no sliding sessions, disabled message only after correct password, limiter reset/429 behavior, which attempts count).
## Deviations from spec
None. Analyze pass: test-before-implementation ordering fixed for session.ts (T011 before T010); 401 code mismatch resolved with local `UnauthenticatedError`.
## Requires F01 / other-feature changes
None. Needs F01 to provide the `user-menu.tsx` slot, persona seed users with password `demo1234`, and `jose`/`bcryptjs`/`ulid`.
## Known issues / follow-ups
Gateway file assumed `middleware.ts` (Next 14 per F01 plan). No new dependencies.
