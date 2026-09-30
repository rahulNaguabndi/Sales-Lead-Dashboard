# Tasks: Showroom Mini App (Lead Generation)

**Input**: `specs/013-showroom-app/` (spec, plan, research, data-model, contracts/intake-client.md)
**Scope**: only `apps/showroom/src/**`, `apps/showroom/.env.example`, `apps/showroom/index.html`; append-only edits to `apps/showroom/package.json` / Vite config (deps, `test` block).
**Tests**: pure logic first (red → green). RBAC tests: **not applicable** (the showroom has no lead-scoped endpoints; server-side RBAC belongs to F10).

## Phase 1: Setup

- [ ] T001 Append deps to `apps/showroom/package.json` (react-router-dom, react-hook-form, @hookform/resolvers, zod, @faker-js/faker; dev: vitest, jsdom, @testing-library/react, @testing-library/user-event, @testing-library/jest-dom) and add a `test` script plus a Vitest `test` block (jsdom, setup file) to `apps/showroom/vite.config.ts` without reordering existing config; run `npm install`
- [ ] T002 [P] Replace `apps/showroom/.env.example` with `VITE_INTAKE_URL=http://localhost:3000/api/intake/leads`, `VITE_INTAKE_API_KEY=showroom-dev-key`, `VITE_SHOW_DEMO_TOOLBAR=true`, `VITE_MOCK_INTAKE=false` (FR-015)
- [ ] T003 [P] Update `apps/showroom/index.html` (title "EuroDrive Motors", root div, warm neutral body classes) and create `apps/showroom/src/test/setup.ts` (jest-dom, `crypto.randomUUID` stub, `localStorage.clear` after each)

## Phase 2: Foundational (blocks all stories)

- [ ] T004 [P] Write failing tests `apps/showroom/src/lib/env.test.ts` (defaults per FR-015; invalid URL throws; booleans parsed from "true"/"false")
- [ ] T005 Implement `apps/showroom/src/lib/env.ts` (zod-parsed `import.meta.env`)
- [ ] T006 [P] Write failing tests `apps/showroom/src/lib/phone.test.ts` (`+49` + `151 1234 5678` → `+4915112345678`; leading `+49`/`0049` duplicate dial stripped; empty digits → undefined; dial follows country while digits kept)
- [ ] T007 [P] Write failing tests `apps/showroom/src/lib/budget.test.ts` (LT20 → max 2_000_000 cents only; 20_30 → 2_000_000–3_000_000; 30_40; 40_55 → 4_000_000–5_500_000; GE55 → min 5_500_000 only; empty → none)
- [ ] T008 [P] Implement `apps/showroom/src/lib/phone.ts` and `apps/showroom/src/lib/budget.ts` to pass T006/T007
- [ ] T009 [P] Write failing tests `apps/showroom/src/lib/payload.test.ts` (form values → `IntakeLead` accepted by `IntakeLeadSchema`; "Not sure yet" omits vehicleModel; empty strings omitted; source/sourceDetail from demo selection; `ageBand` default UNKNOWN; channel-specific requirement: CALL/WHATSAPP/SMS without phone fails, EMAIL without email fails; both empty → "Please give us an email or phone number.")
- [ ] T010 Implement `apps/showroom/src/lib/payload.ts` (`EnquiryFormValues`, `buildPayload`, wrapping resolver over `IntakeLeadSchema`)
- [ ] T011 [P] Write failing tests `apps/showroom/src/lib/intake-client.test.ts` with stubbed `fetch`: 201/200 parse `IntakeResponseSchema`; 202 → accepted; 400 → validation fields; 401 → unauthorized (console hint); 413; 429 with Retry-After; abort at 10 s → timeout; rejection → network; 415/500/bad body → server; headers `X-API-Key` and `Idempotency-Key` sent; mock mode resolves after 600 ms with `EDM-2026-` reference and no fetch
- [ ] T012 Implement `apps/showroom/src/lib/intake-client.ts` per `contracts/intake-client.md`
- [ ] T013 [P] Write failing tests `apps/showroom/src/lib/errors.test.ts` (each `IntakeError` → banner copy from the contract; validation paths → form field names, unmapped path → banner)
- [ ] T014 Implement `apps/showroom/src/lib/errors.ts`
- [ ] T015 [P] Create `apps/showroom/src/components/VehicleArt.tsx` (inline SVG silhouette + gradient per slug in `VEHICLES`; no external assets, FR-003)
- [ ] T016 Create `apps/showroom/src/main.tsx` and `apps/showroom/src/App.tsx` (router: `/`, `/models/:slug`, `/thank-you`, `*`; page-level enquiry state provider keeping the draft in memory; brand header "EuroDrive Motors")

## Phase 3: User Story 1 - Browse and enquire (P1) 🎯 MVP

**Independent test**: mock mode → submit valid enquiry → thank-you with reference.

- [ ] T017 [P] [US1] Write failing tests `apps/showroom/src/pages/Home.test.tsx` (hero, 6 cards with `formatEUR` price, body and fuel chips filter client-side, "I'm interested" opens the sheet with the model preselected)
- [ ] T018 [P] [US1] Write failing tests `apps/showroom/src/pages/Enquiry.flow.test.tsx` (mock mode: fill required fields, submit, land on `/thank-you` with "Thanks Anna! Your reference is EDM-2026-…"; button disabled + spinner in flight)
- [ ] T019 [P] [US1] Create `apps/showroom/src/components/VehicleCard.tsx` and `apps/showroom/src/components/Filters.tsx`
- [ ] T020 [US1] Create `apps/showroom/src/pages/Home.tsx` (hero "Find your next drive" with scroll CTA, filters, grid)
- [ ] T021 [P] [US1] Create `apps/showroom/src/components/enquiry/PhoneInput.tsx` (dial-code select + digits) and `BudgetSelect.tsx`
- [ ] T022 [US1] Create `apps/showroom/src/components/enquiry/EnquiryForm.tsx` (all FR-005 fields in three groups, RHF + resolver, counters: message max 2000 with counter shown after 1,800, names 1–60, city ≤ 80, honeypot `website` hidden with `tabIndex=-1` and `autocomplete=off`, marketing consent unchecked, idempotency key ref generated on open and reused on retry, disabled submit + spinner in flight, full-screen sheet ≥ 360 px viewport)
- [ ] T023 [US1] Create `apps/showroom/src/components/enquiry/EnquirySheet.tsx` (right-side sheet, sticky footer submit)
- [ ] T024 [US1] Create `apps/showroom/src/pages/ThankYou.tsx` (reference monospace pill with copy button, "What happens next" 3 steps, reads router state or `?ref=`, 202 → generic copy, heading receives focus) and `apps/showroom/src/pages/NotFound.tsx`
- [ ] T025 [US1] Commit: `feat(F13): browse and enquire`

## Phase 4: User Story 2 - Contact preferences (P1)

- [ ] T026 [P] [US2] Write failing tests `apps/showroom/src/components/enquiry/ChannelTiles.test.tsx` (WhatsApp/Call/SMS/Email radio group, keyboard arrows; choosing WhatsApp/SMS/Call makes phone required, Email makes email required; language defaults from country and dial code follows country keeping digits; best-time default ANYTIME)
- [ ] T027 [US2] Create `apps/showroom/src/components/enquiry/ChannelTiles.tsx` and wire channel-dependent requirements and country → dial/language defaults in `EnquiryForm.tsx`

## Phase 5: User Story 3 - Validation and errors (P1)

- [ ] T028 [P] [US3] Write failing tests `apps/showroom/src/components/enquiry/EnquiryForm.errors.test.tsx` (blur invalid email → inline error via `aria-describedby`; server 400 fields shown next to fields and focus on first invalid; network/5xx banner + Retry keeps values and reuses the same Idempotency-Key; 429, 401 (+console hint), 413, timeout banners; both email/phone empty message; draft kept when the sheet is closed and reopened)
- [ ] T029 [US3] Implement error banner with Retry, server-field mapping via `setError`, focus-first-invalid in `EnquiryForm.tsx` using `lib/errors.ts`

## Phase 6: User Story 4 - Demo toolbar (P1)

- [ ] T030 [P] [US4] Write failing tests `apps/showroom/src/components/demo/sources.test.ts` (each "Came from" option → `source`/`sourceDetail`: Instagram + "autumn-suv" → INSTAGRAM; persistence in `localStorage`) and `prefill.test.ts` (random buyer passes `IntakeLeadSchema`; phone starts with the country's dial code; channel weights follow F01 FR-033 by age band, seeded RNG) and `burst.test.ts` (5 submissions 1.5 s apart with fake timers, log of references)
- [ ] T031 [P] [US4] Implement `apps/showroom/src/components/demo/sources.ts`, `prefill.ts` (dynamic `import('@faker-js/faker')`, locale per country), `burst.ts`
- [ ] T032 [US4] Write failing test `apps/showroom/src/components/demo/DemoToolbar.test.tsx` (visible by default; hidden when `VITE_SHOW_DEMO_TOOLBAR=false`; source select drives next payload; Prefill fills the form; Submit ×5 logs references), then create `DemoToolbar.tsx` (36 px dark bar, amber DEMO tag, "Demo controls") and mount it in `App.tsx`
- [ ] T033 [US4] Commit: `feat(F13): contact preferences, errors and demo toolbar`

## Phase 7: User Story 5 - Model detail (P2)

- [ ] T034 [P] [US5] Write failing tests `apps/showroom/src/pages/ModelDetail.test.tsx` (`/models/luma-ev` shows illustration, price, fuel, three highlights and a working "I'm interested"; unknown slug → NotFound)
- [ ] T035 [US5] Create `apps/showroom/src/pages/ModelDetail.tsx` (highlights derived from catalog fields, three per model)

## Phase 8: Polish & cross-cutting

- [ ] T036 [P] Accessibility pass (FR-017): labels on all inputs, `aria-describedby` on errors, radio-group semantics, focus management; verified through Testing Library role/label queries in the flow tests (no extra dependency); the Lighthouse ≥ 95 target (SC-005) is checked manually and recorded in the report
- [ ] T037 [P] Add Playwright test `apps/showroom/src/e2e/showroom-to-inbox.e2e.ts` (uses the root Playwright config if F01 provides one, otherwise the file is left un-run and noted in the report; base URLs from `SHOWROOM_PORT`/`PORT`; FR-016 CORS/idempotency is verified here once F10 exists; submit from the showroom, expect the lead in the persona inbox within 2 s; `test.skip` when the intake API is unreachable or F10/F12 are not merged)
- [ ] T038 Verify `npm run typecheck`, `npm run lint`, `npm test`, and `npm run build --workspace apps/showroom` (gzip < 250 KB, faker in a separate chunk)
- [ ] T039 Walk `quickstart.md` in mock mode; note results for the report

## Dependencies & Order

Setup → Foundational (T004–T016; tests precede implementation in each pair) → US1 (MVP) → US2 → US3 → US4 → US5 → Polish. US2/US3 extend `EnquiryForm.tsx` so they run after US1; US4 and US5 are otherwise independent.

Parallel examples: T006, T007, T009, T011, T013 (test files); T017, T018; T030's three test files.

## Implementation Strategy

MVP = Phases 1–3 (browse and enquire in mock mode). Then add preferences, errors, toolbar, and detail page in priority order.
