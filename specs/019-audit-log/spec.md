# Feature Specification: F19 — Audit Log & Traceability UI

**Feature Branch**: `019-audit-log`

**Created**: 2026-09-30

**Status**: Draft

**Input**: User description: "F19 Audit Log & Traceability UI. The authoritative source is docs/features/F19-audit-log.md."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Investigate what happened to a lead (Priority: P1)

As a manager, I want to see every change made to a lead, by whom and when, so that I can resolve disputes (for example "who reassigned my lead?").

**Why this priority**: Traceability is the core purpose of the feature. Without it, disputes about lead ownership and changes cannot be settled.

**Independent Test**: Reassign a lead, change its stage and log an activity. Open the audit screen filtered to that lead and see 3 entries with correct actors and diffs.

**Acceptance Scenarios**:

1. **Given** a lead was reassigned from Anna Weber to Jonas Fischer by Lukas, **When** Lukas opens the lead's audit trail, **Then** he sees an entry `lead.assigned` · actor Lukas Becker · time · a diff `owner: Anna Weber → Jonas Fischer`, `method: MANUAL`.
2. **Given** a lead detail page, **When** a manager clicks "Audit trail" (a link visible to MANAGER/VP only), **Then** the audit screen opens pre-filtered to that lead.

---

### User Story 2 - Search and filter the log (Priority: P1)

As the VP, I want to filter the audit log by date, actor, action and entity so that I can review activity across the org.

**Why this priority**: Without filtering, the log is unusable at any realistic volume.

**Independent Test**: Seed varied audit entries, apply each filter, and confirm only matching entries are listed newest first.

**Acceptance Scenarios**:

1. **Given** the VP opens the audit screen, **When** she filters Action = `offer.*` and the last 30 days, **Then** only offer create/update/deactivate entries are listed, newest first, 50 per page, with "Load more" (cursor pagination).
2. **Given** a search on lead reference `EDM-2026-00812`, **When** submitted, **Then** all entries for that lead appear.

---

### User Story 3 - Inspect a diff (Priority: P1)

As a manager or VP, I want to expand an entry and see exactly what changed, in readable terms.

**Why this priority**: The before/after values are the evidence; raw data is not usable by sales managers.

**Independent Test**: Expand a stage-change entry and a creation entry and check the labelled, formatted output.

**Acceptance Scenarios**:

1. **Given** an entry with before/after JSON, **When** the row is expanded, **Then** a side-by-side diff shows only changed keys, with human labels (Stage, Owner, Score…), formatted values (EUR, dates, user names resolved), and unchanged keys collapsed.
2. **Given** a `lead.created` entry (no before), **When** expanded, **Then** it shows the created values only.

---

### User Story 4 - Scope enforcement (Priority: P1)

As the business, I need each viewer to see only the audit entries they are entitled to.

**Why this priority**: The log contains cross-team information. A leak is a security defect.

**Independent Test**: Sign in as a Team DACH manager and as a rep and confirm visible entries and access outcomes.

**Acceptance Scenarios**:

1. **Given** Lukas (Team DACH), **When** he opens the audit screen, **Then** he sees only entries about leads in Team DACH, actions by users in his subtree, and his team's settings, never Team West's.
2. **Given** a REP navigates to the audit screen, **When** the page loads, **Then** they're redirected with 403, and the nav item is hidden.

---

### User Story 5 - Security events (Priority: P2)

As the VP, I want to review failed login attempts without exposing personal data.

**Why this priority**: Useful for spotting suspicious patterns, but not required for the core dispute-resolution flow.

**Independent Test**: Produce failed logins, filter by `auth.login_failed`, and inspect the stored fields.

**Acceptance Scenarios**:

1. **Given** failed login attempts, **When** the VP filters Action = `auth.login_failed`, **Then** the entries show the time, IP, and a hashed email identifier (no password, no plaintext email).

---

### Edge Cases

- **An entity the viewer can no longer see** (a lead moved to another team): scope is evaluated on the lead's *current* team, plus entries the viewer themselves authored. Documented behavior.
- **A deleted/deactivated user as actor:** the name still resolves (users are deactivated, never deleted).
- **High-volume simulator runs:** paging stays fast regardless of how deep the user pages (no offset scans).
- **Malformed legacy before/after data:** the UI shows the raw data as a fallback rather than crashing.
- **Clock skew:** entries are ordered by time then by a unique, time-sortable identifier, so the order is stable.
- **Large diffs** (a long offer description): truncated at 500 characters with "Show more".
- **No matching entries:** an empty state reads "No audit entries match these filters."
- **Invalid filter values:** the request is rejected with a clear error, not silently ignored.

## Requirements *(mandatory)*

### Functional Requirements

**Writer contract (normative for all features; the implementation is provided by F01)**

- **FR-001**: Every mutation MUST record its audit entry **within the same atomic transaction** as the change, so that no change exists without its audit entry and vice versa.
- **FR-002**: An audit entry MUST carry: actor (or none for system/intake/jobs), action, entity type, entity id, before values (or none), after values (or none), optional source IP, and optional metadata. For non-user actors, metadata MUST identify the actor type as `SYSTEM`, `INTAKE` or `JOB`.
- **FR-003**: Before/after values MUST contain **only the changed fields** (plus `id`), except for create (full `after`) and delete/deactivate (full `before`).
- **FR-004**: The writer MUST strip secret fields (password hashes, token versions, API keys, JWTs) and MUST NOT store full activity note text. It stores note length, type and outcome instead, because the note lives with the activity.
- **FR-005**: The audit log MUST be append-only. There is no update or delete capability, the query side exposes read operations only, and the data store rejects any update or delete attempt.

**Audited actions** (append-only list of action names)

| Action | Producer | before → after |
|---|---|---|
| `auth.login`, `auth.logout` | F02 | meta: ip, userAgent |
| `auth.login_failed` | F02 | meta: ip, `emailHash` (sha256 of the lowercased email) |
| `lead.created` | F10 | after: full lead summary (reference, source, team, owner, score) |
| `lead.updated` | F06/F09/others | changed fields (score, priority, vehicle, budget …) |
| `lead.stage_changed` | F07 | stage, lost_reason, deal_value |
| `lead.assigned` / `lead.claimed` | F10/F11 | owner_id (+ meta.method AUTO/MANUAL/CLAIM, strategy) |
| `lead.reopened` | F07 | stage |
| `lead.auto_cold` | F08 | stage (actor none, JOB) |
| `activity.created` | F06 | after: {activityId, type, outcome, noteLength, aiAssisted} |
| `followup.created` / `followup.completed` / `followup.missed` | F08 | status, due_at |
| `offer.created` / `offer.updated` / `offer.deactivated` | F15 | changed offer fields |
| `team.settings_updated` | F11 | auto_assign, assign_strategy |

**Query & UI**

- **FR-006**: The audit query MUST support filters `from`, `to`, `actorId`, `action` (exact or prefix such as `lead.*`), `entity`, `entityId`, `leadRef`, and cursor pagination (page size ≤ 100, default 50), ordered newest first with a stable tie-break.
- **FR-007 (scope)**: MANAGER sees entries where (a) the entity is a lead whose team is their team, or (b) the actor is in their subtree, or (c) the entity is their team's settings. VP sees all. REP is denied (403). Offer entries are visible to VP only.
- **FR-008**: The UI MUST show columns Time (relative + absolute on hover), Actor (name + role, or "System"/"Website intake"), Action (human label), Entity (link to the lead detail or offer), Summary (one-line diff, for example "Stage: CONTACTED → QUALIFIED").
- **FR-009**: Expanding a row MUST show the before/after diff with resolved labels (user IDs → names, stage enums → labels, cents → EUR, timestamps → local dates).
- **FR-010**: The lead detail page MUST show an "Audit trail" link for MANAGER/VP that opens the audit screen filtered to that lead.
- **FR-011**: Filters MUST be URL-driven (shareable links).

### Key Entities

- **Audit entry**: An immutable record of one state change: id (time-sortable), actor, action, entity type, entity id, before values, after values, metadata, source IP, created time. Provided by the F01 schema.
- **Actor**: A user (name, role; deactivated users still resolve) or a non-user source (System, Website intake, Job).
- **Lead / Team / Offer**: The audited entities. Lead provides team scope and reference; Team provides settings scope; Offer entries are VP-only.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of mutation endpoints produce exactly one audit entry per state change in the same transaction (verified per endpoint, plus a rollback test showing no orphan entries).
- **SC-002**: A manager finds "who changed this lead's owner" in ≤ 2 clicks from the lead detail page.
- **SC-003**: A page of 50 entries loads in under 150 ms (95th percentile) with 20,000 entries in the log.
- **SC-004**: Access tests: a REP is denied. A MANAGER can't see another team's lead entries or offer entries.
- **SC-005**: No secrets or plaintext passwords/emails from failed logins exist anywhere in the audit log (verified by test).

## Assumptions

- The audit writer and log storage (including append-only enforcement) are delivered by F01; F19 verifies the contract and provides the query side and UI.
- Scope and role decisions come from F03; the lead detail link is registered into F05's extension slot.
- Managers see audit entries for their own reps' logins (actor in subtree) — the documented default.
- Out of scope: export (CSV/SIEM), retention/archival, cryptographic tamper-evidence, auditing read access, GDPR erasure of audit PII.
- UX: the audit screen has a filter row (date range, actor, grouped multi-select action, entity type, lead reference search), a dense table, expandable diff panel with a "changed" marker in addition to color, and a nav item "Audit" for MANAGER/VP.
