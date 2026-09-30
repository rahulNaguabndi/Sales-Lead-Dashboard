# F10 — Lead Intake, Dedupe, Routing & Auto-assign, Simulator

| Field | Value |
|---|---|
| **ID** | F10 |
| **Priority** | P1 |
| **Build wave** | 2 |
| **Depends on** | F01 (schema, shared `IntakeLeadSchema`, event bus, Redis client), F03 (hierarchy data), F09 (`scoreLead`) |
| **Blocks** | F11 (manual/claim assignment reuses the assignment core), F12 (produces `lead.created`/`lead.assigned`), F13 (the Showroom posts here) |
| **Personas** | BUYER (indirectly, via the Showroom), REP (receives), MANAGER (configures team behaviour in F11) |
| **Challenge req.** | Makes "incoming leads" (R1) real |
| **Owns (files/areas)** | `apps/web/app/api/intake/**`, `apps/web/server/services/intake.ts`, `apps/web/server/services/routing.ts`, `apps/web/server/services/dedupe.ts`, `apps/web/scripts/simulate.ts` |

## 1. Summary
The intake pipeline is how leads *arrive*. External sources (the Showroom app, the simulator, and in future web forms, ad platforms and portals) POST to one public, API-key-protected endpoint. Each submission is **validated → rate-limited → normalized → deduplicated against existing customers (returning detection) → scored → routed to a regional team → auto-assigned to a rep (if the team has auto-assign on) → persisted atomically with timeline events → broadcast live**. A simulator script streams realistic European leads for the demo.

## 2. User Stories & Acceptance Scenarios

### US-1 (P1): Accept a lead from an external source
*As the dealership, I want every website or ad enquiry to become a lead automatically, so none are lost.*

**Independent test:** `curl -X POST localhost:3000/api/intake/leads -H "X-API-Key: showroom-dev-key" -H "Content-Type: application/json" -d @anna.json` returns 201 with a reference. The lead exists in the DB with a LEAD_CREATED activity.

1. **Given** a valid payload and API key, **When** posted, **Then** the response is **201** `{ "reference": "EDM-2026-00812", "status": "created", "assignedTo": { "firstName": "Anna" }, "expectedContact": { "channel": "WHATSAPP", "bestTime": "EVENING" } }`.
2. **Given** a missing or unknown `X-API-Key`, **Then** **401** `UNAUTHORIZED_CLIENT`, and nothing is stored.
3. **Given** an invalid payload (e.g. no email and no phone, or an unknown model), **Then** **400** `VALIDATION_ERROR` with a per-field message map, so the Showroom can show inline errors.
4. **Given** more than 60 requests per minute from one key and IP, **Then** **429** with a `Retry-After` header.
5. **Given** the hidden honeypot field `website` is filled in (a bot), **Then** **202** `{ "status": "accepted" }` is returned but nothing is stored, and a warning is logged.
6. **Given** the Showroom origin `http://localhost:3001`, **When** the browser sends the CORS preflight, **Then** it's allowed. Any other origin gets no CORS headers.

### US-2 (P1): Recognise returning customers
*As a rep, I want to know when an enquiry comes from someone we already know.*

1. **Given** customer Giulia Conti exists with phone `+393471234567`, **When** a lead arrives with phone "347 123 4567" and country IT, **Then** the phone normalizes to the same E.164 value, the lead attaches to the existing customer, and the lead is flagged returning (scoring gets +10, plus +5 for a purchase within 5 years).
2. **Given** no phone match but an email match (case-insensitive), **Then** the lead attaches to that customer.
3. **Given** phone and email match *different* customers, **Then** the phone match wins, and `metadata.dedupeConflict = { emailCustomerId }` is recorded on the LEAD_CREATED activity.
4. **Given** a matched customer, **Then** their contact preferences (preferred/secondary channel, best time, language, age band, city) are updated to the latest submission and missing email/phone are filled in. Names are never overwritten.

### US-3 (P1): Route to the right regional team
1. **Given** country DE, AT or CH, **Then** team DACH. FR, BE, NL or LU → team West. IT, ES or PT → team South. The mapping is read from `teams.countries`, not hard-coded.
2. **Given** a country no team covers (e.g. PL), **Then** the lead goes to teams in round-robin order (Redis counter `rr:teams`, falling back to an in-memory counter), and the LEAD_CREATED metadata records `routing: "fallback_round_robin"`.
3. **Given** the customer already has an **open** lead (or a lead with activity in the last 90 days) owned by an active rep, **Then** the new lead goes to **that rep and their team** ("sticky owner"), whatever the country and the auto-assign setting. The ASSIGNED activity says `reason: "existing customer relationship"`.

### US-4 (P1): Auto-assign fairly
*As a manager, I want new leads distributed automatically using my team's chosen strategy.*

1. **Given** Team DACH has auto-assign ON with `LOAD_BALANCED`, and the open lead counts are Anna 12, Jonas 9, Lea 9, Felix 14, and Lea was assigned longer ago than Jonas, **Then** the lead goes to **Lea** (fewest open, tie broken by oldest `last_assigned_at`).
2. **Given** `LANGUAGE_MATCH` and customer language `fr`, **Then** only reps who speak fr are considered (Lea Hoffmann), then load-balanced. **Given** no rep speaks the language, **Then** all reps are considered, and the reason says `language fallback: no fr speaker`.
3. **Given** `ROUND_ROBIN` and `rr_cursor` = Jonas (ordered Anna, Felix, Jonas, Lea by name), **Then** the lead goes to **Lea**, and the cursor moves to Lea. It wraps around after the last rep.
4. **Given** every active rep is at `max_open_leads` (25), **Then** the lead goes to the **Unassigned pool** (`owner_id = null`) with the system note "Auto-assign skipped: all reps at capacity".
5. **Given** auto-assign OFF, **Then** the lead goes to the team's Unassigned pool, and LEAD_CREATED metadata includes `unassignedReason: "auto_assign_off"`.
6. **Given** 20 concurrent intake requests for the same team, **Then** each lead is assigned exactly once, open counts stay balanced (max − min ≤ 1 from an equal start), and there are no duplicate references.

### US-5 (P1): Everything visible and live
1. **Given** a lead is created and assigned, **Then** its timeline contains SYSTEM `LEAD_CREATED` ("Lead created from Facebook · Hamburg, DE") and, if assigned, `ASSIGNED` ("Auto-assigned to Lea Hoffmann · language match: fr · 9 open leads").
2. **Given** commit succeeds, **Then** `lead.created` is published, and `lead.assigned` too if an owner was set (method `AUTO`). F12 delivers these to users whose scope covers the lead.
3. **Given** an audit entry is required, **Then** `audit_log` gets `action='lead.intake'`, `actor_id=null`, `after` = the lead snapshot, and `metadata.apiKeyName`.

### US-6 (P1): Idempotent submissions
1. **Given** the Showroom retries the same submission with the same `idempotencyKey` within 24 h, **Then** **200** is returned with the original reference, and no new lead is created.
2. **Given** no idempotency key, but the same customer submits the same vehicle model again within 10 minutes, **Then** it's treated as a duplicate: 200 with the existing reference.

### US-7 (P1): Simulate traffic for the demo
*As the presenter, I want to stream realistic leads so the inbox and dashboard come alive.*

1. **Given** the web app is running, **When** I run `npm run simulate -- --rate 12 --count 20`, **Then** 20 leads are posted at about one every 5 s, and each prints a line: `✔ EDM-2026-00813  Lena Braun (DE, de)  aurora-suv  FACEBOOK  → Team DACH / Anna Weber  HOT 74`.
2. **Given** `--returning 0.2`, **Then** about 20% of leads reuse phone numbers of seeded customers (they come out returning).
3. **Given** `--burst`, **Then** all `--count` leads are sent concurrently (for the concurrency demo).
4. **Given** the API is unreachable or returns an error, **Then** the script prints the error status and body and continues (or exits with code 1 when `--fail-fast` is set).

## 3. Functional Requirements
- **FR-001**: The system MUST expose `POST /api/intake/leads` (public, no user session) and `OPTIONS /api/intake/leads` (CORS preflight).
- **FR-002**: Authentication MUST use the `X-API-Key` header, compared in constant time against `INTAKE_API_KEYS` (comma-separated `name:key` or bare `key`; bare keys get the name `default`).
- **FR-003**: CORS MUST allow only `SHOWROOM_ORIGIN`, methods `POST, OPTIONS`, and headers `Content-Type, X-API-Key, Idempotency-Key`. Server-to-server calls (no Origin, e.g. the simulator) are allowed with a valid key.
- **FR-004**: Requests MUST be `application/json` (else 415) and ≤ 10 KB (else 413).
- **FR-005**: Rate limiting MUST be a fixed window of 60 requests per 60 s per `apiKeyName:ip` in Redis (`rl:intake:<name>:<ip>`), falling back to an in-memory map when Redis is degraded. 429 includes `Retry-After`.
- **FR-006**: The payload MUST be validated with the shared `IntakeLeadSchema` (§9), which is identical in the Showroom and the server.
- **FR-007**: Honeypot: if `website` is non-empty, return 202 without persisting.
- **FR-008**: Normalization: trim all strings; lowercase the email; normalize the phone to **E.164** with `libphonenumber-js`, using `country` as the default region (an invalid phone gives a 400 field error); derive `ageBand` from `age` if only age is given.
- **FR-009**: Dedupe MUST match the customer by E.164 phone first, then by email. It MUST update preferences on a match (US-2.4), and create a new customer otherwise.
- **FR-010**: On a match, if the customer has ≥ 1 earlier lead or ≥ 1 purchase, F10 MUST set the stored column `customers.is_returning = 1` (inside the intake transaction) and treat the lead as returning. New customers are inserted with `is_returning = 0`. `hasRecentPurchase` = a purchase within 5 years. Both are passed to `scoreLead`. The customer repository also refreshes `customers.search_text` (F01 FR-016) on insert or preference update.
- **FR-011**: The score MUST be computed with F09 `scoreLead` at creation (freshness = 20) and stored with `priority` and `score_breakdown`.
- **FR-012**: Routing order MUST be: (1) sticky owner, (2) country → team via `teams.countries`, (3) round-robin across teams. **Sticky owner crosses teams:** if the customer has an open lead, or a lead with activity within the last 90 days, whose owner is active (and under capacity), the new lead goes to that owner **and that owner's team**, regardless of the customer's country.
- **FR-013**: Auto-assignment MUST run only when `teams.auto_assign = 1` (sticky-owner assignment runs regardless). Eligible reps: `role=REP`, `is_active=1`, `team_id = team`, open leads (stage ∈ NEW, CONTACTED, QUALIFIED, TEST_DRIVE, NEGOTIATION) < `max_open_leads`.
- **FR-014**: Strategies MUST behave exactly as follows:
  - `LOAD_BALANCED`: min open count → oldest `last_assigned_at` (nulls first) → name ASC → id ASC.
  - `LANGUAGE_MATCH`: filter by `languages` containing the customer language; if empty, use all eligible (fallback reason); then LOAD_BALANCED.
  - `ROUND_ROBIN`: eligible sorted by name ASC, id ASC; pick the first after `rr_cursor` (wrapping); update `rr_cursor`.
- **FR-015**: Assignment MUST be serialized per team: acquire the Redis lock `lock:assign:<teamId>` (SET NX PX 5000, 3 retries × 50 ms), falling back to an in-process per-team mutex. Selection plus insert happen inside one SQLite transaction.
- **FR-016**: One transaction MUST write: the customer insert/update, the lead (with `reference`, `team_id`, `owner_id`, `assigned_at`, score fields, `version=1`), the SYSTEM `LEAD_CREATED`, the SYSTEM `ASSIGNED` (if assigned), `users.last_assigned_at`, `teams.rr_cursor` (if RR), and `audit_log`.
- **FR-017**: The reference MUST be `EDM-{YYYY}-{NNNNN}`: the UTC year of creation plus a 5-digit zero-padded sequence per year, computed inside the transaction as `max(existing seq for year) + 1`. It's unique-indexed. The seed uses the same generator.
- **FR-018**: After commit, the service MUST publish `lead.created` and, if assigned, `lead.assigned { method: 'AUTO', strategy, reason }`. Publish failures MUST NOT fail the request.
- **FR-019**: Idempotency: the `Idempotency-Key` header or `idempotencyKey` field is stored in LEAD_CREATED metadata. A repeat within 24 h returns 200 with the original reference. The implicit duplicate window is the same customer + same `vehicleModel` + open lead created ≤ 10 min ago.
- **FR-020**: The response MUST NOT expose internal IDs, scores or other customers' data. It returns only `reference`, `status`, the assignee's `firstName` (or null), and `expectedContact`.
- **FR-021**: `apps/web/scripts/simulate.ts` MUST support: `--url` (default `http://localhost:3000/api/intake/leads`), `--key` (default env `INTAKE_API_KEY` or `showroom-dev-key`), `--rate` (leads per minute, default 12), `--count` (default 20; `0` = infinite until Ctrl+C), `--seed` (default random; fixed = reproducible), `--returning` (0–1, default 0.15), `--countries` (CSV ISO2 filter), `--burst`, `--fail-fast`. It uses Faker EU locales matching the country, the source mix from F01 FR-034, with social split into Facebook and Instagram (Website 35%, Facebook 12%, Instagram 8%, Google Ads 15%, Portal 5%, Walk-in 10%, Phone 8%, Referral 7%), and the vehicle catalog. Returning phones come from the deterministic seed customer generator with the same `SEED`, so it needs no DB access.

## 4. Key Entities & Data
- Writes: `customers`, `leads`, `activities` (SYSTEM), `users.last_assigned_at`, `teams.rr_cursor`, `audit_log`.
- Reads: `teams` (countries, auto_assign, assign_strategy, rr_cursor), `users` (reps, languages, max_open_leads), `leads` (open counts, the customer's open or recently active leads), `purchases`.
- Writes on `customers`: `is_returning` (stored column) and `search_text` (via the repository).
- Redis: `rl:intake:*`, `lock:assign:*`, `rr:teams`, channel `leaddesk:events`.

## 5. Edge Cases & Error Handling
- **Redis down:** rate limiting, locks and team round-robin fall back to in-process equivalents. Intake still works. Log `redis_degraded` once per minute.
- **Sticky owner inactive or at capacity:** skip the sticky rule and continue normal routing (the reason is recorded).
- **A team with zero active reps:** go to the unassigned pool with the reason `no_active_reps`.
- **Lock not acquired after retries:** proceed with the in-process mutex. SQLite's single writer still guarantees no double assignment within one process. Log a warning.
- **Phone valid but not mobile, with preferred channel WHATSAPP/SMS:** accept, and record `metadata.channelWarning: "phone may not support WhatsApp/SMS"` (F14 can surface it).
- **Duplicate references under concurrency:** prevented by the transaction and unique index. A retry once on a unique violation.
- **Payload contains unknown fields:** stripped (Zod `.strip()`), not rejected.
- **Budget min > max:** 400 field error.
- **Year rollover:** the sequence restarts at 00001 for the new year.
- **An old lead for the same customer (closed, no activity in 90 days):** not sticky. The customer is still returning. A closed lead with activity within 90 days *is* sticky (FR-012).
- **XSS attempt in the message:** stored as-is, rendered as plain text by F05. Control characters are stripped.

## 6. Success Criteria
- **SC-001**: Intake p95 < 150 ms server time locally (Redis up), and < 250 ms degraded.
- **SC-002**: From a Showroom submit to the event published < 300 ms (the F12 target end to end is < 2 s).
- **SC-003**: 100% of 200 concurrent simulated submissions produce unique references and exactly one owner-or-pool assignment each.
- **SC-004**: LOAD_BALANCED fairness: after 40 sequential intakes into a team starting from equal loads, max − min open count ≤ 1.
- **SC-005**: Returning detection accuracy is 100% on the test fixtures (phone formats: national, with spaces, +CC, 00CC).
- **SC-006**: 0 leads are stored for honeypot or invalid-key requests.

## 7. UX Notes
The intake endpoint has no UI. The user-visible results are:
- System timeline entries in F05 (copy above).
- The Showroom thank-you copy built from the response: "Thanks Anna! Lea from EuroDrive will contact you on WhatsApp this evening. Reference EDM-2026-00812."
- Simulator console output, one coloured line per lead: green ✔ for assigned, yellow ◌ for pool, red ✖ for errors, with a summary at the end (sent, assigned, pool, returning, errors, avg latency).

## 8. Decisions
| # | Decision | Alternatives | Rationale |
|---|---|---|---|
| 1 | One public intake endpoint for all external sources | Per-source endpoints | One contract, one pipeline. The source is a field |
| 2 | API key plus CORS allowlist plus rate limit plus honeypot | OAuth client credentials, CAPTCHA | Proportionate for a demo; shows layered defence. OAuth is the scale path |
| 3 | Dedupe by E.164 phone, then email | Fuzzy name matching | Deterministic and explainable. Fuzzy matching risks wrong merges (GDPR risk) |
| 4 | Latest submission updates contact preferences | Keep the original | The customer's latest stated preference is the most accurate |
| 5 | Sticky owner (open lead or activity ≤ 90 days, owner active), crossing teams | Always route fresh; sticky only within the same team | One relationship per customer; avoids two reps calling the same person |
| 6 | Country → team mapping read from data (`teams.countries`) | Hard-coded map | Configurable without a deploy |
| 7 | Default strategy LOAD_BALANCED; LANGUAGE_MATCH available | Round-robin default | Fairness by current workload; language matters in the multilingual EU market |
| 8 | Per-team Redis lock plus in-process fallback, inside a SQLite transaction | DB-only | Correct across future multiple instances; still correct single-instance without Redis |
| 9 | Reference per-year sequence `EDM-YYYY-NNNNN` | ULID shown to customers | Human-friendly for phone conversations |
| 10 | Idempotency key plus a 10-min implicit duplicate window | None | Handles retries and double-submits from the form |
| 11 | The simulator is a pure HTTP client | Direct DB inserts | Exercises the real pipeline end to end (validation, routing, events) |

## 9. Technical Plan Input (for `/speckit.plan`)

**Shared contract** `packages/shared/src/schemas/intake.ts`: the **canonical definition is F01 §9.2** (`IntakeLeadSchema`, `IntakeResponseSchema`). F10 and F13 consume it, and changes need coordination through F01. Key points F10 relies on: `age` (optional, used to derive `ageBand` when it's `UNKNOWN`), `ageBand`, `secondaryChannel`, `budgetMin`/`budgetMax` in euro cents, `idempotencyKey` (body fallback; the `Idempotency-Key` header wins), `marketingConsent`, the `website` honeypot (parses, then F10 rejects non-empty with 202), and refinements (email or phone; contact detail for the preferred channel; min ≤ max budget).

**Responses**
- 201 `{ "reference": "EDM-2026-00812", "status": "created", "assignedTo": { "firstName": "Lea" } | null, "expectedContact": { "channel": "WHATSAPP", "bestTime": "EVENING" } }`
- 200 same shape with `"status": "duplicate"` (idempotent replay or implicit duplicate)
- 202 `{ "status": "accepted" }` (honeypot)
- 400 `{ "error": { "code": "VALIDATION_ERROR", "message": "…", "fields": { "phone": "Invalid phone number for DE" } } }`
- 401 `UNAUTHORIZED_CLIENT` · 413 `PAYLOAD_TOO_LARGE` · 415 `UNSUPPORTED_MEDIA_TYPE` · 429 `RATE_LIMITED` (+ `Retry-After`) · 500 `INTERNAL`

**Modules**
- `app/api/intake/leads/route.ts`: `OPTIONS` (CORS) and `POST`: content-type and size check → API key → rate limit → JSON parse → Zod → honeypot → `intakeService.ingest(payload, { apiKeyName, ip, idempotencyKey })` → map the result to HTTP.
- `server/services/dedupe.ts`: `normalizePhone(raw, country)`, `normalizeEmail`, `findCustomer({phone,email})`, `mergeCustomer(existing, payload)`, `customerFacts(customerId) → { isReturning, hasRecentPurchase, openLeadWithActiveOwner? }`.
- `server/services/routing.ts`: `resolveTeam(country, facts) → { teamId, routing: 'sticky'|'country'|'fallback_round_robin' }`; `pickAssignee(team, customerLanguage, tx) → { ownerId | null, strategy, reason, openCount }` (pure selection functions `selectLoadBalanced`, `selectLanguageMatch`, `selectRoundRobin` take plain arrays for unit tests). `pickAssignee` is exported for F11 to reuse.
- `server/services/intake.ts`: `ingest()` orchestrates: idempotency check → dedupe → `scoreLead` (F09) → resolve team → `withTeamLock(teamId, () => db.transaction(...))` → publish events.
- `server/lib/lock.ts` (or inside `routing.ts`): `withTeamLock` with the Redis SET NX PX plus the in-process fallback.
- `apps/web/scripts/simulate.ts`: run with `tsx`, parse args with `node:util parseArgs`, generate with `@faker-js/faker` (locale per country: `de`, `de_AT`, `de_CH`, `fr`, `fr_BE`, `nl`, `nl_BE`, `it`, `es`, `pt_PT`), post with `fetch`. Root script: `"simulate": "npm run simulate -w apps/web --"`.

**Events**
- `lead.created { lead: LeadSummary, teamId, ownerId, by: null, at }` (shape per F01 `events.ts`)
- `lead.assigned { leadId, teamId, fromOwnerId: null, toOwnerId, ownerId, by: null, method: 'AUTO', strategy, reason, at }`

**Tests**
- Unit: `normalizePhone` table (DE `0151 1234 5678` → `+4915112345678`; IT `347 123 4567`; `0033 6 12 34 56 78`; invalid); each strategy selector with ties; round-robin wrap-around; `resolveTeam` for every seeded country plus fallback; reference formatting and year rollover; the schema refinements.
- Integration (temp SQLite, Redis mocked up/down): happy path rows and events; returning via phone and via email; dedupe conflict; sticky owner; auto-assign OFF → pool; all at capacity → pool; honeypot 202 with no rows; 401/413/415/429; idempotency replay 200; publish failure still 201.
- Concurrency: 50 parallel `ingest()` calls into one team → unique references, balanced counts (SC-003/004).
- CORS: preflight from `http://localhost:3001` → allowed headers present; from `http://evil.test` → none.
- Simulator smoke test: `--count 3 --seed 1` against a test server → 3 × 201, deterministic names.

## 10. Out of Scope
- Manual assign, claim, reassign, auto-assign settings UI (F11). F10 only reads the team settings.
- SSE delivery to browsers (F12). F10 only publishes.
- The Showroom UI (F13).
- Real ad-platform or portal webhooks (Meta Lead Ads, AutoScout24). They're future adapters onto the same pipeline.
- Auto-reassign of untouched HOT leads (F11/P2).
- GDPR consent capture beyond the `marketingConsent` flag.

## 11. Open Questions
- Resolved: the sticky-owner rule crosses teams. If the customer has an open lead (or one active within 90 days) whose owner is active, the new lead goes to that owner and their team (FR-012).
- Should the intake response reveal the assignee's first name to the buyer? It's a nice demo touch but a mild disclosure. Default: yes, first name only.
- Resolved: `customers.is_returning` is a stored column (03-domain-model). F10 sets it during dedupe, F07 sets it on WON, and the seed sets it.

## 12. Spec Kit Prompts
**`/speckit.specify`**
> Build the lead intake pipeline for a European car dealership group. External sources (the dealership's showroom website, and a traffic simulator for demos) submit customer enquiries to one public entry point that only accepts trusted sources with a key, only from allowed websites, and limits how often each source can submit; obvious bot submissions are silently discarded. Each enquiry contains the customer's name, email and/or phone, country and city, language, preferred and secondary contact channel, best time to contact, optional age, vehicle of interest, budget, trade-in, financing and test-drive interest, a message, the source (website, Facebook, Instagram, Google Ads, portal, walk-in, phone, referral) and marketing consent. The system checks the enquiry, recognises returning customers by phone number (in any national or international format) or email, and updates their contact preferences, scores the lead, and sends it to the right regional team by country (DACH: Germany/Austria/Switzerland; West: France/Belgium/Netherlands/Luxembourg; South: Italy/Spain/Portugal; other countries spread across teams). A customer who already has an open lead goes to the same salesperson. If the team has automatic assignment switched on, the lead is given to a rep using the team's chosen method: fewest open leads, same language as the customer, or strict rotation. Reps at capacity (25 open leads) are skipped; if nobody is available, or automatic assignment is off, the lead waits in the team's unassigned pool. Every lead gets a human-friendly reference like EDM-2026-00812, a timeline entry explaining where it came from and why it was assigned, and is announced immediately so salespeople see it live. Resubmitting the same enquiry must not create duplicates. The submitter receives the reference, the first name of the person who will contact them, and the channel and time they'll be contacted. Also provide a command-line simulator that streams realistic European enquiries at a chosen rate, optionally including returning customers or a simultaneous burst.

**`/speckit.plan`**
> Next.js route handler `apps/web/app/api/intake/leads/route.ts` with `OPTIONS` (CORS allowlist `SHOWROOM_ORIGIN`) and `POST`: content-type/size checks (415/413), constant-time `X-API-Key` check against `INTAKE_API_KEYS` (401), Redis fixed-window rate limit `rl:intake:<name>:<ip>` 60/min with in-memory fallback (429 + Retry-After), shared Zod `IntakeLeadSchema` from `packages/shared/src/schemas/intake.ts` (400 with field map), honeypot `website` (202, no write). Services: `server/services/dedupe.ts` (libphonenumber-js E.164, email lowercase, match phone then email, merge preferences, returning facts), `server/services/routing.ts` (sticky owner → `teams.countries` → Redis `rr:teams` fallback; pure selectors `selectLoadBalanced`, `selectLanguageMatch`, `selectRoundRobin`; exported `pickAssignee` for F11; `withTeamLock` via Redis `SET lock:assign:<teamId> NX PX 5000` with an in-process mutex fallback), and `server/services/intake.ts#ingest` (idempotency via key/10-min window → F09 `scoreLead` → one better-sqlite3/Drizzle transaction inserting customer, lead with reference `EDM-YYYY-NNNNN` (per-year max+1, unique index, retry once), SYSTEM `LEAD_CREATED`/`ASSIGNED` activities, `users.last_assigned_at`, `teams.rr_cursor`, audit_log → publish `lead.created`/`lead.assigned` on the F01 bus after commit, never failing the request). The response exposes only reference, status, assignee first name and expected contact. Simulator `apps/web/scripts/simulate.ts` (tsx, `node:util parseArgs`, Faker EU locales, weighted source mix, deterministic returning phones from the seed generator, flags `--url --key --rate --count --seed --returning --countries --burst --fail-fast`, coloured summary). Tests: Vitest unit (phone normalization table, selectors and ties, RR wrap, team resolution, reference/year rollover, schema refinements), integration on temp SQLite with Redis up/down (all status codes, returning, sticky, pool fallbacks, idempotency, publish failure), a 50-way concurrency test, and a CORS preflight test.
