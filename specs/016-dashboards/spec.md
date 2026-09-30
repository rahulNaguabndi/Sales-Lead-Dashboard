# Feature Specification: F16 — Manager & VP Dashboards

**Feature Branch**: `016-dashboards`

**Created**: 2026-09-30

**Status**: Draft

**Input**: User description: "F16 Manager & VP Dashboards. Authoritative source: docs/features/F16-dashboards.md."

---

## User Scenarios & Testing *(mandatory)*

One dashboard page whose content depends on the viewer's role and scope. Reps see personal performance, managers see their team, and the VP sees the whole organization plus a team comparison. Every number comes from real stored data, every chart segment drills down into a pre-filtered lead list, and the page refreshes itself when leads or activities change.

### User Story 1 — Manager sees team health at a glance (Priority: P1)

As a manager, I want headline KPIs for my team over a chosen period so that I know immediately whether we're responding fast enough and converting.

**Why this priority**: The headline KPIs are the core value of the dashboard and the entry point for every other widget.

**Independent Test**: Log in as Lukas Becker (Team DACH), open the dashboard, and compare each KPI tile against a hand-written query over the same period and scope.

**Acceptance Scenarios**:

1. **Given** Lukas is logged in, **When** he opens the dashboard, **Then** he sees six KPI tiles for Team DACH over the last 30 days: New leads, Coverage %, Avg first response time, Conversion %, Revenue won (€), Overdue follow-ups. Each tile shows a delta against the previous 30 days.
2. **Given** the period is changed to "Last 7 days", **When** the filter applies, **Then** every tile and chart recomputes for that window, and the page address updates to reflect the range (`?range=7d`).
3. **Given** a KPI where lower is better (first response time, overdue follow-ups), **When** it went down against the previous period, **Then** the delta is shown as an improvement (success icon plus "▼ 12 min" label), not as a decline.

---

### User Story 2 — Manager finds overloaded reps and neglected leads (Priority: P1)

As a manager, I want a rep leaderboard with workload and quality metrics so that I can rebalance leads.

**Why this priority**: Turning a number into a concrete list of neglected leads is the main action managers take from the dashboard.

**Independent Test**: Open the leaderboard as Lukas, sort by each column, and click an overdue cell to confirm the drilled list matches the number.

**Acceptance Scenarios**:

1. **Given** Team DACH has 4 reps, **When** Lukas views the leaderboard, **Then** each row shows: rep, open leads, new in period, contacted, coverage %, avg first response time, SLA breaches, overdue follow-ups, won, revenue €. The table is sortable by any column.
2. **Given** Felix Wagner has 3 overdue follow-ups, **When** Lukas clicks the overdue cell, **Then** he lands on the lead inbox (team view, owner = Felix, overdue only) filtered to exactly those 3 leads.

---

### User Story 3 — VP compares teams and sources (Priority: P1)

As the VP, I want org-wide KPIs, the funnel, and a team comparison so that I can see where we win and lose.

**Why this priority**: The VP's only view of the business; without it the org level has no value.

**Independent Test**: Log in as Isabelle, check the org-wide KPIs and team comparison, set a team filter, and click a source bar.

**Acceptance Scenarios**:

1. **Given** Isabelle is logged in, **When** she opens the dashboard, **Then** she sees org-wide KPIs plus a Team comparison table (DACH / West / South) with the same metric columns as the leaderboard, aggregated per team.
2. **Given** a Team filter is set to "Team South", **When** it applies, **Then** every widget is scoped to Team South, and the comparison table highlights that row.
3. **Given** Isabelle clicks the "Referral" bar in Source performance, **When** the drill-down fires, **Then** the inbox opens with source = Referral and the same date range.

---

### User Story 4 — Funnel and stage flow (Priority: P1)

As a manager or VP, I want to see how many leads reach each stage so that I can spot where leads stall.

**Why this priority**: Shows where leads stall, which is the main diagnostic for pipeline health.

**Independent Test**: Compare funnel counts to hand-computed reach counts from stage history for a fixture period, then click a bar.

**Acceptance Scenarios**:

1. **Given** the selected period, **When** the funnel renders, **Then** it shows the counts of leads created in the period that reached (current stage or history) New, Contacted, Qualified, Test drive, Negotiation, Won, with the step-to-step conversion % labeled between bars.
2. **Given** a funnel bar is clicked, **When** the drill-down fires, **Then** the inbox opens filtered to leads currently in that stage within the period.

---

### User Story 5 — Rep sees personal performance (Priority: P2)

As a rep, I want my own stats so that I can track my progress.

**Why this priority**: Useful, but reps already work from the inbox; managers and VP views carry the primary value.

**Independent Test**: Log in as Sofia and verify that only her own data is shown and no team leaderboard exists.

**Acceptance Scenarios**:

1. **Given** Sofia is logged in, **When** she opens the dashboard, **Then** she sees tiles for My open leads, Due today, My coverage %, My avg first response time, Won this period, My revenue €; her personal funnel; and her touches per day. She sees no other rep's data and no team leaderboard.

---

### User Story 6 — Live refresh (Priority: P2)

As a manager, I want the dashboard to update itself when leads arrive or close so that the demo and daily use reflect reality.

**Why this priority**: Makes the dashboard feel alive and supports the demo, but the numbers are already correct on reload.

**Independent Test**: Keep Lukas's dashboard open, submit a Showroom lead routed to Team DACH, and watch the New leads tile.

**Acceptance Scenarios**:

1. **Given** Lukas's dashboard is open, **When** a Showroom lead is routed to Team DACH, **Then** within 7 seconds the New leads tile increments and the "Live" indicator pulses. No page reload happens.
2. **Given** a rep marks a lead Won with €38,900, **When** the event arrives, **Then** Revenue won updates to include it.

---

### Edge Cases

- **Division by zero**: coverage with 0 leads, or conversion with 0 closed leads, shows "—" with an explanation ("No closed leads in this period"). Never shows 0 %.
- **Previous period has no data**: the delta shows "New" instead of a percentage.
- **Funnel reach vs current stage**: the funnel counts leads that *ever reached* a stage; the drill-down shows leads *currently* in that stage. The tooltip states both ("Reached: 212 · Currently here: 48"), and the drill-down count matches "Currently here".
- **Backward stage moves** count once per lead per stage reached.
- **Cold / revived leads**: Cold is not a funnel step; it appears in the "Going cold" strip.
- **Reassigned leads**: rep metrics use the *current* owner. This is documented in the leaderboard tooltip; historical attribution is out of scope.
- **Custom range over 366 days** is rejected with a validation message. A start date after the end date is rejected.
- **VP with a Team filter and a Rep filter from another team**: rejected with "Rep not in selected team".
- **Leads with no first response** are excluded from the average response time but counted in "Not yet responded".
- **Live-event burst** (for example 5 leads per second): refreshes are limited to at most one per 5 seconds.
- **One widget fails to load**: that widget shows an inline error with Retry; the other widgets still render.
- **Daylight-saving transitions**: day buckets use the offset of the bucket's own date, so 23- or 25-hour days are acceptable and documented.
- **Empty data** (new period or team): tiles show "—", and charts show an empty state suggesting a wider date range.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST render a single dashboard page whose widgets are chosen by role: REP gets the personal set, MANAGER the team set, VP the org set plus team comparison.
- **FR-002**: Every metric MUST be computed from stored data at request time, or from a cache derived from it (F20), using the definitions in the domain model §6. There are no hard-coded or client-side-fabricated numbers.
- **FR-003**: All queries MUST be restricted to the viewer's scope (F03). Requested filters (team, rep) are intersected with the scope. Requesting a team or rep outside the scope MUST be refused as out of scope.
- **FR-004**: The KPI row MUST contain: New leads, Coverage %, Avg first response time, Conversion %, Revenue won (EUR), Overdue follow-ups. Each tile shows its value, the delta against the previous equal-length period (absolute and %), direction semantics (higher-is-better or lower-is-better), and a sparkline of the daily series.
- **FR-005**: A secondary stat strip MUST show SLA breaches (now), Pipeline value (€, open leads), and Leads going cold (at risk + cold).
- **FR-006**: Charts MUST include (for MANAGER/VP): Leads over time by source group, Funnel, Source performance (volume and win rate), Stage aging, Lost reasons. MANAGER additionally sees the Rep leaderboard; VP sees the Team comparison and can open any team's leaderboard.
- **FR-007**: The filter row MUST offer: date range presets (Today, Last 7 days, Last 30 days (default), Last 90 days, Month to date, Custom), Team (VP only), Rep (MANAGER/VP), Source group. Filter state MUST be kept in the page address so views are shareable and reload-safe.
- **FR-008**: Every chart mark, leaderboard cell and KPI tile MUST drill down to the lead inbox with equivalent filters (date range, team, owner, source, stage, overdue, SLA). The drilled inbox count MUST equal the number clicked, except where the edge cases note a definitional difference.
- **FR-009**: The dashboard MUST react to live lead and activity events (lead created, assigned, updated; activity created) by refreshing affected widgets, limited to at most once per 5 seconds.
- **FR-010**: Every chart MUST have a hover tooltip showing exact values and a "View as table" toggle rendering the same data as an accessible table.
- **FR-011**: Money MUST be formatted in EUR with German locale by default (e.g. "38.900 €"). Durations are humanized ("1 h 12 min"). Percentages use one decimal place.
- **FR-012**: Day buckets and period boundaries MUST be computed in the organization timezone Europe/Brussels (CET/CEST).
- **FR-013**: Every response MUST include when it was generated and the resolved period and scope so the UI can show "Updated 12 s ago".
- **FR-014**: The page MUST render usefully with empty data (a new period or team): tiles show "—", and charts show an empty state that suggests widening the date range.

### Key Entities

Read-only; nothing is written and the data model is unchanged.

- **Lead**: creation time, stage, source, owner, team, first response time, deal value, close time, lost reason, budget.
- **Contact activity**: a user-performed activity other than a note; used for coverage and touches.
- **Stage history**: stage transitions per lead; used for funnel reach and stage aging.
- **Follow-up**: scheduled task on a lead; used for overdue counts.
- **User / Team**: reps, managers, VP and the teams they belong to; define scope and leaderboard rows.
- **Source group**: fixed mapping of the raw lead sources into six groups, each with a fixed chart color:

| Group | Label | Sources | Color slot |
|---|---|---|---|
| WEBSITE | Website | Website | 1 blue |
| SOCIAL | Social | Facebook, Instagram | 2 orange |
| PAID_SEARCH | Paid search | Google Ads | 3 aqua |
| PORTALS | Portals | Portal | 4 yellow |
| OFFLINE | Walk-in & Phone | Walk-in, Phone | 5 magenta |
| REFERRAL | Referral | Referral | 6 green |

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: For a fixture dataset with known answers, 100 % of KPI values match the expected results.
- **SC-002**: A manager can go from the dashboard to the exact list of neglected leads (overdue or SLA breach) in 2 clicks or fewer.
- **SC-003**: The dashboard's first meaningful content appears in under 1.5 seconds locally, and each widget loads in under 500 ms for 95 % of requests with the demo data (800+ leads, ~7,000 activities) without caching.
- **SC-004**: No request can return a metric computed over leads outside the viewer's scope, verified for REP, MANAGER and VP including cross-team attempts.
- **SC-005**: A Showroom lead is reflected in the manager's New leads tile within 7 seconds without a reload.
- **SC-006**: Every chart passes the color-palette accessibility validation in light and dark mode, and every chart offers a table view.

## Assumptions

- Out of scope: custom dashboard builder or saved layouts; targets/quota management (stage-aging thresholds are constants: 3 days for New/Contacted, 7 for other stages); historical owner attribution for reassigned leads; CSV/PDF export; forecasting.
- The rep dashboard does not show a team rank (default for the open question).
- Revenue counts Won leads by close date within the period, not by creation cohort.
- Stage-aging targets of 3 days (New/Contacted) and 7 days (others) are accepted defaults.
- Depends on F03 (scope and access policy) and F07 (stage history, Won/Lost data); reads data produced by F06, F08 and F10; live refresh consumes F12 events; F20 may add caching; F17 adds a Demographics tab to the same page.
- Visual design follows the project's data-visualization rules: color follows the entity, one y-axis per chart, no pie charts, and light and dark palettes selected rather than auto-inverted.
