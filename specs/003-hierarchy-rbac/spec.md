# Feature Specification: F03 — Org Hierarchy, Scope & RBAC Policy

**Feature Branch**: `003-hierarchy-rbac`
**Created**: 2026-09-30
**Status**: Draft
**Input**: `docs/features/F03-hierarchy-rbac.md` (authoritative source)
**Wave / Priority**: Wave 1 · P0 · Depends on F01 (schema, errors). Consumes F02's `CurrentUser` type only (no runtime dependency). Blocks F04, F05, F06, F10, F11, F16, F19.

## Summary

The sales organization is a tree (VP → Managers → Reps). This feature decides **who can see and do what**. A user's *scope* is themselves plus everyone below them, resolved so that adding another level later needs no code change. On top of scope, a single permission function applies the role-by-action matrix, and a query helper applies the same visibility rules to list and aggregate queries. Every other feature calls these; none implements its own permission checks. There is no UI.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Reps see only their own leads plus their team's pool (Priority: P1)

As a rep, I want to see only my leads and my team's unassigned leads so that my view is focused and customer data stays need-to-know.

**Why this priority**: Need-to-know visibility is the base guarantee every lead screen relies on.

**Independent Test**: As Sofia Rossi (REP, South), list leads through the scope filter and open a DACH lead by id.

**Acceptance Scenarios**:

1. **Given** Sofia (REP, South), **When** the inbox query runs with the scope filter, **Then** it returns only leads where owner = Sofia, or where the lead is unassigned and its team = South.
2. **Given** a lead owned by Anna Weber (DACH), **When** Sofia requests it by id, **Then** the response is 404, so the lead's existence is not revealed.

---

### User Story 2 - Managers see their whole team (Priority: P1)

As a manager, I want to see and act on every lead of my team so that I can steer the work.

**Why this priority**: Managers' steering actions (assign, reopen) depend on it.

**Independent Test**: As Lukas Becker (MANAGER, DACH), resolve scope and attempt two assignments.

**Acceptance Scenarios**:

1. **Given** Lukas Becker (MANAGER, DACH), **Then** his scope is {Lukas, Anna, Jonas, Lea, Felix} and his teams are {DACH}.
2. **When** Lukas assigns a DACH lead to Lea, **Then** it is allowed. **When** he assigns it to Sofia (South), **Then** it is rejected with 403 `FORBIDDEN`.

---

### User Story 3 - VP sees the whole org (Priority: P1)

As the VP, I want org-wide access so that I can oversee and intervene anywhere.

**Why this priority**: The VP is the only persona who may move leads across teams.

**Independent Test**: As Isabelle Laurent (VP), resolve scope and reassign a DACH lead to a South rep.

**Acceptance Scenarios**:

1. **Given** Isabelle Laurent (VP), **Then** her scope contains all 16 users and all 3 teams.
2. **When** she reassigns a DACH lead to a South rep, **Then** it is allowed and the decision carries the new team (South): the team follows the owner.

---

### User Story 4 - One policy, enforced on the server (Priority: P1)

As the business, I want permission rules centralized and enforced on the server so that hiding a button never counts as security.

**Why this priority**: This is the security guarantee (Constitution IV) for all later features.

**Independent Test**: Run the full role × action test matrix against the policy, and sweep every seeded lead id as each persona.

**Acceptance Scenarios**:

1. **Given** any lead-scoped endpoint, **When** it is called without permission, **Then** it fails consistently: 404 for reading an out-of-scope lead, 403 for a forbidden action on a visible lead.
2. **Given** the 36-row test matrix (see plan), **Then** every role × action case passes.

---

### User Story 5 - Deeper hierarchies work unchanged (Priority: P2)

As the business, I want to add levels (for example a Regional Director) without code changes.

**Why this priority**: Future-proofing; the seeded org only has three levels.

**Independent Test**: Build a 4-level fixture and compute scope for the top user.

**Acceptance Scenarios**:

1. **Given** a fixture with 4 levels, **When** scope is computed for the top user, **Then** it includes all descendants.

---

### Edge Cases

- A user whose manager chain contains a cycle (bad data): resolution stops at the depth limit, terminates, and an error is logged.
- A deactivated rep who still owns leads: those leads stay visible to the manager; reassigning *to* the inactive user is forbidden.
- A manager with no reports: scope = self plus their team, so they still see the team pool.
- A VP who also owns a lead: allowed as a normal owner.
- A lead's team changes between list load and detail load: the detail re-checks and may return 404.
- Claim race: the policy may say "allowed" while another user wins the claim; the conditional update in F11 is the final arbiter (409). F03 only decides.
- A rep at the claim limit: 403 with code `CLAIM_LIMIT_REACHED`; the message includes the limit.
- Write on a closed lead (WON/LOST): denied for every role except appending a NOTE.
- Write-type action (write, claim, assign, reopen) on a lead outside the actor's visibility: 404, not 403.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: `getScope(userId)` MUST return `Scope = { userId, role, userIds: Set<string>, teamIds: Set<string>, isOrgWide: boolean }`. `userIds` = the user plus all descendants via a recursive query over `users.manager_id`. `teamIds` = the distinct team of all users in `userIds`, plus the user's own team. `isOrgWide` = true when the user has no manager (root).
- **FR-002**: Scope MUST be memoized per request. It MUST expose `scopeCacheKey(userId)` so F20 can cache it in Redis, invalidated when a user's manager or team changes.
- **FR-003**: The hierarchy query MUST guard against cycles (depth limit 10 and set-union semantics, not `UNION ALL`).
- **FR-004**: **Lead visibility rule:** a lead is visible to user U when `lead.owner_id ∈ scope.userIds` OR (`lead.owner_id IS NULL` AND `lead.team_id ∈ scope.teamIds`).
- **FR-005**: `leadScopeWhere(scope)` MUST return a SQL condition implementing FR-004, so list and aggregate queries (F04, F16, F17, F19) filter in SQL. For `isOrgWide` it returns an always-true condition.
- **FR-006**: `authorize(user, action, resource?)` MUST implement the matrix in FR-008 and throw `NotFoundError` for out-of-scope lead reads, `ForbiddenError` otherwise. `can(user, action, resource?)` returns a boolean for UI hints.
- **FR-007**: Actions: `lead:read`, `lead:write` (log activity, change stage, schedule follow-up, edit fields), `lead:claim`, `lead:assign`, `lead:reopen` (LOST → CONTACTED), `team:read`, `team:settings`, `dashboard:personal`, `dashboard:team`, `dashboard:org`, `demographics:read`, `offer:read`, `offer:manage`, `audit:read`, `user:list`.
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

- **FR-009**: `lead:write` on a closed lead (WON/LOST) MUST be denied for all roles except appending a NOTE activity. Reopening is `lead:reopen`.
- **FR-010**: Unassigning (target `null`, returning the lead to the pool) is part of `lead:assign`.
- **FR-011**: The team follows the owner. When a lead is assigned to a user of another team, the decision MUST include `newTeamId`, which F11 applies.
- **FR-012**: A route-handler wrapper MUST compose: resolve current user → optional resource loader (for example the lead by route id) → `authorize` → handler, converting application errors to the standard error response.
- **FR-013**: Denied attempts on mutations MUST be logged at warn level (user, action, resource id). They are not audited, to avoid noise. The log MUST NOT contain PII.
- **FR-014**: Permission checks MUST use the database role and hierarchy (from the current-user lookup), never token claims alone.

### Key Entities

- **User**: id, role (REP/MANAGER/VP), manager, team, active flag, max open leads.
- **Team**: id, manager.
- **Lead**: owner (nullable), team, stage. Open-lead count for claim limits = leads owned by the user in an open stage.
- **Scope**: derived, per-request set of visible user ids and team ids.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of the test-matrix cases pass.
- **SC-002**: Scope resolution takes < 5 ms for the seeded org (16 users) and < 20 ms for a synthetic 1,000-user tree.
- **SC-003**: No lead endpoint returns data outside scope, verified by an automated sweep that tries every seeded lead id as each persona.
- **SC-004**: Zero permission logic lives outside the policy folder (a grep check for role comparisons outside it passes).

## Assumptions

- Out of scope: user/team management UI, field-level permissions, claim/assign *execution* (F11).
- Managers cannot assign to reps in a peer team; only the VP (or anyone higher) moves leads across teams (resolution of the open question in the source doc).
- Further inferred decisions are in `assumptions.md`.
