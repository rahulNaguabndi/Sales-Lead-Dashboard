# Feature Specification: F08 — Follow-ups & Going-Cold Detection

**Feature Branch**: `008-follow-ups-cold`

**Created**: 2026-09-30

**Status**: Draft

**Input**: User description: "F08 Follow-ups & Going-Cold Detection. The authoritative spec is docs/features/F08-follow-ups-cold.md."

---

## Clarifications

### Session 2026-09-30

- Q: Which stages are "open" for at-risk and auto-COLD? → A: NEW, CONTACTED, QUALIFIED, TEST_DRIVE, OFFER, NEGOTIATION (anything except COLD, WON, LOST), as defined by the domain model.
- Q: Does a snoozed follow-up still protect a lead from the 7-day cold rule? → A: Yes, as long as it is PENDING with a due time in the future after snoozing.
- Q: Does a PENDING follow-up that is overdue (but not yet MISSED) protect a lead from the 7-day rule? → A: No; only a future-dated PENDING follow-up protects.
- Q: Does creating a follow-up for a different assignee supersede another user's PENDING one? → A: No; supersede applies per (lead, assignee) only (FR-002).
- Q: Is the "unanswered attempts" auto-COLD rule blocked by a future follow-up? → A: No; it always applies (US-5 scenario 3).

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Schedule a follow-up (Priority: P1)

As a rep, I want to schedule the next touch so I don't forget it.

**Why this priority**: Without a scheduled next step, leads silently die. Every other story builds on follow-ups existing.

**Independent Test**: Schedule a follow-up for tomorrow 18:00 and check that it appears in the lead's follow-up panel and in tomorrow's "Due today" list.

**Acceptance Scenarios**:

1. **Given** I'm logging an activity, **When** I set "Next follow-up" to tomorrow 18:00, **Then** a PENDING follow-up is created in the same transaction, assigned to the lead owner (or me if the lead is unassigned), and a `FOLLOW_UP_SCHEDULED` system activity appears.
2. **Given** a lead detail page, **When** I use the Follow-up panel's "Schedule" button (standalone, without an activity) with quick picks (in 2 h, Tomorrow 10:00, Tomorrow 18:00, In 3 days, custom), **Then** the follow-up is created likewise.
3. **Given** the due time is in the past, **Then** validation fails with "Pick a future time".

---

### User Story 2 — Today's Follow-ups widget (Priority: P1)

As a rep, I want one list of what's due today, with overdue items on top.

**Why this priority**: The daily worklist is the main way reps act on follow-ups.

**Independent Test**: Seed 2 overdue and 4 due-today follow-ups for a rep, open the inbox, and compare the chips and list against a direct data query.

**Acceptance Scenarios**:

1. **Given** I have 2 overdue and 4 due-today follow-ups, **When** I open the inbox, **Then** the "Due today" chip shows 6 and "Overdue" shows 2. The widget lists overdue items in red first, then today's items sorted by time, each with the lead name, priority dot, preferred channel icon and due time ("18:00" or "2 h overdue").
2. **When** I click an item, **Then** the lead detail opens with the composer focused.

---

### User Story 3 — Complete, snooze or cancel a follow-up (Priority: P1)

As a rep, I want to close out, move or drop a follow-up so my list reflects reality.

**Why this priority**: Follow-ups that can't be closed clutter the worklist and corrupt overdue metrics.

**Independent Test**: With a pending follow-up, log an activity with "Complete follow-up" checked and check that the follow-up is DONE and linked to that activity.

**Acceptance Scenarios**:

1. **Given** a lead with a PENDING follow-up, **When** I log a user activity with "Complete follow-up" checked (it defaults to checked when a pending follow-up is due within ±24 h or is overdue), **Then** the follow-up becomes DONE with a completion time and a link to the completing activity.
2. **Given** the panel, **When** I click "Mark done" without logging, **Then** it becomes DONE and a NOTE system entry "Follow-up marked done without activity" is recorded for traceability.
3. **Given** a pending follow-up, **When** I snooze it (+1 h / tomorrow / custom), **Then** its due time moves and a system activity records the previous due time.
4. **Given** a pending follow-up, **When** I cancel it (with an optional note), **Then** it becomes CANCELLED.

---

### User Story 4 — Missed follow-ups and due-soon reminders (Priority: P1)

As a manager, I want follow-ups that were never actioned to be flagged, and as a rep I want a heads-up shortly before one is due.

**Why this priority**: Missed follow-ups feed team overdue metrics; reminders prevent misses.

**Independent Test**: Seed a follow-up 25 h past due, run the sweeper, and check it is MISSED with a `FOLLOW_UP_MISSED` activity.

**Acceptance Scenarios**:

1. **Given** a PENDING follow-up 24 h past due, **When** the sweeper job runs, **Then** it becomes MISSED and a `FOLLOW_UP_MISSED` system activity is added. Managers see it in the team "overdue" metrics.
2. **Given** a follow-up due in the next 5 minutes, **When** the sweeper runs, **Then** a `followup.due` notification is emitted to the owner (a toast via live updates), once per follow-up.

---

### User Story 5 — At-risk flag and auto-COLD (Priority: P1)

As a manager, I want neglected leads flagged automatically.

**Why this priority**: This keeps leads from dying unnoticed; it is the core "going cold" promise.

**Independent Test**: Seed a QUALIFIED lead with last contact 8 days ago (and a NOTE yesterday, which must not prevent it), run the detector, and check that the stage is COLD and there is an `AUTO_COLD` activity.

**Acceptance Scenarios**:

1. **Given** an open lead (NEW…NEGOTIATION) with no **contact activity** (a user activity that is not a NOTE; measured from last contact, else creation time) for ≥ **3 days**, **Then** it shows an amber **"At risk"** badge in the inbox and detail. This is derived, not stored.
2. **Given** an open lead with no contact activity for ≥ **7 days** **or** with ≥ 3 unanswered attempts in a row, **When** the cold-detector runs, **Then** it transitions to COLD (system actor, reason "No activity 7 days" / "3 unanswered attempts"), with an `AUTO_COLD` activity and a lead-updated event.
3. **Given** a lead with a PENDING follow-up in the future, **Then** it is **not** auto-COLDed on the 7-day rule (the rep has a plan), but it still is on the unanswered-attempts rule.
4. **Given** a NEW lead, **Then** its "age without activity" counts from its creation time.

---

### User Story 6 — Cadence guidance (Priority: P2)

As a rep, I want to be told the next step of the standard outreach cadence.

**Why this priority**: Helpful guidance, but reps can work without it.

**Independent Test**: Take a lead with 1 prior outreach attempt and check the detail shows "Attempt 2 of 5 · Suggested: WhatsApp today".

**Acceptance Scenarios**:

1. **Given** a lead with 1 prior outreach attempt, **Then** the detail shows "Attempt 2 of 5 · Suggested: WhatsApp today", based on the cadence **Day 0 Call → Day 1 WhatsApp/SMS → Day 3 Call → Day 7 Email → Day 14 final message**, with the channel replaced by the customer's preferred channel when the cadence step is a generic message.
2. **When** a "Callback requested" outcome is logged, **Then** the composer suggests a follow-up at the customer's best time the next day.

---

### Edge Cases

- **Closed lead (WON/LOST)**: the stage pipeline cancels its follow-ups; the sweeper ignores non-PENDING items.
- **Unassigned lead**: follow-ups are assigned to the creator; when the lead is later claimed they move to the new owner.
- **DST changes (e.g. Europe/Berlin, Europe/Paris)**: times are stored as absolute instants and rendered in the viewer's local time zone. Quick picks are computed in local time.
- **Several server processes**: background jobs must not double-process; a per-job lock prevents overlapping runs where a shared lock store is available, and otherwise a single instance is assumed.
- **Clock skew between client and server** for the "future time" check: the server allows 60 s of tolerance.
- **Auto-COLD while a rep is on the page**: a live update shows a banner "Lead moved to Cold".

---

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST support follow-up create (with an activity or standalone), complete, snooze/reschedule, and cancel. Creation requires a due time after now and no more than 90 days ahead.
- **FR-002**: Each lead MUST have at most **one PENDING follow-up per assignee**. Creating a new one supersedes the old (CANCELLED with note "Superseded").
- **FR-003**: The follow-up assignee MUST default to the lead owner. Reassigning a lead MUST move its PENDING follow-ups to the new owner.
- **FR-004**: Overdue MUST be derived: status is PENDING and the due time is before now.
- **FR-005**: A sweeper MUST run every 60 s: PENDING follow-ups more than 24 h past due become MISSED with a `FOLLOW_UP_MISSED` activity. It MUST also emit `followup.due` for follow-ups due within the next 5 minutes, deduplicated to once per follow-up (shared-store key with a 1-hour lifetime, with an in-memory fallback when the shared store is unavailable).
- **FR-006**: A cold detector MUST run every 60 s and apply the FR-007 rules, with a batch limit of 200 leads per run and each transition in its own transaction.
- **FR-007**: The rules MUST live as shared constants: at-risk after 3 days, cold after 7 days, cold after 3 unanswered attempts, missed after 24 hours, due-soon window 5 minutes, and the cadence (Day 0 CALL, Day 1 PREFERRED, Day 3 CALL, Day 7 EMAIL, Day 14 PREFERRED). `PREFERRED` is a cadence-only token that resolves at display time to the customer's preferred channel, falling back to WhatsApp if that channel is a call. The at-risk, cold, unanswered and missed thresholds MUST be overridable by environment for demos (fractional values allowed, e.g. 0.01 days).
- **FR-008**: The unanswered-attempt count is owned by activity logging (single source of truth) and only read here: +1 on contact activities with outcome NO_ANSWER or VOICEMAIL; reset to 0 on CONNECTED, INTERESTED, NOT_INTERESTED, CALLBACK_REQUESTED or a MEETING/TEST_DRIVE; a NOTE leaves it unchanged.
- **FR-009**: Background jobs MUST start once per process behind a global guard, be disable-able with `JOBS_ENABLED=false` (tests), and log each run's counts.
- **FR-010**: Follow-up actions MUST require write permission on the parent lead.
- **FR-011**: The system MUST offer a list of the current user's follow-ups by view (today, overdue, upcoming); managers may additionally filter by an owner within their scope.
- **FR-012**: The system MUST also schedule the lead-score freshness recompute (owned by lead scoring) every 5 minutes, under the same guard, lock and disable switch as the other jobs.

### Key Entities

- **Follow-up**: a scheduled next touch on a lead: lead, assignee, due time, status (PENDING / DONE / MISSED / CANCELLED), note, completion time and completing activity.
- **Lead** (read/updated): last contact time, creation time, unanswered-attempt count, stage, owner.
- **Activity** (created): system entries `FOLLOW_UP_SCHEDULED`, `FOLLOW_UP_MISSED`, `AUTO_COLD`.
- **Customer** (read): best time to contact and preferred channel.

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of seeded leads meeting the cold criteria are COLD within 2 job cycles of startup.
- **SC-002**: The Due Today widget matches a direct data query (verified by test).
- **SC-003**: A follow-up due in 5 minutes produces exactly one toast for its owner.
- **SC-004**: Scheduling a follow-up takes at most 2 clicks from the composer (using a quick pick).

---

## Assumptions

- Dependencies (activity logging, stage transitions, lead scoring) are built in earlier waves or the same wave; the auto-COLD transition is coded against the stage-transition interface and stubbed until it merges.
- Out of scope: email/push notifications outside the app, calendar sync, per-team configurable cadences.
- Open questions resolved with the doc's proposals: no daily manager digest for MISSED follow-ups (P2, dashboard only); a MISSED follow-up does not reduce the lead score.
- UX: inbox chips "Due today · Overdue · At risk" filter the inbox; the detail right column has a "Next follow-up" card (due time, assignee avatar, Done / Snooze / Cancel, cadence line). Overdue is red text with a clock icon; at-risk is an amber badge "At risk · 4 d idle"; the COLD chip has the tooltip "Auto-moved: no activity for 7 days".
