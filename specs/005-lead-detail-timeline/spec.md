# Feature Specification: Lead Detail & Timeline

**Feature Branch**: `005-lead-detail-timeline`

**Created**: 2026-09-30

**Status**: Draft

**Input**: User description: "F05 Lead Detail & Timeline — source: docs/features/F05-lead-detail-timeline.md. Clicking a lead shows its full details and a chronological log of all follow-up activities (challenge requirement R2)."

## Clarifications

### Session 2026-09-30

- Q: Should viewing a lead be recorded for compliance? → A: No; viewing is side-effect free (FR-014).
- Q: What does a rep see on an unassigned team-pool lead? → A: Read-only page with "Claim this lead to work on it"; claiming is a later feature.
- Q: Which score rule labels are shown before the scoring feature exists? → A: Component names and values only.
- Q: How is the timeline's order preference scoped? → A: One preference per browser, shared across all leads.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Open a lead and see its full details (Priority: P1)

A sales rep clicks a lead and immediately sees who the customer is and what they want: a header (name, reference, stage, priority and score, owner, source, created date, returning-customer marker) plus Customer, Interest and History cards.

**Why this priority**: This is the core of requirement R2 and the rep's workspace for a lead.

**Independent Test**: From the inbox, click a seeded lead. The header, customer card and interest card show values that match the stored data.

**Acceptance Scenarios**:

1. **Given** I'm on the inbox, **When** I click "Giulia Conti", **Then** the lead page loads showing the header (name, reference `EDM-2026-00812`, stage chip, priority badge + score, owner, source, created date, Returning badge) and the Customer, Interest and History cards.
2. **Given** the customer card, **Then** it shows phone (international format for display, e.g. "+39 347 123 4567"), email, city and country, age band, language, the preferred channel marked ★, secondary channel, and best time to contact.
3. **Given** the interest card, **Then** it shows the vehicle model name and list price (euros, German number format, "38.900 €"), budget range, trade-in yes/no, finance interest yes/no, test drive requested yes/no, and the buyer's original message.
4. **Given** the customer is returning, **Then** the History card lists previous leads (reference, model, stage/outcome, date, each linking to the lead if it's in my scope) and purchases (model, amount in €, date). **Given** the customer is new, **Then** the card says "First enquiry".

---

### User Story 2 - See the chronological activity log (Priority: P1)

A rep sees the full history of the lead in time order, merging activities logged by people with automatic system events, so they know exactly what has happened.

**Why this priority**: The chronological log of follow-up activities is the other half of requirement R2.

**Independent Test**: Open a lead with 6 user activities and 4 system events and verify all 10 appear in correct order in both directions.

**Acceptance Scenarios**:

1. **Given** a lead with 6 user activities and 4 system events, **When** the page loads, **Then** the timeline shows all 10 entries merged in time order, newest first by default, grouped under day headers ("Today", "Yesterday", "Mon 28 Sep").
2. **Given** I toggle order to "Oldest first", **Then** the timeline reverses, and the preference persists across leads and reloads.
3. **Given** a user-logged entry, **Then** it shows a type icon, type label, outcome chip, the note (line breaks preserved, no markup rendering), actor name and avatar, relative time ("3 h ago"), an "AI-assisted" marker if set, and the absolute timestamp on hover or focus ("30 Sep 2026, 14:05").
4. **Given** a system entry, **Then** it renders as a compact muted line, e.g. "Stage changed NEW → CONTACTED · by Sofia Rossi · 2 d ago", "Auto-assigned to Sofia Rossi · language match: it", "Lead created from Facebook · Milano".
5. **Given** I filter the timeline to "Activities only", **Then** system entries are hidden. "All" shows both.
6. **Given** more than 50 entries, **Then** the first 50 load and "Load older" fetches the next page.

---

### User Story 3 - Access control without leaking existence (Priority: P1)

A user may only see leads within their scope, and asking for a lead outside it looks exactly like asking for one that doesn't exist.

**Why this priority**: Protecting cross-team lead data and not leaking that a lead exists are essential.

**Independent Test**: As Sofia (Team South) open the URL of a DACH lead and of a non-existent lead; the outcomes are indistinguishable.

**Acceptance Scenarios**:

1. **Given** Sofia (Team South) opens the URL of a DACH lead, **Then** she sees the same "Lead not found" page as for a non-existent id (not-found response from the data endpoint). Nothing about the lead is disclosed.
2. **Given** a lead in my scope where I'm not allowed an action (e.g. a rep viewing a team-pool unassigned lead), **Then** the page renders read-only, and action areas show "Claim this lead to work on it" (the claim action itself belongs to a later feature). Action endpoints answer "forbidden" (visible but not permitted).
3. **Given** my session expired, **When** I open a lead URL, **Then** I'm redirected to sign-in and return to that lead after login.

---

### User Story 4 - Reserved places for later features (Priority: P1)

The page reserves named places for the composer, channel actions, follow-ups, offers and AI suggestions so later features plug in without changing the page structure.

**Why this priority**: Parallel delivery of later features depends on stable, named extension points.

**Independent Test**: With no later features present the page fully satisfies R2; registering a component in one place makes it appear in the right region.

**Acceptance Scenarios**:

1. **Given** the composer, channel, follow-up, offers and AI features aren't built, **Then** each reserved place renders nothing (or a subtle placeholder in development), and the page still fully satisfies R2.
2. **Given** a later feature registers its component for a reserved place, **Then** it renders in the correct region with the lead context, with no other change to the page.

---

### User Story 5 - Score explanation (Priority: P2)

A rep can see how the priority score was made up.

**Why this priority**: Helps reps trust and act on priority, but not needed for R2.

**Independent Test**: Click the priority badge and compare the popover with the stored breakdown.

**Acceptance Scenarios**:

1. **Given** the priority badge "HOT 82", **When** I click it, **Then** a popover shows the breakdown (Intent 27/35, Source 5/15, Customer 15/15, Freshness 20/20, Engagement 15/15) with the scoring rule labels.

---

### User Story 6 - Responsive layout (Priority: P2)

The page is usable on narrower screens.

**Why this priority**: Secondary to the desktop workflow.

**Independent Test**: Resize the viewport below 1024 px.

**Acceptance Scenarios**:

1. **Given** a viewport under 1024 px, **Then** the columns collapse into tabs **Details · Timeline · Actions**, with Timeline as the default tab.

---

### Edge Cases

- Malformed lead id: shown as not found without any data lookup.
- Lead with zero activities: timeline shows only "Lead created" (every lead has one). If even that is missing, show "No activity yet".
- Deleted or deactivated owner or actor: name shown with an "(inactive)" suffix. Missing actor shows "System".
- Unknown system activity type (added later without a formatter): generic "{type} · {time}" line, no crash.
- Missing customer email or phone: field shows "—".
- Very long note (2000 chars): collapsed to 6 lines with "Show more".
- Lead reassigned away while open: the next refresh yields not-found, and the UI shows the not-found state with "Back to inbox".
- Activities with identical timestamps: a stable tiebreak keeps the order deterministic.
- Budget missing: "Not specified". Only a max given: "up to 40.000 €".
- Activities list fails to load: inline retry that doesn't break the rest of the page.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST render the lead page with a header, a left column (Customer, Interest, History, Score cards), a center column (composer place + timeline) and a right column (channels, follow-ups, offers and AI places).
- **FR-002**: The system MUST provide lead data (lead, customer, owner, team, history of previous leads and purchases, follow-up summary) together with a set of permissions computed by the access policy for the current user.
- **FR-003**: The system MUST answer "not found" both when the lead doesn't exist and when it's outside the user's read scope, and log out-of-scope attempts as a security warning (user, lead). It MUST answer "forbidden" only for disallowed actions on leads the user can read.
- **FR-004**: The system MUST provide a lead's user and system activities ordered by time with a stable tiebreak, in the requested direction, in pages (default 50, max 100) with an opaque continuation marker.
- **FR-005**: The timeline MUST support an order toggle (newest first default / oldest first) persisted client-side, and a filter All / Activities only / System only.
- **FR-006**: Every timestamp MUST show relative time (refreshed every 60 s) plus the absolute date and time on hover/focus, in the user's locale and timezone (24 h), with machine-readable time markup.
- **FR-007**: System entries MUST be rendered from their type and details through a single central formatter, so new system types can be added in one place.
- **FR-008**: User-entered text (notes, buyer messages) MUST be rendered as plain text with preserved line breaks, never as markup.
- **FR-009**: The page MUST expose named extension places `composer`, `channels`, `followUps`, `offers`, `ai`, `customerExtras`, and `headerActions`, each receiving the lead, customer, permissions and current user.
- **FR-010**: The page MUST show initial data on first load, then keep it refreshable so later mutations (activity logging) and live events can update it without a full reload.
- **FR-011**: The stage chip in the header MUST be read-only in this feature; a later feature replaces it with an editable control via the header actions place.
- **FR-012**: Money MUST display as euros with German number formatting and no decimals. Phone numbers are displayed in international format.
- **FR-013**: History MUST only link to previous leads the user can read. Others are listed without a link.
- **FR-014**: Opening a lead MUST NOT create an activity or modify the lead. Viewing is side-effect free.

### Key Entities

- **Lead**: reference, stage, priority, score and breakdown, source, vehicle interest, budget, trade-in/finance/test-drive flags, message, timestamps, owner, team.
- **Customer**: identity, contact details, location, age band, language, preferred/secondary channel, best contact time, returning status (derived from prior lead or purchase).
- **Activity**: user-logged (type, outcome, note, AI-assisted flag) or system (type plus details) entry with actor and time.
- **Owner/Actor (user)**: name, avatar colour, active flag. **Team**: name.
- **Follow-up**: next pending follow-up and pending count (summary only).
- **Previous lead / Purchase**: history entries for the same customer.
- **Permissions**: read, log activity, change stage, assign, claim, for the current user on this lead.

Reads only; no writes. Vehicle names and prices come from the shared vehicle catalog.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Lead details and the first page of the timeline are ready within 150 ms of server processing for 95% of requests on the seed data set, and the full page is interactive in under 1 second locally.
- **SC-002**: 100% of activities stored for a lead appear in the timeline (verified by count), in correct order in both directions.
- **SC-003**: Responses for an out-of-scope lead and a non-existent lead are indistinguishable (identical status and body).
- **SC-004**: A new viewer can state the customer's preferred channel, vehicle and last contact outcome within 5 seconds of the page loading.

## Assumptions

- Depends on authentication (current user) and hierarchy/RBAC (read-scope and permission policy); a viewer is a rep, manager or VP.
- Out of scope: activity composer and logging, editable stage and won/lost dialogs, follow-up scheduling UI (only the next follow-up is included in data), channel buttons and message templates, offers panel, AI card, editing customer details.
- Viewing a lead is not recorded in any audit log (FR-014); whether it should be is an open compliance question.
- Score rule labels come from the lead-scoring feature; until available the breakdown shows component names and values.
- Lead-detail logic lives in its own service, separate from the inbox query service.
