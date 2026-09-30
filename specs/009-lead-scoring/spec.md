# Feature Specification: Lead Scoring & Priority

**Feature Branch**: `009-lead-scoring`

**Created**: 2026-09-30

**Status**: Draft

**Input**: User description: "F09 Lead Scoring & Priority. Every lead gets a transparent 0–100 score built from five explainable factors, mapped to a HOT/WARM/COOL priority band, with response-time SLA flags. Source: docs/features/F09-lead-scoring.md"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Know which lead to work next (Priority: P1)

As a sales rep, I want each lead to carry a priority so that I contact the most promising ones first.

**Why this priority**: It is the core value of the feature and supports ranking in the lead inbox.

**Independent Test**: Score the worked examples from the feature doc (A–G) and compare each score and band with the expected values.

**Acceptance Scenarios**:

1. **Given** a referral lead from a returning customer who wants a test drive and whose last outcome was "Interested", **When** it is scored, **Then** it is HOT (70 or more).
2. **Given** an 8-day-old social lead with 3 unanswered calls, **When** it is scored, **Then** it is COOL (below 40).

---

### User Story 2 - Understand why (Priority: P1)

As a rep or manager, I want to see how a score was built so that I trust it and know what to improve.

**Why this priority**: An opaque score would not be trusted or acted on.

**Independent Test**: Open a lead's score details and check that all five factors, their maximums and plain-language reasons are shown.

**Acceptance Scenarios**:

1. **Given** a lead detail page, **When** I hover over or select the score badge, **Then** I see the five factor values with their maximums and plain-language reasons (for example "Test drive requested +12", "2 unanswered attempts −6").

---

### User Story 3 - Scores stay current (Priority: P1)

As a rep, I want the score to update when I log an activity or time passes so that priorities reflect reality.

**Why this priority**: A stale score misleads reps about who to call.

**Independent Test**: Log an outcome on a lead, and separately advance the clock past a freshness boundary, then check the score, band and timeline.

**Acceptance Scenarios**:

1. **Given** a WARM lead, **When** I log an activity with outcome INTERESTED, **Then** its engagement becomes 15 and the score and priority update in the same transaction as the activity.
2. **Given** a lead created 50 minutes ago with freshness 20, **When** the periodic freshness recompute runs after the lead is 1 hour old, **Then** its freshness becomes 15.
3. **Given** a priority band change (for example WARM → HOT), **Then** a "score changed" system entry is written to the lead's timeline and a lead-updated event is published. A score change within the same band only updates the lead, with no timeline entry.

---

### User Story 4 - Response-time SLA (Priority: P1)

As a manager, I want new leads that nobody has answered in time to be flagged so that I can intervene.

**Why this priority**: Fast first response is the biggest driver of winning hot leads.

**Independent Test**: Evaluate the SLA status for the SLA examples table (HOT/WARM, various ages, with and without contact).

**Acceptance Scenarios**:

1. **Given** a HOT lead in stage NEW with no contact activity, 16 minutes old, **Then** its SLA status is BREACHED.
2. **Given** a WARM lead in stage NEW, 100 minutes old, **Then** its SLA status is DUE_SOON (within the last 25% of the 2-hour window).
3. **Given** any lead with a contact activity or a stage other than NEW, **Then** its SLA status is NA.

---

### Edge Cases

- A creation time in the future (clock skew or bad data) is treated as age 0, so freshness is the maximum (20).
- A budget of 0 counts as "given" only if it is greater than 0.
- A message of only whitespace or emoji uses its trimmed length; emoji count as one character per code point.
- NOT_INTERESTED as the latest meaningful outcome gives engagement 0 (intentional; the rep usually also moves the lead to LOST).
- Many unanswered attempts floor engagement at 0, so the total never drops below the other factors.
- An unknown source value from old data gives 0 source points and a logged warning.
- Reassigning a lead to another rep does not change its score (ownership is not a factor).
- Closed leads (WON, LOST) keep the score they had at closing; COLD leads are recomputed normally.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The scoring function MUST be pure and deterministic: the same inputs and the same supplied "now" always give the same result, with no I/O and no reading of the system clock.
- **FR-002**: The score MUST be built from five factors, with all weights defined in one tunable place:
  - **Intent (max 35)**: test drive requested +12 · wants finance +5 · has trade-in +5 · budget given (min or max) +5 · specific vehicle model +4 · message longer than 30 characters after trimming +4.
  - **Source (max 15)**: REFERRAL 15 · WALK_IN 14 · PHONE 12 · WEBSITE 10 · GOOGLE_ADS 8 · PORTAL 6 · FACEBOOK 5 · INSTAGRAM 5.
  - **Customer (max 15)**: returning customer +10 · a purchase within the last 5 years +5.
  - **Freshness (max 20)**: age since creation: under 1 h → 20 · under 24 h → 15 · under 72 h → 10 · under 168 h → 5 · otherwise 0.
  - **Engagement (max 15)**: base from the most recent staff-logged outcome that is not NO_ANSWER or VOICEMAIL (INTERESTED 15 · CALLBACK_REQUESTED 10 · CONNECTED 6 · NOT_INTERESTED 0 · none 0), minus 3 × the number of consecutive NO_ANSWER/VOICEMAIL outcomes after that base outcome, floored at 0.
- **FR-003**: The total score MUST be the sum of the factors, clamped to 0–100 and rounded to an integer.
- **FR-004**: Priority bands MUST be HOT for 70 and above, WARM for 40–69, COOL below 40, with thresholds defined in one tunable place.
- **FR-005**: Each scoring result MUST include the five factor values and human-readable English reasons (factor, label, points) for display.
- **FR-006**: The SLA status MUST be one of BREACHED, DUE_SOON, OK or NA. It applies only when the stage is NEW and there is no contact activity (a staff activity that is not a note; equivalently no recorded first response). The target is 15 minutes for HOT and 120 minutes otherwise. DUE_SOON covers the final 25% of the target. The result also includes the SLA deadline.
- **FR-007**: Closed leads (WON, LOST) MUST keep the score they had at closing, so recompute skips them. COLD leads are recomputed normally.
- **FR-008**: Recomputing a lead's score MUST load the scoring inputs (lead, customer returning/purchase information, latest outcomes), score it, and persist the score, priority and breakdown only if something changed. When the priority band changes it MUST write a "score changed" system entry (from, to, score) and report to the caller whether anything changed and whether the priority changed, so the caller can publish the lead-updated event after commit.
- **FR-009**: Recompute MUST be triggered (by the owning feature, inside its own transaction) on: lead creation via intake; a staff activity being logged; a stage change; lead intent fields being edited; a customer being marked returning; and periodic freshness decay for open leads younger than 8 days every 5 minutes.
- **FR-010**: The periodic freshness recompute MUST process leads in batches of 200, one transaction per batch, and return the ids whose priority changed so the caller can publish events.
- **FR-011**: The seed data MUST be scored with the same scoring function using the seed's own "now", so seeded leads carry real scores and breakdowns.
- **FR-012**: The UI MUST provide a score badge, a colored chip showing the band text and number (for example "HOT 82") with a popover showing factor bars and reasons, and an SLA badge showing text such as "Respond now · 4 min left" or "SLA breached · 12 min over".

### Key Entities

- **Lead**: score, priority, score breakdown, unanswered attempt count, intent fields (test drive, finance, trade-in, budget min/max, vehicle model, message), source, creation time, first response time, stage.
- **Customer**: whether they are returning (a stored flag) and their purchase history (most recent purchase date).
- **Activity**: staff-logged outcomes in time order, used for engagement; system "score changed" entries record band changes.
- **Score input / Score result**: the inputs the function reads and its output (score, priority, five-factor breakdown, reasons).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of the documented worked examples (A–G, including band boundaries at 70, 40 and 39) and SLA examples produce exactly the expected results.
- **SC-002**: Scoring 1,000 leads takes under 50 ms in total.
- **SC-003**: In the seeded data, the priority distribution across open leads is roughly HOT 15–25%, WARM 40–55%, COOL 25–40%. If it is not, thresholds are adjusted and the change recorded as a decision.
- **SC-004**: In the demo, reps can name the top two reasons for any lead's score from the UI without documentation.

## Assumptions

- The database schema, enums and shared contracts already exist (owned by the platform foundation feature); this feature adds no schema changes.
- Callers (intake, activity logging, stage changes, lead editing, the job runner) invoke recompute inside their own transaction and publish events after commit; this feature only provides the functions.
- "Returning customer" is the stored customer flag; last purchase date is the latest purchase for that customer.
- NOT_INTERESTED does not subtract points, and HOT thresholds are the same for all teams (v1 defaults from the open questions).
- Priority chip colors: HOT red, WARM amber, COOL sky; the SLA badge pulses when BREACHED and respects reduced-motion preferences.

## Out of Scope

- Machine-learned or LLM-learned weights.
- Per-team custom weights UI.
- At-risk and cold detection (a separate feature); scoring only lowers freshness and engagement.
