# Tasks: Customer Profile, Preferences & Channel Deep Links (F14)

**Input**: `specs/014-customer-channels/` (spec, plan, data-model, contracts, research, quickstart)
**Tests**: Required (constitution V): pure-logic tests first (red → green), RBAC tests for every lead-scoped endpoint, Playwright e2e for the click-to-prefill journey.
**Path rule**: only F14-owned paths; `slots.tsx` and shared index exports are append-only.

## Phase 1: Setup

- [X] T001 Verify F01/F05/F06 interfaces on the branch (detail slots in `apps/web/components/leads/detail/slots.tsx`, composer `prefill()` context, customer/purchase/lead repositories); where missing, create minimal local stubs behind the documented interface and note them in `specs/014-customer-channels/REPORT.md`
- [X] T002 [P] Create empty module files and append exports: `packages/shared/src/channels.ts`, `packages/shared/src/customer-timezone.ts`, `packages/shared/src/schemas/customer.ts` (append-only export in the shared index)

## Phase 2: Foundational (blocks all stories)

- [X] T003 [P] Write failing Vitest tests for link builders in `packages/shared/src/channels.test.ts`: WhatsApp (`https://wa.me/<digits>?text=`), tel, SMS (`sms:<E164>?&body=`), mailto (subject+body), accented names (Émile, João), special chars (`&`, `?`, `#`, newline, emoji), truncation to 1,000 chars with `truncated` flag, availability and reasons ("No email on file", "Invalid phone number", missing phone)
- [X] T004 Implement `packages/shared/src/channels.ts` (builders, `channelAvailability`, `truncateMessage`) until T003 passes
- [X] T005 [P] Write failing Vitest tests in `packages/shared/src/templates.test.ts`: 7 languages × 5 keys all exist (35), every render has no leftover `{…}` placeholders, unknown variable → empty string plus dev warning, unsupported language falls back to English with `langUsed`, `offer_share` with no offer is reported disabled, email subject present where applicable, output is plain text
- [X] T006 Implement `packages/shared/src/templates.ts` (`TEMPLATES`, `TemplateKey`, `TemplateLang`, `renderTemplate`, `resolveTemplateLang`; append-only) until T005 passes; sample it/first_contact text from the F14 doc
- [X] T007 [P] Write failing tests in `packages/shared/src/customer-timezone.test.ts`: country→zone map (DE/AT/CH/FR/BE/NL/LU/IT/ES, PT→Lisbon, unknown→Europe/Berlin), windows MORNING 08–12 / AFTERNOON 12–17 / EVENING 17–20, ANYTIME never hints, hint text "Customer prefers evenings (it's 10:15 in Milan)", DST edge
- [X] T008 Implement `packages/shared/src/customer-timezone.ts` until T007 passes
- [X] T009 [P] Write failing tests for `PatchPreferencesSchema` in `packages/shared/src/schemas/customer.test.ts` (at least one field, enum validation, secondary ≠ preferred, supported language, `leadId` required), then implement in `packages/shared/src/schemas/customer.ts`
- [X] T010 [P] Define `ChannelAdapter` in `apps/web/server/channels/ChannelAdapter.ts` and implement `DeepLinkAdapter` (all four channels, `send` undefined) in `apps/web/server/channels/DeepLinkAdapter.ts` with a unit test `apps/web/tests/unit/deep-link-adapter.test.ts` written first; export via `apps/web/server/channels/index.ts`

## Phase 3: User Story 1 — Customer card (P1)

**Independent test**: open the seeded Giulia Conti lead and verify card contents.

- [X] T011 [P] [US1] Write failing service test `apps/web/tests/unit/customer-profile.test.ts` for `getProfile` returning the contract shape from `contracts/customers-api.md`
- [X] T012 [P] [US1] Write failing RBAC route tests `apps/web/tests/unit/customers.rbac.test.ts` for `GET /api/customers/:id`: REP/MANAGER/VP, in-scope lead ok, out-of-scope 403, lead not belonging to customer 404, unauthenticated 401
- [X] T013 [US1] Implement `getProfile` in `apps/web/server/channels/customer-profile.ts` (authorize via F03 `authorize`, repository reads, no N+1)
- [X] T014 [US1] Implement thin `GET` handler in `apps/web/app/api/customers/[id]/route.ts` (Zod query validation, authorize, delegate)
- [X] T015 [US1] Build `apps/web/components/leads/customer/CustomerCard.tsx`: name·city+flag·age band·language, international phone format with copy button, email with copy button or "—", ★ preferred, "Also OK", best time, "No marketing consent" badge, loading/empty/error states
- [X] T016 [US1] Register CustomerCard append-only in `apps/web/components/leads/detail/slots.tsx`

## Phase 4: User Story 2 — Returning-customer history (P1)

**Independent test**: a seeded returning customer shows badge + History entries; a new customer has no History card.

- [X] T017 [P] [US2] Write failing tests for history redaction in `apps/web/tests/unit/customer-profile.test.ts`: out-of-scope leads reduce to `{reference, stage, createdAt, inScope:false}` with no id/owner; in-scope keep id and owner; purchases included
- [X] T018 [US2] Implement history + redaction in `apps/web/server/channels/customer-profile.ts` (scope from F03 `scopeFor(user)`; a single query joining owner names)
- [X] T019 [US2] Build `apps/web/components/leads/customer/HistoryCard.tsx` (purchases "Metro Hatch · 21.500 € · Mar 2021", past leads linking only when in scope, hidden for new customers) and the "Returning customer" badge in the CustomerCard header
- [X] T020 [US2] Register HistoryCard append-only in `apps/web/components/leads/detail/slots.tsx`
- [X] T021 [US2] Add test asserting 100% of seeded returning customers have at least one history entry (SC-004) in `apps/web/tests/unit/customer-profile.seed.test.ts`

## Phase 5: User Story 3 — Contact on preferred channel (P1)

**Independent test**: click primary WhatsApp button, see deep link and prefilled composer.

- [X] T022 [P] [US3] Write failing Playwright test `apps/web/tests/e2e/customer-channels.spec.ts` (use `PORT`; assert anchor `href` and `target=_blank` for WhatsApp, composer shows type WHATSAPP with template text, Call prefills "Called customer", nothing is saved until submit — assert no new activity before submit, SC-001 ≤ 2 clicks)
- [X] T023 [P] [US3] Write failing RBAC tests for `GET /api/leads/:id/contact-link` in `apps/web/tests/unit/contact-link.rbac.test.ts` (REP/MANAGER/VP in/out of scope; unavailable channel 400; no DB writes)
- [X] T024 [US3] Implement `apps/web/app/api/leads/[id]/contact-link/route.ts` using shared builders and `DeepLinkAdapter`
- [X] T025 [US3] Build `apps/web/components/leads/channels/BestTimeHint.tsx` using `customer-timezone.ts`
- [X] T026 [US3] Build `apps/web/components/leads/channels/ChannelBar.tsx`: primary ★ preferred button, others outline ordered secondary → rest, disabled channels with reason tooltip, copy-number button beside Call, real anchors (no `window.open`), calls `composer.prefill({type, note, channel, aiAssisted:false})` and focuses outcome; no network write on click (FR-007)
- [X] T027 [US3] Register ChannelBar (right column) and BestTimeHint append-only in `apps/web/components/leads/detail/slots.tsx`

## Phase 6: User Story 4 — Multilingual templates (P1)

**Independent test**: picker previews render in the customer's language with fallback and disabled `offer_share`.

- [X] T028 [US4] Build `apps/web/components/leads/channels/TemplatePicker.tsx` (shadcn Popover: list, preview, language select, fallback notice "Template in English (no {language} template)", disabled `offer_share` without an applicable offer via F15 stub, "Open {Channel}" anchor and "Copy text", truncation warning), filling variables per FR-011 (current user name, vehicle display name, offer)
- [X] T029 [US4] Wire TemplatePicker into ChannelBar for WhatsApp, SMS and Email; default template `first_contact` when no prior contact activity else `follow_up` (assumptions #10)
- [X] T030 [US4] Extend e2e `apps/web/tests/e2e/customer-channels.spec.ts` for language switch and fallback

## Phase 7: User Story 5 — Edit preferences (P2)

**Independent test**: change WhatsApp → Call, see card, audit row and timeline note.

- [X] T031 [P] [US5] Write failing tests in `apps/web/tests/unit/customer-profile.test.ts` for `updatePreferences`: single transaction, customer updated, audit row with before/after, SYSTEM NOTE "Preferences updated: WhatsApp → Call" on the viewed lead, rollback on failure
- [X] T032 [P] [US5] Write failing RBAC tests for `PATCH /api/customers/:id` in `apps/web/tests/unit/customers.rbac.test.ts`: needs `lead:write` on an in-scope lead of the customer; VP/MANAGER/REP in/out of scope; 400 invalid body
- [X] T033 [US5] Implement `updatePreferences` in `apps/web/server/channels/customer-profile.ts` and the `PATCH` handler in `apps/web/app/api/customers/[id]/route.ts`
- [X] T034 [US5] Build `apps/web/components/leads/customer/EditPreferencesDialog.tsx` (TanStack Query mutation, invalidates lead detail/timeline) and add the "Edit preferences" button to CustomerCard

## Phase 8: Polish

- [X] T035 [P] Accessibility pass: keyboard focus order, visible focus rings, text labels on all icons, contrast (`apps/web/components/leads/customer/**`, `apps/web/components/leads/channels/**`)
- [X] T036 [P] Confirm no PII in logs from the new routes and no Redis/AI dependency (degradation check)
- [X] T037 Run `npm run typecheck`, `npm run lint`, `npm test`, `npm run test:e2e`; walk `quickstart.md`; write `specs/014-customer-channels/REPORT.md`

## Dependencies & Order

- Phase 2 gates all stories. Within each phase, test tasks precede their implementation tasks.
- US1 → US2 (shares service file and card) → US3 → US4 (extends ChannelBar) ; US5 depends on US1 (card) only.
- Parallel: T003/T005/T007/T009/T010 (different files); T011/T012; T022/T023; T031/T032.

## MVP

Phase 1–2 plus US1 and US3 (card plus one-click contact).

## Analyze follow-ups
- [X] T038 Amend `docs/features/F14-customer-channels.md` §9 endpoint contracts to include `leadId` (GET query, PATCH body) per `assumptions.md` #11, and list it under Deviations in `REPORT.md`
