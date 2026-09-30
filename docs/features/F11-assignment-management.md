# F11 — Claim, Manual Assign & Auto-assign Settings

| Field | Value |
|---|---|
| **ID** | F11 |
| **Priority** | P1 |
| **Build wave** | 3 |
| **Depends on** | F04 (inbox tabs/rows, multi-select), F10 (routing + `assignmentStrategies` used by auto-assign) |
| **Blocks** | — |
| **Personas** | REP, MANAGER, VP |
| **Challenge req.** | — |
| **Owns (files/areas)** | `apps/web/server/services/assignment.ts`, `apps/web/app/(app)/team/settings/**`, `apps/web/app/api/leads/[id]/claim/route.ts`, `apps/web/app/api/leads/[id]/assign/route.ts`, `apps/web/app/api/leads/assign/route.ts` (bulk), `apps/web/app/api/teams/[id]/settings/route.ts`, `apps/web/components/leads/assign/**` |

## 1. Summary
Implements decision D4. Reps can **claim** leads from their team's unassigned pool (race-safe, capped at `max_open_leads`). Managers **assign and reassign** leads within their team, singly or in bulk, and VPs do it across teams. Managers and VPs configure per-team **auto-assign** (on/off and strategy: load-balanced, language match, round-robin). Every assignment is traceable: timeline entry, audit row and live event.

## 2. User Stories & Acceptance Scenarios

### US-1 (P1): Rep claims an unassigned lead
*As a rep with capacity, I want to grab new leads from my team's pool.*

**Independent test:** As Anna Weber, open Unassigned, claim a lead, and check that it's in My Leads and that the timeline shows "Claimed by Anna Weber".

1. **Given** a DACH lead with `owner_id = null` and I (DACH rep) have 12 open leads, **When** I click **Claim**, **Then** `owner_id = me`, `assigned_at = now`, a `CLAIMED` system activity is added, the lead leaves the Unassigned tab and appears in My Leads, and `lead.assigned {method:"CLAIM"}` is published.
2. **Given** Jonas claimed the same lead a second earlier, **When** I click Claim, **Then** I get `409 ALREADY_ASSIGNED` and the toast "Claimed by Jonas Fischer a moment ago", and the row disappears.
3. **Given** I already have 25 open leads (`max_open_leads`), **When** I click Claim, **Then** I get `422 CLAIM_LIMIT` and the toast "Claim limit reached (25 open leads)".
4. **Given** a lead in another team's pool, **Then** I can't see it, and a direct API call returns 403/404.

### US-2 (P1): Manager assigns and reassigns
*As a manager, I want to route leads to the right rep.*

1. **Given** I'm Lukas (DACH manager), **When** I open a DACH lead and choose "Assign to… → Lea Hoffmann", **Then** the owner changes, an `ASSIGNED` activity "Assigned to Lea Hoffmann by Lukas Becker" (with `metadata {from, to, method:"MANUAL", reason?}`) is added, the PENDING follow-ups move to Lea, both inboxes update live, and Lea gets a toast.
2. **Given** the assignee picker, **Then** it lists only active reps in my scope, each with an open-lead count, a languages badge and a "matches customer language" marker. It is sorted by language match, then fewest open leads.
3. Manager assignment **ignores the claim limit**, but shows a warning when the target is at or above the limit ("Lea has 26 open leads").
4. "Unassign → return to pool" sets `owner_id=null` (manager+ only).

### US-3 (P1): Bulk reassign
1. **Given** the Team Inbox filtered by owner=Felix and "Going cold", **When** I select 5 rows and choose "Assign to… Lea", **Then** all 5 are reassigned in one request (atomically, all or nothing), with 5 timeline entries and one summary toast "5 leads assigned to Lea Hoffmann".
2. Bulk is capped at 100 leads per request.

### US-4 (P1): VP assigns across teams
1. **Given** I'm Isabelle (VP), **When** I assign a DACH lead to Sofia Rossi (South), **Then** `owner_id = Sofia` **and** `team_id = South` are updated, and the activity notes "Moved from Team DACH to Team South".
2. A manager attempting a cross-team assign gets 403.

### US-5 (P1): Auto-assign settings
*As a manager, I want to control how new leads are distributed in my team.*

**Independent test:** Turn auto-assign OFF for DACH, submit a DE showroom lead, and check that it lands in Unassigned. Turn it ON with LANGUAGE_MATCH, submit again, and check that it went to a German-speaking rep with the fewest open leads.

1. **Given** `/team/settings`, **Then** I see my team with a toggle **Auto-assign ON/OFF** and a **Strategy** radio (Load balanced · Language match · Round robin), each with a one-line explanation, plus a table of reps (open leads, languages, active toggle, max open leads).
2. **When** I save, **Then** `teams.auto_assign`/`assign_strategy` update, the change is audited, and new intake uses it immediately.
3. A VP sees all 3 teams on this page. A REP gets 403 and has no nav item.
4. Deactivating a rep (`is_active=false`, manager+) excludes them from auto-assign and from the picker. Their existing leads stay put, and a hint says "Reassign Felix's 14 open leads?" with a one-click bulk action to the pool.

### US-6 (P2): Rebalance helper
1. "Rebalance pool" on the settings page runs the team's strategy over all currently unassigned leads in the team (max 100), reporting "Assigned 12 leads".

## 3. Functional Requirements
- **FR-001**: Claim MUST be an atomic conditional update: `UPDATE leads SET owner_id=?, assigned_at=?, version=version+1 WHERE id=? AND owner_id IS NULL AND team_id IN (user teams)`. If 0 rows change, it's 409.
- **FR-002**: Claim MUST check `count(open leads owned by user) < users.max_open_leads` inside the same transaction. **Open = NEW, CONTACTED, QUALIFIED, TEST_DRIVE, NEGOTIATION** (COLD doesn't count toward the limit).
- **FR-003**: Manual assign requires `authorize(user,'lead:assign', lead, {targetUser})`: MANAGER when both the lead and the target are in their scope, VP always. The target must be `is_active` and role REP or MANAGER.
- **FR-004**: Every ownership change MUST in one transaction update `owner_id`, `team_id` (if changed), `assigned_at`, `version`, insert an `ASSIGNED`/`CLAIMED` system activity, reassign PENDING follow-ups (F08 `reassignPending`), and write an `audit_log` row (`action: lead.assign`, before/after owner and team).
- **FR-005**: Publish `lead.assigned {leadId, fromOwnerId, toOwnerId, by, method: AUTO|MANUAL|CLAIM, teamId}` after commit. F12 uses it to remove the row from the old owner and add it for the new one.
- **FR-006**: Bulk assign MUST be all-or-nothing, max 100 IDs, and every lead must pass authorization or the whole request fails with a list of the offending IDs.
- **FR-007**: Team settings `PATCH` requires `team:configure` (the team's manager, or VP). Validates the strategy enum.
- **FR-008**: `assignmentService.autoAssign(teamId, lead, customer)` implements the strategies (shared with F10):
  - `LOAD_BALANCED`: active reps in the team, fewest open leads, tie → oldest `last_assigned_at`, tie → name.
  - `LANGUAGE_MATCH`: filter reps whose `languages` include `customer.language`, then load-balanced. If none match, fall back to all reps (the activity notes the fallback).
  - `ROUND_ROBIN`: the next active rep after `teams.rr_cursor` ordered by name, then update the cursor.
  - Auto-assign also skips reps at or above `max_open_leads`. If everyone is full, the lead goes to the pool.
  - Serialized per team with Redis lock `lock:assign:<teamId>` (PX 5000), with an in-process mutex fallback.
- **FR-009**: `users.last_assigned_at` is updated on every assignment to that user.
- **FR-010**: The activity message for auto-assign includes the reason: "Auto-assigned to Sofia Rossi · language match (it) · 11 open leads".

## 4. Key Entities & Data
`leads` (owner_id, team_id, assigned_at, version), `users` (is_active, languages, max_open_leads, last_assigned_at, team_id), `teams` (auto_assign, assign_strategy, rr_cursor), `follow_ups`, `activities` (ASSIGNED, CLAIMED), `audit_log`.

## 5. Edge Cases & Error Handling
- Claiming a lead that the manager is assigning at the same moment: whichever commits first wins, and the other gets 409.
- Assigning to yourself as a manager is allowed (managers can hold leads).
- Reassigning to the current owner is a no-op, returns 200 and writes nothing.
- The target rep is deactivated between the picker loading and submit: 422 `TARGET_INACTIVE`.
- The team has 0 active reps and auto-assign is ON: the lead goes to the pool and the manager gets a `lead.created` toast "No available reps; lead in pool".
- A cross-team move by the VP changes visibility: the old team's manager loses access, and F12 removes the row from their views.
- Round-robin cursor points to a deleted or deactivated user: continue from the next name alphabetically.

## 6. Success Criteria
- **SC-001**: 0 double-claims under a concurrency test (50 parallel claim requests on one lead → exactly 1 success).
- **SC-002**: Assigning a lead updates both inboxes live in < 2 s.
- **SC-003**: With LOAD_BALANCED, 40 simulated leads into a 4-rep team with equal starting loads end within ±1 lead of each other.
- **SC-004**: 100% of ownership changes have a matching timeline activity and audit row.

## 7. UX Notes
- The Unassigned tab rows have a primary **Claim** button (keyboard `C` when the row is focused).
- "Assign to…" is a combobox popover (shadcn Command) with a search box. Each option shows the avatar, name, "12 open", language flags, and a ✓ "speaks DE".
- Bulk: a sticky action bar appears when rows are selected: "5 selected · Assign to… · Return to pool · Clear".
- Settings page: a card per team. Toggle plus radio group plus a rep table with inline "Active" switches and a "Max open" number input. The Save button is disabled until something changes. Success toast: "Team DACH: auto-assign ON (Language match)".

## 8. Decisions
| # | Decision | Alternatives | Rationale |
|---|---|---|---|
| 1 | Conditional UPDATE for claims | SELECT…then UPDATE; distributed lock | Atomic in SQLite, simple, race-proof |
| 2 | Claim limit applies to reps, not to manager assignment | Hard limit everywhere | Managers need the override for emergencies. They get a warning |
| 3 | COLD leads don't count toward the limit | They count | Prevents stale leads from blocking new work |
| 4 | Strategies live in one service shared with intake | Duplicate logic | One tested implementation |
| 5 | Per-team Redis lock for auto-assign | No lock | Prevents two simultaneous intakes picking the same "least loaded" rep |
| 6 | VP cross-team move also changes team_id | Keep the original team | Ownership and visibility stay consistent |

## 9. Technical Plan Input
**Endpoints**
```json
// POST /api/leads/:id/claim            (body: {})
// 200 { "lead": { "id":"..","ownerId":"u_anna","assignedAt":1790000000000,"version":3 } }
// 409 { "error": { "code":"ALREADY_ASSIGNED", "message":"Claimed by Jonas Fischer", "ownerName":"Jonas Fischer" } }
// 422 { "error": { "code":"CLAIM_LIMIT", "message":"Claim limit reached (25 open leads)" } }

// POST /api/leads/:id/assign
{ "toUserId": "u_lea" | null, "reason": "Rebalancing", "version": 3 }
// 200 { "lead": { ... } }

// POST /api/leads/assign   (bulk)
{ "leadIds": ["..",".."], "toUserId": "u_lea" | null, "reason": "Felix on holiday" }
// 200 { "assigned": 5 }   | 403 { "error": { "code":"FORBIDDEN", "leadIds":[".."] } }

// GET /api/teams/:id/assignees?leadId=..   → [{ "id","name","openLeads","languages","languageMatch":true,"atLimit":false }]

// GET /api/teams/settings  → [{ "id","name","autoAssign":true,"assignStrategy":"LANGUAGE_MATCH","reps":[{ "id","name","isActive","maxOpenLeads","openLeads","languages" }] }]
// PATCH /api/teams/:id/settings
{ "autoAssign": true, "assignStrategy": "LOAD_BALANCED", "reps": [{ "id":"u_felix", "isActive": false, "maxOpenLeads": 30 }] }
```
**Service:** `assignmentService.{claim, assign, bulkAssign, autoAssign, pickRep(strategy, reps, customer), rebalancePool}`. `pickRep` is pure and unit-tested.
**Components:** `components/leads/assign/{ClaimButton, AssignCombobox, BulkActionBar}.tsx`, `app/(app)/team/settings/page.tsx`.
**Events:** `lead.assigned`, `activity.created`. **Cache:** invalidate `scope`/`dash` tags per F20.
**Tests:** pure `pickRep` tests for all 3 strategies plus fallback plus limit, a concurrency claim test (Promise.all against the service), RBAC tests (a manager can't cross teams, a rep can't assign), a bulk atomicity test, a Playwright claim flow.

## 10. Out of Scope
- Skill- or vehicle-based routing, and weighted capacity.
- Working hours and out-of-office calendars.
- Automatic reassignment of HOT leads untouched for 30 min (listed as P2 in the PLAN; tracked as a future F11 extension).

## 11. Open Questions
- Should managers appear as auto-assign candidates? Proposed: no, reps only.
- Should reps be able to "release" a lead back to the pool? Proposed: yes (P2), with a required reason.

## 12. Spec Kit Prompts
**`/speckit.specify`**
> Each team has a pool of unassigned leads. Salespeople can claim leads from their own team's pool, one at a time and only up to a personal limit (25 open leads by default). If two people try to claim the same lead, only the first succeeds and the other is told who got it. Managers can assign or reassign any lead within their team, one at a time or in bulk, and return leads to the pool. VPs can move leads between teams. When choosing whom to assign to, managers see each person's workload and whether they speak the customer's language. Managers configure per team whether new leads are assigned automatically and how: balancing workload, matching the customer's language, or strict rotation. They can also deactivate a salesperson or change their limit. Every assignment is recorded in the lead's timeline and the audit log, with who did it and why, and shows up immediately for everyone affected.

**`/speckit.plan`**
> `assignmentService` in `apps/web/server/services/assignment.ts` with a pure `pickRep` for LOAD_BALANCED/LANGUAGE_MATCH/ROUND_ROBIN, shared with F10 intake. Claims use a conditional Drizzle UPDATE (`WHERE owner_id IS NULL`) plus an open-lead count check in one SQLite transaction. Manual and bulk assign authorized via F03 `lead:assign`. Each change writes the ASSIGNED/CLAIMED activity plus an audit_log row, moves pending follow-ups, and publishes `lead.assigned` on the Redis bus. The per-team Redis lock `lock:assign:<teamId>` falls back to an in-process mutex. The settings page at `/team/settings` uses shadcn Switch/RadioGroup and `PATCH /api/teams/:id/settings`. Vitest covers strategies, concurrency and RBAC. Playwright covers the claim flow.
