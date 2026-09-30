# Tasks: F07 — Stage Pipeline, Won/Lost & Kanban

**Input**: `specs/007-stage-pipeline/` (plan.md, spec.md, data-model.md, contracts/stage-api.md)
**Rule**: tests for pure logic and the service come BEFORE implementation (red → green). Paths are relative to repo root; `[P]` = parallelizable; `[USn]` = user story.

## Phase 1: Setup
- [ ] T001 Add `@dnd-kit/core` and `@dnd-kit/utilities` to `apps/web/package.json` and install
- [ ] T002 [P] Append `StageChangeSchema` (discriminated union on `to`: WON needs dealValue/vehicleModel/appliedOfferId?, LOST needs lostReason/lostNote?, others reason?) in `packages/shared/src/schemas/stage.ts` and export from `packages/shared/src/index.ts`

## Phase 2: Foundational (blocks all stories)
- [ ] T003 Write matrix test `apps/web/tests/unit/stage-machine.test.ts`: every from×to×role (REP/MANAGER/VP/system) for the 8×8 matrix (SC-001), WON terminal, LOST reopen manager+, COLD manual manager+
- [ ] T004 Append helpers `allowedTargets(from, role)` and `STAGE_LABELS` to `packages/shared/src/stage-machine.ts` (append-only) until T003 passes
- [ ] T005 [P] Write service tests `apps/web/tests/unit/stage-service.test.ts` (fresh seeded DB): stage_history + STAGE_CHANGED written, version+1, same-stage no-op, WON requires dealValue (>0, ≤1e8) and creates purchase + `is_returning`, LOST requires reason (OTHER needs note 3–500), follow-ups CANCELLED on close, 409 on stale version, 422 INVALID_TRANSITION, 422 OFFER_NOT_APPLICABLE, revive resets attempt_count, reopen clears closing fields, events published after commit (SC-003)
- [ ] T006 Implement `apps/web/server/services/stage.ts` `transition(ctx, leadId, input)` in one transaction with `WHERE version=?`; local stubs for F09 `scoreLead` and F15 `matchOffers`; publish events; audit; `dash:*` invalidation hook (FR-001–FR-011)

## Phase 3: US1 — Change stage from detail page (P1)
- [ ] T007 [US1] Write RBAC/route tests `apps/web/tests/unit/stage-route-rbac.test.ts`: REP/MANAGER/VP, in-scope vs out-of-scope (403), unauthenticated (401), rep reopen (403), 422 invalid, 409 conflict
- [ ] T008 [US1] Implement `apps/web/app/api/leads/[id]/stage/route.ts` (PATCH: auth → Zod → authorize `lead:changeStage`/`lead:reopen` → service)
- [ ] T009 [P] [US1] `apps/web/components/leads/stage/StageSelect.tsx` (colored text chip dropdown, disabled invalid targets with "Not allowed from X" tooltip) and `use-stage-mutation.ts` (toast "Moved to …", error toasts)
- [ ] T010 [US1] Register StageSelect in `apps/web/components/leads/detail/slots.tsx` (append-only)

## Phase 4: US2 — Won (P1)
- [ ] T011 [P] [US2] Unit test for EUR parsing/format ("36500"/"36.500" → 3650000, `de-DE` display) in `apps/web/tests/unit/stage-money.test.ts`, then implement helper in `components/leads/stage/money.ts` (FR-013)
- [ ] T012 [US2] `components/leads/stage/WonDialog.tsx` (value input, model select, offer radio list, disabled Confirm + inline error; refresh offers on OFFER_NOT_APPLICABLE)

## Phase 5: US3 — Lost (P1)
- [ ] T013 [US3] `components/leads/stage/LostDialog.tsx` (reason radios, note textarea required for OTHER, 3–500)

## Phase 6: US4 — Reopen & revive (P1)
- [ ] T014 [US4] Reopen action in StageSelect for LOST leads visible only to MANAGER/VP; timeline text "Reopened by <name>" via activity metadata `{reopened:true}`
- [ ] T015 [US4] Verify service exposes revive path for F06/F08 (`ctx.system`, optional `ctx.tx`); covered by T005

## Phase 7: US5 — Concurrency (P2)
- [ ] T016 [US5] In `use-stage-mutation.ts` handle 409: toast "This lead was updated by <name>. Refreshed.", refetch lead

## Phase 8: US6 — Kanban (P2)
- [ ] T017 [US6] Test `pipeline` query in `stage-service.test.ts`: per-column count/value, 200 cap + `more`, WON/LOST 30-day window, scope + filters
- [ ] T018 [US6] Implement `listPipeline()` in `server/services/stage.ts` and `apps/web/app/api/pipeline/route.ts`
- [ ] T019 [P] [US6] `KanbanCard.tsx`, `MoveMenu.tsx` (key `M`), `KanbanBoard.tsx` (dnd-kit pointer/touch/keyboard sensors, dim invalid targets, optimistic move + rollback, open Won/Lost dialogs on drop, snap back on cancel, empty state, "+N more → inbox")
- [ ] T020 [US6] `apps/web/app/(app)/pipeline/page.tsx` with filters (owner for managers, source, priority), loading/empty/error states; append nav entry
- [ ] T021 [US6] Playwright `apps/web/tests/e2e/pipeline.spec.ts`: change stage on detail page persists (US1), drag card QUALIFIED→TEST_DRIVE persists (US6); uses `PORT`

## Phase 9: Polish
- [ ] T022 Run typecheck, lint, unit, e2e; fix failures within owned paths
- [ ] T023 Amend `docs/features/F07-stage-pipeline.md` if behavior deviated; write `REPORT.md`

## Dependencies
T001–T002 → T003 → T004 → T005 → T006 → T007 → T008 → UI tasks (T009–T016) → T017 → T018 → T019 → T020 → T021 → T022 → T023.
