# Feature Specification: Live Updates

**Feature Branch**: `012-live-updates`

**Created**: 2026-09-30

**Status**: Draft

**Input**: User description: "F12 Live Updates. Screens update in real time without refreshing. New or assigned leads reach the right people within two seconds, people never receive updates about leads they aren't allowed to see, open lead pages reflect colleagues' changes, users aren't notified about their own actions, a small indicator shows connection state, the screen reconnects and catches up on its own, and it keeps working without the shared messaging component in a single-server setup." Authoritative source: `docs/features/F12-live-updates.md`.

## Clarifications

### Session 2026-09-30

- Q: Does a rep receive events for leads owned by teammates? → A: No. A rep's visible users are only themselves, and their visible teams cover the team pool (owner empty). Managers see their team subtree, VPs see everything. The scope comes from F03 `scopeFor` (docs/03 §5).
- Q: Should the dashboard update in real time or be debounced? → A: Debounced to at most one refresh per 5 s (F12 §11).
- Q: Is a notification sound for HOT leads included? → A: Not in this build's required scope. If added, it is off by default behind a toggle (F12 §11).
- Q: How many notifications are visible at once? → A: At most 3 (F12 §7).
- Q: What is shown when the event arrives for a lead the user can no longer see? → A: The row is removed on refresh, and an open lead detail shows the reassignment banner (US-3.2).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - New lead appears live (Priority: P1)

A sales rep with the inbox open sees a new lead assigned to them appear immediately, with a notification and a visually highlighted row, without reloading the page.

**Why this priority**: This is the headline demo moment (a buyer submits in the showroom and the lead shows up in the rep's inbox) and the core value of the feature.

**Independent Test**: With the inbox open as Anna Weber, submit a DACH lead through the lead intake. Within 2 seconds a notification appears and the new row is inserted at the correct position with a highlight, with no reload.

**Acceptance Scenarios**:

1. **Given** I'm on the inbox, **When** a lead is auto-assigned to me, **Then** within 2 s I see the notification "New HOT lead · Anna Schmidt · Aurora SUV · assigned to you" with an "Open" action, and the inbox list refreshes and shows the new row highlighted (a yellow fade over 3 s).
2. **Given** I'm a DACH rep and a lead lands in the DACH unassigned pool, **Then** my Unassigned tab count increments live and a subtle notification "New lead in team pool" appears.
3. **Given** I'm a South rep, **Then** I receive **no** update about a DACH lead.

---

### User Story 2 - Managers and VPs see team and organisation activity (Priority: P1)

Managers and VPs see activity in their team or organisation reflected in their views as it happens.

**Why this priority**: Managers need live coverage and pipeline visibility. It also proves that scope-based delivery works for the wider hierarchy.

**Independent Test**: With the DACH manager on the dashboard, create, assign and change the stage of DACH leads. The dashboard figures and Team Inbox refresh, with dashboard refreshes limited to once per 5 s.

**Acceptance Scenarios**:

1. **Given** Lukas (DACH manager) is on the dashboard, **When** any DACH lead is created, assigned, or changes stage, **Then** the dashboard KPIs refresh (at most once per 5 s) and the Team Inbox updates.
2. **Given** Isabelle (VP), **Then** she receives updates for all teams.

---

### User Story 3 - Lead detail stays current (Priority: P1)

A user viewing a lead sees colleagues' changes (new activities, stage changes, reassignment) reflected within seconds.

**Why this priority**: It prevents users from acting on stale information, such as double-contacting a customer or editing a lead someone else has just taken.

**Independent Test**: Open lead X as one user. As a colleague, log an activity and change the stage. The timeline and header update within 2 s with an "Updated by … just now" note.

**Acceptance Scenarios**:

1. **Given** I have lead X open, **When** a colleague logs an activity or changes its stage, **Then** the timeline and header update within 2 s, with a small "Updated by Lukas Becker just now" note.
2. **Given** lead X is reassigned away from me (out of my scope), **Then** I see a banner "This lead was reassigned to Lea Hoffmann" and the actions are disabled.

---

### User Story 4 - Resilient connection (Priority: P1)

Users keep a working live view through network drops, sleeping laptops and server restarts, and can always see whether the live view is connected.

**Why this priority**: Live updates users can't trust are worse than none. Silent gaps cause missed leads.

**Independent Test**: Restart the server while the inbox is open. The status indicator goes to "Reconnecting…", then back to "Live" within 5 s, and any lead created during the gap is visible without manual reload.

**Acceptance Scenarios**:

1. **Given** my laptop sleeps or the server restarts, **When** the connection comes back, **Then** the client reconnects automatically (the server advises a 3-second retry). After reconnecting it refreshes the active views, so nothing is missed even if events were dropped.
2. A connection status indicator in the top bar shows green "Live", amber "Reconnecting…" or grey "Offline". It has a tooltip and visible text for accessibility.

---

### User Story 5 - Degraded mode without shared messaging (Priority: P2)

If the shared messaging component (Redis) is unavailable, live updates still work in a single-server setup.

**Why this priority**: The demo must never hard-fail because of an external service (Constitution VII), but multi-server delivery is not needed for the demo.

**Independent Test**: Stop Redis, start a single development server, and repeat User Story 1. The notification and highlighted row still appear.

**Acceptance Scenarios**:

1. **Given** Redis is unavailable, **Then** the app logs `Redis: degraded`, events are delivered through an in-process channel, and live updates still work in a single-process development run.

### Edge Cases

- **Several browser tabs**: each tab opens its own live connection, within the per-user limit of 5. Sharing one connection across tabs is out of scope.
- **Development hot reload** must not create duplicate subscribers, so the event source is a process-wide singleton.
- **Event arrives before the refetch sees the data**: events are published only after the change is committed, so a refresh triggered by an event always sees the committed data.
- **User logs out in another tab**: the next reconnect is rejected as unauthenticated and the client redirects to the login page.
- **Burst of 100 simulated leads**: refreshes are debounced per view (250 ms) and notifications are grouped rather than stacked.
- **Corporate proxy buffering the stream**: heartbeats and a no-buffering hint mitigate it. If the status is Offline for more than 60 s, the client falls back to polling every 30 s (documented fallback).
- **Reconnect with a gap larger than the replay buffer**: the client is told to resync and refreshes everything.
- **Session revoked or expired while connected**: the stream is closed at the next scope refresh.
- **More than 5 streams for one user**: the oldest is closed.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The live stream endpoint MUST authenticate with the same session cookie as other endpoints. Unauthenticated requests MUST get a 401 and no stream.
- **FR-002**: The stream response MUST be a non-cached, non-transformed, unbuffered event stream (`text/event-stream`, `Cache-Control: no-cache, no-transform`, `Connection: keep-alive`, `X-Accel-Buffering: no`), served by the Node.js runtime and never statically rendered.
- **FR-003**: On connect the stream MUST send a retry hint of 3000 ms, then an initial `hello` event carrying the user id and server time.
- **FR-004**: The stream MUST send a heartbeat comment every 25 s so idle connections are not closed by intermediaries.
- **FR-005**: Each message MUST carry a unique sortable id, an event type and a JSON body. The type MUST be one of `lead.created`, `lead.assigned`, `lead.updated`, `activity.created`, `followup.due`, `offer.changed` (docs/03 §5), plus the control event `resync`.
- **FR-006**: Delivery MUST be filtered per subscriber: deliver if the event's owner is within the user's visible users; or the event has no owner and its team is within the user's visible teams; or it is a `lead.assigned` whose previous owner is within the user's visible users (so the previous owner can remove the row); or the user is a VP. `offer.changed` MUST go to everyone. `followup.due` MUST go only to the assignee.
- **FR-007**: The subscriber's visible scope MUST be computed at connect time and refreshed every 60 s, and also on `lead.assigned` events that involve a team change. Token revocation or expiry MUST close the stream at its next refresh.
- **FR-008**: Each server process MUST subscribe to the shared event channel `leaddesk:events` once and fan events out to its open connections, each with its own filter. Payloads MUST be validated against the shared event schema. Invalid messages MUST be logged and dropped.
- **FR-009**: Producers MUST publish events only after the originating database transaction commits.
- **FR-010**: The server MUST keep a best-effort in-memory buffer of the last 500 events per process. A reconnect presenting a last-event id found in the buffer MUST replay the newer events that pass the filter. Otherwise the server MUST send a `resync` event and the client MUST refresh everything.
- **FR-011**: A single client mechanism, mounted once for the signed-in app, MUST turn events into view refreshes:
  - `lead.created` / `lead.assigned` → inbox lists and counts, follow-ups, dashboard (debounced 5 s)
  - `lead.updated` → that lead, inbox lists, pipeline
  - `activity.created` → that lead's timeline
  - `followup.due` → notification only, plus follow-ups
  - `offer.changed` → offers and every lead's offers
  - `resync` or reconnect → refresh all active views
- **FR-012**: Notification rules: a notification for `lead.assigned` to the current user (HOT gets a red accent and stays 8 s, others 5 s), for a team-pool arrival (grouped as "N new leads in team pool" when more than 3 arrive within 10 s), for `followup.due`, and for a reassignment away from the user. Events caused by the **current user** MUST NOT notify (compare the event actor with the user).
- **FR-013**: The client MUST track recently changed lead ids (5 s lifetime) and expose them to the inbox so those rows get a highlight animation. Users who prefer reduced motion get a static highlight instead.
- **FR-014**: At most 5 concurrent streams per user (the oldest is closed). Streams MUST be released and their listeners removed when the client disconnects.
- **FR-015**: The top bar MUST show a connection status indicator with three states (Live / Reconnecting… / Offline), each with text and a tooltip, not colour alone.
- **FR-016**: The lead detail view MUST show an "Updated by <name> just now" note when another user changed the open lead, and MUST show a reassignment banner and disable actions when the lead moves out of the user's scope (US-3.2).
- **FR-017**: When the shared messaging component is unavailable, event delivery MUST fall back to an in-process channel and log `Redis: degraded`.
- **FR-018**: When the status has been Offline for more than 60 s the client MUST poll active views every 30 s until the stream recovers.

### Key Entities

- **Domain Event**: a notification that something changed. It has a unique sortable id, a type, a timestamp, the team, the owner (which may be empty for the unassigned pool), the actor (empty for system or intake), and a type-specific payload. No new stored data is introduced.
- **Live Connection**: one open stream for one user in one browser tab. It has a user identity, a visible scope (users and teams) that is refreshed periodically, and a last-delivered event id.
- **Recent Event Buffer**: a bounded, best-effort, per-process history of recent events used only to catch up reconnecting clients.
- **Highlight Set**: the short-lived set of lead ids to show as newly changed in the inbox.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: From submission of a lead through intake to the notification being visible for the correct user takes under 2 s (p95, local).
- **SC-002**: There are zero cross-scope leaks. A test asserts that a South rep's stream receives none of 20 DACH events.
- **SC-003**: The live connection survives 10 minutes idle and reconnects within 5 s after a server restart.
- **SC-004**: With the shared messaging component stopped, live updates still work in a single-process development run.
- **SC-005**: A burst of 100 leads produces no more than one dashboard refresh per 5 s and grouped rather than stacked notifications.

## Assumptions

- Depends on F01 (event bus and shared event types), F03 (scope resolution), F04 (inbox, including the inbox live-highlight slot this feature fills in) and F10 (producer of `lead.created` / `lead.assigned`). Same-wave and earlier producers publish through the F01 bus.
- Owned areas: the live event endpoint, `lib/sse`, and `components/live`. The one sanctioned cross-owner edit is the body of F04's live-highlight hook, with its signature unchanged.
- Events trigger a refresh rather than patching cached data, so the data always matches server authorization and sort order.
- Durable delivery, browser push notifications and presence are out of scope.
- Dashboard updates are debounced to 5 s (revisit with F20). A notification sound for HOT leads is off by default with a toggle, and is treated as optional polish (see `assumptions.md`).
