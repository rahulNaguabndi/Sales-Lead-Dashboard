# Feature Specification: Stage Pipeline, Won/Lost & Kanban

**Feature Branch**: `007-stage-pipeline`

**Created**: 2026-09-30

**Status**: Draft

**Input**: User description: "F07 Stage Pipeline, Won/Lost & Kanban. Source: docs/features/F07-stage-pipeline.md"

## User Scenarios & Testing *(mandatory)*

Leads move through a defined pipeline: New → Contacted → Qualified → Test Drive → Negotiation → Won / Lost, plus a dormant Cold stage. This feature enforces the allowed moves, captures closing data (deal value in euros, applied offer, lost reason), records every transition in the lead's timeline and stage history, and adds a Kanban board. Stage data drives funnel, conversion, revenue and stage-aging metrics in the dashboards (F16).

### User Story 1 - Change a lead's stage from the detail page (Priority: P1)

As a rep, I want to move a lead to another stage so that the pipeline reflects reality.

**Why this priority**: Without stage changes nothing downstream (revenue, funnel, follow-up cancellation) can work.

**Independent Test**: Open a Contacted lead, change its stage to Qualified, reload, and check that the stage, the timeline entry and the stage-history record all exist.

**Acceptance Scenarios**:

1. **Given** a lead in Contacted that I own, **When** I pick Qualified from the stage dropdown, **Then** the stage updates, a system activity "CONTACTED → QUALIFIED" appears at the top of the timeline, and a stage-history record is written.
2. **Given** a lead in New, **When** I open the stage dropdown, **Then** only valid targets are enabled (Contacted, Lost); invalid ones (for example Won) are disabled with the tooltip "Not allowed from NEW".
3. **Given** a request for an invalid transition (New → Won), **Then** it is rejected with an `INVALID_TRANSITION` error and nothing changes.

---

### User Story 2 - Close a lead as Won (Priority: P1)

As a rep, I want to record a won deal with its value so that revenue is tracked.

**Why this priority**: Revenue tracking is the primary business outcome of the pipeline.

**Independent Test**: Move a Negotiation lead to Won with €36,500 and check that the dashboard revenue increases by €36,500.

**Acceptance Scenarios**:

1. **Given** a Negotiation lead, **When** I choose Won, **Then** a dialog asks for the deal value (€, required, > 0), the vehicle model (defaulting to the lead's model) and an optional applied offer chosen from the offers currently matched to the lead.
2. **When** I confirm, **Then** the stage becomes Won, the deal value, applied offer and closing time are saved, open follow-ups are cancelled, and the timeline shows "Won · 36.500 € · Aurora SUV" plus an "offer applied" entry if an offer was chosen.
3. **Given** I enter an empty or zero deal value, **Then** Confirm stays disabled and an inline error is shown.

---

### User Story 3 - Close a lead as Lost with a reason (Priority: P1)

As a rep, I want to record why a lead was lost so that loss reasons can be analysed.

**Why this priority**: Conversion and loss-reason metrics require every closed lead to be classified.

**Independent Test**: Move an open lead to Lost with reason "Price" and check the reason on the timeline and that pending follow-ups are cancelled.

**Acceptance Scenarios**:

1. **Given** an open lead, **When** I choose Lost, **Then** a dialog requires a reason from: Price, Bought elsewhere, Not ready, Unreachable, Financing declined, Other. "Other" requires a note of 3–500 characters.
2. **When** I confirm, **Then** the stage becomes Lost, the reason, note and closing time are saved, pending follow-ups are cancelled, and the timeline entry shows the reason.

---

### User Story 4 - Reopen and revive (Priority: P1)

As a rep or manager, I want dormant or lost leads to come back into play when there is fresh interest.

**Why this priority**: Prevents dead-ends in the pipeline and keeps revenue/loss metrics protected by role.

**Independent Test**: Reopen a Lost lead as a manager and confirm a rep cannot.

**Acceptance Scenarios**:

1. **Given** a Cold lead, **When** a rep logs a contact activity (a user activity that is not a Note) or sets the stage to Contacted, **Then** the lead moves to Contacted ("Revived") and its unanswered-attempt count resets to 0.
2. **Given** a Lost lead, **When** a manager or VP chooses "Reopen", **Then** it moves to Contacted, its closing time, lost reason and lost note are cleared, and the timeline shows "Reopened by Lukas Becker". A rep does not see the option, and a reopen attempt by a rep is refused as forbidden.
3. **Given** a Won lead, **Then** its stage cannot change (terminal); an attempt is rejected with `INVALID_TRANSITION`.

---

### User Story 5 - Concurrent edits are detected (Priority: P2)

As a user, I want to be told when someone else changed the lead I am editing so that I don't overwrite their work.

**Why this priority**: Protects data integrity, but the core flows work without it.

**Independent Test**: Open the same lead in two sessions; change stage in the first; submit a change from the second.

**Acceptance Scenarios**:

1. **Given** two users have the same lead open at version 4, **When** user A changes the stage (version becomes 5) and then user B submits a stage change based on version 4, **Then** B receives a `VERSION_CONFLICT` error, the UI shows "This lead was updated by Lukas Becker. Refreshed.", and the lead is refetched.

---

### User Story 6 - Kanban pipeline board (Priority: P2)

As a rep or manager, I want to see my leads by stage and drag them between columns.

**Why this priority**: A convenience view over the same stage changes; the detail-page flow already delivers the core value.

**Independent Test**: Drag a card from Qualified to Test Drive, reload, and check that it stayed.

**Acceptance Scenarios**:

1. **Given** the pipeline page, **Then** there are columns for New, Contacted, Qualified, Test Drive, Negotiation, Won (last 30 days), Lost (last 30 days) and Cold. Each column shows a count and its pipeline value (sum of maximum budget, in €).
2. Cards show the customer name, model, priority indicator, score, owner avatar and days in stage.
3. **When** I drag a card to a valid column, **Then** the same stage change is applied, optimistically. Invalid drop targets are dimmed while dragging. Dropping on Won or Lost opens the matching dialog, and cancelling it snaps the card back.
4. The board is scoped like the inbox and offers the same filters (owner for managers, source, priority).
5. Keyboard alternative: focus a card and press `M` to get a "Move to…" menu.

---

### Edge Cases

- A same-stage "transition" is a no-op: it succeeds without writing history.
- The lead is reassigned while the Won dialog is open: the version check rejects the submit (conflict).
- An applied offer expires between opening the dialog and confirming: the server re-validates and returns `OFFER_NOT_APPLICABLE`, and the dialog refreshes its offer list.
- An automatic going-cold job runs while a rep is editing: the rep's submit is rejected as a conflict and the lead is refetched (Cold → the chosen stage may still be allowed).
- Drag and drop on a touch device: a long-press starts the drag; a tap opens the lead.
- A user cannot move a lead outside their scope: the UI hides such leads on the board, and the server still refuses the change as forbidden.
- An open column with more than 200 cards shows only the top 200 by score with a "+N more → open in inbox" link.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST validate every stage change against a single transition table (docs/03 §3), on the server.
- **FR-002**: Allowed transitions: forward per the pipeline diagram; backward between open stages (any open → any earlier open stage); any open → Lost; any open → Cold (system only, or manager+ manually); Cold → Contacted; Lost → Contacted (manager/VP only); Won is terminal.
- **FR-003**: Each successful change MUST atomically update the lead's stage, modification time and version, record a stage-history entry (from, to, changed by, reason, time), and add a "stage changed" system activity with from, to and optional reason.
- **FR-004**: Won MUST require a deal value (integer euro cents, > 0 and ≤ €1,000,000). An applied offer is optional and, if given, MUST be an offer currently matching this lead. Won sets the closing time and, in the same atomic change, records a purchase (customer, lead, vehicle model, amount = deal value) and marks the customer as returning.
- **FR-005**: Lost MUST require a lost reason; "Other" requires a note (3–500 characters). Lost sets the closing time.
- **FR-006**: Moving to Won or Lost MUST cancel the lead's pending follow-ups.
- **FR-007**: A stage change request MUST carry the version the user last saw. A mismatch is rejected as a conflict and returns the current lead.
- **FR-008**: Authorization: changing a stage requires the user to be permitted to change stage on that lead (own / team / organisation scope). Reopening a Lost lead additionally requires manager or VP role.
- **FR-009**: After a successful change the system MUST publish a lead-updated event (with stage and deal value if set) and an activity-created event.
- **FR-010**: The stage change capability MUST be reusable by other features: activity logging (automatic New → Contacted on the first contact activity; Cold → Contacted revive) and follow-up/going-cold detection (automatic Cold, with no user as the actor).
- **FR-011**: The lead's score MUST be recomputed after a stage change, and a score-changed activity emitted if the priority band changes.
- **FR-012**: The Kanban MUST load at most 200 cards per open column (sorted by score, highest first), with a "+N more → open in inbox" link.
- **FR-013**: Won/Lost dialog amounts are displayed and entered in euros using German formatting ("36.500 €"), and the input accepts both "36500" and "36.500".

### Key Entities

- **Lead**: stage, deal value, applied offer, lost reason and note, closing time, version, unanswered-attempt count.
- **Stage history**: per-lead record of each transition (from, to, who, reason, when).
- **Activity**: timeline entries of type "stage changed" and "offer applied".
- **Follow-up**: pending items cancelled on close.
- **Offer**: read to validate the applied offer at closing.
- **Purchase / Customer**: a purchase is recorded on Won and the customer is marked returning.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of invalid transitions are rejected (verified for the full 8×8 stage matrix and every role).
- **SC-002**: A stage change is reflected in the timeline and Kanban in under 500 ms in a local environment.
- **SC-003**: Every Won lead has a deal value, and every Lost lead has a reason (enforced at data level and verified by a service test).
- **SC-004**: Funnel counts in the dashboards equal the stage-history-derived counts for the seed data.

## Assumptions

- Cold can be set manually only by managers/VPs (open question resolved with the doc's proposal); reps cannot set it.
- Won creates a purchase record (resolved in the domain model).
- Configurable pipelines, probability-weighted forecasting and undoing a stage change are out of scope.
- The offer picker depends on offer matching (F15); until it exists, the Won dialog offers no offers and applied offer is omitted.
- Score recomputation depends on scoring (F09) and the activity/transaction helpers on F06; until integrated they are stubbed against the documented interface.
- Stage chip colors: New slate, Contacted blue, Qualified indigo, Test Drive violet, Negotiation amber, Won green, Lost red, Cold sky-grey; the chip always includes a text label.
- Toasts: "Moved to Qualified" on success; error toast with the reason on conflict/invalid outcomes.
