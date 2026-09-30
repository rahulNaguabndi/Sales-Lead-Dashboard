# Tasks: F09 — Lead Scoring & Priority

**Input**: `specs/009-lead-scoring/` (spec, plan, research, data-model, contracts)
**Prerequisite**: F01 foundation (schema, enums, `Tx`/`withTx`, `writeAudit`, seed, ui kit). Tests are written before implementation (Constitution V).
**Format**: `[ID] [P?] [Story] Description` — `[P]` = parallelizable (different files).

## Phase 1: Setup

- [x] T001 Confirm F01 artifacts exist (`packages/shared/src/enums.ts`, `apps/web/server/db/client.ts`, `seed/score-step.ts`, `components/ui/popover.tsx`); if a shadcn `popover` is missing, stub-add it via append-only ui addition

## Phase 2: Foundational — pure scoring module (blocks all stories)

- [x] T002 [P] [US1] Write failing unit tests `packages/shared/tests/scoring.test.ts`: worked examples A, A', B, C, D, E, F; boundary G (70→HOT, 40→WARM, 39→COOL); clamping 0–100; future `createdAt` → freshness 20; budget 0 not given; whitespace/emoji message length by code points; unknown source → 0 + warn; NOT_INTERESTED → engagement 0; engagement floor at 0; purchase window (7 y ago no, 3 y yes)
- [x] T003 [P] [US2] Add reasons snapshot tests (label text and points, e.g. "Test drive requested +12", "2 unanswered attempts −6") in the same test file
- [x] T004 [P] [US4] Write failing SLA tests `packages/shared/tests/sla.test.ts`: HOT NEW 16 min → BREACHED; HOT NEW 12 min → DUE_SOON (deadline 15 min, threshold 11.25 min); WARM NEW 100 min → DUE_SOON; WARM NEW 30 min → OK; contacted or stage ≠ NEW → NA; deadline value
- [x] T005 [P] [US1] Add perf test: 1,000 `scoreLead` calls < 50 ms (SC-002)
- [x] T006 [US1] Implement `packages/shared/src/scoring.ts` (`SCORING_WEIGHTS`, `PRIORITY_THRESHOLDS`, `SLA_TARGETS_MS`, `scoreLead`, `slaStatus`, `isScoreFrozen`, `explainScore`, types) until T002–T005 pass (FR-001…FR-006)
- [x] T007 [US1] Append `export * from './scoring'` to `packages/shared/src/index.ts`

**Checkpoint**: pure function fully tested; SC-001, SC-002 met.

## Phase 3: User Story 3 — Scores stay current (P1)

- [x] T008 [US3] Write failing integration tests `apps/web/tests/unit/scoring-service.test.ts` (in-memory seeded DB): `loadScoreInput` derives `lastPositiveOutcome`/`unansweredAttempts` from USER activities (ignores SYSTEM); INTERESTED logged → engagement 15 and score/priority updated; same-band change updates lead with no `SCORE_CHANGED`; band change writes exactly one `SCORE_CHANGED` with `{from,to,score}`; WON/LOST leads skipped (score unchanged); COLD recomputed; unchanged inputs → `changed=false` and no write; reassign does not change score
- [x] T009 [US3] Write failing tests for `recomputeFreshScores`: lead 50 min old → after 1 h freshness 20→15; leads ≥ 8 days old and WON/LOST excluded; batches of 200 (seed > 200 leads processed, one tx per batch); returns only priority-changed ids
- [x] T010 [US3] Implement `apps/web/server/services/scoring.ts`: `loadScoreInput`, `recomputeLeadScore` (SCORE_CHANGED activity + `writeAudit`, no version bump), `recomputeFreshScores` (FR-007, FR-008, FR-010) until T008–T009 pass
- [x] T011 [US3] Document caller duties (publish `lead.updated` after commit) in JSDoc on the exports; verify triggers table (FR-009) is reflected in `contracts/scoring.md`

**Checkpoint**: recompute and freshness job callable by F05/F06/F07/F08/F10.

## Phase 4: User Story 1 & seed — realistic scores (P1)

- [x] T012 [US1] Write seed test `apps/web/tests/unit/seed-distribution.test.ts`: every seeded lead has score in 0–100, priority consistent with `PRIORITY_THRESHOLDS`, breakdown sums to score; prints HOT/WARM/COOL distribution vs SC-003 targets (report only, non-blocking)
- [x] T013 [US1] Replace the body of `apps/web/server/db/seed/score-step.ts` with `scoreLead()` using the seed's `now` and seed customer/purchase/activity data (FR-011); keep export signature
- [x] T014 [US1] If distribution is outside SC-003, tune `SCORING_WEIGHTS`/`PRIORITY_THRESHOLDS` only after re-checking the worked examples, and record the change in `docs/features/F09-lead-scoring.md` §8 Decisions

## Phase 5: User Story 2 & 4 — UI (P1)

- [ ] T015 [P] [US2] Write failing component tests `apps/web/tests/unit/score-components.test.tsx`: ScoreBadge shows "HOT 82" text and number (not color only), opening the popover shows five factor bars with value/max and the reasons, footer text; keyboard focus opens popover (deferred: no DOM test env / no F05 page on this branch)
- [ ] T016 [P] [US4] Add SlaBadge tests: BREACHED → "SLA breached · 12 min over", DUE_SOON → "Respond now · 4 min left", NA → renders nothing; pulse class only with `motion-safe:` (deferred: no DOM test env / no F05 page on this branch)
- [x] T017 [US2] Implement `apps/web/components/leads/score/score-badge.tsx` (chip colors HOT red-600, WARM amber-500, COOL sky-500; Popover with bars and reasons; footer "Rule-based score · updated …" via `lib/format.ts`) (FR-012)
- [x] T018 [US4] Implement `apps/web/components/leads/score/sla-badge.tsx` and `components/leads/score/index.ts` barrel (FR-012)

## Phase 6: Verification & polish

- [ ] T019 e2e (only if F05 detail page and Playwright are present on the branch): `apps/web/tests/e2e/score-badge.spec.ts` — open a seeded lead, open the score popover, assert five bars and at least two reasons (SC-004); use `PORT` env, no hardcoded ports (deferred: no DOM test env / no F05 page on this branch)
- [x] T020 Run `npm run typecheck`, `npm run lint`, `npm test`; fix failures caused by this feature
- [x] T021 Verify no RBAC tests are needed (no endpoints added) and no files outside the owned paths were changed; write `specs/009-lead-scoring/REPORT.md`

## Dependencies & Order

- Phase 2 (T002–T007) blocks everything; T002–T005 (tests) precede T006.
- Phase 3 depends on Phase 2; T008/T009 precede T010.
- Phase 4 depends on Phase 2 (not on Phase 3). Phase 5 depends on Phase 2 types only, so it can run in parallel with Phases 3–4.
- Story coverage: US1 → T002, T005, T006, T012–T014; US2 → T003, T015, T017; US3 → T008–T011; US4 → T004, T016, T018.
- FR coverage: FR-001–006 → T002–T006; FR-007/008/010 → T008–T010; FR-009 → T011 (caller duties, contract); FR-011 → T013; FR-012 → T015–T018.
