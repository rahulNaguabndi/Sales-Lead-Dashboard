# F19 — Audit Log & Traceability UI

| Field | Value |
|---|---|
| **ID** | F19 |
| **Priority** | P2 |
| **Build wave** | 4 |
| **Depends on** | F03 (scope/policy); the audit **writer** (`audit.record`) and the `audit_log` table come from F01; audit entries are produced by F02, F06, F07, F08, F10, F11, F15 |
| **Blocks** | — |
| **Personas** | MANAGER (team), VP (org) |
| **Challenge req.** | — (supports the "traceability" ask) |
| **Owns (files/areas)** | `apps/web/server/services/audit.ts` (query side; the writer function stays in F01's `server/db`), `apps/web/app/(app)/audit/**`, `apps/web/app/api/audit/**`, `apps/web/components/audit/**` |

## 1. Summary
Every state-changing action (login, lead creation, stage change, assignment, activity, follow-up, offer and settings change) is recorded in an append-only audit log with the actor, timestamp and before/after values. This feature defines the **writer contract** that all features must follow, and the **Audit UI** where managers (their team) and the VP (the org) can search, filter and inspect exact before/after diffs. The lead timeline (F05) remains the user-facing story, and the audit log is the complete, tamper-evident record.

## 2. User Stories & Acceptance Scenarios

### US-1 (P1): Investigate what happened to a lead
*As a manager, I want to see every change made to a lead, by whom and when, so that I can resolve disputes (for example "who reassigned my lead?").*

**Independent test:** Reassign a lead, change its stage and log an activity. Open `/audit?entity=lead&entityId=<id>` and see 3 entries with correct actors and diffs.

1. **Given** a lead was reassigned from Anna Weber to Jonas Fischer by Lukas, **When** Lukas opens the lead's audit trail, **Then** he sees an entry `lead.assigned` · actor Lukas Becker · time · a diff `owner: Anna Weber → Jonas Fischer`, `method: MANUAL`.
2. **Given** a lead detail page, **When** a manager clicks "Audit trail" (a link visible to MANAGER/VP only), **Then** `/audit` opens pre-filtered to that lead.

### US-2 (P1): Search and filter the log
*As the VP, I want to filter the audit log by date, actor, action and entity so that I can review activity across the org.*

1. **Given** the VP opens `/audit`, **When** she filters Action = `offer.*` and the last 30 days, **Then** only offer create/update/deactivate entries are listed, newest first, 50 per page, with "Load more" (cursor pagination).
2. **Given** a search on lead reference `EDM-2026-00812`, **When** submitted, **Then** all entries for that lead appear.

### US-3 (P1): Inspect a diff
1. **Given** an entry with before/after JSON, **When** the row is expanded, **Then** a side-by-side diff shows only changed keys, with human labels (Stage, Owner, Score…), formatted values (EUR, dates, user names resolved), and unchanged keys collapsed.
2. **Given** a `lead.created` entry (no before), **When** expanded, **Then** it shows the created values only.

### US-4 (P1): Scope enforcement
1. **Given** Lukas (Team DACH), **When** he opens `/audit`, **Then** he sees only entries about leads in Team DACH, actions by users in his subtree, and his team's settings, never Team West's.
2. **Given** a REP navigates to `/audit`, **When** the page loads, **Then** they're redirected with 403, and the nav item is hidden.

### US-5 (P2): Security events
1. **Given** failed login attempts, **When** the VP filters Action = `auth.login_failed`, **Then** the entries show the time, IP, and a hashed email identifier (no password, no plaintext email).

## 3. Functional Requirements

**Writer contract (normative for all features; the implementation is provided by F01)**
- **FR-001**: Every mutation MUST call `audit.record(entry, tx)` **inside the same DB transaction** as the change, so that no change exists without its audit entry and vice versa.
- **FR-002**: `entry = { actorId: string|null, action: AuditAction, entity: AuditEntity, entityId: string, before: object|null, after: object|null, ip?: string, meta?: object }`. `actorId` is null for system/intake/jobs, and `meta.actorType` is `"SYSTEM" | "INTAKE" | "JOB"`.
- **FR-003**: `before`/`after` MUST contain **only the changed fields** (plus `id`), except for create (full `after`) and delete/deactivate (full `before`).
- **FR-004**: The writer MUST strip secret fields (`password_hash`, `token_version`, API keys, JWTs) and MUST NOT store full activity note text. It stores `{noteLength, type, outcome}` instead, because the note lives in `activities`.
- **FR-005**: The audit log MUST be append-only. There's no update or delete API, the service layer exposes read functions only, and F01's DB triggers reject any UPDATE/DELETE.

**Audited actions (the `AuditAction` enum in `packages/shared`, append-only)**
| Action | Producer | before → after |
|---|---|---|
| `auth.login`, `auth.logout` | F02 | meta: ip, userAgent |
| `auth.login_failed` | F02 | meta: ip, `emailHash` (sha256 of the lowercased email) |
| `lead.created` | F10 | after: full lead summary (reference, source, team, owner, score) |
| `lead.updated` | F06/F09/others | changed fields (score, priority, vehicle, budget …) |
| `lead.stage_changed` | F07 | stage, lost_reason, deal_value |
| `lead.assigned` / `lead.claimed` | F10/F11 | owner_id (+ meta.method AUTO/MANUAL/CLAIM, strategy) |
| `lead.reopened` | F07 | stage |
| `lead.auto_cold` | F08 | stage (actor null, JOB) |
| `activity.created` | F06 | after: {activityId, type, outcome, noteLength, aiAssisted} |
| `followup.created` / `followup.completed` / `followup.missed` | F08 | status, due_at |
| `offer.created` / `offer.updated` / `offer.deactivated` | F15 | changed offer fields |
| `team.settings_updated` | F11 | auto_assign, assign_strategy |

**Query & UI**
- **FR-006**: `GET /api/audit` MUST support filters: `from`, `to`, `actorId`, `action` (exact or prefix `lead.*`), `entity`, `entityId`, `leadRef`, and cursor pagination (`cursor`, `limit` ≤ 100, default 50), ordered by `created_at DESC, id DESC`.
- **FR-007 (scope)**: MANAGER sees entries where (a) the entity is a lead whose `team_id` is their team, or (b) the actor is in their subtree, or (c) the entity is their team's settings. VP sees all. REP gets 403. Offer entries are visible to VP only.
- **FR-008**: The UI MUST show columns Time (relative + absolute tooltip), Actor (name + role, or "System"/"Website intake"), Action (human label), Entity (link to the lead detail or offer), Summary (one-line diff, for example "Stage: CONTACTED → QUALIFIED").
- **FR-009**: Expanding a row MUST show the before/after diff with resolved labels (user IDs → names, stage enums → labels, cents → EUR, timestamps → local dates).
- **FR-010**: The lead detail page MUST show an "Audit trail" link for MANAGER/VP that opens `/audit?entity=lead&entityId=…` (F05 slot, append-only).
- **FR-011**: Filters MUST be URL-driven (shareable links).

## 4. Key Entities & Data
`audit_log (id, actor_id, action, entity, entity_id, before json, after json, meta json, ip, created_at)` from `03-domain-model.md` (F01 schema). Joins `users` (actor names), `leads` (team scope, reference). Indexes used: `audit_log(entity, entity_id)` and `audit_log(created_at)` (paginated feed), both created by F01. F01 also installs SQLite triggers that reject UPDATE/DELETE on `audit_log` (and `activities`), so append-only is enforced at the DB level.

## 5. Edge Cases & Error Handling
- **An entity the viewer can no longer see** (a lead moved to another team): scope is evaluated on the lead's *current* team, plus entries the viewer themselves authored. Documented.
- **A deleted/deactivated user as actor:** still resolves the name (users are deactivated, never deleted).
- **High-volume simulator runs:** cursor pagination keeps queries O(limit). No offset scans.
- **Malformed legacy JSON in before/after:** the UI shows the raw JSON fallback rather than crashing.
- **Clock skew:** entries are ordered by `(created_at, id)` using ULIDs, so the order is stable.
- **Large diffs** (a long offer description): truncated at 500 chars with "Show more".

## 6. Success Criteria
- **SC-001**: 100 % of mutation endpoints produce exactly one audit entry per state change in the same transaction (an integration test per endpoint, plus a rollback test showing no orphan entries).
- **SC-002**: A manager finds "who changed this lead's owner" in ≤ 2 clicks from the lead detail page.
- **SC-003**: The audit feed query is < 150 ms p95 for 50 rows with 20k audit entries.
- **SC-004**: RBAC tests: a REP gets 403. A MANAGER can't see another team's lead entries or offer entries.
- **SC-005**: No secrets or plaintext passwords/emails from failed logins exist in `audit_log` (test).

## 7. UX Notes
- Route `/audit`: a filter row (date range, Actor combobox, Action multi-select grouped by domain, Entity type, lead reference search) → a dense table (40px rows) → an expandable row diff panel.
- Diff panel: two columns "Before" / "After". Changed values are highlighted with a subtle background **plus** a "changed" marker (not color alone). Added keys show "—" on the before side.
- Empty state: "No audit entries match these filters."
- Nav item "Audit" (MANAGER/VP) with a shield icon.

## 8. Decisions
| # | Decision | Alternatives | Rationale |
|---|---|---|---|
| 1 | Write the audit entry in the same transaction as the change | Async via the event bus; DB triggers | Guaranteed consistency. Simple. Triggers can't know the actor |
| 2 | Store only changed fields | Full snapshots | Smaller, and the diff is readable. Full snapshots are redundant with the entity tables |
| 3 | Don't store note text in the audit log | Copy the notes | Avoids duplicating PII. The note is immutable in append-only `activities` anyway |
| 4 | Scope by the lead's current team + authored entries | Scope at write time (a stored team_id) | No schema change. Matches the inbox visibility. Trade-off documented |
| 5 | Cursor (keyset) pagination | Offset pagination | Stable and fast on a growing append-only table |
| 6 | Hash the emails on failed logins | Store plaintext; don't log | Enables pattern detection without storing PII for non-users |

## 9. Technical Plan Input (for `/speckit.plan`)

**Endpoint**
```
GET /api/audit?from=&to=&actorId=&action=lead.*&entity=lead&entityId=&leadRef=EDM-2026-00812&cursor=&limit=50
200 {
  "items":[{
    "id":"01J…","createdAt":1759240000000,
    "actor":{"id":"u_lukas","name":"Lukas Becker","role":"MANAGER"} | {"type":"SYSTEM"|"INTAKE"|"JOB"},
    "action":"lead.assigned","entity":"lead","entityId":"01J…","entityLabel":"EDM-2026-00812 · Anna Schmidt",
    "summary":"Owner: Anna Weber → Jonas Fischer (manual)",
    "before":{"owner_id":"u_anna"},"after":{"owner_id":"u_jonas"},
    "resolved":{"owner_id":{"u_anna":"Anna Weber","u_jonas":"Jonas Fischer"}}
  }],
  "nextCursor":"MTc1OTI0MDAwMDAwMHwwMUo…" | null
}
400 INVALID_FILTER · 403 FORBIDDEN
```

**Service (`server/services/audit.ts`):** `queryAudit(ctx, filters)` builds the scope predicate: `(al.entity='lead' AND l.team_id IN (:teamIds)) OR al.actor_id IN (:scopeUserIds) OR (al.entity='team' AND al.entity_id IN (:teamIds))`, plus VP bypass, joined `LEFT JOIN leads l ON al.entity='lead' AND l.id=al.entity_id`. Keyset: `WHERE (al.created_at, al.id) < (:cAt, :cId)`. `summarize(entry)` and `resolveRefs(entries)` (batch-resolve user IDs and offer titles) are pure and unit-tested.

**Writer (F01, verified here):** `audit.record(entry, tx)` with a redaction list. F19 adds a conformance test helper `expectAudited(action, entityId)` that other features' tests can use.

**Components (`components/audit/`):** `AuditPage`, `AuditFilterBar`, `AuditTable`, `AuditRow`, `DiffPanel`, `ActorCell`. TanStack Query infinite query keyed by filters.

**Tests:** Vitest for the scope predicate (MANAGER/VP/REP), keyset pagination correctness, the redaction (no `password_hash`, no note text), `summarize` labels, and transaction rollback leaving no orphan entries. Playwright: a manager reassigns a lead → Audit trail link → the entry with the diff is visible.

## 10. Out of Scope
- Export (CSV/SIEM), retention policies and archival.
- Cryptographic tamper-evidence (hash chains).
- Auditing read access ("who viewed this lead").
- GDPR erasure handling of audit PII (future GDPR module).

## 11. Open Questions
- Resolved: `meta` is a dedicated `meta json` column on `audit_log` (in the F01 schema), with a `created_at` index and append-only triggers.
- Resolved: yes. F01 installs `BEFORE UPDATE/DELETE` triggers (`RAISE(ABORT)`) on `audit_log` and `activities` (F01 FR-015).
- Should managers see the audit entries for their own reps' logins? Default: yes (actor in subtree).

## 12. Spec Kit Prompts
**`/speckit.specify`**
> Record every change made in the sales lead tool (logins and failed logins, new leads, stage changes, assignments and claims, logged activities, follow-ups, offer changes, team assignment settings) in a permanent, unchangeable history that stores who did it (or that the system or website did it), when, and exactly what changed (before and after values). Provide an audit screen where sales managers can review changes within their own team and the VP can review everything. It can filter by date, person, type of action and lead, and each entry expands to show a clear before/after comparison with readable names, stages, amounts and dates. From a lead's page, managers can jump straight to that lead's audit history. Sales reps cannot access the audit screen. Secrets, passwords and full note text are never stored in the history, and failed logins store only a non-reversible identifier of the email used.

**`/speckit.plan`**
> The writer contract `audit.record(entry, tx)` (implemented in F01 `server/db`) is called in the same Drizzle transaction as every mutation, with only changed fields and a redaction list. `AuditAction`/`AuditEntity` enums are added append-only to `packages/shared`. Query side `server/services/audit.ts`: a scope predicate via a LEFT JOIN to leads for the team scope plus the actor subtree, keyset pagination on `(created_at, id)`, and batch reference resolution. Route handler `GET /api/audit` with Zod filters and F03 authorization (403 for REP). A Next.js page `app/(app)/audit` with a URL-driven filter bar, TanStack infinite query, and an expandable row diff panel. Contract requests to F01: a `meta json` column, a `created_at` index, and an optional append-only trigger. Tests: Vitest scope/pagination/redaction/rollback, and an `expectAudited` helper for other features, plus a Playwright reassignment-to-audit flow.
