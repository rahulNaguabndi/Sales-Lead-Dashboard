# Implementation Plan: F17 — Demographics Analytics

**Branch**: `017-demographics` | **Date**: 2026-09-30 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/017-demographics/spec.md`; technical input from `docs/features/F17-demographics.md` §9.

## Summary

Add a read-only Demographics tab to the F16 dashboard for MANAGER and VP. One endpoint (`GET /api/dashboard/demographics`) calls a service that runs three grouped queries (conversion by band, channel mix by band, model interest by band), then passes the raw counts through a pure `applySuppression()` function. That function applies the minimum-sample rule **before** the response leaves the server, builds the deterministic insight lines, and produces a Zod-validated response. The UI renders three Recharts views (conversion columns, 100 % stacked channel bars, sequential heatmap) plus table views, tooltips, a methodology popover and footnotes. No schema changes and no writes.

## Technical Context

**Language/Version**: TypeScript 5.x strict, Node ≥ 20

**Primary Dependencies**: Next.js App Router (route handler), Drizzle ORM (better-sqlite3), Zod, Recharts, TanStack Query, Tailwind + shadcn/ui. **No new dependencies.**

**Storage**: SQLite, read-only (`customers`, `leads`). Existing indexes `leads(created_at)`, `leads(team_id, owner_id)`, `leads(source)` cover the filters.

**Testing**: Vitest (pure `applySuppression`, insight selection, service against a fixture DB, route RBAC), Playwright (VP flow).

**Target Platform**: Local dev machine, Node runtime.

**Project Type**: Existing npm-workspaces monorepo. This is a feature slice inside `apps/web` plus one constant in `packages/shared`.

**Performance Goals**: Tab loads in < 800 ms uncached with seed data (SC-004); the constitution's dashboard budget is < 500 ms cold server time.

**Constraints**: Suppressed values never leave the server. No caching here (F20). Works with Redis stopped and with no `ANTHROPIC_API_KEY` (neither is used).

**Scale/Scope**: ~800 leads, 5 bands × 4 channels × 6 models. Three aggregate queries, each a single pass with GROUP BY.

## Constitution Check

| Principle | Status | Note |
|---|---|---|
| I Spec is truth | Pass | Source doc F17 is carried over, FR numbers kept. Any deviation amends the doc |
| II R1–R3 first | Pass | Read-only P2 feature, touches none of the R1–R3 paths |
| III Layering | Pass | Route handler (auth, Zod validate, authorize) → service → queries. The service has no Next/React imports |
| IV Security | Pass | Server-side role check (403 for REP), Zod-validated query params, parameterized Drizzle queries, no PII in the response (aggregates only) |
| V Test-first | Pass | Tasks put `applySuppression` and insight tests before the implementation. RBAC tests and the e2e are included |
| VI Integrity | Pass | No writes, no schema change, UTC ms time |
| VII Degradation | Pass | No Redis or AI dependency |
| VIII Simplicity | Pass | No new dependency. One pure function holds the rules |
| IX Performance | Pass | Three indexed grouped queries, no N+1 |
| X UX | Pass | Loading, empty, error states. Text labels beside color. Table view for accessibility |

No violations, so no Complexity Tracking entries.

## Project Structure

### Documentation (this feature)

```text
specs/017-demographics/
├── spec.md
├── assumptions.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/demographics-api.md
├── checklists/requirements.md
└── tasks.md
```

### Source Code (repository root) — owned paths only

```text
packages/shared/src/
└── demographics.ts                      # DEMOGRAPHICS_MIN_SAMPLE, band/model order, DemographicsResponseSchema (append-only export from index.ts)

apps/web/
├── app/api/dashboard/demographics/route.ts      # thin handler: auth → Zod query → authorize(MANAGER|VP) → service
├── server/services/demographics.ts              # getDemographics(ctx, filters), 3 grouped queries, applySuppression(), selectInsights()
├── components/dashboard/demographics/
│   ├── DemographicsTab.tsx
│   ├── ConversionByBandChart.tsx
│   ├── ChannelMixChart.tsx
│   ├── ModelInterestHeatmap.tsx
│   ├── SuppressedMark.tsx
│   ├── MethodologyPopover.tsx
│   ├── CountryFilter.tsx
│   ├── use-demographics.ts                      # TanStack Query hook
│   ├── palette.ts                               # channel slots + sequential ramp tokens (light/dark)
│   └── _f16-stubs.ts                            # only if F16 isn't on the branch at build time
├── components/dashboard/tabs.ts                 # shared file: append-only registration of the Demographics tab (role-gated)
└── tests/
    ├── unit/demographics/suppression.test.ts
    ├── unit/demographics/insights.test.ts
    ├── unit/demographics/service.test.ts        # fixture DB
    ├── unit/demographics/route-rbac.test.ts
    ├── unit/demographics/palette.test.ts        # contrast check for the palette
    └── e2e/demographics.spec.ts
```

**Structure Decision**: Follow the README path ownership. The only shared-file edits are the append-only tab registration in `components/dashboard/tabs.ts` and a new export line in `packages/shared` (`demographics.ts` is a new file, so it doesn't collide with F01's files).

## Design

### Endpoint
`GET /api/dashboard/demographics?range=90d&from=&to=&teamId=&sourceGroup=&country=DE`. Response shape is in [contracts/demographics-api.md](contracts/demographics-api.md). Errors use the F01 `AppError` JSON shape: 401 unauthenticated, 403 `FORBIDDEN` for REP, 400 for invalid query.

### Service
`getDemographics(ctx, filters)`:
1. Resolve the period with F16's period resolver and the scope with F16's scope predicate (read-only imports from `dashboard.ts`; F03 `scopeFor` underneath).
2. Run three grouped queries (Drizzle, `customers` JOIN `leads`, `age_band != 'UNKNOWN'` for the band data) plus two footnote counts (unknown age, no model) and an org-wide conversion query:
   - conversion: `closed_at` in period, `stage IN ('WON','LOST')` grouped by `age_band` → `closed`, `won`
   - channel: `created_at` in period grouped by `age_band, preferred_channel` → `n`
   - model: `created_at` in period, `vehicle_model IS NOT NULL` grouped by `age_band, vehicle_model` → `n`
3. Hand raw counts to `applySuppression(raw, thresholds)`, which returns the response with suppressed entries carrying **no numeric fields** except what the UI must show (`closed`/`n` as the sample-size label is allowed: the spec shows "n = 7, min 20"; shares, won and conversion are never included for a suppressed entry).
4. `selectInsights()` picks the maximum from non-suppressed entries only.
5. Validate with `DemographicsResponseSchema` (strict, suppressed variants are a separate discriminated member with no value fields).

Sample-size disclosure: the spec text "Not enough data (n = 7, min 20)" shows the group size for suppressed items, so `n`/`closed` is sent for suppressed conversion and channel entries. Heatmap suppressed cells send no count (tooltip says "Fewer than 5 leads"). This is recorded in research.md as Decision R3.

### UI
- `DemographicsTab` composes F16 `FilterBar` (date range, source group, team for the VP only) plus `CountryFilter`, and three `ChartCard`s, with an insight line above each chart and footnotes for excluded counts.
- Every card has a Chart / Table toggle. Suppressed rows read "Not enough data".
- `palette.ts` holds the fixed channel slots (Call blue, WhatsApp orange, SMS aqua, Email yellow) and the sequential blue ramp (steps 100→700) with light and dark tokens. A unit test checks contrast for text-on-cell and adjacent distinguishability.
- Layout: conversion and channel mix side by side at ≥ 1280 px, heatmap full width.

### Role gating
`tabs.ts` registers `{ id: 'demographics', label: 'Demographics', roles: ['MANAGER','VP'] }`. The API check is the real authorization (constitution IV). `?tab=demographics` for a REP falls back to the default tab.

### Stubs (F16 missing at build time)
`_f16-stubs.ts` provides minimal local versions of `ChartCard`, the period resolver and the scope predicate, with the exact names F16 will export, so merge replaces imports only.

## New Dependencies
None.

## Complexity Tracking
None.
