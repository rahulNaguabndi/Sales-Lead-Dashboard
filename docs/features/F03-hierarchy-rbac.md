# F03 — Org Hierarchy, Scope & RBAC Policy

| Field | Value |
|---|---|
| **ID** | F03 |
| **Priority** | P0 |
| **Build wave** | 1 |
| **Depends on** | F01 (schema, errors). Consumes F02's `CurrentUser` type (use the shared type, so there's no runtime dependency) |
| **Blocks** | F04, F05, F06, F10, F11, F16, F19 |
| **Personas** | REP, MANAGER, VP |
| **Challenge req.** | — (guards R1–R3) |
| **Owns (files/areas)** | `apps/web/server/policy/**` (`scope.ts`, `authorize.ts`, `actions.ts`, `lead-filter.ts`, `with-authz.ts`, tests) |

## 1. Summary
F03 decides **who can see and do what**. The sales org is a tree (VP → Managers → Reps, `users.manager_id`). A user's **scope** is themselves plus all their descendants, resolved with a recursive SQL query, so a future fourth level needs no code change. On top of scope, one `authorize(user, action, resource)` function applies the permission matrix, and a SQL filter helper applies the same rules to list queries. Every feature calls these. None implement their own permission checks.

## 2. User Stories & Acceptance Scenarios

### US-1 (P1): Reps see only their own leads plus their team's pool
*As a rep, I want to see only my leads and my team's unassigned leads so that my view is focused and customer data stays need-to-know.*

**Independent test:** As Sofia Rossi, list leads and open a DACH lead by id.

1. **Given** Sofia (REP, South), **When** the inbox query runs with the scope filter, **Then** it returns only leads where `owner = Sofia` or (`owner IS NULL` and `team = South`).
2. **Given** a lead owned by Anna Weber (DACH), **When** Sofia requests it by id, **Then** the response is **404** (existence isn't revealed).

### US-2 (P1): Managers see their whole team
*As a manager, I want to see and act on every lead of my team so that I can steer the work.*

1. **Given** Lukas Becker (MANAGER, DACH), **Then** his scope is {Lukas, Anna, Jonas, Lea, Felix} and team {DACH}.
2. **When** Lukas assigns a DACH lead to Lea, **Then** it's allowed. **When** he assigns it to Sofia (South), **Then** 403 `FORBIDDEN`.

### US-3 (P1): VP sees the whole org
*As the VP, I want org-wide access so that I can oversee and intervene anywhere.*

1. **Given** Isabelle Laurent (VP), **Then** her scope contains all 16 users and all 3 teams.
2. **When** she reassigns a DACH lead to a South rep, **Then** it's allowed. The lead's team changes to South (the team follows the owner).

### US-4 (P1): One policy, enforced on the server
*As the business, I want permission rules centralized and enforced on the server so that hiding a button never counts as security.*

1. **Given** any lead-scoped endpoint, **When** called without permission, **Then** it fails consistently: 404 for reading an out-of-scope lead, 403 for a forbidden action on a visible lead.
2. **Given** the test matrix in §9, **Then** every role × action case passes.

### US-5 (P2): Deeper hierarchies work unchanged
*As the business, I want to add levels (for example a Regional Director) without code changes.*

1. **Given** a test fixture with 4 levels, **When** scope is computed for the top user, **Then** it includes all descendants.

## 3. Functional Requirements
- **FR-001**: `getScope(userId)` MUST return `Scope = { userId, role, userIds: Set<string>, teamIds: Set<string>, isOrgWide: boolean }`. `userIds` = the user plus all descendants via a recursive CTE over `users.manager_id`. `teamIds` = the distinct `team_id` of all users in `userIds`, plus the user's own team. `isOrgWide` = true when the user has no manager (root).
- **FR-002**: Scope MUST be memoized per request (React `cache`). It MUST expose a `scopeCacheKey(userId)` so F20 can cache it in Redis, invalidated when `users.manager_id`/`team_id` change.
- **FR-003**: The CTE MUST guard against cycles (depth limit 10 and `UNION`, not `UNION ALL`).
- **FR-004**: **Lead visibility rule:** a lead is visible to user U when `lead.owner_id ∈ scope.userIds` OR (`lead.owner_id IS NULL` AND `lead.team_id ∈ scope.teamIds`).
- **FR-005**: `leadScopeWhere(scope)` MUST return a Drizzle SQL condition implementing FR-004, so list and aggregate queries (F04, F16, F17, F19) filter **in SQL**. For `isOrgWide` it returns `TRUE`.
- **FR-006**: `authorize(user, action, resource?)` MUST implement the matrix in FR-008 and throw `NotFoundError` for out-of-scope lead reads, `ForbiddenError` otherwise. `can(user, action, resource?)` returns a boolean for UI hints.
- **FR-007**: Actions (`actions.ts`):
  `lead:read`, `lead:write` (log activity, change stage, schedule follow-up, edit fields), `lead:claim`, `lead:assign`, `lead:reopen` (LOST → CONTACTED), `team:read`, `team:settings`, `dashboard:personal`, `dashboard:team`, `dashboard:org`, `demographics:read`, `offer:read`, `offer:manage`, `audit:read`, `user:list` (assignee pickers).
- **FR-008**: Permission matrix:

| Action | REP | MANAGER | VP |
|---|---|---|---|
| `lead:read` | lead visible per FR-004 | visible | visible |
| `lead:write` | lead.owner = self | lead visible | lead visible |
| `lead:claim` | lead unassigned, lead.team = own team, open leads < `max_open_leads` | lead unassigned and visible | lead unassigned and visible |
| `lead:assign` | ❌ | lead visible **and** target user ∈ scope, active, role REP or self | lead visible and target active and ∈ scope |
| `lead:reopen` | ❌ | lead visible | lead visible |
| `team:read` | own team (basic info only) | teams in scope | all |
| `team:settings` | ❌ | team.manager = self | any team |
| `dashboard:personal` | ✅ | ✅ | ✅ |
| `dashboard:team` | ❌ | teams in scope | all |
| `dashboard:org` | ❌ | ❌ | ✅ |
| `demographics:read` | ❌ | teams in scope | all |
| `offer:read` | ✅ | ✅ | ✅ |
| `offer:manage` | ❌ | ❌ | ✅ |
| `audit:read` | ❌ | entities in scope | all |
| `user:list` | ❌ | users in scope | all |

- **FR-009**: `lead:write` on a closed lead (WON/LOST) MUST be denied for all roles except appending a NOTE activity (`lead:write` with `resource.activityType = 'NOTE'`). Reopening is `lead:reopen`.
- **FR-010**: Unassigning (target `null`, returning the lead to the pool) is part of `lead:assign`.
- **FR-011**: The team follows the owner. When a lead is assigned to a user of another team, the policy returns `{ allowed: true, newTeamId }`, and F11 applies it.
- **FR-012**: `withAuthz(handler, { action, loadResource? })` MUST wrap route handlers: `requireUser` → optional resource loader (for example the lead by `params.id`) → `authorize` → handler(ctx), converting AppErrors via `toErrorResponse`.
- **FR-013**: Denied attempts on mutations MUST be logged (warn level: user, action, resource id). They aren't audited, to avoid noise.
- **FR-014**: Permission checks MUST use the DB role and hierarchy (from `getCurrentUser`), never JWT claims alone.

## 4. Key Entities & Data
`users` (id, role, manager_id, team_id, is_active, max_open_leads), `teams` (id, manager_id), `leads` (owner_id, team_id, stage). The open-lead count for claim limits: `count(leads where owner_id = U and stage in OPEN_STAGES)`.

## 5. Edge Cases & Error Handling
- A user with a `manager_id` cycle (bad data) → the CTE depth limit stops recursion and logs an error.
- A deactivated rep still owns leads → they stay visible to the manager. Reassigning to the inactive user is forbidden.
- A manager with no reports → scope = self plus their team. They still see the team pool.
- A VP who also owns a lead (rare) → allowed as a normal owner.
- A lead's team changes between list and detail load → the detail re-checks and may return 404.
- Claim race → policy says allowed, but the conditional update in F11 (`WHERE owner_id IS NULL`) is the final arbiter and gives 409.
- A rep at the claim limit → 403 with code `CLAIM_LIMIT_REACHED` (the message includes the limit).

## 6. Success Criteria
- **SC-001**: 100% of the §9 test-matrix cases pass.
- **SC-002**: Scope resolution takes < 5 ms for the seeded org (16 users) and < 20 ms for a synthetic 1,000-user tree.
- **SC-003**: No lead endpoint returns data outside scope (verified by an automated sweep that tries every seeded lead id as each persona).
- **SC-004**: Zero permission logic lives outside `server/policy/**` (code review / grep check for `role ===` outside the policy folder).

## 7. UX Notes
- No UI of its own. It provides `can()` results that screens use to hide or disable actions (for example, a disabled "Assign" button with the tooltip "Only managers can assign leads").
- A 403 in the UI shows a toast with the server message. A 404 on detail shows "Lead not found or you don't have access."

## 8. Decisions
| # | Decision | Alternatives | Rationale |
|---|---|---|---|
| D1 | Adjacency list + recursive CTE | Closure table, materialized path, a fixed 3-level schema | Simple, supports N levels, fast at this size. A closure table is the scale path |
| D2 | Scope = self + descendants | Team-based only | Naturally handles VP → Managers → Reps and future levels |
| D3 | 404 for out-of-scope reads | 403 | Doesn't reveal that a lead exists |
| D4 | SQL filter helper plus an object-level `authorize` | Filter after fetching | Correct pagination and counts, efficient |
| D5 | The team follows the owner on cross-team assignment | The lead keeps its original team | Keeps the pool and visibility rules consistent |
| D6 | Policy as code (a TS matrix) | A policy engine (Casbin, OPA) | Small rule set. Explainable and type-checked |

## 9. Technical Plan Input (for `/speckit.plan`)

**Scope query**
```sql
WITH RECURSIVE sub(id, depth) AS (
  SELECT id, 0 FROM users WHERE id = :userId
  UNION
  SELECT u.id, sub.depth + 1 FROM users u JOIN sub ON u.manager_id = sub.id WHERE sub.depth < 10
)
SELECT u.id, u.team_id FROM users u JOIN sub ON sub.id = u.id;
```

**API (module exports)**
```ts
export type Action = 'lead:read' | 'lead:write' | 'lead:claim' | 'lead:assign' | 'lead:reopen' | 'team:read'
  | 'team:settings' | 'dashboard:personal' | 'dashboard:team' | 'dashboard:org' | 'demographics:read'
  | 'offer:read' | 'offer:manage' | 'audit:read' | 'user:list';
export type Resource =
  | { kind: 'lead'; lead: { id: string; ownerId: string | null; teamId: string; stage: Stage }; activityType?: string;
      targetUser?: { id: string; teamId: string | null; role: Role; isActive: boolean }; openLeadCount?: number }
  | { kind: 'team'; team: { id: string; managerId: string | null } }
  | { kind: 'none' };
export function getScope(userId: string): Promise<Scope>;
export function leadScopeWhere(scope: Scope): SQL;
export function authorize(user: CurrentUser, action: Action, resource?: Resource): Promise<AuthzResult>; // throws
export function can(user: CurrentUser, action: Action, resource?: Resource): Promise<boolean>;
export function withAuthz<P>(handler: (ctx: { user: CurrentUser; scope: Scope; resource?: Resource; req: Request; params: P }) => Promise<Response>,
  opts: { action: Action; loadResource?: (params: P, user: CurrentUser) => Promise<Resource> }): RouteHandler<P>;
```

**Test matrix** (Vitest, seeded fixture: VP Isabelle; MGR Lukas (DACH), Marco (South); REP Anna (DACH), Sofia (South). Leads: L1 owned by Anna, L2 owned by Sofia, L3 unassigned DACH, L4 unassigned South, L5 WON owned by Anna)

| # | Actor | Action | Resource | Expected |
|---|---|---|---|---|
| 1 | Anna | lead:read | L1 | ✅ |
| 2 | Anna | lead:read | L2 | ❌ 404 |
| 3 | Anna | lead:read | L3 | ✅ (team pool) |
| 4 | Anna | lead:read | L4 | ❌ 404 |
| 5 | Anna | lead:write | L1 | ✅ |
| 6 | Anna | lead:write | L3 | ❌ 403 (not owner) |
| 7 | Anna | lead:write (CALL) | L5 | ❌ 403 (closed) |
| 8 | Anna | lead:write (NOTE) | L5 | ✅ |
| 9 | Anna | lead:claim | L3 (open count 10) | ✅ |
| 10 | Anna | lead:claim | L3 (open count 25) | ❌ 403 CLAIM_LIMIT_REACHED |
| 11 | Anna | lead:claim | L4 | ❌ 404 |
| 12 | Anna | lead:assign | L1 → Jonas | ❌ 403 |
| 13 | Anna | lead:reopen | L5 | ❌ 403 |
| 14 | Anna | dashboard:team | — | ❌ 403 |
| 15 | Anna | offer:manage | — | ❌ 403 |
| 16 | Lukas | lead:read | L1, L3 | ✅ |
| 17 | Lukas | lead:read | L2 | ❌ 404 |
| 18 | Lukas | lead:write | L1 | ✅ |
| 19 | Lukas | lead:assign | L3 → Lea | ✅ |
| 20 | Lukas | lead:assign | L1 → Sofia | ❌ 403 (target out of scope) |
| 21 | Lukas | lead:assign | L1 → inactive rep | ❌ 403 |
| 22 | Lukas | lead:assign | L1 → null (to pool) | ✅ |
| 23 | Lukas | lead:reopen | L5 | ✅ |
| 24 | Lukas | team:settings | DACH | ✅ |
| 25 | Lukas | team:settings | South | ❌ 403 |
| 26 | Lukas | dashboard:team | — | ✅ |
| 27 | Lukas | dashboard:org | — | ❌ 403 |
| 28 | Lukas | audit:read | — | ✅ (scoped) |
| 29 | Isabelle | lead:read | L1, L2, L3, L4 | ✅ |
| 30 | Isabelle | lead:assign | L1 → Sofia | ✅ newTeamId = South |
| 31 | Isabelle | team:settings | South | ✅ |
| 32 | Isabelle | dashboard:org | — | ✅ |
| 33 | Isabelle | offer:manage | — | ✅ |
| 34 | Marco | lead:read | L1 | ❌ 404 |
| 35 | Sofia | offer:read | — | ✅ |
| 36 | 4-level fixture top user | getScope | — | all descendants |

Also: a `leadScopeWhere` test returns exactly the ids visible per rows 1–4, 16–17, and 29 for list queries. A cycle fixture terminates.

## 10. Out of Scope
- User and team management UI (creating users, changing managers).
- Field-level permissions (for example hiding phone numbers from certain roles).
- Claim and assign **execution** (F11). F03 only decides.

## 11. Open Questions
- ~~Should managers be able to assign to reps in a *peer* team?~~ **Resolved: no.** Only the VP (or anyone higher) can move leads across teams (enforced and tested).

## 11a. Implementation Notes (as built)
- `authorize`/`can` accept an optional 4th argument `{ scope?, database? }` for tests and callers already holding the scope. `withAuthz` accepts an optional `resolveUser` (defaults to `getCurrentUser`, 401 when null) until F02's `requireUser` lands.
- Claim-limit denial throws `ClaimLimitReachedError` (403, code `CLAIM_LIMIT_REACHED`), exported from the policy barrel.
- `Resource.targetUser: null` means unassign; `undefined` on `lead:assign` is denied.
- `lead:assign` by a MANAGER is limited to REP targets or themselves.

## 12. Spec Kit Prompts
**`/speckit.specify`**
> The sales organization is a hierarchy: a VP over regional managers, and managers over sales reps. It must support more levels later without rework. Everyone sees their own work plus the work of everyone below them. Reps see their own leads and their team's unassigned leads. Managers see and act on everything in their team. The VP sees the whole organization. Reps can claim unassigned team leads up to a personal limit of open leads. Managers can assign, reassign or unassign leads within their team, and only people higher up can move leads between teams. Closed leads only accept notes. Reopening lost leads, team settings, team and org dashboards, demographics, audit views and offer management are restricted by role as listed in the permission matrix. Asking for a lead outside your visibility must look the same as asking for one that doesn't exist. All of these rules are enforced centrally on the server and can be verified with an exhaustive role-by-action test table.

**`/speckit.plan`**
> TypeScript module in `apps/web/server/policy/`: a `getScope` recursive CTE over `users.manager_id` (UNION, depth ≤ 10) memoized with React `cache`; `leadScopeWhere(scope)` returns a Drizzle SQL condition (owner in scope OR unassigned in scope teams); `authorize/can` implement the action matrix in F03 FR-008, throwing F01's NotFoundError/ForbiddenError; a `withAuthz` route-handler wrapper uses F02's `requireUser`. The team follows the owner on cross-team assignment. Vitest tests implement the 36-row matrix in F03 §9 plus a 4-level fixture, a cycle fixture, and a performance test on a synthetic 1,000-user tree. No UI. Only touch `server/policy/**`.
