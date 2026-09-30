# Feature Specification: Lead Intake, Dedupe, Routing & Auto-assign, Simulator

**Feature Branch**: `010-lead-intake-routing`

**Created**: 2026-09-30

**Status**: Draft

**Source**: `docs/features/F10-lead-intake-routing.md` (authoritative). Wave 2, priority P1. Depends on F01 (foundation), F03 (hierarchy data), F09 (lead scoring).

**Input**: External sources (the showroom website, the demo simulator, and in future web forms, ad platforms and portals) submit customer enquiries to one public entry point that only accepts trusted sources, only from allowed websites, and limits how often each source can submit. Each enquiry is validated, de-duplicated against known customers, scored, routed to the right regional team, automatically assigned to a salesperson when the team allows it, recorded with a human-readable timeline, and announced live. A command-line simulator streams realistic European enquiries for demos.

## Clarifications

### Session 2026-09-30

- Q: What happens when an idempotency key is replayed with a different payload? → A: The original reference is returned as a duplicate; the new payload is ignored.
- Q: Which network address is used for rate limiting? → A: The originating client address (first forwarded address if behind a proxy).
- Q: Does a sticky owner at capacity still receive the lead? → A: No; the sticky rule is skipped, normal routing continues, and the reason is recorded.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Accept a lead from an external source (Priority: P1)

As the dealership, I want every website or ad enquiry to become a lead automatically, so none are lost.

**Why this priority**: Without intake there are no incoming leads; every other lead workflow depends on it.

**Independent Test**: Submit a valid enquiry with a trusted key; a confirmation with a reference is returned and the lead exists with a "lead created" timeline entry.

**Acceptance Scenarios**:

1. **Given** a valid enquiry and a trusted key, **When** it is submitted, **Then** the submitter receives a "created" confirmation containing the lead reference (e.g. `EDM-2026-00812`), the first name of the assigned salesperson (or none), and the channel and time they will be contacted on (e.g. WhatsApp, evening).
2. **Given** a missing or unknown key, **When** an enquiry is submitted, **Then** it is rejected as unauthorized and nothing is stored.
3. **Given** an invalid enquiry (e.g. neither email nor phone, or an unknown vehicle model), **When** it is submitted, **Then** it is rejected with a per-field message map so the showroom can show inline errors.
4. **Given** more than 60 submissions per minute from one source key and network address, **When** another arrives, **Then** it is rejected as rate-limited and told how long to wait before retrying.
5. **Given** the hidden bot-trap field is filled in, **When** the enquiry is submitted, **Then** the caller receives an "accepted" response, nothing is stored, and a warning is logged.
6. **Given** a browser on the showroom website's origin, **When** it performs a cross-origin preflight, **Then** it is allowed; any other origin receives no cross-origin permission.

---

### User Story 2 - Recognise returning customers (Priority: P1)

As a rep, I want to know when an enquiry comes from someone we already know.

**Why this priority**: Prevents duplicate customer records and gives reps the relationship context (and a better score) immediately.

**Independent Test**: Submit an enquiry using an existing customer's phone in a different format; the lead attaches to that customer and is flagged returning.

**Acceptance Scenarios**:

1. **Given** customer Giulia Conti exists with phone `+393471234567`, **When** a lead arrives from Italy with phone "347 123 4567", **Then** the phone is recognised as the same number, the lead attaches to the existing customer and is flagged returning (scoring gets a returning bonus, plus an extra bonus for a purchase within 5 years).
2. **Given** no phone match but a case-insensitive email match, **Then** the lead attaches to that customer.
3. **Given** phone and email match *different* customers, **Then** the phone match wins and the created-entry records the email-matched customer as a dedupe conflict.
4. **Given** a matched customer, **Then** their contact preferences (preferred/secondary channel, best time, language, age band, city) are updated to the latest submission and missing email/phone are filled in; names are never overwritten.

---

### User Story 3 - Route to the right regional team (Priority: P1)

**Why this priority**: Leads must reach the team that covers the customer's market.

**Independent Test**: Submit enquiries from DE, FR, IT and PL; they land in DACH, West, South and a round-robin team respectively.

**Acceptance Scenarios**:

1. **Given** country DE, AT or CH, **Then** the lead goes to team DACH; FR, BE, NL or LU to team West; IT, ES or PT to team South. The mapping comes from team configuration data, not fixed rules.
2. **Given** a country no team covers (e.g. PL), **Then** the lead goes to teams in rotation, and the created-entry records that routing was a fallback rotation.
3. **Given** the customer already has an **open** lead (or a lead with activity in the last 90 days) owned by an active rep, **Then** the new lead goes to that rep and their team ("sticky owner"), regardless of country and of the team's auto-assign setting; the assignment entry states the reason "existing customer relationship".

---

### User Story 4 - Auto-assign fairly (Priority: P1)

As a manager, I want new leads distributed automatically using my team's chosen strategy.

**Why this priority**: Fast, fair first contact is the core value of automatic distribution.

**Independent Test**: With Team DACH on load-balanced auto-assign and known open-lead counts, a new lead goes to the rep with the fewest open leads, ties broken by who was assigned longest ago.

**Acceptance Scenarios**:

1. **Given** Team DACH has auto-assign ON with the "fewest open leads" strategy and open counts Anna 12, Jonas 9, Lea 9, Felix 14, and Lea was assigned longer ago than Jonas, **Then** the lead goes to Lea.
2. **Given** the "same language" strategy and customer language French, **Then** only French-speaking reps are considered (Lea Hoffmann), then fewest-open applies. **Given** no rep speaks the language, **Then** all reps are considered and the reason says "language fallback: no fr speaker".
3. **Given** the "strict rotation" strategy with the rotation position at Jonas (ordered by name: Anna, Felix, Jonas, Lea), **Then** the lead goes to Lea and the position moves to Lea; it wraps after the last rep.
4. **Given** every active rep is at capacity (25 open leads), **Then** the lead goes to the team's unassigned pool with the system note "Auto-assign skipped: all reps at capacity".
5. **Given** auto-assign OFF, **Then** the lead goes to the team's unassigned pool and the created-entry records "auto-assign off" as the reason it is unassigned.
6. **Given** 20 concurrent enquiries for the same team, **Then** each lead is assigned exactly once, open counts stay balanced (max − min ≤ 1 from an equal start), and no two leads share a reference.

---

### User Story 5 - Everything visible and live (Priority: P1)

**Why this priority**: Reps must see and trust why a lead arrived and why it was assigned; live announcement makes the demo real.

**Independent Test**: Create an assigned lead; its timeline shows the system entries, an announcement was published, and an audit record exists.

**Acceptance Scenarios**:

1. **Given** a lead is created and assigned, **Then** its timeline contains a system "Lead created" entry (e.g. "Lead created from Facebook · Hamburg, DE") and, if assigned, an "Assigned" entry (e.g. "Auto-assigned to Lea Hoffmann · language match: fr · 9 open leads").
2. **Given** creation succeeds, **Then** a "lead created" announcement is published, and a "lead assigned" announcement too if an owner was set (method automatic), for delivery to users whose scope covers the lead.
3. **Given** an audit entry is required, **Then** the audit log records a lead-intake action with no human actor, the lead snapshot, and the name of the submitting source key.

---

### User Story 6 - Idempotent submissions (Priority: P1)

**Why this priority**: Retries and double-clicks must not create duplicate leads.

**Independent Test**: Submit the same enquiry twice with the same idempotency key; the second returns the original reference.

**Acceptance Scenarios**:

1. **Given** the showroom retries the same submission with the same idempotency key within 24 hours, **Then** an "already received" response with the original reference is returned and no new lead is created.
2. **Given** no idempotency key but the same customer submits the same vehicle model again within 10 minutes, **Then** it is treated as a duplicate: the existing reference is returned.

---

### User Story 7 - Simulate traffic for the demo (Priority: P1)

As the presenter, I want to stream realistic leads so the inbox and dashboard come alive.

**Why this priority**: The demo depends on visibly arriving leads, and the simulator exercises the real pipeline.

**Independent Test**: Run the simulator for 20 leads at 12 per minute; each prints a summary line and a final summary is shown.

**Acceptance Scenarios**:

1. **Given** the app is running, **When** the simulator runs with rate 12 and count 20, **Then** 20 leads are submitted at roughly one every 5 seconds and each prints a line such as `✔ EDM-2026-00813  Lena Braun (DE, de)  aurora-suv  FACEBOOK  → Team DACH / Anna Weber  HOT 74`.
2. **Given** a returning share of 0.2, **Then** about 20% of leads reuse phone numbers of seeded customers and come out returning.
3. **Given** burst mode, **Then** all leads are sent concurrently (for the concurrency demo).
4. **Given** the service is unreachable or returns an error, **Then** the simulator prints the error status and body and continues, or exits with failure when fail-fast is set.

---

### Edge Cases

- **Cache/coordination service unavailable**: rate limiting, assignment locking and team rotation fall back to in-process equivalents; intake still works and degradation is logged at most once a minute.
- **Sticky owner inactive or at capacity**: the sticky rule is skipped, normal routing continues, and the reason is recorded.
- **Team with zero active reps**: lead goes to the unassigned pool with reason "no active reps".
- **Assignment lock not obtained after retries**: proceed with in-process serialization and log a warning.
- **Phone valid but not mobile with WhatsApp/SMS preferred**: accepted; a channel warning ("phone may not support WhatsApp/SMS") is recorded.
- **Duplicate reference under concurrency**: prevented; one retry on a uniqueness conflict.
- **Unknown fields in the payload**: ignored, not rejected.
- **Budget minimum greater than maximum**: rejected with a field error.
- **Year rollover**: the reference sequence restarts at 00001 for the new year.
- **Old closed lead with no activity in 90 days**: not sticky, but the customer is still returning. A closed lead with activity within 90 days *is* sticky.
- **Script/markup in the message**: stored as-is (displayed as plain text elsewhere); control characters are stripped.
- **Oversized or wrongly typed request**: rejected as too large (over 10 KB) or unsupported content type.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST expose a public (no user session) lead submission entry point and a matching cross-origin preflight entry point.
- **FR-002**: Submissions MUST be authenticated by a source key, compared in constant time against the configured list of keys (each optionally named; unnamed keys are named "default").
- **FR-003**: Cross-origin access MUST be allowed only for the configured showroom origin, for POST and preflight, with only the content-type, key and idempotency headers. Server-to-server calls without an origin are allowed with a valid key.
- **FR-004**: Submissions MUST be JSON (else "unsupported media type") and at most 10 KB (else "payload too large").
- **FR-005**: Rate limiting MUST be a fixed window of 60 submissions per 60 seconds per source-key-and-network-address, degrading to an in-process counter when the shared store is unavailable; rejections include a retry-after hint.
- **FR-006**: The payload MUST be validated with the single shared enquiry contract used identically by the showroom and the server.
- **FR-007**: If the bot-trap field is non-empty, the system MUST return an "accepted" response without persisting anything.
- **FR-008**: Normalization MUST trim all text, lowercase the email, normalize the phone to international format using the country as default region (an invalid phone yields a field error), and derive the age band from age when only age is given.
- **FR-009**: Deduplication MUST match an existing customer by normalized phone first, then by email; on a match it MUST update preferences per US-2.4, otherwise create a new customer.
- **FR-010**: On a match, if the customer has at least one earlier lead or at least one purchase, the customer MUST be marked returning (within the intake transaction) and the lead treated as returning; new customers start as not returning. "Recent purchase" means a purchase within 5 years. Both facts feed scoring. The customer's searchable text MUST be refreshed on insert or preference update.
- **FR-011**: The lead score MUST be computed at creation using the scoring capability (freshness = 20) and stored with priority and score breakdown.
- **FR-012**: Routing order MUST be: (1) sticky owner, (2) country to team via team configuration, (3) round-robin across teams. Sticky owner crosses teams: if the customer has an open lead, or a lead with activity in the last 90 days, whose owner is active (and under capacity), the new lead goes to that owner and that owner's team.
- **FR-013**: Auto-assignment MUST run only when the team has auto-assign on (sticky-owner assignment runs regardless). Eligible reps: role REP, active, in the team, with fewer open leads (stage NEW, CONTACTED, QUALIFIED, TEST_DRIVE, NEGOTIATION) than their maximum.
- **FR-014**: Strategies MUST behave exactly as follows:
  - Fewest open leads (load-balanced): minimum open count, then oldest last-assigned time (never-assigned first), then name ascending, then id ascending.
  - Same language: filter to reps speaking the customer language; if none, use all eligible (with a fallback reason); then apply load-balanced.
  - Strict rotation (round-robin): eligible reps sorted by name then id; pick the first after the team's rotation position (wrapping) and update the position.
- **FR-015**: Assignment MUST be serialized per team so that no two concurrent enquiries make conflicting selections, using a shared lock with an in-process fallback; selection and persistence happen atomically.
- **FR-016**: One atomic write MUST record: customer insert/update, the lead (reference, team, owner, assignment time, score fields, version 1), the system "Lead created" entry, the system "Assigned" entry (if assigned), the rep's last-assigned time, the team's rotation position (if rotation), and the audit entry.
- **FR-017**: The reference MUST be `EDM-{YYYY}-{NNNNN}`: the UTC year of creation plus a 5-digit zero-padded per-year sequence computed atomically as the highest existing sequence for the year plus one, and unique. The demo data generator uses the same rule.
- **FR-018**: After the write succeeds, the system MUST publish "lead created" and, if assigned, "lead assigned" (method automatic, with strategy and reason). Publish failures MUST NOT fail the request.
- **FR-019**: Idempotency: the idempotency key (header wins over body field) is remembered; a repeat within 24 hours returns "duplicate" with the original reference. The implicit duplicate window is the same customer, same vehicle model, open lead created within 10 minutes.
- **FR-020**: The response MUST NOT expose internal identifiers, scores or other customers' data; it returns only the reference, status, assignee first name (or none) and expected contact channel and time.
- **FR-021**: A command-line simulator MUST support: target address (default local), key (default from environment or the dev key), rate (leads per minute, default 12), count (default 20; 0 = until interrupted), seed (default random; fixed = reproducible), returning share (0–1, default 0.15), country filter, burst mode, and fail-fast. It uses realistic per-country names, the source mix Website 35%, Facebook 12%, Instagram 8%, Google Ads 15%, Portal 5%, Walk-in 10%, Phone 8%, Referral 7%, and the vehicle catalog. Returning phones come from the deterministic demo customer generator with the same seed, needing no database access. It is a pure client of the public entry point.

### Key Entities

- **Enquiry (intake payload)**: name, email and/or phone, country, city, language, preferred and secondary channel, best time, optional age/age band, vehicle model of interest, budget range, trade-in/financing/test-drive interest, message, source, marketing consent, optional idempotency key, hidden bot-trap field.
- **Customer**: person identified by normalized phone and/or email; holds contact preferences, returning flag, purchase history.
- **Lead**: an enquiry attached to a customer; has reference, team, optional owner, score, priority, breakdown, stage.
- **Team**: covers a set of countries; has auto-assign on/off, strategy, rotation position.
- **Rep (user)**: belongs to a team; languages, maximum open leads, last-assigned time, active flag.
- **Timeline entry (activity)**: system entries "Lead created" and "Assigned".
- **Audit entry**: record of the intake action, with source key name.
- **Source key**: named credential for a submitting system.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A submitter receives their confirmation in under 150 ms at the 95th percentile normally, and under 250 ms when supporting services are degraded.
- **SC-002**: From submission to the live announcement being published takes under 300 ms.
- **SC-003**: Of 200 concurrent simulated submissions, 100% produce unique references and exactly one owner-or-pool assignment each.
- **SC-004**: After 40 sequential enquiries into a team starting from equal loads, the difference between the most- and least-loaded rep is at most 1.
- **SC-005**: Returning-customer detection is 100% accurate on test fixtures covering national, spaced, `+CC` and `00CC` phone formats.
- **SC-006**: Zero leads are stored for bot-trap or invalid-key submissions.

## Assumptions

- Team configuration, rep data and seeded customers are provided by the foundation (F01) and hierarchy (F03) features; scoring is provided by F09.
- Reveal of the assignee's first name to the buyer is intended (mild, accepted disclosure).
- Manual assign, claim, reassign and the auto-assign settings UI (F11), live delivery to browsers (F12), and the showroom UI (F13) are out of scope; this feature only reads team settings and publishes events.
- Real ad-platform/portal webhooks, auto-reassign of untouched HOT leads, and consent capture beyond the marketing-consent flag are out of scope.
- The intake entry point has no user interface; user-visible results are timeline entries, the showroom thank-you built from the response, and simulator console output (green ✔ assigned, yellow ◌ pool, red ✖ error, with a summary of sent, assigned, pool, returning, errors, average latency).
