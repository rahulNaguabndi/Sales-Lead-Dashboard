# Tasks: F17 — Demographics Analytics

**Input**: `specs/017-demographics/` (spec.md, plan.md, research.md, data-model.md, contracts/)

**Tests**: Required (constitution V). Tests for pure logic come **before** the implementation (red → green).

**Format**: `[ID] [P?] [Story] Description`. All paths are relative to the repo root. Stay inside the F17 owned paths.

## Phase 1: Setup

- [x] T001 Verify the F16 interfaces exist on the branch (`apps/web/server/services/dashboard.ts` period resolver and scope predicate, `components/dashboard/tabs.ts`, `ChartCard`, `FilterBar`, `useLiveRefresh`). If any are missing, create `apps/web/components/dashboard/demographics/_f16-stubs.ts` with the same export names
- [x] T002 [P] Create `packages/shared/src/demographics.ts` with `DEMOGRAPHICS_MIN_SAMPLE`, `AGE_BANDS`, `CHANNELS`, `MODELS`, and export it append-only from `packages/shared/src/index.ts`

## Phase 2: Foundational (blocks all stories)

- [x] T003 [P] Write failing unit tests `apps/web/tests/unit/demographics/suppression.test.ts`: boundaries 19/20 closed, 29/30 channel, 4/5 cell; all five bands always present in order; suppressed entries carry no `won`/`conversionPct`/`shares`/`count`/`sharePct` (SC-002, FR-006)
- [x] T004 [P] Write failing unit tests `apps/web/tests/unit/demographics/insights.test.ts`: max selection ignores suppressed entries, deterministic tie-break (band order, then catalog order), insight omitted when everything is suppressed (FR-009)
- [x] T005 Add `DemographicsResponseSchema` (Zod, discriminated suppressed/unsuppressed variants, strict) to `packages/shared/src/demographics.ts`
- [x] T006 Implement `applySuppression()` and `selectInsights()` in `apps/web/server/services/demographics.ts` until T003/T004 pass (depends on T005)
- [x] T007 [P] Write failing fixture-DB service test `apps/web/tests/unit/demographics/service.test.ts` cross-checking conversion, channel mix, heatmap, `excluded` counts and `orgConversionPct` against independent SQL on the seeded DB (SC-001)
- [x] T008 Implement `getDemographics(ctx, filters)` in `apps/web/server/services/demographics.ts`: three grouped Drizzle queries plus footnote, org and `availableCountries` queries, scope via the F16 predicate, period via the F16 resolver, `sourceGroup` via the shared mapping, `country` filter, output validated by `DemographicsResponseSchema` (depends on T006, T007)
- [x] T009 [P] Write failing RBAC tests `apps/web/tests/unit/demographics/route-rbac.test.ts`: REP → 403, unauthenticated → 401, invalid query → 400, MANAGER limited to own team (foreign `teamId` yields empty, not another team's data), VP sees the whole organization
- [x] T010 Implement `apps/web/app/api/dashboard/demographics/route.ts`: thin handler with session, Zod query parse, role check (MANAGER/VP), service call, F01 error shape (depends on T008, T009)

**Checkpoint**: the API is correct, scoped and leak-free. The UI work can start.

## Phase 3: User Story 1 — Conversion by age band (P1) 🎯 MVP

**Goal**: VP sees conversion columns per band with n labels and suppression.

- [x] T011 [P] [US1] Write `apps/web/tests/unit/demographics/palette.test.ts`: WCAG contrast checks for chart tokens (light/dark) and the ramp text-on-cell choice (SC-005)
- [x] T012 [US1] Create `apps/web/components/dashboard/demographics/palette.ts` (channel slots, sequential blue ramp 100→700, light/dark tokens, `inkOn(cell)` helper) until T011 passes
- [x] T013 [P] [US1] Create `SuppressedMark.tsx` (45° hatched pattern, "Not enough data (n = X, min Y)" label, tooltip text)
- [x] T014 [P] [US1] Create `use-demographics.ts` (TanStack Query hook, filter-keyed, uses `useLiveRefresh`)
- [x] T015 [US1] Create `ConversionByBandChart.tsx`: ordinal vertical columns, single blue hue, value label on top, "n = …" under the axis label, org-average reference line, tooltip, Chart/Table toggle, empty state
- [x] T016 [US1] Create `DemographicsTab.tsx` (layout, filter row, insight line, footnote for excluded counts, loading/error/empty states, `MethodologyPopover.tsx`) and register the tab append-only in `apps/web/components/dashboard/tabs.ts` for MANAGER/VP

**Checkpoint**: US1 is demoable on its own.

## Phase 4: User Story 2 — Channel mix (P1)

- [x] T017 [US2] Create `ChannelMixChart.tsx`: 100 % horizontal stacked bars per band, fixed channel slots, 2 px surface gap, direct labels for segments ≥ 8 %, always-visible legend, n per band, suppressed rows via `SuppressedMark`, per-lead counting note in the tooltip, Chart/Table toggle
- [x] T018 [US2] Wire `ChannelMixChart` into `DemographicsTab.tsx` (side by side with conversion at ≥ 1280 px)

## Phase 5: User Story 3 — Model interest heatmap (P2)

- [x] T019 [US3] Create `ModelInterestHeatmap.tsx`: bands × models, row-share sequential fill, cell text with inverse/primary ink, suppressed cells unfilled with "–" and "Fewer than 5 leads" tooltip, ramp legend, "Show counts" toggle, unknown-model columns labelled by slug, Chart/Table toggle
- [x] T020 [US3] Wire the heatmap full width into `DemographicsTab.tsx`, footnote for `noModel`

## Phase 6: User Story 4 — Filters and scope (P2)

- [x] T021 [P] [US4] Create `CountryFilter.tsx` (options from `availableCountries`) and plug it into the tab's filter row; hide the team filter for MANAGER; all three charts refetch on any filter change
- [x] T022 [US4] Ensure REP never sees the tab (`?tab=demographics` falls back to the default tab) and a forbidden API response renders a clear error state

## Phase 7: Polish and verification

- [x] T023 [P] Write Playwright `apps/web/tests/e2e/demographics.spec.ts` (ports from `PORT`): VP opens the tab on 90 days, three charts visible, table view shows "Not enough data" for a suppressed band (a narrow filter such as a single country or source group to force it), manager has no team filter, rep has no tab and the API returns 403
- [x] T024 Seed-story check: verify with a service test that at least one band has WhatsApp as the top channel and another has Call (SC-003); if the seed doesn't support it, log "Requires F01 change" in the report
- [x] T025 Timing check for SC-004 (< 800 ms uncached with seed data), keyboard access for the toggles and cells, dark-mode pass
- [x] T026 Run `npm run typecheck`, `npm run lint`, `npm test`, `npm run test:e2e`; fix failures from this feature only
- [x] T027 Update `docs/features/F17-demographics.md` if implementation deviates (Constitution I), and write `specs/017-demographics/REPORT.md`

## Dependencies & Order

- T001, T002 → T003/T004/T005 → T006 → T007 → T008 → T009 → T010.
- US1 (T011–T016) needs T010. US2 needs T016. US3 needs T016. US4 needs T016. Polish last.
- Parallel: T003/T004/T007/T009 (different files); T011/T013/T014; T021 with T019.

## Requirement coverage

| Requirement | Tasks |
|---|---|
| FR-001 | T009, T010, T016, T022, T023 |
| FR-002 | T003, T008 |
| FR-003 | T007, T008, T015 |
| FR-004 | T007, T008, T017 |
| FR-005 | T007, T008, T019, T020 |
| FR-006 | T002, T003, T006 |
| FR-007 | T008, T021 |
| FR-008 | T015, T017, T019, T023 |
| FR-009 | T004, T006, T016 |
| FR-010 | T008, T009 |
| SC-001 | T007 |
| SC-002 | T003, T005 |
| SC-003 | T024 |
| SC-004 | T025 |
| SC-005 | T011, T012 |
