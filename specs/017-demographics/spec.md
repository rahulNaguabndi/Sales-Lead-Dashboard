# Feature Specification: F17 — Demographics Analytics

**Feature Branch**: `017-demographics`

**Created**: 2026-09-30

**Status**: Draft

**Input**: User description: "F17 Demographics Analytics. The authoritative source is docs/features/F17-demographics.md."

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Conversion by Age Band (Priority: P1)

As the VP, I want conversion rate by customer age band so that I know which customer segments we serve well.

**Why this priority**: It's the headline insight of the tab. It tells leadership where the sales operation works and where it doesn't.

**Independent Test**: Log in as the VP and open Dashboard → Demographics with "Last 90 days". Compare each band's conversion and sample size against an independent count of the seed data.

**Acceptance Scenarios**:

1. **Given** the period has closed leads across bands, **When** the tab opens, **Then** a bar per age band (18–25, 26–35, 36–45, 46–60, 60+) shows Conversion % (won ÷ (won + lost)) with its "n = closed leads" label.
2. **Given** a band has fewer than 20 closed leads, **When** it renders, **Then** its bar is replaced by a hatched placeholder labelled "Not enough data (n = 7, min 20)", and the tooltip explains the rule.
3. **Given** leads with an unknown age, **When** the tab renders, **Then** they're excluded from the bands, and a footnote shows "312 leads without age excluded".

---

### User Story 2 — Channel Preference by Age Band (Priority: P1)

As a manager, I want to see the preferred contact channels per age band so that reps pick the right channel by default.

**Why this priority**: It turns directly into daily rep behavior (which channel to try first) and marketing spend.

**Independent Test**: Open the tab as a manager or the VP and compare each band's channel shares and n against an independent count of the leads created in the period.

**Acceptance Scenarios**:

1. **Given** the period, **When** the chart renders, **Then** each age band shows a 100 % horizontal stacked bar of preferred-channel share (Call, WhatsApp, SMS, Email) with direct labels for segments ≥ 8 %, a legend, and n per band.
2. **Given** a band has fewer than 30 leads, **When** it renders, **Then** the band row is suppressed with the "Not enough data" treatment.

---

### User Story 3 — Model Interest Heatmap (Priority: P2)

As the VP, I want to see which vehicle models each age band is interested in so that marketing targets the right audience.

**Why this priority**: It's valuable for marketing but builds on the same data foundation as the P1 stories.

**Independent Test**: Open the tab and compare a sample of heatmap cells (share % and count) against an independent count of leads by band and model.

**Acceptance Scenarios**:

1. **Given** the period, **When** the heatmap renders, **Then** the rows are age bands, the columns are the 6 catalog models, and the cell color shows the **row share** (% of that band's leads interested in the model). The cell text shows the share % and the tooltip shows the count.
2. **Given** a cell count below 5, **When** it renders, **Then** the cell shows "–" in muted ink with no color fill (suppressed), and the tooltip says "Fewer than 5 leads".
3. **Given** the viewer toggles "Show counts", **When** toggled, **Then** the cell text switches to absolute counts (the color still encodes row share).

---

### User Story 4 — Filters and Scope (Priority: P2)

As a manager or the VP, I want the demographics to follow the dashboard filters and my organizational scope so that I only see and compare the data I'm responsible for.

**Why this priority**: Scope and access control are required for correctness and privacy, but they refine the P1 views rather than add new ones.

**Independent Test**: Log in as a manager and confirm the data is limited to their team with no team filter. Log in as a rep and confirm the tab is missing and the data request is refused.

**Acceptance Scenarios**:

1. **Given** a manager, **When** viewing demographics, **Then** data is restricted to their team, and the team filter is hidden.
2. **Given** the Source group or Country filter, **When** changed, **Then** all three charts recompute.
3. **Given** a rep navigates directly to the demographics tab address, **When** the page loads, **Then** the tab isn't shown and the data request is refused with a forbidden response.

---

### Edge Cases

- **All bands suppressed** (for example "Today"): each chart shows the empty state "Not enough data for this period · Try Last 90 days".
- **A returning customer with several leads in the period:** the channel mix counts per lead. It's documented in the tooltip. The per-customer alternative is noted in Assumptions.
- **Age changes over time:** the band is stored on the customer, so historical leads use the current band (acceptable for the demo).
- **Model removed from the catalog:** its column still shows if data exists, labelled by its identifier.
- **Small teams:** a manager's team can easily fall under the thresholds, which is expected. The UI suggests widening the date range.
- **Suppression bypass via filtering (differencing attack):** out of scope for the demo. Noted as a GDPR follow-up.
- **Leads without a vehicle model:** excluded from the heatmap and counted in a footnote.
- **Filter combination with no data at all:** every chart shows the empty state, with no errors.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST provide a Demographics tab on the dashboard for MANAGER and VP roles only. Data requests from a REP MUST be refused with a forbidden response, and the tab MUST NOT be shown to a REP.
- **FR-002**: Age bands MUST be exactly `18-25`, `26-35`, `36-45`, `46-60`, `60+`. Customers with an unknown age band are excluded from the charts and reported as an excluded count.
- **FR-003**: Conversion by band MUST use the global definition (won ÷ (won + lost), leads closed in the period) and show n (closed leads).
- **FR-004**: Channel mix MUST use the preferred channel of the customers behind the leads created in the period, counting each lead once.
- **FR-005**: The model-interest heatmap MUST use the vehicle model of leads created in the period. Leads without a model are excluded and counted in a footnote.
- **FR-006 (minimum sample rule)**: The system MUST suppress conversion bars with fewer than 20 closed leads, channel-mix rows with fewer than 30 leads, and heatmap cells with a count below 5. Suppression MUST be applied **on the server**, so suppressed values are never sent to the client. The thresholds are shared named constants.
- **FR-007**: All charts MUST honor the dashboard filter row (date range, team for the VP, source group) plus a Country filter (countries present in scope).
- **FR-008**: Each chart MUST offer a tooltip and a table view. Suppressed entries appear in the table as "Not enough data".
- **FR-009**: An "Insight" line above each chart MAY highlight the maximum, for example "WhatsApp is the top channel for 18–25 (58 %)". It's computed deterministically from non-suppressed data only, and hidden if all data is suppressed.
- **FR-010**: Scope enforcement MUST reuse the same scope rules as the rest of the dashboard (manager → own team, VP → whole organization).

### Key Entities

- **Customer**: age band, preferred channel, country. Read only.
- **Lead**: customer, vehicle model, stage, created/closed time, source, team, owner. Read only.
- **Age band**: one of five ordered bands plus "unknown" (excluded).
- **Vehicle model catalog**: the six catalog models (`aurora-suv`, `metro-hatch`, `vento-sedan`, `terra-4x4`, `luma-ev`, `nova-van`).
- **Minimum sample thresholds**: 20 closed leads (conversion), 30 leads (channel row), 5 leads (heatmap cell).

No data is written and no schema changes are needed.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: For the seed data over 90 days, every age band's conversion, channel mix and heatmap cell matches an independent count of the same data (verified by automated tests).
- **SC-002**: The data delivered to the browser never contains a numeric value for a suppressed entry (verified by an automated test).
- **SC-003**: The seed data produces a visible, explainable story: at least one band where WhatsApp is the top channel and one where Call is.
- **SC-004**: The tab loads in under 800 ms with the seed data and no caching.
- **SC-005**: The chart colors (4 channel colors and the sequential heatmap ramp) keep readable contrast in both light and dark mode, validated with the palette check, and no chart relies on color alone.

## Assumptions

- The dashboard shell, filter row, chart container and scope handling come from F16. Until F16 is merged, F17 codes against those interfaces and stubs them.
- Channel mix counts per lead, not per customer. Revisit if the VP prefers per-customer counting.
- Thresholds (20 / 30 / 5) are fixed constants, not configurable by the VP.
- Country is a filter only, with no country breakdown chart.
- Gender, income and other sensitive attributes are out of scope. Significance testing, cohort analysis and AI narrative are out of scope.
- Caching is not implemented here and is a candidate for the later caching feature.

## Clarifications

### Session 2026-09-30

All questions were answered from `docs/features/F17-demographics.md` and the domain model (see [assumptions.md](assumptions.md)).

- Q: Channel mix per lead or per customer? → A: Per lead.
- Q: Are the thresholds configurable? → A: No, fixed constants.
- Q: Country breakdown chart? → A: Filter only.
- Q: A manager passes a team filter outside their team? → A: Results stay inside their team scope, so the outcome is empty, not an error.
- Q: Tie-breaking for insight lines? → A: Band order, then catalog order, so the result is deterministic.
