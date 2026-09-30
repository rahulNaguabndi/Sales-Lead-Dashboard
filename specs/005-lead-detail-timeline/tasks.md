# Tasks: F05 — Lead Detail & Timeline

**Input**: `specs/005-lead-detail-timeline/` (plan.md, spec.md, data-model.md, contracts/api.md, research.md)
**Paths**: relative to `apps/web/` unless prefixed. Stay inside F05 owned paths. Tests for pure logic come BEFORE implementation (Constitution V).

## Phase 1: Setup

- [ ] T001 Confirm F01/F02/F03 interfaces on this branch (`getSessionUser`, `authorize`/`can`, `NotFoundError`, schema, `packages/shared` catalog and `format.ts`); where a same-wave dependency (F04 `RelativeTime`, F09 score labels) is missing, code against its documented interface with a minimal local stub inside F05 owned paths, and record each stub in REPORT.md
- [ ] T002 [P] Create directories `components/leads/detail/`, `components/timeline/`, `app/(app)/leads/[id]/`, `tests/`

## Phase 2: Foundational (blocks all stories)

- [ ] T003 [P] Unit test cursor encode/decode (round trip, invalid input) in `components/timeline/cursor.test.ts`
- [ ] T004 [P] Unit test `formatSystemActivity` for every SYSTEM type (LEAD_CREATED, STAGE_CHANGED, ASSIGNED, CLAIMED, FOLLOW_UP_SCHEDULED, FOLLOW_UP_MISSED, AUTO_COLD, OFFER_APPLIED, SCORE_CHANGED) plus unknown type in `components/timeline/formatSystemActivity.test.ts`
- [ ] T005 [P] Unit test EUR (`38.900 €`, budget "Not specified", "up to 40.000 €") and international phone display helpers in `components/leads/detail/format.test.ts`
- [ ] T006 [P] Implement `components/timeline/cursor.ts` (base64url of `createdAt:id`)
- [ ] T007 [P] Implement `components/timeline/formatSystemActivity.ts` single formatter map with generic fallback `{type} · {time}`
- [ ] T008 [P] Implement display helpers (money, phone, budget range) in `components/leads/detail/format.ts`, reusing `@leaddesk/shared` format where present
- [ ] T009 Define view-model types (`LeadDetail`, `ActivityItem`, `ActivityPage`, `LeadPermissions`, `LeadSlotProps`) in `components/leads/detail/types.ts` per `data-model.md`
- [ ] T010 [P] Implement `components/timeline/RelativeTime.tsx` (`<time dateTime>`, absolute tooltip, 60 s refresh, 24 h, user locale) unless F04's exists

## Phase 3: User Story 1 — Lead details (P1) 🎯 MVP

**Independent test**: open a seeded lead; header/cards match DB.

- [ ] T011 [US1] Integration test `getLeadDetail`: payload fields, history (previous leads with `canView`, purchases), follow-up summary, "First enquiry" case, in `tests/lead-detail.service.test.ts`
- [ ] T012 [US1] Implement `getLeadDetail(user, id)` in `server/services/lead-detail.ts` (ULID check with no DB query, batched loads, no N+1, permissions via `can()`, read-only)
- [ ] T013 [US1] Implement `GET` in `app/api/leads/[id]/route.ts` (Zod params, 401/404 mapping)
- [ ] T014 [P] [US1] `components/leads/detail/LeadHeader.tsx` (name, reference, read-only stage chip, priority badge + score, owner with "(inactive)", source, created date, Returning badge, `headerActions` slot)
- [ ] T015 [P] [US1] `components/leads/detail/CustomerCard.tsx` (phone, email, city/country, age band, language, ★ preferred channel, secondary, best time, "—" for missing, `customerExtras` slot)
- [ ] T016 [P] [US1] `components/leads/detail/InterestCard.tsx` (model + price, budget, flags, buyer message as plain text with 6-line collapse and "Show more")
- [ ] T017 [P] [US1] `components/leads/detail/HistoryCard.tsx` (links only when `canView`)
- [ ] T018 [US1] `app/(app)/leads/[id]/page.tsx` RSC: load detail + first activities page, hydrate TanStack Query keys, title "Name · REF · Lead Desk", breadcrumb back to inbox, skeleton loading
- [ ] T019 [US1] `app/(app)/leads/[id]/layout.tsx` and `not-found.tsx` ("Lead not found. It may not exist or you may not have access." + "Back to inbox")

## Phase 4: User Story 2 — Chronological timeline (P1)

**Independent test**: lead with 6 USER + 4 SYSTEM shows 10 entries, both orders.

- [ ] T020 [US2] Integration test `listActivities`: ordering both directions with identical `created_at`, kind filter, pagination completeness (sum of pages = count, limit 50/100 cap), invalid cursor in `tests/activities.service.test.ts`
- [ ] T021 [US2] Implement `listActivities(user, leadId, {order, kind, limit, cursor})` in `server/services/lead-detail.ts` (same authorize as detail, keyset `limit+1`, batched actor lookup)
- [ ] T022 [US2] Replace stub in `app/api/leads/[id]/activities/handlers/get.ts` (Zod query: order, kind, limit ≤ 100, cursor)
- [ ] T023 [P] [US2] `components/timeline/TimelineEntry.tsx` (type icon/label, outcome chip, plain-text note with preserved line breaks and 6-line collapse, actor avatar/name, "AI-assisted", RelativeTime)
- [ ] T024 [P] [US2] `components/timeline/SystemEntry.tsx` (compact muted line via `formatSystemActivity`, "System" for null actor)
- [ ] T025 [P] [US2] `components/timeline/TimelineDayGroup.tsx` (Today / Yesterday / "Mon 28 Sep" headers)
- [ ] T026 [P] [US2] `components/timeline/TimelineControls.tsx` (order toggle persisted in localStorage `leaddesk.timeline.order`, filter All/Activities/System)
- [ ] T027 [US2] `components/timeline/Timeline.tsx` (`useInfiniteQuery` `['lead', id, 'activities', {order, kind}]`, `role="feed"`, `aria-busy`, 5 skeletons, inline error retry, "Load older", empty "No activity yet")

## Phase 5: User Story 3 — Access control (P1)

**Independent test**: out-of-scope and missing ids give identical status/body.

- [ ] T028 [US3] RBAC integration tests in `tests/lead-detail.rbac.test.ts`: REP/MANAGER/VP × in-scope/out-of-scope for both endpoints; byte-identical 404 for missing vs out-of-scope; malformed id 404 without DB query; unauthenticated 401; security warning logged with userId and leadId only; `permissions` per role; unassigned pool lead for rep is readable with `canClaim`/`canLogActivity` per F03
- [ ] T029 [US3] Ensure `getLeadDetail`/`listActivities` log out-of-scope attempts (warn, no PII) and throw the same `NotFoundError` as missing
- [ ] T030 [US3] Read-only rendering when `!permissions.canLogActivity`: slot areas show "Claim this lead to work on it" when `permissions.canClaim`; unauthenticated open redirects to `/login?next=/leads/{id}` (verify via shell/middleware from F02)

## Phase 6: User Story 4 — Slots (P1)

- [ ] T031 [US4] Implement `components/leads/detail/slots.tsx` (`leadSlots` record with null defaults, `LeadSlotProps`)
- [ ] T032 [US4] `components/leads/detail/DetailLayout.tsx` renders left/center/right columns and each non-null slot with `{lead, customer, permissions, currentUser}`; null slots render nothing (subtle dev placeholder only)
- [ ] T033 [US4] Unit test: registering a component for one slot renders it in its region with correct props; null slots render nothing, in `components/leads/detail/DetailLayout.test.tsx`

## Phase 7: User Stories 5 and 6 — Score popover, responsive (P2)

- [ ] T034 [P] [US5] `components/leads/detail/ScoreCard.tsx` and `ScoreBreakdownPopover.tsx` (Intent x/35, Source x/15, Customer x/15, Freshness x/20, Engagement x/15; F09 labels when available)
- [ ] T035 [P] [US6] Responsive tabs Details · Timeline · Actions under 1024 px with Timeline default, in `DetailLayout.tsx`

## Phase 8: Polish and e2e

- [ ] T036 E2E `tests/e2e/lead-detail.spec.ts`: inbox → click lead → details; toggle order → first entry changes → reload → persists; out-of-scope deep link as Sofia → not-found page; use `PORT` env, no hardcoded ports
- [ ] T037 Contribute R2 steps to `tests/e2e/core-loop.spec.ts` (append-only, coordinate with F04) if the file exists
- [ ] T038 Assert timeline count equals stored activity count (SC-002) and viewing creates no activity/lead change (FR-014) in `tests/lead-detail.service.test.ts`; also a coarse timing check that `getLeadDetail` and the first activities page stay well under 150 ms on seed data (SC-001)
- [ ] T039 Run `npm run typecheck`, `npm run lint`, `npm test`, `npm run test:e2e`; fix F05-owned failures
- [ ] T040 Update `docs/features/F05-lead-detail-timeline.md` if behavior deviated; write `REPORT.md`

## Dependencies

Phase 1 → 2 → {3, 4, 6} (US2 needs Phase 2 helpers; UI of US1/US2 assembled in `DetailLayout` T032) → 5 (RBAC tests span both services) → 7 → 8.
Within phases: tests (T003–T005, T011, T020, T028, T033) precede their implementations.

## Parallel examples

- T003–T005 together, then T006–T008/T010 together.
- T014–T017 together; T023–T026 together.

## Strategy

MVP = Phases 1–3 (+4 for R2 completeness). Deliver P1 stories first; P2 (US5, US6) last.
