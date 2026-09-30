# Feature Specification: F04 — Lead Inbox

**Feature Branch**: `004-lead-inbox`

**Created**: 2026-09-30

**Status**: Draft

**Input**: User description: "F04 Lead Inbox. The authoritative source is docs/features/F04-lead-inbox.md."

**Requirement**: Challenge requirement **R1** — display a list of all incoming sales leads.

**Depends on**: F02 (current user), F03 (scope and policy). Reads fields populated by the seed (F01), scoring (F09) and intake (F10). Blocks F11 (claim/assign in rows) and F12 (live row updates).

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 — See my leads, ranked by urgency (Priority: P1) · R1

As a rep, I want to see all my leads in one list, most urgent first, so I know who to contact next.

**Why this priority**: This is the mandatory R1 deliverable and the home screen for reps.

**Independent Test**: Sign in as `sofia.rossi@eurodrive.test`. The inbox shows only Sofia's leads, and the first rows are overdue or response-target-breach leads.

**Acceptance Scenarios**:

1. **Given** Sofia owns 32 open leads, **When** she opens the inbox, **Then** she lands on the **My Leads** tab showing 25 rows (page 1 of 2) and a total of 32.
2. **Given** one of her leads has a follow-up due yesterday, **When** the list loads, **Then** that lead is ranked above leads with no overdue follow-up and its "Next" cell is red and labelled "Overdue".
3. **Given** two leads have no overdue follow-ups and no response-target breach, with scores 82 and 55, **Then** the 82 lead appears first. Equal scores are ordered newest first.
4. **Given** a NEW HOT lead created 20 minutes ago with no activity, **Then** it shows a "Respond now" badge and ranks above non-breaching leads.

---

### User Story 2 — Each row tells me enough to decide (Priority: P1) · R1

As a rep, I want each row to show who, what, where from, and how urgent, without opening it.

**Why this priority**: The list is only useful if rows carry the decision-making information.

**Independent Test**: Inspect a row and confirm every listed element is present; click it and land on the lead detail page.

**Acceptance Scenarios**:

1. **Given** a lead row, **Then** it shows: priority indicator (HOT/WARM/COOL, with text for screen readers), customer name with a Returning badge if applicable, city and country flag, vehicle model, source badge, stage chip, owner avatar (hidden on the My Leads tab), lead age ("2 h", "3 d"), last activity summary with relative time, and next follow-up.
2. **Given** I click anywhere on a row (or press Enter on a focused row), **Then** I navigate to that lead's detail page (F05).

---

### User Story 3 — Quick views (tabs) (Priority: P1)

As a user, I want one-click views for the lists I use most.

**Why this priority**: Tabs are the primary navigation for working the list.

**Independent Test**: Sign in as each role and verify the visible tabs, counts and default tab.

**Acceptance Scenarios**:

1. **Given** I'm a rep, **Then** I see tabs **My Leads · Unassigned · Due Today · Going Cold**, each with a count badge.
2. **Given** I'm a manager or VP, **Then** I also see **Team** (manager) or **All** (VP), which is my default tab, and My Leads is hidden if I own no leads.
3. **Given** I pick **Unassigned**, **Then** I see open leads with no owner in my scope's teams. For a rep that's their own team's pool only.
4. **Given** I pick **Due Today**, **Then** I see leads with a pending follow-up due before the end of today (in my browser's timezone), including overdue ones.
5. **Given** I pick **Going Cold**, **Then** I see open-stage leads (NEW…NEGOTIATION) whose last contact (or creation, if none) is 3 or more days ago, oldest first.

---

### User Story 4 — Filter, search, sort (Priority: P1)

As a user, I want to narrow and reorder the list.

**Why this priority**: Needed to find a specific lead among hundreds.

**Independent Test**: Apply each filter, search and sort option and verify results and the URL.

**Acceptance Scenarios**:

1. **Given** I set Stage = QUALIFIED and Source = FACEBOOK, **Then** only matching leads show, the URL updates (`?stage=QUALIFIED&source=FACEBOOK`), and the filter survives a reload.
2. **Given** I type "conti" in search, **Then** after a 250 ms pause the list shows leads whose customer name, email, phone digits, or reference matches (case- and accent-insensitive).
3. **Given** I choose sort "Newest", **Then** ordering is newest-created first and the default ranking is no longer applied.
4. **Given** I'm a manager, **Then** I can filter by Owner (my reps, plus "Unassigned"). **Given** I'm a rep, **Then** the owner filter isn't shown.
5. **Given** I click **Clear filters**, **Then** all filters reset but the tab stays.

---

### User Story 5 — Scope enforcement (Priority: P1)

As the business, I need nobody to see a lead outside their visibility, even by manipulating filters.

**Why this priority**: Security requirement (constitution IV); a leak here is a critical defect.

**Independent Test**: Run the role × view matrix and assert every returned lead is in scope.

**Acceptance Scenarios**:

1. **Given** Sofia (Team South) requests the list with an owner filter set to a DACH rep (Anna Weber), **Then** the response contains **no** DACH leads. Out-of-scope filter values are silently intersected with the scope, and there's no error that reveals whether they exist.
2. **Given** VP Isabelle, **When** she opens **All**, **Then** she sees leads from all three teams.

---

### User Story 6 — Stat chips (Priority: P2)

As a user, I want at-a-glance urgency counts above the tabs.

**Why this priority**: Helpful shortcut; not required for R1.

**Independent Test**: Verify chip counts against tab counts and click behaviour.

**Acceptance Scenarios**:

1. **Given** I'm on the inbox, **Then** above the tabs I see chips **Due today · Overdue · New (untouched) · Going cold**. Each count is limited to my default scope, and clicking one applies the matching tab or filter.

---

### User Story 7 — Live-ready rows (Priority: P2)

As a future live-updates feature (F12), I need a stable contract to plug into.

**Why this priority**: Enables F12 without restructuring, but has no user-visible effect on its own.

**Independent Test**: Confirm the inbox works fully with manual refresh, and that the documented extension point exists and returns an empty highlight set.

**Acceptance Scenarios**:

1. **Given** live updates aren't built yet, **Then** the inbox works fully with manual refresh.
2. **Given** live updates are built, **When** a lead-created event arrives for my scope, **Then** the list refetches and the new row highlights. This feature provides the cache-key contract and a highlight extension point that returns nothing until then.

---

### Edge Cases

- A lead with no customer email or phone still renders; the name is always present.
- A lead with no activity shows "No activity yet" in italics, and last-activity sorting treats it as the oldest.
- A page past the end clamps to the last page, and the response echoes the effective page.
- Invalid query parameters (unknown values, bad dates) are rejected by the API with a validation error naming the fields. The page ignores bad parameters and shows defaults.
- A rep with no leads gets an empty state pointing to the Unassigned tab; a manager with an empty unassigned pool sees "All caught up".
- Search with fewer than 2 characters is ignored (no request).
- Very long names or notes are truncated with an ellipsis, and the full text is available on hover.
- The client's timezone drives the Due Today boundary; an invalid timezone falls back to Europe/Berlin.
- A lead reassigned away while on screen disappears on the next fetch, and opening it shows the not-found state.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST list leads visible to the current user: a REP sees own leads plus own team's unassigned pool, a MANAGER sees their team, a VP sees the whole organisation.
- **FR-002**: The system MUST support views `mine`, `unassigned`, `due_today`, `going_cold`, `team` (MANAGER, VP) and `all` (alias of `team` for VP). The default view is `mine` for REP and `team` for MANAGER and VP.
- **FR-003**: Default ranking (`sort=rank`) MUST be: (1) has an overdue pending follow-up, (2) response-target breach, (3) score high to low, (4) newest created, (5) id descending as a stable tiebreak.
- **FR-004**: Response-target (SLA) breach MUST be computed at query time: stage = NEW, no **contact activity** (a user-logged activity that is not a note), and age > 15 min for HOT, > 2 h otherwise.
- **FR-005**: Other sorts MUST be supported: `newest`, `oldest_untouched` (NEW leads with no contact activity, oldest first), `next_follow_up` (earliest pending due first, none last), `score`, and `last_activity` (oldest first, never-touched first).
- **FR-006**: Filters MUST be supported and combinable (AND across filters, OR within a multi-value filter): `stage[]`, `source[]`, `priority[]`, `owner[]` (user ids or `unassigned`; MANAGER and VP only), `team[]` (VP only), `returning`, `overdue`, `sla` (`breached`), `sourceGroup` (one of WEBSITE, SOCIAL, PAID_SEARCH, PORTALS, OFFLINE, REFERRAL; expands to the member sources, used by F16 drill-downs), `createdFrom` / `createdTo` (inclusive dates), `q` (search).
- **FR-007**: Search MUST be case- and accent-insensitive ("emile" matches "Émile"), matching customer first/last name, "first last", email and phone digits (4+ digits for phone). Lead reference is matched by prefix. Minimum 2 characters.
- **FR-008**: Pagination MUST be server-side, with `page` (1-based) and `pageSize` (default 25, allowed 10/25/50) and `total` returned.
- **FR-009**: The response MUST include tab counts for the user's scope (`mine`, `unassigned`, `dueToday`, `overdue`, `newUntouched`, `goingCold`), computed efficiently (one extra aggregate).
- **FR-010**: Filter, sort, page and tab state MUST live in the URL query string, so views can be shared and survive a reload.
- **FR-011**: Closed (WON/LOST) and COLD leads MUST be excluded from `mine`, `team` and `all` by default, and shown when the stage filter explicitly includes them. A "Show closed" toggle adds WON and LOST.
- **FR-012**: Rows MUST be keyboard navigable (↑/↓ moves focus, Enter opens, `/` focuses search).
- **FR-013**: The page MUST render its first page on the server for a fast first paint, then continue with client-side fetching keyed by the normalized parameters.
- **FR-014**: Out-of-scope filter values MUST be intersected with the scope and never produce a forbidden error, so they reveal nothing.
- **FR-015**: Unauthenticated requests MUST get 401 (API) or a redirect to login with a return path to the inbox (page).

### Key Entities

- **Lead**: the unit listed; carries stage, source, priority, score, owner, team, timestamps.
- **Customer**: name, city, country, returning flag, normalized search text.
- **Owner (user)**: name and avatar colour shown per row; used for the owner filter.
- **Follow-up**: earliest pending due time drives the Next cell, Due Today and overdue ranking.
- **Activity**: latest user activity gives the row summary; contact-activity presence drives response-target breach.

The inbox is read-only and writes nothing.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: With ~800 seeded leads, the list request completes in under 300 ms (95th percentile) for any view, filter or sort combination.
- **SC-002**: A rep can go from login to opening their most urgent lead in 2 clicks or fewer.
- **SC-003**: 0 out-of-scope leads are returned across the full role × view test matrix.
- **SC-004**: The ranking fixture (overdue, response-target breach, score ties) returns the exact expected order.
- **SC-005**: Every visible lead is reachable via pagination; the sum of page sizes equals the total.

## Assumptions

- Authentication (F02) and scope/policy (F03) are available; the inbox consumes them and does not re-implement them.
- Seed data and score/priority fields are populated by F01/F09/F10.
- Claim/assign buttons, bulk select (F11), live push and toasts (F12), Kanban (F07), saved views, column customization and CSV export are out of scope.
- Managers who also own leads see My Leads only when they own at least one lead.
- Below 1024 px the table collapses to two-line cards; currency is not shown in the inbox.
- Loading shows skeleton rows and keeps previous data during refetch; errors show an inline banner with Retry.
