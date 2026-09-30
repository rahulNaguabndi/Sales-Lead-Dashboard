# Tasks: F06 — Activity Logging

**Input**: `specs/006-activity-logging/` (spec, plan, research, data-model, contracts/post-activity.md)
**Rules**: stay in owned paths; no schema changes; unit tests for pure logic come **before** implementation (red → green); RBAC tests for the endpoint; Playwright core-loop e2e. Paths are relative to the repo root; `web` = `apps/web`.

## Phase 1: Setup

- [X] T001 Verify F01 contracts exist (`packages/shared/src/stage-machine.ts`, `web/server/db/audit.ts`, `web/server/events/bus.ts`, `web/server/http/errors.ts`, `web/app/api/leads/[id]/activities/route.ts`); where a wave-1/2 contract (F02 `getCurrentUser`, F03 `authorize`, F09 `scoreLead`, F05 `slots.tsx`) is absent, create a minimal typed stub used only by tests, never inside another feature's owned path.

## Phase 2: Foundational (blocks all stories)

- [X] T002 [P] Write failing unit tests for `CreateActivitySchema` in `web/tests/unit/activity-schema.test.ts`: note trimmed 1–2000 chars; control chars other than `\n`/`\t` stripped; outcome required for CALL/WHATSAPP/SMS/EMAIL, optional for MEETING/TEST_DRIVE, forbidden for NOTE; `nextFollowUp.dueAt` ≥ now+1 min and ≤ now+90 days; `nextFollowUp.note` ≤ 200; `stageChange.to` open stages only (WON/LOST/COLD rejected); `clientRequestId` ULID.
- [X] T003 [P] Write failing unit tests for `nextAttemptCount(prev, type, outcome)` truth table (contact + NO_ANSWER/VOICEMAIL → +1; CONNECTED/INTERESTED/NOT_INTERESTED/CALLBACK_REQUESTED or MEETING/TEST_DRIVE → 0; NOTE → unchanged) in `web/tests/unit/attempt-count.test.ts`.
- [X] T004 [P] Write failing unit tests for `autoAdvance` × every stage × every type (NOTE never advances; NEW/COLD + contact → CONTACTED; WON/LOST never change) and `isAllowedOpenTransition` in `web/tests/unit/auto-advance.test.ts`.
- [X] T005 Implement `CreateActivitySchema`, request/response types and error-code constants in `packages/shared/src/schemas/activity.ts` (append-only; export via existing index) so T002 passes.
- [X] T006 Implement `nextAttemptCount` and `isAllowedOpenTransition` in `web/server/services/activity.ts` (pure helpers first) so T003/T004 pass.

## Phase 3: US1 — Log a follow-up activity (P1, R3) 🎯 MVP

**Independent test**: post Call/Connected/"Called customer"; row is in `activities`, survives DB close/reopen and page reload.

- [X] T007 [P] [US1] Write failing integration test (real temp-file SQLite) for the happy path: expected rows in `activities`, `leads`, `audit_log`; response matches contract; persistence test (close connection, reopen, row still present) in `web/tests/integration/activity-log.test.ts`.
- [X] T008 [US1] Implement `logActivity(user, leadId, input)` in `web/server/services/activity.ts` as one synchronous `db.transaction` covering FR-003 steps 1–4, 10, 11 (authorize, insert USER activity with `metadata.clientRequestId`, attempt count, first_response/last_contact/last_activity, version++, audit) with an injectable step hook for fault injection; publish `activity.created` + `lead.updated` after commit inside try/catch (FR-004).
- [X] T009 [US1] Replace the 501 stub in `web/app/api/leads/[id]/activities/handlers/post.ts`: Origin check, JSON ≤ 16 KB, Zod validation (400 `VALIDATION_ERROR` with `fields`), call the service, map domain errors to 401/403/404/409/422 (do not edit `route.ts`).
- [X] T010 [P] [US1] Create `web/components/leads/composer/TypeSegmentedControl.tsx` (radiogroup, icon + text labels, keys 1–7) and `OutcomeSelect.tsx`.
- [X] T011 [US1] Create `web/components/leads/composer/useLogActivity.ts`: TanStack `useMutation` with `onMutate` optimistic insert into `['lead', id, 'activities', …]`, `onError` rollback + toast "Couldn't save activity. Your note is kept", `onSuccess` replace with server rows, patch `['lead', id]`, invalidate `['leads']` (FR-007); ULID `clientRequestId` per attempt.
- [X] T012 [US1] Create `web/components/leads/composer/ActivityComposer.tsx` (collapsed "Log an activity…" input, note textarea with counter, Log activity button with Ctrl/⌘+Enter, Esc-clear with confirm, reset keeping type, focus back to note) and `index.ts`; register in `web/components/leads/detail/slots.tsx` as `leadSlots.composer` (append-only).
- [X] T013 [US1] Write Playwright `web/tests/e2e/core-loop.spec.ts` (use `PORT`): login as Sofia → inbox → first lead → log Call/Connected "Called customer" → top of timeline → reload → still present → inbox row shows "Call · just now".

## Phase 4: US2 — Validation that helps (P1)

- [X] T014 [P] [US2] Add integration tests: empty/whitespace note → 400; Note + outcome → 400; Call without outcome → 400; 2001 chars → 400 in `web/tests/integration/activity-validation.test.ts`.
- [X] T015 [US2] Wire client-side validation into the composer using the shared schema (disabled submit, inline field errors, red counter, outcome hidden for Note, optional for Meeting/Test drive) in `web/components/leads/composer/ActivityComposer.tsx`.
- [X] T016 [US2] Add second e2e test "empty note → submit disabled" to `web/tests/e2e/core-loop.spec.ts`.

## Phase 5: US3 — Automatic lead bookkeeping (P1)

- [X] T017 [P] [US3] Add failing integration tests: NEW + Call → CONTACTED with STAGE_CHANGED (`auto:first_activity`) and first_response_at; NEW + Note stays NEW; COLD + contact → CONTACTED (`auto:revive`); attempt count 1 → 2 → 0; Interested changes score and adds SCORE_CHANGED on band change; WON/LOST leads accept Note and don't change stage in `web/tests/integration/activity-bookkeeping.test.ts`.
- [X] T018 [US3] Extend `logActivity` with FR-003 steps 5 and 9 (auto-advance via shared `autoAdvance`, `stage_history` rows, SYSTEM `STAGE_CHANGED`; F09 `scoreLead` recompute, score/priority/breakdown update, SYSTEM `SCORE_CHANGED`) in `web/server/services/activity.ts`.
- [X] T019 [P] [US3] Write a `scoreLead` totality unit test (never throws for any valid snapshot) in `web/tests/unit/score-totality.test.ts`.

## Phase 6: US4 — Schedule next follow-up (P1)

- [X] T020 [P] [US4] Add failing integration tests: follow-up created (`assigned_to = owner_id ?? actor`, PENDING) with FOLLOW_UP_SCHEDULED; past/> 90 d rejected; `completeFollowUpId` marks DONE with `completed_by_activity_id`; foreign or already-DONE follow-up → 422 `INVALID_FOLLOW_UP` in `web/tests/integration/activity-followup.test.ts`.
- [X] T021 [US4] Extend `logActivity` with FR-003 steps 7–8 in `web/server/services/activity.ts`.
- [X] T022 [P] [US4] Create `web/components/leads/composer/FollowUpPicker.tsx` (quick picks "In 2 h", "Tomorrow 10:00", "In 3 days", "Next Monday 10:00", "Custom"; `quick-picks.ts` pure helper with unit test `web/tests/unit/quick-picks.test.ts`) and `CompleteFollowUpCheckbox.tsx` (pre-ticked for a pending follow-up due today); integrate into the composer.

## Phase 7: US6 — Permissions (P1)

- [X] T023 [P] [US6] Write RBAC integration tests for REP / MANAGER / VP, in-scope and out-of-scope: rep on own lead 201; rep on pool lead 403; manager (Lukas) on rep's lead 201 with actor = Lukas; Sofia on a DACH lead → 404; unauthenticated → 401; bad Origin → 403 in `web/tests/integration/activity-rbac.test.ts`.
- [X] T024 [US6] Ensure the handler/service distinguish 404 (not readable) vs 403 (readable, not permitted) using F03 `authorize`; render "Claim this lead to log activities" instead of the composer when the actor lacks `activity:create` on a readable pool lead in `ActivityComposer.tsx`.

## Phase 8: US5 — Change stage while logging (P2)

- [X] T025 [P] [US5] Add failing integration tests: CONTACTED → QUALIFIED writes stage_history and STAGE_CHANGED; CONTACTED → NEGOTIATION → 422 `INVALID_TRANSITION`; WON/LOST → 422; stale `expectedVersion` → 409 `STALE_LEAD` with nothing written in `web/tests/integration/activity-stage.test.ts`.
- [X] T026 [US5] Extend `logActivity` with FR-003 step 6 (explicit change after auto-advance, `expectedVersion` check only when a stage change is present) in `web/server/services/activity.ts`.
- [X] T027 [P] [US5] Create `web/components/leads/composer/StageSelect.tsx` (allowed open targets only, "Close lead…" link to F07, sends `expectedVersion`; on 409 show message and keep the note).

## Phase 9: US7 — Fast, safe input (P2)

- [X] T028 [P] [US7] Add integration tests: idempotent replay returns the original 201 payload with no new rows; **fault injection at every step leaves 0 new rows**; publish failure still returns 201; concurrent submits both succeed in `web/tests/integration/activity-atomicity.test.ts`.
- [X] T029 [US7] Implement idempotency (`json_extract(metadata,'$.clientRequestId')`, same lead, 10-minute window) in `web/server/services/activity.ts`; copy `clientRequestId` into the metadata of the SYSTEM rows written in the same save so a replay can rebuild the full original payload (activity, systemActivities, lead delta, followUp).
- [X] T030 [P] [US7] Create `web/components/leads/composer/useComposer.tsx` (context with `prefill({type?, note?, outcome?, aiAssisted?})` and `focus()`), a unit/component test for prefill, and pass `aiAssisted` through the mutation; disable the button while pending.

## Phase 10: Polish

- [X] T031 Run `npm run typecheck`, `npm run lint`, `npm test`, `npm run test:e2e`; fix failures from this feature only.
- [X] T032 Amend `docs/features/F06-activity-logging.md` if behavior deviates; write `specs/006-activity-logging/REPORT.md`.

## Dependencies & Order

Phase 2 → Phase 3 (MVP) → Phases 4–7 (P1, mostly service extensions in one file, so sequential per file) → Phases 8–9 (P2) → Phase 10. Tasks marked [P] touch different files and may run in parallel. Test tasks precede their implementation tasks.

**MVP**: Phases 1–3.
