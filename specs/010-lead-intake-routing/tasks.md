# Tasks: Lead Intake, Dedupe, Routing & Auto-assign, Simulator

**Input**: `specs/010-lead-intake-routing/` (plan.md, spec.md, data-model.md, contracts/, research.md, quickstart.md)

**Prerequisites**: F01 (schema, bus, redis client, `IntakeLeadSchema`, `writeAudit`, `AppError`, seed generator), F09 (`scoreLead`), F03 data. All paths are under `apps/web/` unless noted. Tests for pure logic come before their implementation (red → green).

Format: `- [ ] T### [P?] [US?] description with path`

## Phase 1: Setup

- [ ] T001 Add dependencies `libphonenumber-js`, `@faker-js/faker`, `tsx` to `apps/web/package.json` (skip any F01 already added) and the script `"simulate": "tsx scripts/simulate.ts"`; append root `package.json` script `"simulate": "npm run simulate -w apps/web --"`
- [ ] T002 [P] Create empty module skeletons with exported type signatures: `server/services/dedupe.ts`, `server/services/routing.ts`, `server/services/intake.ts`, `app/api/intake/_lib/`, and shared local types (`IntakeContext`, `CustomerFacts`, `TeamResolution`, `Assignment`, `IngestResult`) per data-model.md
- [ ] T003 [P] Create a test helper `tests/helpers/intake-db.ts` that builds a temp SQLite via F01 migrations, seeds teams DACH/West/South with reps (Anna, Jonas, Lea, Felix per spec US-4), and a Redis up/down mock toggle

## Phase 2: Foundational (blocks all stories)

- [ ] T004 [P] Write unit tests `tests/unit/dedupe.test.ts` for `normalizePhone` (DE `0151 1234 5678` → `+4915112345678`; IT `347 123 4567` → `+393471234567`; `0033 6 12 34 56 78`; `+CC`; invalid → error), `normalizeEmail` (trim, lowercase), and `deriveAgeBand` (18–25, 26–35, 36–45, 46–60, 60+); expect them to fail
- [ ] T005 Implement `normalizePhone`, `normalizeEmail`, `deriveAgeBand` and the non-mobile channel-warning check in `server/services/dedupe.ts` until T004 passes
- [ ] T006 [P] Write unit tests `tests/unit/reference.test.ts` for `formatReference(year, seq)` (`EDM-2026-00812`, zero padding, year rollover restarts at 00001) and `nextReference(tx, now)` against a temp DB (max+1, UTC year); expect failure
- [ ] T007 Implement `formatReference` and `nextReference` in `server/services/intake.ts` (exported for seed reuse) until T006 passes
- [ ] T008 [P] Write unit tests `tests/unit/intake-schema.test.ts` for the shared `IntakeLeadSchema` refinements as F10 relies on them (email or phone; preferred channel needs its contact detail; budget min ≤ max; unknown fields stripped; honeypot parses)
- [ ] T009 [P] Write unit tests (before implementation, expect failure) `tests/unit/intake-guards.test.ts` for key parsing/compare, rate-limit window (60 ok, 61st rejected, Redis down fallback), body limits, and CORS header rules (`http://localhost:3001` allowed, `http://evil.test` none)
- [ ] T010 [P] Implement the API guard helpers in `app/api/intake/_lib/`: `api-key.ts` (parse `INTAKE_API_KEYS` `name:key` or bare key → `default`, SHA-256 + `timingSafeEqual`, no early exit), `cors.ts` (allow only `SHOWROOM_ORIGIN`, methods `POST, OPTIONS`, headers `Content-Type, X-API-Key, Idempotency-Key`), `rate-limit.ts` (Redis fixed window `rl:intake:<name>:<ip>` 60/60 s with in-memory fallback, returns retry-after seconds, logs `redis_degraded` at most once a minute), `client-ip.ts`, `body.ts` (415 non-JSON, 413 over 10 240 bytes)

## Phase 3: User Story 1 - Accept a lead from an external source (P1) 🎯 MVP

**Goal**: valid enquiry returns 201 with reference; auth, validation, rate limit, honeypot, CORS behave per spec.
**Independent test**: curl per quickstart step 2.

- [ ] T011 [P] [US1] Integration tests `tests/integration/intake-http.test.ts` calling the route handler: 201 shape (no ids/scores, FR-020), 401 missing/unknown key with nothing stored, 400 with per-field `fields` map (no email+phone, unknown model, invalid phone for country, budget min > max), 415, 413, 429 with `Retry-After`, honeypot 202 with zero rows and a logged warning, OPTIONS preflight allowed/denied origins
- [ ] T012 [US1] Implement `app/api/intake/leads/route.ts` (`OPTIONS`, `POST`): content type → size → key → rate limit → JSON parse → `IntakeLeadSchema` (400 field map via F01 error shape) → honeypot 202 → `intakeService.ingest` → map result to 201/200; 500 `INTERNAL` on unexpected errors; add CORS headers per T009
- [ ] T013 [US1] Implement the minimal `ingest()` happy path in `server/services/intake.ts`: normalize, create a new customer (`is_returning = 0`, `search_text` via customer repository), score with F09 `scoreLead` (freshness = 20), insert lead with reference, `LEAD_CREATED` SYSTEM activity ("Lead created from Facebook · Hamburg, DE"), `audit_log` `lead.intake` with `apiKeyName`, all in one transaction; the lead goes to the pool until US-3/US-4 land; `team_id` is required by the schema, so use the first team by name as a placeholder until T019 replaces it

## Phase 4: User Story 2 - Recognise returning customers (P1)

**Goal**: match by E.164 phone then email; update preferences; flag returning.
**Independent test**: Giulia Conti fixture, four phone formats.

- [ ] T014 [P] [US2] Unit/integration tests `tests/unit/dedupe-match.test.ts`: phone formats national/spaced/`+CC`/`00CC` all match (SC-005); email match case-insensitive; phone and email matching different customers → phone wins and `dedupeConflict.emailCustomerId` in LEAD_CREATED metadata; preferences updated and missing email/phone filled, names never overwritten; `customerFacts` returns `isReturning` (earlier lead or purchase) and `hasRecentPurchase` (within 5 years)
- [ ] T015 [US2] Implement `findCustomer`, `mergeCustomer`, `customerFacts` in `server/services/dedupe.ts`; set `customers.is_returning = 1` inside the intake transaction on a match with prior lead or purchase; refresh `search_text` on insert and preference update
- [ ] T016 [US2] Wire dedupe and facts into `ingest()` (pass `isReturning`/`hasRecentPurchase` to `scoreLead`; record `dedupeConflict`, `channelWarning` in LEAD_CREATED metadata)

## Phase 5: User Story 3 - Route to the right regional team (P1)

**Goal**: sticky owner → country team → round-robin fallback.
**Independent test**: DE/FR/IT/PL enquiries.

- [ ] T017 [P] [US3] Unit tests `tests/unit/routing-team.test.ts` for `resolveTeam` on every seeded country (DE/AT/CH → DACH; FR/BE/NL/LU → West; IT/ES/PT → South) read from `teams.countries`, fallback round-robin for PL/IE/DK (cycling through teams, Redis counter `rr:teams` and in-memory fallback), sticky owner crossing teams (open lead; closed lead active ≤ 90 days; closed lead older than 90 days not sticky; inactive or at-capacity owner skipped); expect failure
- [ ] T018 [US3] Implement `resolveTeam` and the team round-robin counter in `server/services/routing.ts` until T017 passes; LEAD_CREATED metadata records `routing: 'fallback_round_robin'` where applicable
- [ ] T019 [US3] Wire `resolveTeam` into `ingest()` and set `leads.team_id`

## Phase 6: User Story 4 - Auto-assign fairly (P1)

**Goal**: strategy selection, capacity, pool fallbacks, per-team serialization.
**Independent test**: DACH counts Anna 12, Jonas 9, Lea 9, Felix 14 → Lea.

- [ ] T020 [P] [US4] Unit tests `tests/unit/routing-select.test.ts` for pure `selectLoadBalanced` (min open → oldest `last_assigned_at`, nulls first → name → id, with ties), `selectLanguageMatch` (filter by language, fallback reason `language fallback: no fr speaker`), `selectRoundRobin` (order by name then id, first after cursor, wrap-around, cursor update), and eligibility filter (role REP, active, same team, open < `max_open_leads`); expect failure
- [ ] T021 [US4] Implement the three selectors in `server/services/routing.ts` until T020 passes
- [ ] T022 [P] [US4] Tests `tests/integration/routing-assign.test.ts` for `pickAssignee` against temp DB: strategy per team setting, auto-assign OFF → pool with `unassignedReason: 'auto_assign_off'`, all at capacity (25) → pool with note "Auto-assign skipped: all reps at capacity", zero active reps → `no_active_reps`, sticky owner assigned regardless of auto-assign with reason `existing customer relationship`, ROUND_ROBIN updates `teams.rr_cursor`, `users.last_assigned_at` updated
- [ ] T023 [US4] Implement `pickAssignee(team, customerLanguage, tx)` (exported for F11) and `withTeamLock(teamId, fn)` (Redis `SET lock:assign:<id> NX PX 5000`, 3 × 50 ms retries, token-checked release, in-process per-team mutex always, warning when the Redis lock is not obtained) in `server/services/routing.ts`
- [ ] T024 [US4] Wire assignment into `ingest()`: inside `withTeamLock` + one transaction write customer, lead (`owner_id`, `assigned_at`, `version=1`), `LEAD_CREATED`, `ASSIGNED` ("Auto-assigned to Lea Hoffmann · language match: fr · 9 open leads"), `users.last_assigned_at`, `teams.rr_cursor`, `audit_log`; retry once on reference unique violation
- [ ] T025 [P] [US4] Concurrency tests `tests/integration/intake-concurrency.test.ts`: 20 and 50 parallel `ingest()` into one team give unique references, exactly one owner-or-pool each, open counts balanced (max − min ≤ 1 from equal start); 40 sequential intakes stay balanced (SC-004); repeat with Redis mocked down

## Phase 7: User Story 5 - Everything visible and live (P1)

**Goal**: timeline entries, events, audit.
**Independent test**: create an assigned lead and inspect activities, published events, audit row.

- [ ] T026 [P] [US5] Tests `tests/integration/intake-events.test.ts`: `lead.created` published after commit and `lead.assigned` (method `AUTO`, strategy, reason) only when an owner is set; a throwing bus still returns 201; `audit_log` row has `action='lead.intake'`, `actor_id` null, `after` snapshot, `meta.apiKeyName`; timeline copy matches spec
- [ ] T027 [US5] Implement post-commit publishing in `ingest()` (try/catch, never fails the request; `LeadSummary` built from the committed row; extended `lead.assigned` fields, see research.md "Requires F01 change")

## Phase 8: User Story 6 - Idempotent submissions (P1)

**Goal**: replay and implicit duplicate protection.
**Independent test**: same `Idempotency-Key` twice.

- [ ] T028 [P] [US6] Tests `tests/integration/intake-idempotency.test.ts`: same key within 24 h → 200 `duplicate` with the original reference and no new rows; header wins over body `idempotencyKey`; key replayed with a different payload → original reference; no key, same customer + same `vehicleModel` + open lead ≤ 10 min → 200 duplicate; after 10 min or another model → new lead
- [ ] T029 [US6] Implement idempotency lookup (LEAD_CREATED metadata, 24 h) and the implicit duplicate window (10 min) at the start of `ingest()`, before dedupe and locking

## Phase 9: User Story 7 - Simulator (P1)

**Goal**: demo traffic generator.
**Independent test**: `--count 3 --seed 1` gives 3 × 201 with deterministic names.

- [ ] T030 [P] [US7] Unit tests `tests/unit/simulate-args.test.ts` for arg parsing (defaults, `--count 0`, `--returning` bounds, `--countries` CSV), seeded determinism (same seed → same payload sequence), source mix weights (Website 35, Facebook 12, Instagram 8, Google Ads 15, Portal 5, Walk-in 10, Phone 8, Referral 7), and returning phones drawn from the seed customer generator with the same `SEED`
- [ ] T031 [US7] Implement `scripts/simulate.ts` (`node:util parseArgs`, seeded faker locales `de, de_AT, de_CH, fr, fr_BE, nl, nl_BE, it, es, pt_PT`, vehicle catalog, pacing 60 000 / rate ms, `--burst` via `Promise.all`, coloured lines ✔/◌/✖, summary of sent/assigned/pool/returning/errors/avg latency, error status and body printed and continue, exit 1 with `--fail-fast`)
- [ ] T032 [US7] Simulator smoke test `tests/integration/simulate-smoke.test.ts`: start the route handler on an ephemeral port (respect `PORT`), run the simulator with `--count 3 --seed 1` and assert 3 × 201 and deterministic names; a second run with an unreachable URL prints errors and continues, and exits 1 with `--fail-fast`

## Phase 10: Polish & Cross-Cutting

- [ ] T033 [P] Playwright e2e `tests/e2e/intake.spec.ts` (uses `PORT`, no hardcoded ports): POST an enquiry with the dev key, expect 201; if the F04 inbox is present, sign in as the assignee and see the lead, otherwise verify through the API/DB; then repeat with Redis stopped
- [ ] T034 [P] Degraded-mode integration test `tests/integration/intake-redis-down.test.ts`: rate limiting, lock and team round-robin fall back; intake still returns 201; `redis_degraded` logged once per minute
- [ ] T035 [P] Verify no PII (email, phone) appears in log output during intake tests; verify the response leaks no ids or scores
- [ ] T036 Run `npm run typecheck`, `npm run lint`, `npm test`, and walk through `quickstart.md`; fix failures inside owned paths
- [ ] T038 Latency check `tests/integration/intake-perf.test.ts`: 200 sequential intakes on the seeded temp DB measure p95 < 150 ms with Redis mocked up and < 250 ms mocked down, and event publish within 300 ms of the request (SC-001, SC-002; Constitution IX); report numbers, do not flake CI (use a generous margin, log actuals)
- [ ] T037 Amend `docs/features/F10-lead-intake-routing.md` only if behavior deviates (for example the simulator line content); list the deviations in `REPORT.md`

## Dependencies & Execution Order

- Phase 1 → Phase 2 → stories. Phase 2 (T004–T010) blocks all stories.
- US1 (T011–T013) is the MVP. US2 and US3 depend on US1's `ingest()` skeleton; US4 depends on US3 (`resolveTeam`); US5 and US6 depend on US4's transaction; US7 depends only on the API contract (can start after T012).
- In every phase the test task precedes its implementation task.

### Parallel opportunities
T004/T006/T008/T009 (different test files); T014/T017/T020/T022 (story tests); T030 (simulator tests) runs in parallel with US2–US6 work.

## Implementation Strategy
MVP = Phases 1–3 (accept and store a lead). Then add returning detection, routing, assignment, events, idempotency, simulator in order. Commit after each phase with `feat(F10): …`.
