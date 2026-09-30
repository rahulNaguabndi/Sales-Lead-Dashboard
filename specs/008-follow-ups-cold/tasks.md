# Tasks: F08 — Follow-ups & Going-Cold Detection

**Input**: `/specs/008-follow-ups-cold/` (plan.md, spec.md, data-model.md, contracts/, research.md, quickstart.md)

**Tests**: Requested by the plan and constitution V: pure-logic tests first (red → green), RBAC tests for every endpoint, one Playwright test.

**Path root**: `apps/web/` unless a path starts with `packages/`. Stay inside the F08 owned paths; shared files are append-only.

## Format: `- [ ] Tnnn [P?] [US?] Description with file path`

---

## Phase 1: Setup

- [ ] T001 Verify F01 scaffold present (`follow_ups` table, `server/redis`, `server/events/bus.ts`, `server/db/audit.ts`); create empty dirs `server/jobs/`, `components/followups/`, `tests/unit`, `tests/service`, `tests/jobs`, `tests/rbac`, `tests/e2e` as needed
- [ ] T002 [P] Add job env vars (`JOBS_ENABLED`, `AT_RISK_DAYS`, `COLD_AFTER_DAYS`, `COLD_AFTER_UNANSWERED`, `MISSED_AFTER_HOURS`) to the Zod env schema and `.env.example` (append-only, already listed in docs/04 §7)

---

## Phase 2: Foundational (blocks all stories)

**Tests first (red)**

- [ ] T003 [P] Unit tests for `isAtRisk`, `shouldAutoCold` (7-day, unanswered, future-follow-up protection, NOTE-not-contact via `lastContactAt`, NEW from `createdAt`, closed stages excluded, env-fraction overrides) with fixed `now` in `tests/unit/followup-rules.test.ts`
- [ ] T004 [P] Unit tests for `cadence.next` ("Attempt 2 of 5 · WhatsApp today", PREFERRED resolution with CALL→WHATSAPP fallback, beyond step 5, callback suggestion at `best_time` next day) in `tests/unit/cadence.test.ts`

**Implementation**

- [ ] T005 Implement `packages/shared/src/followup-rules.ts` (append-only export from shared index): constants per FR-007, env override parsing, `isAtRisk`, `shouldAutoCold`, `idleDays`, `cadence.next`, `suggestCallbackTime`; make T003/T004 pass
- [ ] T006 [P] Add Zod schemas `CreateFollowUpSchema` (`dueAt` in (now−60 s, now+90 d], message "Pick a future time"), `PatchFollowUpSchema` (discriminated on `action`), `ListFollowUpsQuerySchema` in `packages/shared/src/followup-rules.ts` (append-only) — no new files outside owned paths
- [ ] T007 Implement `server/jobs/lock.ts`: `withJobLock(name, fn)` using Redis `SET lock:job:<name> NX PX 55000`, in-memory fallback with warning log
- [ ] T008 [P] Implement `server/jobs/deps.ts`: adapters for F07 `stageService.transition` and F09 `recomputeFreshScores` (dynamic import, logged stub fallback)

**Checkpoint**: rules green, lock and adapters ready.

---

## Phase 3: US1 — Schedule a follow-up (P1) 🎯 MVP

**Independent test**: schedule for tomorrow 18:00, see it in the panel and in the upcoming list.

- [ ] T009 [P] [US1] Service tests for create: assignee = owner, else caller; supersede same (lead, assignee) with note "Superseded"; different assignee not superseded; past/>90 d rejected; closed lead rejected; `FOLLOW_UP_SCHEDULED` activity written in same transaction in `tests/service/followup-create.test.ts`
- [ ] T010 [P] [US1] RBAC tests for `POST /api/leads/:id/follow-ups` (REP own/other, MANAGER in/out of scope, VP; 401) in `tests/rbac/followup-post.test.ts`
- [ ] T011 [US1] Implement `followupService.create` and `createInTx(tx, …)` in `server/services/followup.ts` (transaction: supersede, insert, activity, audit)
- [ ] T012 [US1] Implement `app/api/leads/[id]/follow-ups/route.ts` POST (validate → `authorize(lead:write)` → service)
- [ ] T013 [P] [US1] `components/followups/quick-picks.ts` (in 2 h, Tomorrow 10:00, Tomorrow 18:00, In 3 days, custom; local time) with a unit test `tests/unit/quick-picks.test.ts`
- [ ] T014 [US1] `components/followups/schedule-popover.tsx` and `followup-card.tsx` (due time, assignee avatar, cadence line, empty/loading/error states); register card in `components/leads/detail/slots.tsx` (append-only)

---

## Phase 4: US2 — Today's Follow-ups widget (P1)

**Independent test**: 2 overdue + 4 due-today → chips 6/2 and list order matches a direct DB query.

- [ ] T015 [P] [US2] Service test for `listForUser` (today/overdue/upcoming, ordering, counts equal direct SQL, manager `owner=` within scope) in `tests/service/followup-list.test.ts`
- [ ] T016 [P] [US2] RBAC tests for `GET /api/follow-ups` (own only; `owner` for REP → 403; MANAGER out-of-scope → 403) in `tests/rbac/followup-get.test.ts`
- [ ] T017 [US2] Implement `followupService.listForUser` (single joined query with lead + customer, indexed) in `server/services/followup.ts`
- [ ] T018 [US2] Implement `app/api/follow-ups/route.ts` GET
- [ ] T019 [US2] `components/followups/due-today-widget.tsx` (overdue red + clock icon + text, "18:00" / "2 h overdue", priority dot, channel icon, click → lead detail with composer focus) and export chips data ("Due today · Overdue · At risk" counts; the At risk count uses `isAtRisk`) linking to F04's `due_today`/`overdue`/`going_cold` view params

---

## Phase 5: US3 — Complete, snooze, cancel (P1)

**Independent test**: log activity with "Complete follow-up" → DONE + linked activity.

- [ ] T020 [P] [US3] Service tests for complete (with activity link, `completed_at`), mark-done-without-activity system entry (`metadata.action = done_without_activity`, note "Follow-up marked done without activity"), snooze (`metadata.rescheduledFrom`), cancel with note, non-PENDING → 409 in `tests/service/followup-transitions.test.ts`
- [ ] T021 [P] [US3] RBAC tests for `PATCH /api/follow-ups/:id` in `tests/rbac/followup-patch.test.ts`
- [ ] T022 [US3] Implement `complete`, `completeInTx`, `snooze`, `cancel`, `cancelAllForLead(leadId)` in `server/services/followup.ts`
- [ ] T023 [US3] Implement `app/api/follow-ups/[id]/route.ts` PATCH
- [ ] T024 [US3] Wire Done / Snooze / Cancel buttons into `followup-card.tsx`; export `defaultCompleteChecked(followUp, now)` (due within ±24 h or overdue) for the F06 composer

---

## Phase 6: US4 — Missed and due-soon sweeper (P1)

**Independent test**: follow-up 25 h overdue → MISSED + `FOLLOW_UP_MISSED`; one due in 3 min → exactly one `followup.due`.

- [ ] T025 [P] [US4] Job tests with fake timers: MISSED transition once, ignores non-PENDING, due-soon emit exactly once across two runs (in-memory dedupe and mocked Redis), lock skips concurrent run in `tests/jobs/followup-sweeper.test.ts`
- [ ] T026 [US4] Implement `server/jobs/followup-sweeper.ts`
- [ ] T027 [US4] Implement `server/jobs/index.ts` (`startJobs`, `globalThis` guard, `JOBS_ENABLED=false`, per-run count logging, error isolation) and `server/jobs/score-freshness.ts` (every 5 min, FR-012); register from `apps/web/instrumentation.ts` (append-only); test guard and switch in `tests/jobs/jobs-index.test.ts`

---

## Phase 7: US5 — At-risk and auto-COLD (P1)

**Independent test**: 8-day-idle QUALIFIED lead with a NOTE yesterday → COLD + `AUTO_COLD`.

- [ ] T028 [P] [US5] Job tests: idle 8 d + recent NOTE → COLD; future follow-up protects 7-day rule but not unanswered rule; NEW counts from `createdAt`; batch limit 200; one failing lead does not abort the run; `changedBy = null` and reason strings; SC-001: all seeded cold-eligible leads are COLD after 2 runs (seeded DB, fake timers) in `tests/jobs/cold-detector.test.ts`
- [ ] T029 [US5] Implement `server/jobs/cold-detector.ts` (candidate query, per-lead transaction, `AUTO_COLD` activity, `lead.updated` event)
- [ ] T030 [P] [US5] `components/followups/at-risk-badge.tsx` ("At risk · 4 d idle", amber, text + icon), COLD chip tooltip helper "Auto-moved: no activity for 7 days", and a "Lead moved to Cold" banner component for live updates

---

## Phase 8: US6 — Cadence guidance (P2)

- [ ] T031 [US6] Render cadence line ("Attempt 2 of 5 · Suggested: WhatsApp today") in `followup-card.tsx` using `cadence.next`; export `suggestCallbackFollowUp` for the F06 composer (Callback requested → next day at `best_time`)

---

## Phase 9: Polish and cross-cutting

- [ ] T032 Export `followupService.reassignPending(leadId, toUserId)` with a service test (PENDING follow-ups move; DONE untouched) in `tests/service/followup-reassign.test.ts`
- [ ] T033 Playwright e2e `tests/e2e/followups.spec.ts`: log in as rep, schedule "Tomorrow 18:00", check panel and Due Today list, asserting the schedule takes ≤ 2 clicks from the composer (SC-004) (server on `PORT`, `JOBS_ENABLED=false`)
- [ ] T034 Verify degradation: run job tests with Redis mocked as unavailable; confirm warning logs and unchanged behaviour
- [ ] T035 Amend `docs/features/F08-follow-ups-cold.md` for the system-entry type decision (plan deviation 1); run `typecheck`, `lint`, unit and e2e; run quickstart.md validation

---

## Dependencies & Order

- Phase 1 → Phase 2 → stories. US1 first (MVP); US2, US3 need only US1's service file (same file, so sequential edits); US4 and US5 depend on Phase 2 and on T011/T022 for services; US6 depends on T005 and T014.
- Test tasks precede their implementation tasks in each phase (red → green).
- Parallel `[P]` tasks touch different files.

## Parallel example (Phase 2)

T003, T004, T006, T008 in parallel; then T005, T007.

## Strategy

MVP = Phases 1–3 (schedule + card). Then US2 → US3 → US4 → US5 → US6 → polish.
