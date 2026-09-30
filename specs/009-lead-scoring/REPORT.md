# F09 Build Report
Status: PARTIAL
Branch: 009-lead-scoring · Commits: see git log

## Acceptance scenarios
| Story/Scenario | Result | Evidence |
|---|---|---|
| US-1 (worked examples A, A', B–F, boundary G) | ✅ | `packages/shared/src/scoring.test.ts` |
| US-1 (seed scores realistic) | 🟡 | scores valid and consistent (test); distribution off SC-003, see Known issues |
| US-2 (badge shows five factors + reasons) | 🟡 | `ScoreBadge` implemented; no component test, no detail page yet (F05) |
| US-3 (recompute, SCORE_CHANGED only on band change, freeze WON/LOST, freshness job) | ✅ | `apps/web/server/services/scoring.test.ts` |
| US-4 (SLA table) | ✅ | `scoring.test.ts` slaStatus cases; `SlaBadge` implemented |

## Checks
typecheck: pass · lint: pass · unit: 88/88 · e2e: n/a (no F05 detail page on this branch)

## Assumptions made (see assumptions.md)
- Unanswered attempts = NO_ANSWER/VOICEMAIL USER activities newer than the latest decisive outcome (INTERESTED, CALLBACK_REQUESTED, CONNECTED, NOT_INTERESTED), within the latest 20.
- Tests sit beside the code (`*.test.ts`) because vitest's include globs only match `packages/shared/src/**` and `apps/web/**`, not `packages/shared/tests`.
- Seed `forceHot` leads are lifted to 70 only if the rules leave them lower.

## Deviations from spec
- Added D7 to F09 §8: thresholds stay 70/40 (worked examples fix them).
- New dependency `@radix-ui/react-popover` (for the keyboard-accessible score popover; the shadcn popover primitive).
- T015/T016/T019 (component tests, e2e) not done: no DOM test environment is configured and F05's page is absent.

## Requires F01 / other-feature changes
None to the schema. Replaced the body of `seed/score-step.ts` as sanctioned.

## Known issues / follow-ups
- SC-003: seeded open-lead distribution is about HOT 2% / WARM 32% / COOL 66%. The seed data is mostly old leads with little intent, so the seed generator would need retuning, not F09.
- Callers (F05/F06/F07/F08/F10) must call `recomputeLeadScore` and publish `lead.updated` after commit. F08's job runner must schedule `recomputeFreshScores`.
- Add component tests and the e2e spec once a DOM test env and F05 exist.
