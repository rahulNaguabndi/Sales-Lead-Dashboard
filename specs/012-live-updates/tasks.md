# Tasks: F12 — Live Updates

**Input**: `specs/012-live-updates/` (plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md)

**Tests**: Requested (Constitution V). Pure-logic tests come before their implementation (red → green).

**Paths**: all under `apps/web/` unless noted. Owned: `app/api/events/**`, `lib/sse/**`, `components/live/**`. Append-only touches to F01/F04/F05 files are marked (shared).

## Format: `- [ ] [ID] [P?] [Story] Description with file path`

## Phase 1: Setup

- [ ] T001 Confirm F01 `server/events/bus.ts`, `packages/shared/src/events.ts` (`LeadDeskEvent` Zod schema), F03 `scopeFor`, F02 `getCurrentUser()` and F04 `components/leads/inbox/live-slot.ts` exist. Where one is missing, create a minimal local stub behind the documented interface and note it for REPORT.md.
- [ ] T002 [P] Create empty module skeletons `lib/sse/{filter,hub,wire,liveStore,invalidation,useLiveEvents}.ts` and `components/live/` so tests can import them.

## Phase 2: Foundational (blocks all stories)

- [ ] T003 [P] Write unit tests for the SSE frame encoder in `tests/unit/sse/wire.test.ts`: `retry: 3000`, `hello` frame, event frame `id/event/data` ending `\n\n`, heartbeat `: ping`.
- [ ] T004 [P] Write unit tests for `filterFor` in `tests/unit/sse/filter.test.ts` covering every FR-006 case: owner in scope, owner null + team in scope, owner null + team out of scope, `lead.assigned` with `fromOwnerId` in scope, VP gets all, `offer.changed` to everyone, `followup.due` only to the assignee, and REP/MANAGER/VP fixtures for DACH vs SOUTH.
- [ ] T005 Implement `lib/sse/wire.ts` (make T003 pass).
- [ ] T006 Implement `lib/sse/filter.ts`: `Scope` type and pure `filterFor(scope, userId)` returning `(event) => boolean` using `Set` lookups (make T004 pass).
- [ ] T007 [P] Write hub unit tests in `tests/unit/sse/hub.test.ts` using a fake bus and a fake connection: register, broadcast only to passing connections, ulid ids increase, abort/unregister removes the listener and clears timers, ring buffer keeps the last 500, replay after a known `Last-Event-ID` (filtered), unknown id → `resync`, the 6th stream of a user closes the oldest, invalid payload dropped (Zod), singleton guard (`globalThis.__ldHub`) yields one bus subscription, scope refresh every 60 s and closure when the user is revoked or missing.
- [ ] T008 Implement `lib/sse/hub.ts` per plan (make T007 pass): connection registry, ring buffer (500), `broadcast`, per-user limit 5, 60 s scope refresh via F03 `scopeFor`, refresh on team-changing `lead.assigned`, `bus.subscribe` once.

## Phase 3: User Story 1 — New lead appears live (P1) 🎯 MVP

**Goal**: Anna sees the toast and the highlighted row in < 2 s. **Independent test**: intake POST → toast and highlighted row.

- [ ] T009 [P] [US1] Write tests in `tests/unit/sse/invalidation.test.ts` for the pure event → query-key mapping (FR-011 table), the 250 ms per-key debounce and the 5 s dashboard debounce (fake timers).
- [ ] T010 [P] [US1] Write route integration tests in `tests/unit/sse/route.test.ts`: 401 without a session, correct headers (FR-002), `retry: 3000` then `hello`, event published on a fake bus is read from the stream, heartbeat after 25 s (fake timers), `request.signal` abort cleans up.
- [ ] T011 [US1] Implement `app/api/events/route.ts` (`runtime='nodejs'`, `dynamic='force-dynamic'`): authenticate, build the `ReadableStream`, register with the hub, write retry/hello, heartbeat interval, replay via `Last-Event-ID`, abort cleanup (make T010 pass).
- [ ] T012 [US1] Implement `lib/sse/invalidation.ts` (make T009 pass).
- [ ] T013 [P] [US1] Implement `lib/sse/liveStore.ts` with `useSyncExternalStore`: status, highlighted ids with 5 s TTL, `lastUpdatedBy`.
- [ ] T014 [US1] Implement `lib/sse/useLiveEvents.ts`: `EventSource('/api/events')`, event listeners for all catalog types plus `resync`, invalidations through `invalidation.ts`, highlight updates.
- [ ] T015 [US1] Implement `components/live/LiveToaster.tsx` (FR-012): assigned-to-me toast (HOT red accent 8 s, others 5 s, Open and Dismiss buttons, priority dot, name, model, source), pool arrival toast grouped when more than 3 in 10 s, no toast when `event.by === me`, max 3 visible. When the event carries no lead summary (research D7), fall back to the summary from a `lead.created` seen for the same lead id, else the generic text "Lead assigned to you". Include unit tests for the toast decision function in `tests/unit/sse/toast-rules.test.ts` written first.
- [ ] T016 [P] [US1] Implement `components/live/useRowHighlight.ts` and the amber 3 s fade CSS (static under `prefers-reduced-motion`).
- [ ] T017 [US1] Replace the body only of `useInboxLive()` in `components/leads/inbox/live-slot.ts` (shared, F04 exception) to return highlighted ids from the store.
- [ ] T018 [US1] Implement `components/live/LiveProvider.tsx` (mounts `useLiveEvents` and the toaster once) and append its mount to the F01 `(app)` layout (shared, append-only).

## Phase 4: User Story 2 — Managers and VPs (P1)

**Goal**: Team and org views update. **Independent test**: DACH manager dashboard refresh at most once per 5 s.

- [ ] T019 [P] [US2] Extend `tests/unit/sse/filter.test.ts` with a manager fixture (subtree users and teams) and a VP fixture receiving all teams' events.
- [ ] T020 [US2] Write the scope-leak/RBAC test `tests/unit/sse/scope-leak.test.ts` (SC-002): 20 DACH events published on the fake bus, a South REP stream receives 0. A DACH REP receives only own and pool events, a DACH MANAGER receives all DACH events, a VP receives everything, `followup.due` reaches only the assignee.
- [ ] T021 [US2] Verify the dashboard 5 s debounce is wired in `useLiveEvents` for `lead.created`/`lead.assigned`/`lead.updated` (covered by T009) and add a burst test (100 events → 1 dashboard invalidation per 5 s) in `tests/unit/sse/invalidation.test.ts`.

## Phase 5: User Story 3 — Lead detail stays current (P1)

**Goal**: An open lead reflects colleagues' changes. **Independent test**: log an activity elsewhere, and the timeline updates in < 2 s.

- [ ] T022 [P] [US3] Write tests for `components/live/UpdatedByNote.tsx` logic (`tests/unit/sse/updated-by.test.ts`): a note is shown for events with `by` ≠ me on the open lead, not for own actions. A `lead.assigned` away from me on the open lead yields the reassignment banner state with disabled actions.
- [ ] T023 [US3] Implement `components/live/UpdatedByNote.tsx` (note and reassignment banner) and append its registration to the F05 detail header slot in `components/leads/detail/slots.tsx` (shared, append-only). Set `lastUpdatedBy` in `useLiveEvents`.

## Phase 6: User Story 4 — Resilient connection (P1)

**Goal**: Reconnect, catch up, show status. **Independent test**: restart the server, and the dot goes amber then green in < 5 s.

- [ ] T024 [P] [US4] Write tests in `tests/unit/sse/live-store.test.ts`: status transitions, offline > 60 s enables polling, highlight TTL expiry.
- [ ] T025 [US4] Implement in `lib/sse/useLiveEvents.ts`: `onerror` → reconnecting, `onopen` → live plus `invalidateQueries()`, `resync` handling, offline > 60 s → 30 s polling flag (`useLivePollingInterval()`), 401 on reconnect → redirect to `/login`.
- [ ] T026 [P] [US4] Implement `components/live/LiveStatusDot.tsx` (green "Live", amber "Reconnecting…", grey "Offline", tooltip and visible text) and append it to the F01 top bar (shared, append-only).

## Phase 7: User Story 5 — Degraded mode (P2)

- [ ] T027 [US5] Add a hub test with the bus in `'memory'` mode (event published in-process reaches the stream) in `tests/unit/sse/hub.test.ts`, and confirm `Redis: degraded` is logged by F01, not by F12.

## Phase 8: E2E and polish

- [ ] T028 Write the Playwright test `tests/e2e/live-updates.spec.ts` with two browser contexts: Anna (DACH rep) on `/inbox`, then the intake API POSTs a DE lead → toast within 2 s, highlighted row, no reload. A South rep context receives nothing. A reload-free reconnect check is optional. Use `PORT` from the env.
- [ ] T029 [P] Add an idle 10-minute heartbeat check as a fake-timer test in `tests/unit/sse/route.test.ts` (SC-003).
- [ ] T030 Run `npm run typecheck`, `npm run lint`, `npm test`, `npm run test:e2e`. Walk through `quickstart.md`. Amend `docs/features/F12-live-updates.md` if any behavior deviates. Write `REPORT.md`.

- [ ] T031 Cover FR-009: add a checklist item to REPORT.md confirming which producers (F10/F11/F06/F07/F08/F15) publish after commit, and document any that don't as follow-ups. F12 does not edit their code.

## Dependencies

- Phase 2 blocks everything. US1 (MVP) → US2/US3/US4 can then proceed in parallel. US5 needs only Phase 2. T028 needs US1 and US4.
- Within a phase: tests (T003, T004, T007, T009, T010, T024) precede their implementations.

## Parallel examples

- T003 ‖ T004 ‖ T007 (three test files). T013 ‖ T016 ‖ T009. T022 ‖ T024.

## Implementation strategy

MVP = Phases 1–3 (live toast and highlight). Then US4 (resilience), then US2/US3, then US5 and e2e.
