# Feature Specification: F06 — Activity Logging

**Feature Branch**: `006-activity-logging`

**Created**: 2026-09-30

**Status**: Draft

**Input**: User description: "F06 Activity Logging. The authoritative source is docs/features/F06-activity-logging.md (mandatory requirement R3: a salesperson can log a new follow-up activity for a lead, and it is persisted)."

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Log a follow-up activity (Priority: P1) · R3

As a rep, I want to record a call, message or note on a lead so my team and I have an accurate history.

**Why this priority**: This is mandatory requirement R3. Without it the lead history is empty and every downstream metric is meaningless.

**Independent Test**: On a lead you own, submit type Call, outcome Connected, note "Called customer". The entry appears at the top of the timeline. Reload the page, then restart the server: the entry is still there.

**Acceptance Scenarios**:

1. **Given** I own lead L, **When** I choose type **Call**, outcome **Connected**, type "Called customer, interested in test drive", and press **Log activity** (or Ctrl/⌘+Enter), **Then** the entry appears at the top of the timeline immediately, marked "Saving…", and within 1 second is confirmed with the server timestamp.
2. **Given** the entry was saved, **When** I reload the page, **Then** it is still in the timeline with the same text, type, outcome, author and time.
3. **Given** the entry was saved, **When** the server restarts and I reopen the lead, **Then** the entry is still present.
4. **Given** I return to the inbox, **Then** L's "Last activity" shows "Call · just now".

---

### User Story 2 — Validation that helps (Priority: P1)

**Why this priority**: Bad or empty entries destroy the value of the history; guidance must be immediate.

**Independent Test**: Try to submit an empty note, a Call without outcome, a Note with outcome, and a 2001-character note.

**Acceptance Scenarios**:

1. **Given** the note is empty or only whitespace, **When** I try to submit, **Then** the submit button is disabled, and the system also rejects the request with a validation error (note required, 1–2000 characters after trimming).
2. **Given** type Call/WhatsApp/SMS/Email, **Then** the outcome is required. **Given** type Note, **Then** the outcome is hidden and not accepted. **Given** Meeting or Test drive, **Then** the outcome is optional.
3. **Given** a note longer than 2000 characters, **Then** the character counter turns red and submit is disabled.

---

### User Story 3 — Automatic lead bookkeeping (Priority: P1)

**Why this priority**: Keeps response-time, coverage and priority metrics honest without extra clicks.

**Independent Test**: Log a contact activity on a NEW lead and check stage, first-response time, attempt counter and score.

**Acceptance Scenarios**:

1. **Given** L is in stage NEW with no contact activity, **When** I log a **contact activity** (any type except Note) without choosing a stage, **Then** L moves to **CONTACTED**, the timeline shows the system entry "Stage changed NEW → CONTACTED · auto: first activity", and the first-response time is set.
   - 1a. **Given** L is NEW, **When** I log a **Note**, **Then** the note is saved but L stays NEW, first-response time stays empty, the attempt counter is unchanged, and the lead still counts as uncovered (an internal note isn't customer contact).
2. **Given** L is COLD, **When** I log a Call/WhatsApp/SMS/Email/Meeting/Test drive, **Then** L is revived to **CONTACTED** (system entry "Revived from COLD").
3. **Given** L has an unanswered-attempt count of 1, **When** I log a Call with outcome **No answer**, **Then** the count becomes 2. **When** I later log outcome **Connected**, **Then** it resets to 0.
4. **Given** L has score 64 (WARM), **When** I log an outcome **Interested**, **Then** the score is recomputed (engagement +15), the header shows the new score, and if the priority band changed (WARM → HOT) a system entry "Priority WARM → HOT" is added.

---

### User Story 4 — Schedule the next follow-up while logging (Priority: P1)

**Why this priority**: Logging and scheduling the next step is one gesture in a rep's workflow.

**Independent Test**: Tick "Schedule follow-up", pick "Tomorrow 10:00", submit; then try invalid times.

**Acceptance Scenarios**:

1. **Given** I tick **Schedule follow-up** and choose "Tomorrow 10:00", **When** I submit, **Then** a pending follow-up is created for the lead owner (or me if the lead is unassigned and I am an eligible role), and the timeline shows "Follow-up scheduled for Thu 1 Oct, 10:00".
2. **Given** a follow-up time in the past, or more than 90 days ahead, **Then** validation rejects it.
3. **Given** L has a pending follow-up due today, **When** I log an activity, **Then** the composer shows a pre-ticked checkbox "Mark follow-up 'Call back about finance' as done". Submitting marks it done and links it to this activity.

---

### User Story 5 — Change stage while logging (Priority: P2)

**Why this priority**: A convenience that saves a second action; the core log works without it.

**Independent Test**: On a CONTACTED lead, log an activity moving to QUALIFIED; then attempt an invalid jump and a stale change.

**Acceptance Scenarios**:

1. **Given** L is CONTACTED, **When** I pick "Move to QUALIFIED" and submit, **Then** the stage changes in the same save, with a stage-history record and a system timeline entry.
2. **Given** L is CONTACTED, **Then** the stage options list only offers allowed open-stage targets (QUALIFIED, plus backward moves). Skipping ahead (e.g. CONTACTED → NEGOTIATION) is not offered, and the system rejects it if forced (invalid transition).
3. **Given** I need WON or LOST, **Then** the composer shows a link "Close lead…", which opens the separate closing flow (F07). This feature does not accept WON or LOST.
4. **Given** someone else changed L's stage after I opened the page, **When** I submit a stage change, **Then** I am told "This lead was updated by Marco Bianchi. Review and retry." The activity isn't saved (all or nothing), and my typed note is kept.

---

### User Story 6 — Permissions (Priority: P1)

**Why this priority**: Security by default; every lead-scoped write is authorized server-side.

**Independent Test**: Post as a rep to a pool lead, as a manager to a team lead, and as a rep from another team to an out-of-scope lead.

**Acceptance Scenarios**:

1. **Given** I'm a rep viewing an unassigned lead in my team pool, **Then** the composer is replaced by "Claim this lead to log activities" (F11), and a forced request is refused as forbidden.
2. **Given** I'm Lukas (manager, DACH), **When** I log on a lead owned by Anna Weber, **Then** it's allowed, and the entry's actor is Lukas.
3. **Given** Sofia posts to a DACH lead she cannot see, **Then** the response is "not found" (no existence leak).

---

### User Story 7 — Fast, safe input (Priority: P2)

**Why this priority**: Polishes the experience under flaky networks and enables later AI/channel features.

**Independent Test**: Simulate a failed request, double-click submit, and prefill the composer programmatically.

**Acceptance Scenarios**:

1. **Given** a flaky network, **When** a request fails, **Then** the optimistic entry is removed, a message says "Couldn't save activity. Your note is kept", and the form still holds my input.
2. **Given** I double-click submit, **Then** only one activity is created (the button disables while pending, and repeated requests are recognized as the same submission).
3. **Given** channel actions (F14) or AI assist (F18) prefill the composer (type WhatsApp, drafted note, AI-assisted flag), **Then** the fields are filled and focus moves to the outcome/note, and the saved entry carries the AI-assisted flag.

---

### Edge Cases

- The lead was reassigned away mid-edit: the save is refused as forbidden (still readable as a manager) or not found (no longer in scope). The UI shows an explanation and keeps the note.
- The lead is WON or LOST: logging a Note is allowed (post-sale notes); contact types are allowed but don't change the stage. LOST → CONTACTED reopen is F07 (manager and above) only.
- Concurrent saves by two users on the same lead with no stage change: both succeed (append-only), ordered by server time then identifier.
- Concurrent stage changes: the second is refused as stale.
- A follow-up chosen for completion belongs to another lead or is already done: refused as an invalid follow-up.
- The live-update channel or cache is down: the activity is still saved. A warning is logged, and live clients refetch on reconnect.
- The scoring calculation fails unexpectedly: everything rolls back and the request fails; nothing partial is written.
- Unicode, emoji and newlines in the note are stored and rendered correctly. Control characters other than newline and tab are stripped on save.
- Clock skew: the server sets all timestamps; client times are ignored except the chosen follow-up due time.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST provide a composer with **type** (Call, WhatsApp, SMS, Email, Meeting, Test drive, Note), **outcome** (Connected, No answer, Voicemail, Interested, Not interested, Callback requested), **note** (required, 1–2000 characters trimmed), optional **next follow-up** (date/time plus optional note up to 200 characters), optional **complete pending follow-up**, and optional **stage change** (open stages only).
- **FR-002**: Outcome rules: required for contact types (Call, WhatsApp, SMS, Email), optional for Meeting and Test drive, forbidden for Note.
- **FR-003**: Saving an activity MUST perform all of the following as **one all-or-nothing operation**; any failure leaves nothing written:
  1. load the lead and check permission (not visible to the user → "not found"; visible but not permitted → "forbidden");
  2. record the user's activity (author, AI-assisted flag, client request id);
  3. update the unanswered-attempt counter: contact type with No answer/Voicemail → +1; any outcome of Connected, Interested, Not interested or Callback requested, or type Meeting/Test drive → reset to 0; Note → unchanged;
  4. for a **contact activity** (user activity whose type is not Note): set first-response time if empty and set last-contact time to now; always set last-activity time to now;
  5. auto-advance the stage: NEW → CONTACTED on the first contact activity; COLD → CONTACTED on any contact activity; a Note never advances. Each records stage history (actor = user, reason auto:first_activity / auto:revive) and a system timeline entry;
  6. apply an explicit stage change (after auto-advance) if it is a valid open-to-open transition; otherwise refuse as an invalid transition. If the request carries the version the user last saw and it no longer matches, refuse as stale;
  7. create the requested follow-up (assigned to the lead owner, or the actor if unassigned; status pending) plus a system timeline entry;
  8. complete the pending follow-up if one was chosen (it must belong to this lead and be pending/overdue): mark done, record the completion time and link it to the new activity;
  9. recompute the lead's score and priority; if the priority band changed, add a system timeline entry showing from/to priority and score;
  10. increase the lead's version and update its modified time;
  11. write an audit entry (actor, action "activity.create", before/after of the changed lead fields).
- **FR-004**: After the save is committed, the system MUST announce one "activity created" event per inserted activity (user and system, in order) and one "lead updated" event with the changed fields. Announcement failures are logged and MUST NOT fail the save.
- **FR-005**: Saving MUST be idempotent on a client-generated request id: a repeat with the same id for the same lead within 10 minutes returns the original result without creating new records.
- **FR-006**: Activities MUST be append-only. No edit or delete capability exists. Corrections are logged as a new Note.
- **FR-007**: The client MUST show the new entry optimistically, roll it back on error while keeping the form values, and on success replace it with the server's records, refresh the lead's header fields, and refresh the inbox list.
- **FR-008**: The composer MUST expose a way for other features (F14 channels, F18 AI assist) to prefill type, note, outcome and AI-assisted flag, and to move focus into it.
- **FR-009**: The note MUST be stored exactly as typed (after trimming) and rendered as plain text.
- **FR-010**: The follow-up due time MUST be in the future (at least 1 minute ahead) and at most 90 days ahead. Quick picks: "In 2 h", "Tomorrow 10:00", "In 3 days", "Next Monday 10:00", "Custom".
- **FR-011**: Keyboard: keys 1–7 pick the type when the composer is focused but not typing in the note; Ctrl/⌘+Enter submits; Esc clears (with a confirmation if the note is non-empty).
- **FR-012**: Validation rules MUST be identical on the client and the server (one shared definition).

### Key Entities

- **Activity**: An append-only timeline record on a lead: kind (user or system), type, optional outcome, note, author, AI-assisted flag, client request id, time.
- **Lead** (updated by each save): stage, unanswered-attempt count, first-response time, last-activity time, last-contact time, score, priority, score breakdown, version, modified time.
- **Stage history**: a record of each stage change with actor, reason and time.
- **Follow-up**: a scheduled next contact for a lead: assignee, due time, note, status (pending/done), and a link to the activity that completed it.
- **Audit entry**: a record of who changed what, with before/after values.
- Reads: the stage transition rules, the scoring calculation, and customer/purchase facts needed for scoring.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A rep logs an activity in at most 3 clicks plus typing from the lead page (type → outcome → submit), and at most 4 from the inbox.
- **SC-002**: The new entry is visible in under 100 ms. Server confirmation completes for 95% of saves in under 150 ms on a local setup.
- **SC-003**: 100% of acknowledged activities are present after a page reload and after a server restart.
- **SC-004**: Zero partial writes: a failure injected at any step of the save leaves the data unchanged.
- **SC-005**: Double-submit and retry produce exactly one activity.

## Assumptions

- Depends on authentication (F02), the permission policy (F03), and lead scoring (F09); the composer is placed in the lead detail page slot provided by F05 and can be built in parallel against that documented contract.
- Closing a lead (WON/LOST) with deal value and lost reason belongs to F07; follow-up lists, overdue sweeping and reminders belong to F08; channel deep links and templates to F14; AI drafting to F18.
- The follow-up scheduled here is a minimal record; F08 extends it.
- A Note is not customer contact (no auto-advance, no first response, no coverage, attempt count unchanged).
- Logging on an unassigned pool lead by a manager does not auto-assign it; the follow-up is assigned to the actor.
- The default composer type is Call (customer's preferred channel once F14 exists).
- Attachments, editing/deleting activities and teammate mentions/notifications are out of scope.
