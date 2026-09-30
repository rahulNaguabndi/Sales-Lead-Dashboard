# Feature Specification: Claim, Manual Assign & Auto-assign Settings (F11)

**Feature Branch**: `011-assignment-management`

**Created**: 2026-09-30

**Status**: Draft

**Input**: User description: "F11 Claim, Manual Assign & Auto-assign Settings. Source: docs/features/F11-assignment-management.md"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Rep claims an unassigned lead (Priority: P1)

A rep with spare capacity grabs new leads from their team's pool of unassigned leads, one at a time, up to a personal limit (25 open leads by default).

**Why this priority**: It is the only way a rep gets new work when auto-assign is off or the pool is full. It is also the most contested action, so correctness under races matters.

**Independent Test**: As Anna Weber, open Unassigned, claim a lead, and check that it's in My Leads and that the timeline shows "Claimed by Anna Weber".

**Acceptance Scenarios**:

1. **Given** a DACH lead with no owner and I (DACH rep) have 12 open leads, **When** I click **Claim**, **Then** I become the owner, the assignment time is set to now, a "claimed" system entry is added to the timeline, the lead leaves the Unassigned tab and appears in My Leads, and a "lead assigned (method: claim)" event is published.
2. **Given** Jonas claimed the same lead a second earlier, **When** I click Claim, **Then** I get an "already assigned" error (409), the toast "Claimed by Jonas Fischer a moment ago", and the row disappears.
3. **Given** I already have 25 open leads (my personal limit), **When** I click Claim, **Then** I get a "claim limit" error (422) and the toast "Claim limit reached (25 open leads)".
4. **Given** a lead in another team's pool, **Then** I can't see it, and a direct request to claim it is refused (403/404).

---

### User Story 2 - Manager assigns and reassigns (Priority: P1)

A manager routes leads within their team to the right rep, with visibility into workload and language fit.

**Why this priority**: It is the manager's core control over lead distribution.

**Independent Test**: As Lukas (DACH manager), open a DACH lead, assign it to Lea Hoffmann, and verify owner, timeline, follow-ups and both inboxes.

**Acceptance Scenarios**:

1. **Given** I'm Lukas (DACH manager), **When** I open a DACH lead and choose "Assign to… → Lea Hoffmann", **Then** the owner changes, an "Assigned to Lea Hoffmann by Lukas Becker" entry (recording previous owner, new owner, method "manual" and optional reason) is added, the pending follow-ups move to Lea, both inboxes update live, and Lea gets a toast.
2. **Given** the assignee picker, **Then** it lists only active reps in my scope, each with an open-lead count, a languages badge and a "matches customer language" marker, sorted by language match, then fewest open leads.
3. **Given** the target is at or above the claim limit, **When** I assign, **Then** the assignment is allowed (managers ignore the claim limit) but a warning is shown (e.g. "Lea has 26 open leads").
4. **Given** a lead I manage, **When** I choose "Unassign → return to pool", **Then** the lead has no owner (manager and above only).

---

### User Story 3 - Bulk reassign (Priority: P1)

A manager selects many leads in the Team Inbox and reassigns them in one action.

**Why this priority**: Covers holidays and rebalancing without repetitive clicking.

**Independent Test**: Filter Team Inbox by owner Felix and "Going cold", select 5 rows, assign to Lea, and verify all five moved with a single toast.

**Acceptance Scenarios**:

1. **Given** the Team Inbox filtered by owner=Felix and "Going cold", **When** I select 5 rows and choose "Assign to… Lea", **Then** all 5 are reassigned in one request, all or nothing, with 5 timeline entries and one summary toast "5 leads assigned to Lea Hoffmann".
2. **Given** a selection of more than 100 leads, **Then** the request is rejected; bulk is capped at 100 leads per request.

---

### User Story 4 - VP assigns across teams (Priority: P1)

A VP moves leads between teams by assigning them to a rep in another team.

**Why this priority**: Cross-team balancing is a VP-only capability, and ownership and visibility must stay consistent.

**Independent Test**: As Isabelle (VP), assign a DACH lead to Sofia Rossi (South) and check owner and team.

**Acceptance Scenarios**:

1. **Given** I'm Isabelle (VP), **When** I assign a DACH lead to Sofia Rossi (South), **Then** the owner becomes Sofia and the lead's team becomes South, and the activity notes "Moved from Team DACH to Team South".
2. **Given** I'm a manager, **When** I attempt a cross-team assign, **Then** I get 403.

---

### User Story 5 - Auto-assign settings (Priority: P1)

A manager controls how new leads are distributed in their team: automatic assignment on/off and the strategy.

**Why this priority**: It determines where every new lead lands.

**Independent Test**: Turn auto-assign OFF for DACH, submit a DE showroom lead, and check that it lands in Unassigned. Turn it ON with Language match, submit again, and check that it went to a German-speaking rep with the fewest open leads.

**Acceptance Scenarios**:

1. **Given** `/team/settings`, **Then** I see my team with a toggle **Auto-assign ON/OFF** and a **Strategy** choice (Load balanced · Language match · Round robin), each with a one-line explanation, plus a table of reps (open leads, languages, active toggle, max open leads).
2. **When** I save, **Then** the team's auto-assign and strategy update, the change is audited, and new intake uses it immediately.
3. **Given** I'm a VP, **Then** I see all 3 teams on this page. A rep gets 403 and has no nav item for it.
4. **Given** I deactivate a rep (manager and above), **Then** they are excluded from auto-assign and from the picker. Their existing leads stay put, and a hint says "Reassign Felix's 14 open leads?" with a one-click bulk action to the pool.

---

### User Story 6 - Rebalance helper (Priority: P2)

A manager applies the team's strategy to all currently unassigned leads at once.

**Why this priority**: A convenience for clearing a backlog after turning auto-assign on.

**Independent Test**: With unassigned leads in the pool, press "Rebalance pool" and check that the reported count matches.

**Acceptance Scenarios**:

1. **Given** unassigned leads in my team's pool, **When** I press "Rebalance pool" on the settings page, **Then** the team's strategy runs over all currently unassigned leads in the team (max 100), and I see "Assigned 12 leads".

---

### Edge Cases

- A rep claims a lead at the same moment a manager assigns it: whichever commits first wins, and the other gets 409.
- A manager assigning a lead to themselves is allowed (managers can hold leads).
- Reassigning to the current owner is a no-op: it returns 200 and writes nothing.
- The target rep is deactivated between the picker loading and submit: 422 "target inactive".
- The team has 0 active reps and auto-assign is ON: the lead goes to the pool, and the manager gets a toast "No available reps; lead in pool".
- A cross-team move by the VP changes visibility: the old team's manager loses access, and their live views drop the row.
- The round-robin cursor points to a deleted or deactivated user: continue from the next name alphabetically.
- Everyone in the team is at or above their open-lead limit during auto-assign: the lead goes to the pool.
- No rep speaks the customer's language under language-match: fall back to all reps and note the fallback in the timeline.
- A bulk request contains any lead the requester isn't authorized for: the whole request fails and lists the offending lead IDs.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Claiming MUST be atomic: a lead is granted only if it is still unowned and belongs to one of the claimer's teams. If nothing changes, the claimer gets 409.
- **FR-002**: Claiming MUST check, in the same atomic operation, that the claimer's open leads are fewer than their personal limit. Open = NEW, CONTACTED, QUALIFIED, TEST_DRIVE, NEGOTIATION (COLD does not count toward the limit).
- **FR-003**: Manual assignment MUST be authorized: a manager when both the lead and the target are in their scope, a VP always. The target MUST be an active REP or MANAGER.
- **FR-004**: Every ownership change MUST, in one atomic operation: update owner, team (if changed), assignment time and version; add an "assigned" or "claimed" system entry to the timeline; move PENDING follow-ups to the new owner; and write an audit row (action `lead.assign`, before/after owner and team).
- **FR-005**: After the change commits, the system MUST publish a "lead assigned" event (lead, previous owner, new owner, actor, method AUTO|MANUAL|CLAIM, team), so live views can remove the row from the old owner and add it for the new one.
- **FR-006**: Bulk assignment MUST be all-or-nothing, limited to 100 leads, and every lead MUST pass authorization or the whole request fails with the list of offending IDs.
- **FR-007**: Changing team settings MUST require permission to configure the team (the team's manager, or a VP), and MUST validate the strategy against the allowed set.
- **FR-008**: The system MUST provide an auto-assign capability (shared with lead intake) implementing:
  - **Load balanced**: active reps in the team, fewest open leads; tie → longest since last assignment; tie → name.
  - **Language match**: reps whose languages include the customer's language, then load-balanced. If none match, fall back to all reps and note the fallback in the activity.
  - **Round robin**: the next active rep after the team's rotation position, ordered by name; the position is then advanced.
  - Auto-assign MUST skip reps at or above their open-lead limit. If everyone is full, the lead goes to the pool.
  - Concurrent auto-assignments within one team MUST be serialized so two simultaneous new leads can't both pick the same "least loaded" rep.
- **FR-009**: The system MUST record the time of last assignment for every user each time a lead is assigned to them.
- **FR-010**: The timeline entry for an auto-assignment MUST include the reason, e.g. "Auto-assigned to Sofia Rossi · language match (it) · 11 open leads".
- **FR-011**: Managers and VPs MUST be able to deactivate/reactivate a rep and change a rep's open-lead limit from the settings page (US-5).
- **FR-012**: The assignee picker MUST expose, per candidate: open-lead count, languages, whether they match the customer's language, and whether they are at or above the limit (US-2).
- **FR-013**: A rebalance action MUST apply the team strategy to the team's unassigned leads (max 100) and report how many were assigned (US-6).

### Key Entities

- **Lead**: owner, team, assignment time, version, stage (open vs. cold determines limit counting).
- **User (rep/manager/VP)**: active flag, spoken languages, open-lead limit, last-assigned time, team.
- **Team**: auto-assign on/off, strategy, round-robin position.
- **Follow-up**: pending follow-ups travel with the lead's owner.
- **Activity (timeline entry)**: "assigned" and "claimed" system entries.
- **Audit log row**: who changed ownership, before/after owner and team.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 0 double-claims under concurrency: 50 simultaneous claim attempts on one lead yield exactly 1 success.
- **SC-002**: Assigning a lead updates both affected inboxes in under 2 seconds.
- **SC-003**: With load-balanced strategy, 40 simulated new leads into a 4-rep team with equal starting loads end within ±1 lead of each other.
- **SC-004**: 100% of ownership changes have a matching timeline entry and audit row.
- **SC-005**: A rep can claim a lead in a single click, and a manager can reassign a lead in at most three interactions (open picker, choose rep, confirm).

## Assumptions

- Depends on the inbox (F04: tabs, rows, multi-select) and on intake/routing (F10) for the shared auto-assign capability; permissions come from the RBAC policy (F03); follow-up moving relies on F08's reassign capability, and live delivery on F12's event bus. Same-wave counterparts are stubbed until they merge.
- Managers are not auto-assign candidates; only reps are (resolves open question 1 by the doc's proposal).
- Reps "releasing" a lead back to the pool is out of scope (P2 extension, needs a mandatory reason).
- Out of scope: skill/vehicle-based routing, weighted capacity, working hours/out-of-office, and auto-reassigning untouched HOT leads after 30 minutes.
- The data model is owned by F01 and is not changed here.
- Default personal limit is 25 open leads.
