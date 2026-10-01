# F16 — Manager & VP Dashboards

| Field | Value |
|---|---|
| **ID** | F16 |
| **Priority** | P1 |
| **Build wave** | 4 |
| **Depends on** | F03 (scope/policy), F07 (stage_history, WON/LOST data); reads data produced by F06, F08, F10 |
| **Blocks** | F17, F20 |
| **Personas** | REP (personal view), MANAGER (team view), VP (org view + team comparison) |
| **Challenge req.** | — (extended scope) |
| **Owns (files/areas)** | `apps/web/server/services/dashboard.ts`, `apps/web/app/(app)/dashboard/**`, `apps/web/app/api/dashboard/**`, `apps/web/components/dashboard/**` (except `demographics/**`, which F17 owns), the dashboard tab registry `apps/web/components/dashboard/tabs.ts` (F17 appends its Demographics tab), and `packages/shared/src/source-groups.ts` content (the mapping in §4; F01 ships the initial file so F04's `sourceGroup` filter works in wave 2, and F16 may append) |

## 1. Summary
One `/dashboard` route whose content depends on the viewer's role and scope. Reps see personal performance. Managers see their team's workload, coverage, response time, funnel and a rep leaderboard. VPs see the org-wide funnel and revenue plus a team-vs-team comparison. Every number comes from SQL aggregates over real rows, as defined in `03-domain-model.md` §6. Every chart segment drills down into a pre-filtered inbox, and the dashboard refreshes live when leads or activities change.

## 2. User Stories & Acceptance Scenarios

### US-1 (P1): Manager sees team health at a glance
*As a manager, I want headline KPIs for my team over a chosen period so that I know immediately whether we're responding fast enough and converting.*

**Independent test:** Log in as Lukas Becker (Team DACH), open `/dashboard`, and compare each KPI tile against a hand-written SQL query over the same period and scope.

1. **Given** Lukas is logged in, **When** he opens `/dashboard`, **Then** he sees six KPI tiles for Team DACH over the last 30 days: New leads, Coverage %, Avg first response time, Conversion %, Revenue won (€), Overdue follow-ups. Each tile shows a delta against the previous 30 days.
2. **Given** the period is changed to "Last 7 days", **When** the filter applies, **Then** every tile and chart recomputes for that window, and the URL updates to `?range=7d`.
3. **Given** a KPI where lower is better (FRT, Overdue), **When** it went down against the previous period, **Then** the delta is shown as an improvement (success icon plus "▼ 12 min" label), not as a decline.

### US-2 (P1): Manager finds overloaded reps and neglected leads
*As a manager, I want a rep leaderboard with workload and quality metrics so that I can rebalance leads.*

1. **Given** Team DACH has 4 reps, **When** Lukas views the leaderboard, **Then** each row shows: rep, open leads, new in period, contacted, coverage %, avg FRT, SLA breaches, overdue follow-ups, won, revenue €. The table is sortable by any column.
2. **Given** Felix Wagner has 3 overdue follow-ups, **When** Lukas clicks the overdue cell, **Then** he lands on `/inbox?view=team&owner=<felixId>&overdue=1` with the list filtered to exactly those 3 leads.

### US-3 (P1): VP compares teams and sources
*As the VP, I want org-wide KPIs, the funnel, and a team comparison so that I can see where we win and lose.*

1. **Given** Isabelle is logged in, **When** she opens `/dashboard`, **Then** she sees org-wide KPIs plus a Team comparison table (DACH / West / South) with the same metric columns as the leaderboard, aggregated per team.
2. **Given** a Team filter is set to "Team South", **When** it applies, **Then** every widget is scoped to Team South, and the comparison table highlights that row.
3. **Given** Isabelle clicks the "Referral" bar in Source performance, **When** the drill-down fires, **Then** the inbox opens with `source=REFERRAL` and the same date range.

### US-4 (P1): Funnel and stage flow
*As a manager or VP, I want to see how many leads reach each stage so that I can spot where leads stall.*

1. **Given** the selected period, **When** the funnel renders, **Then** it shows the counts of leads created in the period that reached (current stage or history) NEW, CONTACTED, QUALIFIED, TEST_DRIVE, NEGOTIATION, WON, with the step-to-step conversion % labeled between bars. A lead counts as having reached every stage up to the furthest one it reached, so the funnel is monotonic even when a stage was skipped. The card subtitle states the cohort definition, because "Won" here (won leads created in the period) differs from the Pipeline's "Won (30d)" (won in the period, any creation date).
2. **Given** a funnel bar is clicked, **When** the drill-down fires, **Then** the inbox opens filtered to leads currently in that stage within the period.

### US-5 (P2): Rep sees personal performance
*As a rep, I want my own stats so that I can track my progress.*

1. **Given** Sofia is logged in, **When** she opens `/dashboard`, **Then** she sees tiles for My open leads, Due today, My coverage %, My avg FRT, Won this period, My revenue €; her personal funnel; and her touches per day. She sees no other rep's data and no team leaderboard.

### US-6 (P2): Live refresh
*As a manager, I want the dashboard to update itself when leads arrive or close so that the demo and daily use reflect reality.*

1. **Given** Lukas's dashboard is open, **When** a Showroom lead is routed to Team DACH, **Then** within ≤ 7 s the New leads tile increments, and the "Live" indicator pulses. No page reload happens.
2. **Given** a rep marks a lead WON with €38,900, **When** the event arrives, **Then** Revenue won updates to include it.

## 3. Functional Requirements
- **FR-001**: The system MUST render a single `/dashboard` route whose widgets are chosen by role: REP gets the personal set, MANAGER the team set, VP the org set plus team comparison.
- **FR-002**: Every metric MUST be computed from database rows at request time, or from a cache derived from them (F20), using the definitions in `03-domain-model.md` §6. There are no hard-coded or client-side-fabricated numbers.
- **FR-003**: All queries MUST be restricted to the viewer's scope (F03). Requested filters (team, rep) are intersected with the scope. Requesting a team or rep outside the scope returns 403.
- **FR-004**: The KPI row MUST contain: New leads, Coverage %, Avg FRT, Conversion %, Revenue won (EUR), Overdue follow-ups. Each tile shows value, delta against the previous equal-length period (absolute and %), direction semantics (higher-is-better or lower-is-better), and a sparkline of the daily series.
- **FR-005**: A secondary stat strip MUST show SLA breaches (now), Pipeline value (€, open leads), and Leads going cold (at risk + COLD).
- **FR-006**: Charts MUST include (for MANAGER/VP): Leads over time by source group, Funnel, Source performance (volume and win rate), Stage aging, Lost reasons. MANAGER additionally sees the Rep leaderboard; VP sees the Team comparison and can open any team's leaderboard.
- **FR-007**: The filter row MUST offer: date range presets (Today, Last 7 days, Last 30 days (default), Last 90 days, Month to date, Custom), Team (VP only), Rep (MANAGER/VP), Source group. Filter state MUST live in the URL query string.
- **FR-008**: Every chart mark, leaderboard cell and KPI tile MUST drill down to `/inbox` with equivalent filters (`from`, `to`, `team`, `owner`, `source`, `stage`, `overdue`, `sla`). The drilled inbox count MUST equal the number clicked, except where §5 notes a definitional difference.
- **FR-009**: The dashboard MUST subscribe to live events (F12: `lead.created`, `lead.assigned`, `lead.updated`, `activity.created`) and refetch affected widgets, debounced to at most once per 5 s.
- **FR-010**: Every chart MUST have a hover tooltip showing exact values and a "View as table" toggle rendering the same data as an accessible table.
- **FR-011**: Money MUST be formatted in EUR via `Intl.NumberFormat` (`de-DE` default → "38.900 €"). Durations are humanized ("1 h 12 min"). Percentages use one decimal place.
- **FR-012**: Day buckets and period boundaries MUST be computed in the org timezone `Europe/Brussels` (CET/CEST).
- **FR-013**: The response MUST include `generatedAt` and the resolved `{from, to, scope}` so the UI can show "Updated 12 s ago".
- **FR-014**: The page MUST render usefully with empty data (a new period or team): tiles show "—", and charts show an empty state that suggests widening the date range.

## 4. Key Entities & Data
Reads `leads` (created_at, stage, source, owner_id, team_id, first_response_at, deal_value, closed_at, lost_reason, budget_max), `activities` (**contact activities**, i.e. kind = USER and type ≠ NOTE, for coverage and touches), `stage_history` (funnel reach, stage aging), `follow_ups` (overdue), `users`, `teams`. No writes. No schema changes.

**Source groups** (fixed mapping, `SOURCE_GROUPS` / `SOURCE_GROUP_OF` in `packages/shared/src/source-groups.ts`, shipped by F01 with exactly this mapping; F04 uses it for the `sourceGroup` filter):
| Group (enum) | Label | Sources | Categorical slot (fixed, follows entity) |
|---|---|---|---|
| WEBSITE | Website | WEBSITE | 1 blue |
| SOCIAL | Social | FACEBOOK, INSTAGRAM | 2 orange |
| PAID_SEARCH | Paid search | GOOGLE_ADS | 3 aqua |
| PORTALS | Portals | PORTAL | 4 yellow |
| OFFLINE | Walk-in & Phone | WALK_IN, PHONE | 5 magenta |
| REFERRAL | Referral | REFERRAL | 6 green |

## 5. Edge Cases & Error Handling
- **Division by zero:** coverage with 0 leads, or conversion with 0 closed leads, shows "—" with a tooltip ("No closed leads in this period"). Never shows 0 %.
- **Previous period has no data:** the delta shows "New" instead of a % (it can't be computed).
- **Funnel reach vs current stage:** the funnel counts leads that *ever reached* a stage (via stage_history). The drill-down shows leads *currently* in that stage. The tooltip states this ("Reached: 212 · Currently here: 48"), and the drill-down count matches "Currently here".
- **Backward stage moves** count once per lead per stage reached.
- **COLD / revived leads:** COLD isn't a funnel step. It appears in the "Going cold" strip.
- **Reassigned leads:** rep metrics use the *current* owner. That's documented in the leaderboard tooltip, and historical attribution is out of scope.
- **Custom range > 366 days** is rejected with a validation message. `from > to` is rejected.
- **VP with Team filter + Rep filter from another team:** 400 with "Rep not in selected team".
- **Leads with null `first_response_at`** are excluded from the FRT average but counted in "Not yet responded".
- **Live-event burst** (the simulator at 5 leads/s): debounce ensures ≤ 1 refetch per 5 s.
- **Query failure on one widget:** that widget shows an inline error with Retry. The other widgets still render (per-widget fetching).
- **DST transitions:** day buckets use the fixed offset of the bucket's date, so 23/25-hour days are acceptable and documented.

## 6. Success Criteria
- **SC-001**: For a fixture dataset with known answers, 100 % of KPI values match the expected results (unit tests).
- **SC-002**: A manager can go from the dashboard to the exact list of neglected leads (overdue or SLA breach) in ≤ 2 clicks.
- **SC-003**: The dashboard's first meaningful paint is < 1.5 s locally, and each widget API is < 500 ms p95 uncached with the seed data (800+ leads, ~7k activities).
- **SC-004**: No request can return a metric computed over leads outside the viewer's scope (RBAC tests for REP/MANAGER/VP and cross-team attempts).
- **SC-005**: A Showroom lead is reflected in the manager's New leads tile within ≤ 7 s without a reload.
- **SC-006**: Every chart passes the palette validator (`validate_palette.js`) in light and dark mode, and every chart offers a table view.

## 7. UX Notes
Visualization rules follow the dataviz skill. Color comes last, color follows the entity, there's one y-axis per chart, and there are no pies.

**Layout (desktop ≥ 1280px), top to bottom:**
1. **Filter row** (one row, above everything): date-range preset menu · Team combobox (VP) · Rep combobox · Source group combobox · "Live ●" indicator + "Updated 12 s ago".
2. **KPI row:** 6 stat tiles in one row (3×2 on tablet). Each tile: label (secondary ink), value (large proportional figures, system sans), delta chip (status color **plus icon plus text**, e.g. "▲ 4.2 pp"), and a 7–30-point sparkline in a single neutral hue with no axes. The hero figure on the manager view is **New leads**; on the VP view it's **Revenue won**.
3. **Secondary strip:** SLA breaches · Pipeline value · Going cold, as compact chips with status icons (critical, warning), clickable to drill down.
4. **Row A:** *Leads over time by source group* (left, 2/3 width) · *Funnel* (right, 1/3).
5. **Row B:** *Rep leaderboard* (manager) or *Team comparison* (VP), full width.
6. **Row C:** *Source performance* (2/3) · *Lost reasons* (1/3).
7. **Row D:** *Stage aging* (1/2) · Demographics teaser linking to F17 (1/2, MANAGER/VP).

**Chart form decisions:**
| Widget | Form | Color job | Notes |
|---|---|---|---|
| KPI tiles | Stat tile (value + delta + sparkline) | status for delta only | Not charts. Lower-is-better metrics invert the good/bad mapping |
| Leads over time | **Stacked column**, day buckets (week buckets when range > 60 days) | categorical, 6 fixed slots per source group | Legend always shown. Direct-label the top 3 groups at the last column. 2px surface gap between segments. 4px rounded top only on the top segment. Crosshair tooltip lists all groups + total |
| Funnel | **Horizontal bars**, one per stage in order, left-aligned (not a funnel shape) | single-hue **ordinal** ramp (blue, lightest step ≥ 250 on light) | Step conversion % shown as a text label between bars. Count labels at bar end |
| Source performance | **Two aligned horizontal bar charts sharing the source rows**: Volume (left) and Win rate % (right) | 1 hue each (volume blue; win rate uses emphasis: the org average line in muted ink, bars blue) | Never a dual-axis chart. Sorted by volume |
| Lost reasons | **Horizontal bars**, sorted descending | single hue | Count + % labels. No pie |
| Stage aging | **Horizontal bars**: avg days in stage | emphasis: bars over the target threshold (configurable, default 3 days for NEW/CONTACTED, 7 for others) in accent, the rest gray | Threshold marker as a thin muted line |
| Rep leaderboard / Team comparison | **Table** (> 7 classes) with inline meters for Coverage % (same-ramp track) | status icons for overdue/SLA only | Tabular numerals. Sticky header. Sortable. Row click = drill down |
| Rep touches per day (REP view) | Single-series column | 1 categorical (blue) | No legend (single series; the title names it) |

**Marks & chrome:** 2px lines, thin bars, 4px rounded data ends anchored to the baseline, recessive hairline grid, muted axis labels, and text in text tokens (never series color). Dark mode uses the palette's dark column (selected, not auto-inverted).

**States:** a skeleton per widget while loading, an empty state ("No leads in this period · Try Last 90 days"), an inline error with Retry. Keyboard: tiles and chart marks are focusable, Enter drills down, and the tooltip also shows on focus.

## 8. Decisions
| # | Decision | Alternatives | Rationale |
|---|---|---|---|
| 1 | One `/dashboard` route with role-driven widget sets | Separate routes per role | One code path. Scope does the filtering. Easy to extend to more levels |
| 2 | Compute on read with indexed SQL aggregates, cacheable later (F20) | Pre-aggregated rollup tables, materialized views | Small data. SQLite aggregates are ms-level. Avoids write amplification. F20 can wrap the functions |
| 3 | Source groups (6) instead of the raw 8 sources in the over-time chart | All 8 sources | 8 stacked segments is at the palette ceiling and hard to read. The raw sources stay available in the Source performance chart and filter |
| 4 | Source performance as two aligned bar charts | Dual-axis combo chart, scatter | Dual axes mislead (dataviz non-negotiable). Aligned bars stay readable |
| 5 | Funnel as horizontal bars with a "reached" semantic | Funnel-shaped graphic, current-stage counts | Bars compare accurately. "Reached" reflects the true flow |
| 6 | Debounced SSE-triggered refetch (5 s) | Push the recomputed metrics over SSE; polling | Reuses F12 events. Server stays stateless. Bounded load |
| 7 | Org timezone Europe/Brussels for buckets | User's browser TZ, UTC | Consistent numbers across a multi-country team. CET covers most of the target market |
| 8 | Recharts for charts | Visx, ECharts, Chart.js | Already chosen in the stack. React-native. Enough control over marks |
| 9 | Per-widget endpoints | One mega-endpoint | Independent loading and error states. Finer cache keys for F20 |

## 9. Technical Plan Input (for `/speckit.plan`)

**Endpoints** (all require auth; scope enforced in the service):
```
GET /api/dashboard/summary?range=30d|7d|90d|today|mtd|custom&from=&to=&teamId=&ownerId=&sourceGroup=
200 {
  "scope": {"level":"TEAM","teamIds":["t_dach"],"ownerIds":["u1","u2","u3","u4"]},
  "period": {"from":1759190400000,"to":1761782399999,"prevFrom":...,"prevTo":...,"tz":"Europe/Brussels"},
  "kpis": {
    "newLeads":      {"value":212,"prev":190,"series":[{"d":"2026-09-01","v":7}, ...]},
    "coveragePct":   {"value":87.3,"prev":82.1,"series":[...]},
    "avgFrtMinutes": {"value":42,"prev":55,"series":[...],"lowerIsBetter":true},
    "conversionPct": {"value":16.4,"prev":14.9,"series":[...]},
    "revenueCents":  {"value":155600000,"prev":120300000,"series":[...]},
    "overdueFollowUps": {"value":9,"prev":null,"lowerIsBetter":true}
  },
  "strip": {"slaBreaches":3,"pipelineValueCents":812400000,"goingCold":{"atRisk":11,"cold":7}},
  "generatedAt": 1759240000000
}

GET /api/dashboard/charts/leads-over-time?…same filters…
200 {"bucket":"day","groups":["WEBSITE","SOCIAL","PAID_SEARCH","PORTALS","OFFLINE","REFERRAL"],
     "rows":[{"d":"2026-09-01","WEBSITE":3,"SOCIAL":2,...,"total":8}]}

GET /api/dashboard/charts/funnel     → {"stages":[{"stage":"NEW","reached":212,"current":31}, ...]}
GET /api/dashboard/charts/sources    → {"rows":[{"source":"REFERRAL","leads":18,"won":6,"lost":5,"winRatePct":54.5}], "orgWinRatePct":16.4}
GET /api/dashboard/charts/lost-reasons → {"rows":[{"reason":"PRICE","count":22,"pct":31.4}]}
GET /api/dashboard/charts/stage-aging  → {"rows":[{"stage":"NEW","avgDays":0.8,"targetDays":3,"n":180}]}
GET /api/dashboard/leaderboard       → {"rows":[{"userId":"u1","name":"Anna Weber","open":24,"newInPeriod":51,"contacted":47,"coveragePct":92.2,"avgFrtMinutes":31,"slaBreaches":0,"overdue":1,"won":8,"revenueCents":31120000}]}
GET /api/dashboard/team-comparison   → (VP only) {"rows":[{"teamId":"t_dach","name":"Team DACH", ...same metrics...}]}
Errors: 400 {error:{code:"INVALID_RANGE"}} · 403 {error:{code:"OUT_OF_SCOPE"}}
```
Query parameters are validated by the shared Zod schema `DashboardFilterSchema` (`packages/shared`, append-only).

**Service (`server/services/dashboard.ts`):** pure functions `getSummary(ctx, filters)`, `getLeadsOverTime(...)`, `getFunnel(...)`, `getSources(...)`, `getLostReasons(...)`, `getStageAging(...)`, `getLeaderboard(...)`, `getTeamComparison(...)`. `ctx = {user, scope}` comes from F03 `scopeFor(user)`. Each function has a stable input signature so F20 can wrap it with a cache (key = function name + scope hash + normalized filters).

**SQL approach (Drizzle `sql` templates, parameterized):**
- Scope predicate reused by every query: `(l.owner_id IN (:ownerIds) OR (l.owner_id IS NULL AND l.team_id IN (:teamIds)))`.
- Coverage (contact activities only; a NOTE doesn't count): `SUM(CASE WHEN EXISTS (SELECT 1 FROM activities a WHERE a.lead_id=l.id AND a.kind='USER' AND a.type<>'NOTE') THEN 1 ELSE 0 END) * 100.0 / COUNT(*)`.
- FRT: `AVG(l.first_response_at - l.created_at) / 60000.0 WHERE first_response_at IS NOT NULL`.
- Conversion: `SUM(stage='WON')*100.0 / NULLIF(SUM(stage IN ('WON','LOST')),0)` over `closed_at` in period.
- Day buckets: `CAST((l.created_at + :tzOffsetMs) / 86400000 AS INTEGER)`, mapped back to ISO dates in TS. Gaps are zero-filled in TS.
- Funnel reach: `SELECT to_stage, COUNT(DISTINCT lead_id) FROM stage_history JOIN leads … GROUP BY to_stage`, plus NEW = all leads in the period.
- Stage aging: a window function `LEAD(changed_at) OVER (PARTITION BY lead_id ORDER BY changed_at)` minus `changed_at`, averaged per `to_stage` (open intervals end at `now`).
- Previous period = the same length immediately before `from`, in one query using `CASE WHEN created_at >= :from`.
- Indexes relied on: `leads(created_at)`, `leads(team_id, owner_id)`, `leads(source)`, `activities(lead_id, created_at)`, `stage_history(lead_id, changed_at)`, `follow_ups(assigned_to, status, due_at)`.

**Components (`components/dashboard/`):** `FilterBar`, `KpiTile`, `KpiRow`, `StatStrip`, `LeadsOverTimeChart`, `FunnelChart`, `SourcePerformanceChart`, `LostReasonsChart`, `StageAgingChart`, `LeaderboardTable`, `TeamComparisonTable`, `ChartCard` (title, table toggle, loading/empty/error states), `LiveIndicator`, `useDashboardFilters` (URL state), `useLiveRefresh` (subscribes to the F12 SSE hook, debounces, invalidates TanStack Query keys `['dashboard', widget, filters]`). Palette tokens are CSS custom properties from the dataviz reference palette (light + dark columns).

**Drill-down contract:** `buildInboxHref(filters, extra)` in `lib/` produces `/inbox?...` using the inbox query params defined by F04, which include `overdue=true`, `sla=breached` and `sourceGroup=<WEBSITE|SOCIAL|PAID_SEARCH|PORTALS|OFFLINE|REFERRAL>` (F04 FR-006, F01 `LeadListQuerySchema`).

**Tab registry:** `components/dashboard/tabs.ts` exports an append-only array `{ id, label, roles, component }`. F16 registers Overview, and F17 appends Demographics (MANAGER/VP).

**Events consumed:** `lead.created`, `lead.assigned`, `lead.updated`, `activity.created` (F12). None emitted.

**Tests:**
- Vitest: metric functions against a deterministic fixture DB (in-memory SQLite, ~30 leads with hand-computed expectations), covering division-by-zero, empty periods, the previous-period delta, the timezone bucket boundary at 23:30 UTC, and funnel reach with backward moves.
- Vitest: RBAC (a REP requesting teamId → 403, a MANAGER requesting another team → 403, VP OK).
- Playwright: manager login → dashboard renders 6 tiles → click an overdue cell → inbox shows the same count. Submit a Showroom lead → the New leads tile increments within 7 s.
- The palette validator is run in CI for the light and dark token sets.

## 10. Out of Scope
- Custom dashboard builder or saved layouts.
- Targets/quotas management (the stage-aging thresholds are constants).
- Historical owner attribution for reassigned leads.
- CSV/PDF export (P3).
- Forecasting.

## 11. Open Questions
- Should the rep personal dashboard show a team rank ("#2 of 4 by coverage")? It motivates, but it may be sensitive. Default: **no**.
- Stage-aging targets: are 3 days for NEW/CONTACTED and 7 for others acceptable defaults?
- Should revenue count WON leads by `closed_at` in the period (current definition) or by `created_at` cohort? Default: `closed_at`.

## 12. Spec Kit Prompts
**`/speckit.specify`**
> Build a role-aware performance dashboard for a car dealership's sales lead tool. Sales reps see only their own performance. Sales managers see their team. The VP sees the whole organization and can compare teams. The dashboard shows headline numbers for a chosen period (new leads, share of leads contacted, average time to first response, conversion rate of closed leads, revenue won in euros, overdue follow-ups), each compared with the previous period. It also shows leads over time by source, how many leads reach each pipeline stage, which sources convert best, why leads are lost, how long leads sit in each stage, and a per-rep (or, for the VP, per-team) leaderboard of workload and quality. Users filter by date range, team, rep and source. Clicking any number or chart segment opens the lead list pre-filtered to exactly those leads. The dashboard updates by itself when new leads arrive or deals close. Nobody can ever see numbers for leads outside their own part of the organization. All numbers must be computed from real stored data.

**`/speckit.plan`**
> Next.js App Router route `apps/web/app/(app)/dashboard`, per-widget route handlers under `app/api/dashboard/*`, and a service `server/services/dashboard.ts` of pure functions taking `{user, scope}` from the F03 policy plus Zod-validated filters (`DashboardFilterSchema` in `packages/shared`). SQLite via Drizzle `sql` templates: a scope predicate on owner_id/team_id, day buckets using a Europe/Brussels offset, window functions for stage aging, stage_history for funnel reach, and the previous period computed in the same query. Recharts for charts following the dataviz reference palette: 6 fixed categorical slots for source groups, a single-hue ordinal ramp for the funnel, emphasis for stage aging, no dual axes, no pies, table view and tooltips on every chart, light and dark tokens as CSS variables. TanStack Query per widget with keys `['dashboard', widget, filters]`, invalidated by F12 SSE events debounced to 5 s. URL-driven filters. Drill-down links build `/inbox` query params. Keep functions cache-wrappable for F20. Tests: Vitest fixture DB for metric correctness and RBAC, Playwright for the drill-down and the live tile update.
