# F17 — Demographics Analytics

| Field | Value |
|---|---|
| **ID** | F17 |
| **Priority** | P2 |
| **Build wave** | 4 |
| **Depends on** | F16 (dashboard shell, filter bar, `ChartCard`, scope handling) |
| **Blocks** | — |
| **Personas** | MANAGER (team), VP (org). REP has no access |
| **Challenge req.** | — |
| **Owns (files/areas)** | `apps/web/components/dashboard/demographics/**`, `apps/web/server/services/demographics.ts`, `apps/web/app/api/dashboard/demographics/route.ts`, the "Demographics" tab inside `app/(app)/dashboard` (added through an append-only tab registry provided by F16) |

## 1. Summary
A Demographics tab on the dashboard shows how customer age bands relate to conversion, preferred contact channel, and vehicle interest. Marketing and sales leadership can then decide where to invest, for example "under-35s prefer WhatsApp and convert best on the Luma EV". A **minimum sample size rule** suppresses unreliable numbers so small groups never produce misleading conclusions.

## 2. User Stories & Acceptance Scenarios

### US-1 (P1): Conversion by age band
*As the VP, I want conversion rate by age band so that I know which customer segments we serve well.*

**Independent test:** Log in as the VP and open Dashboard → Demographics with "Last 90 days". Compare each band's conversion and n against SQL.

1. **Given** the period has closed leads across bands, **When** the tab opens, **Then** a bar per age band (18–25, 26–35, 36–45, 46–60, 60+) shows Conversion % (WON ÷ (WON+LOST)) with its "n = closed leads" label.
2. **Given** a band has fewer than 20 closed leads, **When** it renders, **Then** its bar is replaced by a hatched placeholder labelled "Not enough data (n = 7, min 20)", and the tooltip explains the rule.
3. **Given** leads with an unknown age, **When** the tab renders, **Then** they're excluded from the bands, and a footnote shows "312 leads without age excluded".

### US-2 (P1): Channel preference by age band
*As a manager, I want to see the preferred channels per age band so that reps pick the right channel by default.*

1. **Given** the period, **When** the chart renders, **Then** each age band shows a 100 % horizontal stacked bar of preferred channel share (Call, WhatsApp, SMS, Email) with direct labels for segments ≥ 8 %, a legend, and n per band.
2. **Given** a band has fewer than 30 leads, **When** it renders, **Then** the band row is suppressed with the "Not enough data" treatment.

### US-3 (P2): Model interest heatmap
*As the VP, I want to see which models each age band is interested in so that marketing targets the right audience.*

1. **Given** the period, **When** the heatmap renders, **Then** the rows are age bands, the columns are the 6 catalog models, and the cell color shows the **row share** (% of that band's leads interested in the model). The cell text shows the share % and the tooltip shows the count.
2. **Given** a cell count below 5, **When** it renders, **Then** the cell shows "–" in muted ink with no color fill (suppressed), and the tooltip says "Fewer than 5 leads".
3. **Given** the viewer toggles "Show counts", **When** toggled, **Then** the cell text switches to absolute counts (the color still encodes row share).

### US-4 (P2): Filters and scope
1. **Given** a manager, **When** viewing demographics, **Then** data is restricted to their team, and the team filter is hidden.
2. **Given** the Source group or Country filter, **When** changed, **Then** all three charts recompute.
3. **Given** a REP navigates to `?tab=demographics`, **When** the page loads, **Then** the tab isn't shown and the API returns 403.

## 3. Functional Requirements
- **FR-001**: The system MUST provide a Demographics tab on `/dashboard` for MANAGER and VP roles only. The API MUST return 403 for REP.
- **FR-002**: Age bands MUST be exactly `18-25`, `26-35`, `36-45`, `46-60`, `60+` from `customers.age_band`. `UNKNOWN` is excluded from the charts and reported as an excluded count.
- **FR-003**: Conversion by band MUST use the global definition (WON ÷ (WON + LOST), closed_at in period) and show n (closed leads).
- **FR-004**: Channel mix MUST use `customers.preferred_channel` of the customers behind the leads created in the period, counting each lead once.
- **FR-005**: The model-interest heatmap MUST use `leads.vehicle_model` for leads created in the period. Leads without a model are excluded and counted in a footnote.
- **FR-006 (minimum sample rule)**: The system MUST suppress: conversion bars with < 20 closed leads; channel-mix rows with < 30 leads; heatmap cells with count < 5. Suppression MUST be applied **server-side**, so suppressed values are never sent to the client. The thresholds are constants in `packages/shared` (`DEMOGRAPHICS_MIN_SAMPLE`).
- **FR-007**: All charts MUST honor the F16 filter row (date range, team for VP, source group) plus a Country filter (ISO codes present in scope).
- **FR-008**: Each chart MUST offer a tooltip and a table view. Suppressed entries appear in the table as "Not enough data".
- **FR-009**: An "Insight" line above each chart MAY highlight the maximum, for example "WhatsApp is the top channel for 18–25 (58 %)". It's computed deterministically from non-suppressed data only, and hidden if all data is suppressed.
- **FR-010**: Scope enforcement MUST reuse F03/F16 (the same scope predicate).

## 4. Key Entities & Data
Reads `customers` (age_band, preferred_channel, country), `leads` (customer_id, vehicle_model, stage, created_at, closed_at, source, team_id, owner_id). No writes. No schema changes. The catalog of models comes from the enums in `packages/shared` (`aurora-suv`, `metro-hatch`, `vento-sedan`, `terra-4x4`, `luma-ev`, `nova-van`).

## 5. Edge Cases & Error Handling
- **All bands suppressed** (for example "Today"): each chart shows the empty state "Not enough data for this period · Try Last 90 days".
- **A returning customer with several leads in the period:** the channel mix counts per lead (FR-004). It's documented in the tooltip, and the alternative (per customer) is noted in Open Questions.
- **Age changes over time:** the band is stored on the customer, so historical leads use the current band (acceptable for the demo).
- **Model removed from the catalog:** its column still shows if data exists, labelled by slug.
- **Small teams:** a manager's team can easily fall under the thresholds, which is expected. The UI suggests widening the range.
- **Suppression bypass via filtering (differencing attack):** out of scope for the demo. Noted for GDPR.

## 6. Success Criteria
- **SC-001**: For the seed data over 90 days, every age band's conversion, channel mix and heatmap cell match fixture SQL (unit tests).
- **SC-002**: The API response never contains a numeric value for a suppressed entry (tested).
- **SC-003**: The seed data produces a visible, explainable story: at least one band where WhatsApp is the top channel and one where Call is (the seed correlation from `PLAN.md` §6).
- **SC-004**: The tab loads in < 800 ms uncached with the seed data.
- **SC-005**: The palette validator passes for the 4-slot channel palette and the sequential heatmap ramp in light and dark mode.

## 7. UX Notes
Follows the dataviz skill.

| Chart | Form | Color | Details |
|---|---|---|---|
| Conversion by age band | **Vertical columns** in band order (ordinal x-axis, not sorted by value) | single hue (blue). The org average is a thin muted reference line | Value label on top ("18.2 %"), "n = 64" below the axis label. Suppressed bands: hatched outline (texture fill at 45°) plus the text "n < 20" |
| Channel mix by band | **100 % horizontal stacked bars**, one row per band | categorical slots 1–4, fixed by entity: Call = blue, WhatsApp = orange, SMS = aqua, Email = yellow | 4 series, so **direct labels are mandatory** for segments ≥ 8 %, and the legend is always visible. 2px surface gap between segments |
| Model interest | **Heatmap** (bands × models) | sequential blue ramp (steps 100→700) on row share | Cell text in primary or inverse ink (whichever passes contrast). Suppressed cells: no fill, "–" in muted ink. A ramp legend with min–max % |

Layout: the filter row (inherited) → an insight line → the three charts stacked (the conversion and channel mix side by side on ≥ 1280px, the heatmap full width). Footnotes list the excluded counts. Methodology link: "How these numbers are calculated" opens a popover with the definitions and suppression thresholds.

## 8. Decisions
| # | Decision | Alternatives | Rationale |
|---|---|---|---|
| 1 | Server-side minimum-sample suppression (20 closed / 30 leads / 5 per cell) | No suppression; client-side hiding; confidence intervals | Prevents misleading conclusions from tiny groups and avoids leaking small-group data (privacy-minded for the EU). Simpler to explain than intervals |
| 2 | Heatmap colored by row share | Absolute counts; column share | Bands differ in size. Row share answers "what does this band want?" Counts are available through the toggle |
| 3 | Channel mix as a 100 % stacked bar | Grouped bars; pies per band | Part-to-whole per band is the job. Easy comparison across rows. No pies |
| 4 | Ordinal band order on the x-axis | Sorted by conversion | Age is ordinal, and sorting would hide the trend |
| 5 | Per-lead counting for the channel mix | Per-customer counting | Consistent with the other lead-based metrics. [Revisit in Open Questions] |
| 6 | Deterministic insight line | AI narrative | Reliable and cheap. AI narrative could come later via F18 |

## 9. Technical Plan Input (for `/speckit.plan`)

**Endpoint**
```
GET /api/dashboard/demographics?range=90d&from=&to=&teamId=&sourceGroup=&country=DE
200 {
  "period": {...}, "thresholds": {"conversionMinClosed":20,"channelMinLeads":30,"cellMinCount":5},
  "excluded": {"unknownAge":312,"noModel":58},
  "conversion": [
    {"band":"18-25","closed":64,"won":12,"conversionPct":18.8,"suppressed":false},
    {"band":"60+","closed":7,"suppressed":true}
  ],
  "orgConversionPct": 16.4,
  "channelMix": [
    {"band":"18-25","n":180,"shares":{"CALL":14.4,"WHATSAPP":57.8,"SMS":12.2,"EMAIL":15.6},"suppressed":false}
  ],
  "modelInterest": {
    "models":["aurora-suv","metro-hatch","vento-sedan","terra-4x4","luma-ev","nova-van"],
    "rows":[{"band":"26-35","n":210,"cells":[{"model":"luma-ev","count":61,"sharePct":29.0,"suppressed":false},{"model":"nova-van","suppressed":true}]}]
  },
  "insights": {"conversion":"26–35 converts best (21.4 %)","channelMix":"WhatsApp leads for 18–25 (58 %)","modelInterest":"Luma EV is the top model for 26–35 (29 %)"},
  "generatedAt": 1759240000000
}
403 {error:{code:"FORBIDDEN"}} for REP
```

**Service (`server/services/demographics.ts`):** `getDemographics(ctx, filters)` reuses the F16 scope predicate and period resolver (it imports from `dashboard.ts`, read-only). Three grouped queries:
- `SELECT c.age_band, SUM(l.stage='WON') won, SUM(l.stage IN ('WON','LOST')) closed FROM leads l JOIN customers c … WHERE closed_at BETWEEN … GROUP BY c.age_band`
- `SELECT c.age_band, c.preferred_channel, COUNT(*) … WHERE l.created_at BETWEEN … GROUP BY 1,2`
- `SELECT c.age_band, l.vehicle_model, COUNT(*) … GROUP BY 1,2`

Suppression and insights are applied in TS by `applySuppression()`, a pure function that's unit tested. Its output is validated with `DemographicsResponseSchema`.

**Components:** `DemographicsTab`, `ConversionByBandChart`, `ChannelMixChart`, `ModelInterestHeatmap`, `SuppressedMark` (a hatched pattern plus label), `MethodologyPopover`. They reuse F16's `ChartCard`, `FilterBar` and `useLiveRefresh`.

**Caching:** a candidate for F20 (expensive, tolerant of staleness). No caching implemented here.

**Tests:** Vitest for `applySuppression` threshold boundaries (19/20, 29/30, 4/5), the no-numeric-leak assertion, and insight selection ignoring suppressed entries. A fixture DB for the query correctness. RBAC (REP → 403, manager scope limited). Playwright: VP opens the tab, three charts are visible, and the table view shows "Not enough data" for a suppressed band.

## 10. Out of Scope
- Gender, income or other sensitive attributes (not collected, GDPR).
- Statistical significance testing and confidence intervals.
- Cohort analysis over time per band.
- AI-generated narrative (possible via F18 later).

## 11. Open Questions
- Channel mix per lead or per customer? Default: per lead.
- Are the thresholds (20 / 30 / 5) acceptable, or should they be configurable by the VP?
- Should a country breakdown (map or table) be part of this tab or a separate one? Default: a filter only.

## 12. Spec Kit Prompts
**`/speckit.specify`**
> Add a demographics view for sales managers (their own team) and the VP (the whole organization) that shows, per customer age band (18–25, 26–35, 36–45, 46–60, 60+): how well leads convert into sales, which contact channel customers prefer (call, WhatsApp, SMS, email), and which vehicle models each age band is interested in. It uses the same date range, team, source and country filters as the dashboard. To avoid misleading conclusions and protect privacy, any group that is too small is hidden and clearly labelled "not enough data" (fewer than 20 closed leads for conversion, fewer than 30 leads for channel preference, fewer than 5 leads for a model/age combination). Leads without an age or model are excluded and counted in a footnote. Sales reps cannot see this view. A short, factual highlight above each chart states the strongest pattern.

**`/speckit.plan`**
> Extend the F16 dashboard with a Demographics tab: a route handler `app/api/dashboard/demographics`, a service `server/services/demographics.ts` reusing F16's scope predicate and period resolver, three grouped SQLite queries via Drizzle, and a pure `applySuppression()` that runs server-side before the Zod-validated response (thresholds in `packages/shared`). Recharts with the dataviz reference palette: ordinal columns for conversion with an org-average reference line, 100 % stacked horizontal bars with fixed channel slots and mandatory direct labels, and a sequential blue heatmap on row share with suppressed cells unfilled and a hatched texture for suppressed bars. Table view and tooltips on everything, light and dark tokens. RBAC: 403 for REP. Tests: Vitest on the suppression boundaries and leak prevention, a fixture DB for correctness, Playwright for the VP flow.
