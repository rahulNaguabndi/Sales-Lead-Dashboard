# F04 — Lead Inbox

| Field | Value |
|---|---|
| **ID** | F04 |
| **Priority** | P0 |
| **Build wave** | 2 |
| **Depends on** | F02 (current user), F03 (scope & policy); reads fields populated by F09/F10 seed data |
| **Blocks** | F11 (claim/assign actions in rows), F12 (live row updates) |
| **Personas** | REP, MANAGER, VP |
| **Challenge req.** | **R1**: display a list of all incoming sales leads |
| **Owns (files/areas)** | `apps/web/app/(app)/inbox/**`, `apps/web/components/leads/inbox/**`, `apps/web/app/api/leads/route.ts` (GET), `apps/web/server/services/lead-query.ts` |

## 1. Summary
The inbox is the home screen for reps and the working list for managers and VPs. It shows every lead the user may see, **ranked by what needs attention first**: overdue follow-ups, then SLA breaches, then score, then newest. It has quick-view tabs, filters, search and server-side pagination. It's dense and fast, and designed so live updates (F12) and claim/assign actions (F11) can plug in without restructuring.

## 2. User Stories & Acceptance Scenarios

### US-1 (P1): See my leads, ranked by urgency · R1
*As a rep, I want to see all my leads in one list, most urgent first, so I know who to contact next.*

**Independent test:** log in as `sofia.rossi@eurodrive.test`. `/inbox` shows only Sofia's leads, and the first rows are overdue or SLA-breach leads.

1. **Given** Sofia owns 32 open leads, **When** she opens `/inbox`, **Then** she lands on the **My Leads** tab showing 25 rows (page 1 of 2) and a total of 32. *(R1)*
2. **Given** one of her leads has a follow-up due yesterday, **When** the list loads, **Then** that lead is ranked above leads with no overdue follow-up and its "Next" cell is red and labelled "Overdue". *(R1)*
3. **Given** two leads have no overdue follow-ups and no SLA breach, with scores 82 and 55, **Then** the 82 lead appears first. Equal scores are ordered newest first. *(R1)*
4. **Given** a NEW HOT lead created 20 min ago with no activity, **Then** it shows a "Respond now" SLA badge and ranks above non-breaching leads. *(R1)*

### US-2 (P1): Each row tells me enough to decide · R1
*As a rep, I want each row to show who, what, where from, and how urgent, without opening it.*

1. **Given** a lead row, **Then** it shows: priority dot (HOT/WARM/COOL, with text for screen readers), customer name with a Returning badge if applicable, city and country flag, vehicle model, source badge, stage chip, owner avatar (hidden on the My Leads tab), lead age ("2 h", "3 d"), last activity summary and relative time, and next follow-up. *(R1)*
2. **Given** I click anywhere on a row (or press Enter on a focused row), **Then** I navigate to `/leads/{id}` (F05). *(R1 → R2)*

### US-3 (P1): Quick views (tabs)
*As a user, I want one-click views for the lists I use most.*

1. **Given** I'm a rep, **Then** I see tabs **My Leads · Unassigned · Due Today · Going Cold**, each with a count badge.
2. **Given** I'm a manager or VP, **Then** I also see **Team** (manager) or **All** (VP), which is my default tab, and My Leads is hidden if I own no leads.
3. **Given** I pick **Unassigned**, **Then** I see open leads with no owner in my scope's teams. For a rep that's their own team's pool only.
4. **Given** I pick **Due Today**, **Then** I see leads with a PENDING follow-up due before the end of today (in my browser's timezone), including overdue ones.
5. **Given** I pick **Going Cold**, **Then** I see open-stage leads (NEW…NEGOTIATION) whose last activity (or creation, if none) is 3 or more days ago, oldest first.

### US-4 (P1): Filter, search, sort
1. **Given** I set Stage = QUALIFIED and Source = FACEBOOK, **Then** only matching leads show, the URL updates (`?stage=QUALIFIED&source=FACEBOOK`), and the filter survives a reload.
2. **Given** I type "conti" in search, **Then** after a 250 ms debounce the list shows leads whose customer first or last name, email, phone digits, or reference matches (case-insensitive).
3. **Given** I choose sort "Newest", **Then** ordering is `created_at DESC` and the default ranking is no longer applied.
4. **Given** I'm a manager, **Then** I can filter by Owner (my reps, plus "Unassigned"). **Given** I'm a rep, **Then** the owner filter isn't shown.
5. **Given** I click **Clear filters**, **Then** all filters reset but the tab stays.

### US-5 (P1): Scope enforcement
1. **Given** Sofia (Team South) calls `GET /api/leads?owner=<Anna Weber id>`, **Then** the response contains **no** DACH leads. Out-of-scope filter values are silently intersected with the scope, and there's no error that reveals whether they exist.
2. **Given** VP Isabelle, **When** she opens **All**, **Then** she sees leads from all three teams.

### US-6 (P2): Stat chips
1. **Given** I'm on `/inbox`, **Then** above the tabs I see chips **Due today · Overdue · New (untouched) · Going cold**. Each count is limited to my default scope, and clicking one applies the matching tab or filter.

### US-7 (P2): Live-ready rows
1. **Given** F12 isn't built yet, **Then** the inbox works fully with manual refresh.
2. **Given** F12 is built, **When** a `lead.created` event arrives for my scope, **Then** the list refetches and the new row highlights. F04 provides the query key contract and a highlight hook stub, described in §9.

## 3. Functional Requirements
- **FR-001**: The system MUST list leads visible to the current user according to F03 `scopeFor(user)`: REP sees own leads plus own team's unassigned pool, MANAGER sees their team, VP sees the org.
- **FR-002**: The system MUST support views `mine`, `unassigned`, `due_today`, `going_cold`, `team` (MANAGER, VP) and `all` (alias of `team` for VP). The default view is `mine` for REP and `team` for MANAGER and VP.
- **FR-003**: Default ranking (`sort=rank`) MUST be: (1) has an overdue PENDING follow-up, (2) SLA breach, (3) score DESC, (4) created_at DESC, (5) id DESC for a stable tiebreak.
- **FR-004**: SLA breach MUST be computed at query time: stage = NEW and no **contact activity** (USER, type ≠ NOTE) and age > 15 min for HOT, > 2 h otherwise.
- **FR-005**: Other sorts MUST be supported: `newest`, `oldest_untouched` (NEW leads with no contact activity, created_at ASC), `next_follow_up` (earliest pending due_at ASC, nulls last), `score`, and `last_activity` (ASC, nulls first).
- **FR-006**: Filters MUST be supported and combinable (AND across filters, OR within a multi-value filter): `stage[]`, `source[]`, `priority[]`, `owner[]` (user ids or `unassigned`; MANAGER and VP only), `team[]` (VP only), `returning` (bool, reads `customers.is_returning`), `overdue` (`true`), `sla` (`breached`), `sourceGroup` (one of `SOURCE_GROUPS` from `packages/shared/src/source-groups.ts`: WEBSITE, SOCIAL, PAID_SEARCH, PORTALS, OFFLINE, REFERRAL; maps to the member sources, used by F16 drill-downs), `createdFrom` / `createdTo` (ISO dates), `q` (search).
- **FR-007**: Search MUST be **case- and accent-insensitive** ("emile" matches "Émile") by normalizing the query the same way as `customers.search_text` (F01 FR-016) and matching it with `LIKE '%q%'` against `search_text`, which covers first and last name, "first last", email and phone digits (4+ digits for phone). Lead reference is matched by prefix. Minimum 2 characters.
- **FR-008**: Pagination MUST be server-side, with `page` (1-based) and `pageSize` (default 25, allowed 10/25/50) and `total` returned.
- **FR-009**: The response MUST include tab counts for the user's scope (`mine`, `unassigned`, `dueToday`, `overdue`, `newUntouched`, `goingCold`), computed in one extra aggregate query.
- **FR-010**: Filter, sort, page and tab state MUST live in the URL query string, so views can be shared and survive a reload.
- **FR-011**: Closed (WON/LOST) and COLD leads MUST be excluded from `mine`, `team` and `all` by default, and shown when the stage filter explicitly includes them. A "Show closed" toggle adds WON and LOST.
- **FR-012**: Rows MUST be keyboard navigable (↑/↓ moves focus, Enter opens, `/` focuses search).
- **FR-013**: The page MUST render its first page on the server (RSC) for a fast first paint, then hand over to a TanStack Query client cache keyed `['leads', normalizedParams]`.
- **FR-014**: Out-of-scope filter values MUST be intersected with the scope and never produce a 403, so they reveal nothing.
- **FR-015**: Unauthenticated requests MUST get 401 (API) or a redirect to `/login?next=/inbox` (page), per F02.

## 4. Key Entities & Data
Reads `leads`, `customers` (incl. `is_returning`, `search_text`), `users` (owner), `follow_ups` (next pending due_at), `activities` (latest USER activity for the summary, contact-activity existence check for SLA). No writes. It relies on `leads.score`, `priority`, `stage`, `last_activity_at`, `first_response_at` and `created_at`, and the indexes listed in `03-domain-model.md §2`.

"Returning" reads the stored column `customers.is_returning` (set by the seed, F10 dedupe and F07 on WON).

## 5. Edge Cases & Error Handling
- A lead with no customer email or phone still renders; the name is always present.
- A lead with no activity shows "No activity yet" in italics, and last-activity sorting treats it as the oldest.
- A page past the end (for example `page=9` with 3 pages) clamps to the last page, and the response echoes the effective page.
- Invalid query params (unknown enum values, bad dates) return 400 `VALIDATION_ERROR` with the field names. The page ignores bad params and shows defaults.
- A rep with no leads gets an empty state: "No leads yet. Check the Unassigned tab to claim one", with a button.
- A manager with an empty unassigned pool sees "All caught up".
- Search with fewer than 2 characters is ignored (no request).
- Very long names or notes are truncated with an ellipsis, and the full text is in a tooltip.
- Timezone: the client sends `tz` (IANA, default `Europe/Berlin`) for Due Today boundaries. An invalid tz falls back to the default.
- A lead reassigned away while it's on screen disappears on the next fetch, and clicking it gives the F05 not-found state.

## 6. Success Criteria
- **SC-001**: With seed data (800+ leads), `GET /api/leads` p95 server time < 300 ms for any view, filter or sort combination.
- **SC-002**: A rep can go from login to opening their most urgent lead in 2 clicks or fewer.
- **SC-003**: 0 out-of-scope leads are returned across the RBAC test matrix (REP × MANAGER × VP × every view).
- **SC-004**: The ranking test fixture (overdue, SLA, score ties) returns the exact expected order.
- **SC-005**: Every visible lead is reachable via pagination; the sum of page sizes equals `total`.

## 7. UX Notes
```
[Due today 6] [Overdue 2] [New 4] [Going cold 3]                    (stat chips)
[My Leads 32 | Unassigned 7 | Due Today 6 | Going Cold 3 | Team]   [Filters ▾] [🔍 Search…] [Sort: Recommended ▾]
┌──┬──────────────────────┬────────────┬──────────┬────────────┬───────┬─────┬──────────────────┬─────────────┐
│● │ Giulia Conti ↺  🇮🇹 Milano │ Aurora SUV │ Facebook │ QUALIFIED  │ (SR)  │ 2 d │ Called · 3 h ago │ Today 18:00 │
└──┴──────────────────────┴────────────┴──────────┴────────────┴───────┴─────┴──────────────────┴─────────────┘
                                                                         ‹ 1 2 ›   25 / page
```
- Row height is 40 px, rows are zebra-free with a hover highlight, and the sticky header stays in view.
- The priority dot is red (HOT), amber (WARM) or blue (COOL), always with `aria-label`/tooltip text. Color is never the only signal.
- Loading shows 10 skeleton rows and keeps the previous data during refetch (`placeholderData: keepPreviousData`), with no flash.
- Errors show an inline banner with a Retry button.
- Filters appear as a popover with chips for the active filters; each chip has an ✕.
- Below 1024 px, the table collapses to two-line cards (name, stage chip / vehicle, next follow-up).
- Currency is not shown in the inbox. Budget is only on detail.

## 8. Decisions
| # | Decision | Alternatives | Rationale |
|---|---|---|---|
| 1 | Server-side filter, sort and pagination | Load everything, filter client-side | Scales past the seed size; scope is enforced in SQL |
| 2 | Default "recommended" ranking (overdue → SLA → score → newest) | Newest first | The rep's key job is "who next?"; this encodes it (D5) |
| 3 | URL is the source of truth for view state | Local state or localStorage | Shareable, survives reload, works with RSC |
| 4 | Offset pagination (`page`) | Cursor/keyset | Ranking is multi-key and computed; offset is simpler at this scale and supports page numbers. Revisit with Postgres |
| 5 | Out-of-scope filters are intersected, not rejected | 403 | Doesn't leak existence (SC-5) |
| 6 | Closed and COLD leads hidden by default | Show all | Keeps the working list actionable; still reachable via filters |
| 7 | RSC first page plus TanStack Query takeover | Pure client fetch | Fast first paint and client-side refetch for live updates |

## 9. Technical Plan Input (for `/speckit.plan`)

**Endpoint:** `GET /api/leads`

| Param | Type | Notes |
|---|---|---|
| `view` | `mine\|unassigned\|due_today\|going_cold\|team\|all` | default by role |
| `stage`, `source`, `priority` | CSV of enums | |
| `owner` | CSV of user ids or `unassigned` | MANAGER/VP |
| `team` | CSV of team ids | VP |
| `returning`, `overdue`, `closed` | `true\|false` | |
| `sla` | `breached` | SLA-breach leads only |
| `sourceGroup` | `WEBSITE\|SOCIAL\|PAID_SEARCH\|PORTALS\|OFFLINE\|REFERRAL` | F16 drill-down; expands to member sources via `SOURCE_GROUP_OF` |
| `createdFrom`, `createdTo` | ISO date | inclusive, in `tz` |
| `q` | string ≥ 2 | |
| `sort` | `rank\|newest\|oldest_untouched\|next_follow_up\|score\|last_activity` | default `rank` |
| `page`, `pageSize` | int | 1, 25 |
| `tz` | IANA | default `Europe/Berlin` |

Params are validated with `LeadListQuerySchema` in `packages/shared/src/schemas/lead-filters.ts` (created by F01 to match this table; F04 may refine it append-only).

**Response 200**
```json
{
  "items": [{
    "id": "01J9…", "reference": "EDM-2026-00812",
    "customer": { "id": "01J9…", "name": "Giulia Conti", "city": "Milano", "country": "IT",
                  "isReturning": true, "preferredChannel": "WHATSAPP" },
    "vehicleModel": "aurora-suv", "source": "FACEBOOK", "stage": "QUALIFIED",
    "priority": "HOT", "score": 82,
    "owner": { "id": "01J9…", "name": "Sofia Rossi", "avatarColor": "#7c3aed" },
    "createdAt": 1790000000000, "lastActivityAt": 1790100000000,
    "lastActivity": { "type": "CALL", "outcome": "CONNECTED", "at": 1790100000000 },
    "nextFollowUpAt": 1790200000000,
    "flags": { "overdue": false, "slaBreach": false, "atRisk": false }
  }],
  "page": 1, "pageSize": 25, "total": 32,
  "counts": { "mine": 32, "unassigned": 7, "dueToday": 6, "overdue": 2, "newUntouched": 4, "goingCold": 3 },
  "view": "mine", "sort": "rank"
}
```
Errors: `400 {error:{code:"VALIDATION_ERROR",message,fields}}` and `401 {error:{code:"UNAUTHENTICATED"}}`.

**Service** `server/services/lead-query.ts`
- `listLeads(user, query): Promise<LeadListResult>`: builds a Drizzle query with `scopeFilter(user)` from F03 (owner_id IN scope, OR owner_id IS NULL AND team_id IN scopeTeams).
- Computed columns via correlated subqueries or CTEs: `next_follow_up_at = MIN(due_at) WHERE status='PENDING'`, `has_contact_activity = EXISTS(… kind='USER' AND type<>'NOTE')`, `latest USER activity` (for the row summary; notes included).
- Ranking: `ORDER BY (next_follow_up_at < :now) DESC, sla_breach DESC, score DESC, created_at DESC, id DESC`.
- `countTabs(user, tz)`: a single aggregate query using `SUM(CASE …)`.
- `isReturning`: read directly from `customers.is_returning` (stored column).
- Search: `customers.search_text LIKE '%' || normalize(q) || '%' OR leads.reference LIKE q || '%'`.

**Route handler** `app/api/leads/route.ts` (GET only): `getCurrentUser()` → parse with Zod → `listLeads` → JSON.

**Page** `app/(app)/inbox/page.tsx` (RSC): reads `searchParams`, calls `listLeads` directly for page 1, and passes `initialData` to the client `<InboxTable>`. Owner filter options come from the users repository limited to scope (no new endpoint).

**Components** `components/leads/inbox/`: `InboxTabs`, `StatChips`, `InboxFilters`, `InboxSearch`, `InboxTable` (TanStack Table), `LeadRow`, `PriorityDot`, `SourceBadge`, `StageChip`, `RelativeTime`, `EmptyState`, `useInboxParams` (URL ↔ state).

**Live-update contract for F12:**
- Query key prefix `['leads']`. F12 invalidates it on `lead.created|lead.assigned|lead.updated`.
- `components/leads/inbox/live-slot.ts` exports `useInboxLive(): { highlightedIds: Set<string> }`, which returns an empty set in F04. F12 may replace **only the body** of this file (a documented ownership exception). `LeadRow` applies the `data-highlight` animation when its id is in the set.

**Tests**
- Unit (Vitest): the ranking comparator fixture; SLA computation boundaries (14:59 vs 15:01 min HOT, 1:59 vs 2:01 h WARM); query-param parsing; search normalization (phone digits).
- Integration: an RBAC matrix for REP (Sofia), MANAGER (Lukas), VP (Isabelle) × every view → assert all returned `owner.id`/team are within scope; out-of-scope owner filter → 0 foreign rows; pagination totals.
- E2E (Playwright, shared with F05/F06, file `apps/web/e2e/core-loop.spec.ts`): login as Sofia → `/inbox` shows My Leads with ≥ 1 row → click the first row → lead detail opens → log activity "Called customer" (outcome Connected) → it appears at the top of the timeline → reload → still present → back to inbox → the row's last-activity reads "Called · just now". *(R1 → R2 → R3)*
- Performance: seed 800 leads, run each view 20×, assert p95 < 300 ms.

## 10. Out of Scope
- Claim and assign buttons in rows, and bulk select (F11).
- Live push, toasts, "N new leads" banner (F12).
- Kanban view (F07).
- Saved custom views and column customization.
- CSV export.

## 11. Open Questions
- Resolved: accent-insensitive search uses the indexed `customers.search_text` column (lowercased, diacritics stripped, maintained by the repository on write; F01 FR-016). See FR-007.
- Should managers who also own leads see a My Leads tab by default? The current rule is: show it only when they own at least one lead.

## 12. Spec Kit Prompts
**`/speckit.specify`**
> Build the Lead Inbox for a car dealership's sales team. It shows every sales lead the signed-in person is allowed to see: sales reps see their own leads plus their team's unassigned leads, managers see their whole team, and the VP sees the whole organisation. The list is ordered by what needs attention first: leads with overdue follow-ups, then brand-new leads that haven't been contacted within their response target (15 minutes for hot leads, 2 hours for others), then higher lead score, then newest. Each row shows priority (hot/warm/cool), customer name and city, a returning-customer marker, vehicle of interest, lead source, pipeline stage, owner, how old the lead is, the last activity, and the next follow-up (highlighted when overdue). Quick tabs: My Leads, Unassigned, Due Today, Going Cold (no activity for 3+ days), and Team/All for managers and the VP, each with a count. Users can filter by stage, source, source group, priority, owner (managers only), returning customers, overdue, response-target breaches and created date; search by name (ignoring accents), email, phone or lead reference; and change the sort. Results are paged 25 at a time, and the chosen view survives a page reload and can be shared as a link. Closed and cold leads are hidden unless asked for. Clicking a lead opens its detail page. Nobody may ever see a lead outside their visibility, even by manipulating filters. Provide helpful empty and loading states.

**`/speckit.plan`**
> Next.js App Router (TypeScript, Node runtime) in `apps/web`. The page `app/(app)/inbox/page.tsx` is a Server Component that renders page 1 by calling `server/services/lead-query.ts#listLeads(user, query)` directly, then hands over to a client `InboxTable` built with TanStack Table and TanStack Query (query key `['leads', params]`, `keepPreviousData`). API: `GET /api/leads` (route handler) with query params validated by the Zod `LeadListQuerySchema` in `packages/shared`. SQLite via Drizzle: scope filter from F03 `scopeFilter(user)`, computed next follow-up and SLA breach (contact activities only) via subqueries, `customers.is_returning` read directly, accent-insensitive search on `customers.search_text`, `sourceGroup` expanded via `SOURCE_GROUP_OF`, ranking `ORDER BY overdue DESC, sla DESC, score DESC, created_at DESC, id DESC`, offset pagination, and one aggregate query for tab counts. URL search params are the source of truth for state. UI: Tailwind + shadcn/ui (Tabs, Popover, Badge, Skeleton), 40 px rows, keyboard navigation. Provide `components/leads/inbox/live-slot.ts` (`useInboxLive` stub) for F12. Tests: Vitest for the ranking/SLA/params, an integration RBAC matrix, and the Playwright core-loop e2e shared with F05/F06. Performance target p95 < 300 ms with 800 seeded leads. Don't create claim/assign or SSE code.
