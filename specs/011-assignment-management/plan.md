# Implementation Plan: Claim, Manual Assign & Auto-assign Settings (F11)

**Branch**: `011-assignment-management` | **Date**: 2026-09-30 | **Spec**: [spec.md](spec.md)

## Summary

`assignmentService` in `apps/web/server/services/assignment.ts` with a pure `pickRep` (LOAD_BALANCED / LANGUAGE_MATCH / ROUND_ROBIN) shared with F10 intake. Claims use one conditional Drizzle UPDATE (`WHERE owner_id IS NULL AND team_id IN (...)`) plus an open-lead count check inside a single SQLite transaction. Manual and bulk assign are authorized via F03 `authorize(user,'lead:assign', lead, {targetUser})`. Every ownership change writes an ASSIGNED/CLAIMED activity, an `audit_log` row, moves PENDING follow-ups (F08 `reassignPending`, stubbed until it merges), and publishes `lead.assigned` on the event bus after commit. Auto-assign is serialized per team by `lock:assign:<teamId>` (Redis `SET NX PX 5000`) with an in-process mutex fallback. `/team/settings` uses shadcn Switch/RadioGroup with `PATCH /api/teams/:id/settings`.

## Technical Context

**Language/Version**: TypeScript strict, Node ≥ 20
**Primary Dependencies**: Next.js App Router, Drizzle ORM + better-sqlite3, ioredis (via F01 `server/redis`), Zod (`packages/shared`), TanStack Query, shadcn/ui (Switch, RadioGroup, Command, Popover already in F01 `components/ui`; add missing ones via the shadcn generator, append-only)
**New dependencies**: none. (Any missing shadcn primitive is generated into `components/ui`, which is append-only.)
**Storage**: SQLite (schema owned by F01, unchanged). Uses `leads`, `users`, `teams`, `follow_ups`, `activities`, `audit_log`
**Testing**: Vitest (pure `pickRep`, service concurrency, RBAC, bulk atomicity), Playwright (claim flow)
**Target Platform**: web, Node runtime
**Constraints**: works with Redis stopped (in-process mutex, in-proc event bus) and no `ANTHROPIC_API_KEY` (not used)
**Scale/Scope**: 3 teams, tens of reps, bulk ≤ 100

## Constitution Check

| Principle | Status |
|---|---|
| I Spec is source of truth | Pass. This plan follows F11 doc §9; deviations get amended in the doc |
| II Mandatory requirements first | Pass. F11 is P1 and doesn't disturb R1–R3 |
| III Layered architecture | Pass. route → Zod → authorize → service → repository; the service imports nothing from `app/` |
| IV Security by default | Pass. Every lead-scoped endpoint calls `authorize`; the claim's team filter is enforced in SQL; RBAC tests included |
| V Test-first for logic | Pass. `pickRep` tests precede the implementation |
| VI Data integrity & traceability | Pass. One transaction per change; the activity and audit row are mandatory; `version` bumped |
| VII Graceful degradation | Pass. Lock falls back to a mutex; the bus falls back in-process |
| VIII Simplicity | Pass. One service, no new deps |
| IX Performance | Pass. The claim is one indexed UPDATE + one COUNT |
| X UX consistency | Pass. shadcn components, toasts, keyboard `C` |

## Project Structure

### Documentation
```text
specs/011-assignment-management/
├── spec.md · plan.md · research.md · data-model.md · quickstart.md
├── contracts/api.md
├── assumptions.md · tasks.md · checklists/requirements.md
```

### Source (owned paths only)
```text
apps/web/
├── server/services/assignment.ts            # claim, assign, bulkAssign, autoAssign, pickRep, rebalancePool, listAssignees, getTeamSettings, updateTeamSettings
├── server/services/assignment.pick-rep.ts   # pure pickRep (re-exported by assignment.ts)
├── app/api/leads/[id]/claim/route.ts
├── app/api/leads/[id]/assign/route.ts
├── app/api/leads/assign/route.ts            # bulk
├── app/api/teams/settings/route.ts          # GET all visible teams' settings
├── app/api/teams/[id]/settings/route.ts     # PATCH
├── app/api/teams/[id]/assignees/route.ts    # GET picker data
├── app/api/teams/[id]/rebalance/route.ts    # POST US-6
├── app/(app)/team/settings/{page.tsx,TeamSettingsCard.tsx}
├── components/leads/assign/{ClaimButton,AssignCombobox,BulkActionBar}.tsx
└── tests/{unit/assignment/*.test.ts, e2e/claim.spec.ts}
packages/shared/src/schemas/assignment.ts    # new file: append-only Zod schemas and the `lead.assigned` payload type
```
Nav entry "Team settings" (manager/VP only) and the inbox integration points (Claim button in the Unassigned row, bulk bar in Team Inbox) are **append-only** registrations in F01/F04 shared files.

**Structure Decision**: routes under `app/api/teams/**` beyond the listed `[id]/settings` are treated as part of F11's `teams` API area (no other feature owns them); logged in assumptions.

## Design Decisions

1. **Claim** (FR-001/002): inside `db.transaction` (better-sqlite3 is synchronous, so the transaction is serialized): count open leads (stages NEW, CONTACTED, QUALIFIED, TEST_DRIVE, NEGOTIATION) `< users.max_open_leads`, else `CLAIM_LIMIT` 422; run the conditional UPDATE; 0 changes → read the current owner and throw `ALREADY_ASSIGNED` 409 with `ownerName`. Then write activity, audit row and `last_assigned_at`. Publish `lead.assigned` after commit.
2. **Shared `applyOwnershipChange(tx, …)`** helper: updates owner/team/assigned_at/version, inserts the activity (metadata `{from,to,method,reason?,fromTeam?,toTeam?}`), calls `followups.reassignPending(tx, leadId, toUserId)` (stub interface, no-op until F08), writes the audit row via F01 `server/db/audit.ts`, updates `users.last_assigned_at`. Used by claim, assign, bulk, auto-assign.
3. **Assign** (FR-003): optimistic `version` check → 409 `VERSION_CONFLICT`; same owner → no-op 200; target must be active REP/MANAGER (`TARGET_INACTIVE` 422); a VP cross-team assign also sets `team_id` from the target. `toUserId:null` = return to pool (manager+).
4. **Bulk** (FR-006): validate ≤ 100, load leads, authorize all first (collect offending IDs → 403 `FORBIDDEN` with `leadIds`), then apply all in one transaction.
5. **autoAssign** (FR-008/010): acquire the lock (`lock:assign:<teamId>`, PX 5000; on Redis error or no Redis, an in-process per-team promise-chain mutex), load active reps with open counts, call the pure `pickRep(strategy, reps, customer)` → `{repId, reason} | null`; the round-robin cursor is updated in the same transaction. Reps at/above limit are filtered out inside `pickRep`. `null` → the lead stays in the pool.
6. **pickRep** is pure: input `{id,name,languages,openLeads,maxOpenLeads,lastAssignedAt}[]` plus `rrCursor`. Round-robin orders by name and takes the first name greater than the cursor's name (the cursor stores the last rep id; if it is missing, compare against its remembered name via a lookup with a fallback to the start).
7. **Settings** (FR-007/011): `PATCH` validates with Zod, requires `team:configure` for that team, updates `teams` and the reps' `is_active`/`max_open_leads` in one transaction, and writes audit rows (`team.settings`, `user.update`). Deactivation returns `openLeads` so the UI can offer the bulk "return to pool".
8. **Rebalance** (FR-013): takes the lock, loops the unassigned leads (≤ 100, oldest first) through `autoAssign` logic, reports the count.
9. **UI**: `ClaimButton` (key `C` handled by the inbox row focus; the component exposes an `onClaimed` callback and TanStack mutation), `AssignCombobox` (shadcn Command in a Popover, query key `['assignees', teamId, leadId]`), `BulkActionBar` (sticky, selection from F04 multi-select). Errors map to toasts per the spec.
10. **Events**: `lead.assigned` (add to the shared event union, append-only) and `activity.created`. Cache invalidation for `scope`/`dash` tags is a call into the F01 cache interface (no-op until F20).

## Complexity Tracking

None.
