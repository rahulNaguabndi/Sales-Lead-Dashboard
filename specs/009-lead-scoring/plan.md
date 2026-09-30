# Implementation Plan: F09 — Lead Scoring & Priority

**Branch**: `009-lead-scoring` | **Date**: 2026-09-30 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/009-lead-scoring/spec.md`; technical input from `docs/features/F09-lead-scoring.md` §9.

## Summary

A pure, deterministic `scoreLead(input, now)` and `slaStatus(lead, now)` live in `packages/shared/src/scoring.ts` with exported `SCORING_WEIGHTS` and `PRIORITY_THRESHOLDS`. A server service (`apps/web/server/services/scoring.ts`) loads inputs, recomputes and persists scores inside the caller's transaction, writes a `SCORE_CHANGED` system activity only on a band change, and exposes a batched `recomputeFreshScores(now)` for F08's job runner. F01's seed stub is replaced with `scoreLead()`. Two presentational components (`ScoreBadge` with a breakdown popover, `SlaBadge`) live in `components/leads/score/`.

## Technical Context

**Language/Version**: TypeScript 5.x strict, Node ≥ 20
**Primary Dependencies**: none new. Uses F01's Drizzle/better-sqlite3 (`Tx`, `withTx`), shadcn `Popover` (F01 ui kit), Tailwind, lucide. Vitest for tests.
**Storage**: existing tables only (`leads`, `customers`, `purchases`, `activities`). No schema change, no migration.
**Testing**: Vitest unit (pure function) and integration (in-memory SQLite via F01 test DB helper); component render tests; Playwright e2e for the badge popover on the lead detail page (when F05 is present).
**Target Platform**: Next.js Node runtime + shared package consumed by seed/tests.
**Project Type**: npm-workspaces monorepo (web app + shared package).
**Performance Goals**: `scoreLead` 1,000 calls < 50 ms (SC-002).
**Constraints**: pure function has no I/O and no `Date.now()`; synchronous service API (better-sqlite3); no Redis or AI dependency.
**Scale/Scope**: ≈800 seeded leads; the freshness job touches open leads under 8 days old in batches of 200.

## Constitution Check

| Principle | Status | Notes |
|---|---|---|
| I. Spec is source of truth | ✅ | Plan follows the F09 doc; any deviation amends the doc |
| II. Mandatory reqs first | ✅ | Supports R1 ranking; R1–R3 flows untouched |
| III. Layered architecture | ✅ | Pure logic in shared; service has no Next/React imports; no route handlers added |
| IV. Security | ✅ | No new endpoints or external input; no PII logged |
| V. Test-first | ✅ | Worked examples A–G and SLA table written before implementation. RBAC tests N/A (no endpoints; callers own RBAC) |
| VI. Data integrity | ✅ | Recompute runs in the caller's tx; batch job uses one tx per batch; UTC ms |
| VII. Degradation | ✅ | No Redis/AI dependency |
| VIII. Simplicity | ✅ | No new dependencies |
| IX. Performance | ✅ | Indexed reads (`activities(lead_id, created_at)`, `purchases(customer_id)`); batched job |
| X. UX consistency | ✅ | Chips carry text + number; popover keyboard accessible; reduced motion respected |

**Gate result: PASS.**

## Project Structure

```text
specs/009-lead-scoring/   spec.md plan.md research.md data-model.md quickstart.md contracts/ tasks.md

packages/shared/src/
└── scoring.ts                  # scoreLead, slaStatus, explainScore, SCORING_WEIGHTS, PRIORITY_THRESHOLDS (new; owned)
packages/shared/src/index.ts    # append-only: export * from './scoring'
packages/shared/tests/scoring.test.ts

apps/web/server/services/
└── scoring.ts                  # loadScoreInput, recomputeLeadScore, recomputeFreshScores (new; owned)
apps/web/server/db/seed/score-step.ts   # sanctioned edit: body replaced with scoreLead()
apps/web/components/leads/score/
├── score-badge.tsx             # ScoreBadge + breakdown popover
├── sla-badge.tsx               # SlaBadge
└── index.ts
apps/web/tests/unit/
├── scoring-service.test.ts     # integration with in-memory DB
├── seed-distribution.test.ts   # non-blocking SC-003 report
└── score-components.test.tsx
```

**Structure decision**: only the owned paths from `docs/features/README.md`, plus the append-only barrel export and test files.

## Design

### Pure module (`packages/shared/src/scoring.ts`)
- Types `ScoreInput`, `ScoreResult`, `SlaInput` exactly as in F09 §4 (`Outcome`, `LeadSource`, `Priority`, `Stage` come from `enums.ts`).
- `SCORING_WEIGHTS` (intent weights, source table, customer, freshness tiers, engagement base, `unansweredPenalty: 3`, `messageMinChars: 30`, `purchaseWindowYears: 5`), `PRIORITY_THRESHOLDS = { HOT: 70, WARM: 40 }`, `SLA_TARGETS_MS = { HOT: 15 min, OTHER: 120 min }`, `SLA_DUE_SOON_FRACTION = 0.25`.
- Factors are small internal functions (intent, source, customer, freshness, engagement), each returning points and reasons; `scoreLead` sums, clamps, rounds and derives priority. Age uses `max(0, now - createdAt)`. Message length uses `[...message.trim()].length`. Budget "given" means min or max is greater than 0. An unknown source gives 0 points and a `console.warn`.
- Customer factor: `isReturning` +10; `lastPurchaseAt` within 5 years of `now` (5 × 365.25 days) +5.
- `slaStatus({stage, priority, createdAt, hasContact}, now)` returns `{status, deadline}`. `NA` when stage ≠ NEW or a contact exists; `BREACHED` when `now > deadline`; `DUE_SOON` when `now ≥ deadline − 25% of target`; otherwise `OK`.
- `isScoreFrozen(stage)` is true for WON and LOST.
- `explainScore` is a thin alias of `scoreLead`, so the UI can get reasons (only the 5-number breakdown is persisted).

### Server service (`apps/web/server/services/scoring.ts`)
- `loadScoreInput(tx, leadId)`: joins lead and customer; `lastPurchaseAt = max(purchases.purchased_at)`; reads the latest 20 USER activities (desc) and walks them to derive `lastPositiveOutcome` and `unansweredAttempts`. Activities with no outcome are skipped.
- `recomputeLeadScore(tx, leadId, now)`: a no-op for WON/LOST. Updates `score, priority, score_breakdown, updated_at` only when something differs. On a band change it inserts a SYSTEM `SCORE_CHANGED` activity (`metadata {from, to, score}`) and an audit entry through F01's `writeAudit` (actor null). It does not bump `leads.version`, because the score is derived data.
- `recomputeFreshScores(now)`: selects open and COLD leads with `created_at > now − 8 d`, paged by id in batches of 200, one `withTx` per batch. Returns `{ priorityChangedIds }`. The caller (F08 job) publishes events.

### Seed step
Replace the body of `seed/score-step.ts` so each lead's input is built from seed data and scored with `scoreLead(input, seedNow)`. A non-blocking test reports the SC-003 distribution.

### UI
- `ScoreBadge({score, priority, breakdown, reasons, updatedAt})`: chip "HOT 82" (red-600 / amber-500 / sky-500; text always shown) and a shadcn `Popover` with five value/max bars, the reasons, and footer "Rule-based score · updated …".
- `SlaBadge({status, deadline, now?})`: "Respond now · N min left" / "SLA breached · N min over"; pulse only under `motion-safe:`; renders nothing for `NA`.

## New dependencies
None.

## Complexity Tracking
No constitution violations.
