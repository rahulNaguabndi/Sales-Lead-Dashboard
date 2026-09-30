# F03 Assumptions (self-answered clarifications)

| # | Question | Answer | Source |
|---|---|---|---|
| A1 | May managers assign to reps in a peer team? | No. Only VP/higher moves leads across teams; manager targets must be in the manager's scope. | F03 §11 recommendation |
| A2 | Out-of-scope lead for write-type actions (write/claim/assign/reopen): 404 or 403? | 404 (an unreadable lead is indistinguishable from a missing one). 403 only when the lead is visible. | F03 D3, matrix rows 11 and 34 |
| A3 | Where does the claim limit come from, since `CurrentUser` has no `maxOpenLeads`? | The policy reads `users.max_open_leads` from the DB (FR-014). The caller may supply `openLeadCount`; if absent, the policy counts open leads itself. | Inferred from FR-014, §4 |
| A4 | Is `authorize` sync or async? | Async (scope lookup, optional DB reads). | F03 §9 API signature |
| A5 | Which actions count as "mutations" for denial logging (FR-013)? | `lead:write`, `lead:claim`, `lead:assign`, `lead:reopen`, `team:settings`, `offer:manage`. | Inferred |
| A6 | `lead:claim` on a visible but already-owned lead? | 403 `FORBIDDEN`. | Inferred from matrix ("lead unassigned") |
| A7 | Manager assigning to a MANAGER target? | Allowed only if the target is the actor. | FR-008 "role REP or self" |
| A8 | `newTeamId` when unassigning or when the team is unchanged? | Omitted. Present only if the target's team differs from the lead's team. | FR-011 |
| A9 | `team:read` for a REP beyond own team? | 403. "Basic info only" is a projection concern of the calling feature. | FR-008 |
| A10 | Resource-less scoped actions (`audit:read`, `user:list`, `dashboard:team`, `demographics:read`) for managers | Allowed with `kind:'none'`; callers then filter by scope. With a team resource, the team must be in scope. | FR-008 "in scope" |
| A11 | Test DB for policy tests | Temp-file SQLite migrated with F01's schema (via F01 test helper / drizzle migrate). The 4-level, cycle and 1,000-user fixtures are inserted directly. | Constitution V |
| A12 | F02's `requireUser`/`CurrentUser` may not exist yet (parallel wave) | `withAuthz` depends on an injectable user resolver defaulting to F02's `requireUser`; a local type-only `CurrentUser` shape is used and swapped for F02's at merge. Tests inject a fake. | README same-wave rule |
