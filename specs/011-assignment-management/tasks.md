# Tasks: Claim, Manual Assign & Auto-assign Settings (F11)

**Input**: specs/011-assignment-management/ (spec, plan, contracts, data-model)
Format: `[ID] [P?] [Story] description`. Tests for pure logic come before their implementation.

## Phase 1: Setup
- [X] T001 Add shared Zod schemas and the `lead.assigned` event payload type (append-only) in `packages/shared/src/schemas/assignment.ts`
- [X] T002 [P] Define the F08 `reassignPending` adapter interface plus a no-op stub used by the assignment service in `apps/web/server/services/assignment.ts`

## Phase 2: Foundational (blocks all stories)
- [X] T003 [P] Unit tests for pure `pickRep` (LOAD_BALANCED tie-breaks, LANGUAGE_MATCH plus fallback, ROUND_ROBIN plus deactivated cursor, limit skipping, everyone full → null, SC-003 40-lead simulation) in `apps/web/tests/unit/assignment/pick-rep.test.ts`
- [X] T004 Implement pure `pickRep` in `apps/web/server/services/assignment.pick-rep.ts` (FR-008, FR-010)
- [X] T005 Implement `applyOwnershipChange(tx, …)`: owner/team/assigned_at/version, ASSIGNED/CLAIMED activity, `reassignPending`, audit row, `last_assigned_at`, post-commit `lead.assigned` publish and cache invalidation (FR-004/005/009)
- [X] T006 Per-team lock helper (Redis `lock:assign:<teamId>` PX 5000 + in-process mutex fallback) in `assignment.ts`; test the fallback with Redis unavailable (FR-008)

## Phase 3: US-1 Claim (P1)
- [X] T007 [US1] Service tests: claim success, `ALREADY_ASSIGNED` 409 with owner name, `CLAIM_LIMIT` 422 (COLD not counted), out-of-team refusal, 50-parallel-claims concurrency (SC-001), activity and audit present (SC-004) in `tests/unit/assignment/claim.test.ts`
- [X] T008 [US1] Implement `assignmentService.claim` (FR-001/002)
- [X] T009 [US1] `POST /api/leads/[id]/claim/route.ts` with Zod, auth, error mapping
- [X] T010 [P] [US1] `components/leads/assign/ClaimButton.tsx` (toasts, key `C`, row removal callback); append registration in the Unassigned row (F04 slot)

## Phase 4: US-2 Manager assign / unassign (P1)
- [X] T011 [US2] RBAC and service tests: manager in scope OK, manager cross-team 403, rep 403, inactive target 422, same-owner no-op, over-limit target allowed with warning flag, unassign, VP OK, version conflict, follow-ups moved via the stub in `tests/unit/assignment/assign.test.ts`
- [X] T012 [US2] Implement `assign` and `listAssignees` (sort: language match, then fewest open; `atLimit`)
- [X] T013 [US2] `POST /api/leads/[id]/assign/route.ts` and `GET /api/teams/[id]/assignees/route.ts`
- [X] T014 [P] [US2] `components/leads/assign/AssignCombobox.tsx` (Command popover, avatar, open count, language flags, ✓ speaks X, warning)

## Phase 5: US-3 Bulk (P1)
- [X] T015 [US3] Tests: 5 leads in one transaction, ≥1 unauthorized → nothing changes and the offending IDs are listed, >100 rejected, in `tests/unit/assignment/bulk.test.ts`
- [X] T016 [US3] Implement `bulkAssign` and `POST /api/leads/assign/route.ts`
- [X] T017 [P] [US3] `components/leads/assign/BulkActionBar.tsx` (sticky: N selected · Assign to… · Return to pool · Clear; a single summary toast)

## Phase 6: US-4 VP cross-team (P1)
- [X] T018 [US4] Tests: VP move updates owner and team, the activity notes "Moved from Team X to Team Y", manager cross-team 403, in `assign.test.ts`
- [X] T019 [US4] Cross-team handling in `assign`/`applyOwnershipChange`

## Phase 7: US-5 Settings and auto-assign (P1)
- [X] T020 [US5] Tests: `autoAssign` end-to-end with a real DB (off → pool, on with LANGUAGE_MATCH, all full → pool, 0 reps → pool plus manager notice event, concurrent intakes don't double-pick), settings RBAC (rep 403, manager other team 403, VP all, invalid strategy 400), audit written, in `tests/unit/assignment/auto-assign.test.ts` and `settings.test.ts`
- [X] T021 [US5] Implement `autoAssign` (shared with F10), `getTeamSettings`, `updateTeamSettings` (rep `isActive`/`maxOpenLeads`)
- [X] T022 [US5] `GET /api/teams/settings/route.ts` and `PATCH /api/teams/[id]/settings/route.ts`
- [X] T023 [US5] `app/(app)/team/settings/page.tsx` and `TeamSettingsCard.tsx`: Switch, RadioGroup with explanations, rep table with Active switches and max-open inputs, Save disabled until changed, deactivation hint with a bulk "return to pool"; append the manager/VP-only nav entry

## Phase 8: US-6 Rebalance (P2)
- [X] T024 [US6] Test and implement `rebalancePool` (≤ 100, under the lock) and `POST /api/teams/[id]/rebalance/route.ts`; add the button and result toast to the settings card

## Phase 9: Polish
- [X] T025 Playwright e2e `tests/e2e/claim.spec.ts` (Anna claims from Unassigned; timeline shows "Claimed by Anna Weber"; a second-session conflict toast); use the `PORT` env var
- [X] T026 Verify degradation, and SC-002 (both inboxes update < 2 s once F12 is merged; until then verify that `lead.assigned` is published) (Redis off) and run typecheck/lint/test; walk through quickstart.md; write REPORT.md

## Dependencies
T001,T002 → T003 → T004 → T005 → T006 → story phases. US1–US4 share T005; the UI tasks marked [P] depend on their endpoints. US5 depends on T004/T006.
