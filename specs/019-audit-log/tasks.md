# Tasks: F19 — Audit Log & Traceability UI

**Input**: `specs/019-audit-log/` (plan.md, spec.md, data-model.md, contracts/audit-api.md, research.md)
**Tests**: Required by spec (SC-001, SC-004, SC-005) and Constitution V: pure-logic tests come **before** implementation; RBAC tests for REP/MANAGER/VP; one Playwright journey.
**Paths** are under `apps/web/` unless stated. Stay inside F19-owned paths; shared files are append-only.

## Phase 1: Setup

- [ ] T001 Confirm F01 provides the `audit_log` table (with `meta`, indexes, append-only triggers), `audit.record(entry, tx)` and `lib/format.ts`; confirm F03 `scopeFor`/`authorize`. If any is missing, stub the interface in `server/services/audit.ts` (adapter function) and log it in REPORT.md under "Requires F01 change".
- [ ] T002 [P] Verify `AuditAction` / `AuditEntity` enums in `packages/shared` cover every action in spec.md's table; append missing values only (append-only).

## Phase 2: Foundational (blocks all stories)

- [ ] T003 [P] Write failing unit tests for the cursor codec (encode/decode round-trip, malformed cursor → INVALID_FILTER) and Zod filter schema (limit 1–100 default 50, `from ≤ to`, action pattern, entity enum) in `server/services/audit.test.ts`
- [ ] T004 Implement cursor codec and `auditFiltersSchema` in `server/services/audit.ts`
- [ ] T005 [P] Write failing unit tests for scope predicate builder: REP rejected, MANAGER (team leads, subtree actors, team settings, own entries, offers excluded), VP unrestricted, in `server/services/audit.test.ts`
- [ ] T006 Implement `buildScope(ctx)` (parameterised, no string concatenation) in `server/services/audit.ts`

## Phase 3: User Story 1 — Investigate a lead (P1)

**Goal**: Managers see all changes for a lead with actor and diff. **Independent test**: reassign + stage change + activity → `/audit?entity=lead&entityId=<id>` shows 3 entries.

- [ ] T007 [P] [US1] Write failing tests for `summarize(entry)` (owner change with method, stage change, created, unknown action fallback) in `server/services/audit.test.ts`
- [ ] T008 [P] [US1] Write failing tests for `resolveRefs(entries)` (batch user-name resolution, deactivated user resolves, no N+1 — one query per ref type) in `server/services/audit.test.ts`
- [ ] T009 [US1] Implement `summarize` and `resolveRefs` in `server/services/audit.ts`
- [ ] T010 [P] [US1] Write failing integration tests for `queryAudit` by `entity`/`entityId` with seeded entries (actor names, before/after, `entityLabel`) in `server/services/audit.test.ts`
- [ ] T011 [US1] Implement `queryAudit(ctx, filters)` core (scope join to leads, entity filters, ordering `created_at DESC, id DESC`, limit+1) in `server/services/audit.ts`
- [ ] T012 [US1] Implement `GET /api/audit` thin handler (authenticate → Zod → authorize → service; 400 INVALID_FILTER, 401, 403, 405 for other methods) in `app/api/audit/route.ts`
- [ ] T013 [P] [US1] Register the "Audit trail" link (MANAGER/VP only, `/audit?entity=lead&entityId=<id>`) by appending to `components/leads/detail/slots.tsx`
- [ ] T014 [US1] Build `ActorCell`, `AuditRow`, `AuditTable` (columns Time with absolute tooltip, Actor, Action label, Entity link, Summary; loading/empty/error states) in `components/audit/`
- [ ] T015 [US1] Build `AuditPage` with TanStack infinite query and `app/(app)/audit/page.tsx` (server-side authorize) plus append "Audit" nav entry (shield icon, MANAGER/VP) in F01 nav registry

## Phase 4: User Story 2 — Search and filter (P1)

**Independent test**: VP filters `offer.*` + 30 days → only offer entries, 50/page, Load more.

- [ ] T016 [P] [US2] Write failing tests for keyset pagination (no gaps/duplicates across pages with equal `created_at`, `nextCursor` null on last page, limit cap 100) and filters (`from/to`, `actorId`, exact and prefix `action`, `leadRef`) in `server/services/audit.test.ts`
- [ ] T017 [US2] Implement filters, escaped prefix `LIKE`, `leadRef` resolution and keyset cursor in `server/services/audit.ts`
- [ ] T018 [US2] Build `AuditFilterBar` (date range, actor combobox, grouped action multi-select, entity type, lead reference search) with URL-driven state (FR-011) and "Load more" in `components/audit/`
- [ ] T019 [P] [US2] Add a perf test: 20k seeded entries, 50-row page < 150 ms p95 (SC-003) in `server/services/audit.test.ts`

## Phase 5: User Story 3 — Inspect a diff (P1)

**Independent test**: expand stage-change and created entries; see labelled, formatted values.

- [ ] T020 [P] [US3] Write failing tests for `labels.ts` (field labels, stage enum labels, cents → EUR via `lib/format.ts`, timestamps → local date, truncation at 500 chars, malformed JSON → raw fallback) in `components/audit/labels.test.ts`
- [ ] T021 [US3] Implement `components/audit/labels.ts`
- [ ] T022 [US3] Build `DiffPanel` (Before/After columns, changed-keys only with "changed" marker plus highlight, added keys show "—", unchanged collapsed, create shows after only, "Show more") in `components/audit/DiffPanel.tsx`

## Phase 6: User Story 4 — Scope enforcement (P1)

**Independent test**: Team DACH manager sees no Team West entries; REP gets 403.

- [ ] T023 [P] [US4] RBAC tests for `GET /api/audit` as REP (403), MANAGER in-scope and out-of-scope (other team's lead entries absent, offer entries absent, moved lead follows current team, own authored entries visible), VP (all), unauthenticated (401) in `app/api/audit/route.test.ts`
- [ ] T024 [US4] Fix any scope/authorization gaps found by T023 in `server/services/audit.ts` and `app/api/audit/route.ts`; REP page access returns 403 in `app/(app)/audit/page.tsx`

## Phase 7: User Story 5 — Security events (P2)

- [ ] T025 [P] [US5] Test: `auth.login_failed` entries expose time, IP, `emailHash` and contain no password or plaintext email (SC-005) in `server/services/audit.test.ts`
- [ ] T026 [US5] Ensure `summarize`/`DiffPanel` render `meta.emailHash`/`ip` for login events in `server/services/audit.ts` and `components/audit/DiffPanel.tsx`

## Phase 8: Writer-contract verification and polish

- [ ] T027 [P] Write writer conformance tests: redaction removes `password_hash`, `token_version`, tokens; activity note text never stored (only `{noteLength, type, outcome}`); rollback leaves no orphan audit entry; UPDATE/DELETE on `audit_log` rejected (FR-001–FR-005, SC-001) in `server/services/audit.test.ts`
- [ ] T028 Implement `expectAudited(action, entityId)` helper in `server/services/audit.testing.ts`
- [ ] T029 [P] Playwright e2e: manager reassigns a lead → "Audit trail" link → entry with `Owner: … → …` diff visible; REP has no Audit nav item. Use `PORT` env, no hardcoded ports, in `e2e/audit.spec.ts`
- [ ] T030 Run `npm run typecheck`, `npm run lint`, `npm test`, `npm run test:e2e`; walk `quickstart.md`; write REPORT.md

## Dependencies

T001–T002 → Phase 2 → US1 (MVP) → US2/US3 (parallel after T011) → US4 → US5 → Phase 8. Tests precede implementation within each story.

## Parallel examples

- T003 ∥ T005; T007 ∥ T008 ∥ T010; T016 ∥ T020 ∥ T023 ∥ T025 ∥ T027.

## Strategy

MVP = Phases 1–3 (scoped query, API, table, lead link). Then filters, diff, security events, conformance helper.
