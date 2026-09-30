# Implementation Plan: F07 — Stage Pipeline, Won/Lost & Kanban

**Branch**: `007-stage-pipeline` | **Date**: 2026-09-30 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/007-stage-pipeline/spec.md`

## Summary

Server-side enforced lead stage machine with closing data (WON deal value + purchase, LOST reason), optimistic concurrency, timeline/stage-history records, follow-up cancellation, and a `/pipeline` Kanban board. A single `stageService.transition(ctx, leadId, input)` is the only write path; it is exposed via `PATCH /api/leads/:id/stage` and reused by F06 (auto-advance/revive) and F08 (auto-COLD). Pure transition rules live in F01's `packages/shared/src/stage-machine.ts` (F07 appends helpers only).

## Technical Context

**Language/Version**: TypeScript 5.x strict, Node ≥ 20

**Primary Dependencies**: Next.js App Router, Drizzle + better-sqlite3, Zod (shared), TanStack Query, shadcn/ui, Sonner (all from F01). **New**: `@dnd-kit/core` (+ `@dnd-kit/utilities`) — maintained, accessible drag-and-drop with keyboard + touch sensors (F07 Decision 5).

**Storage**: SQLite; **no schema change** (uses `leads`, `stage_history`, `activities`, `follow_ups`, `purchases`, `customers`, `offers`).

**Testing**: Vitest (transition matrix, service, RBAC/route), Playwright (drag persists).

**Target Platform**: Web (desktop + touch).

**Project Type**: Web application inside npm-workspaces monorepo.

**Performance Goals**: stage change reflected in < 500 ms locally; pipeline board query < 300 ms with seed data (indexed on `leads(owner_id, stage)`, `leads(stage, ...)`).

**Constraints**: layering route → Zod → authorize → service → repository; single transaction for multi-row writes; money in integer cents; works with Redis down and no `ANTHROPIC_API_KEY`; publish events after commit.

**Scale/Scope**: ≤ 200 cards per open column; ~800 seed leads.

## Constitution Check

| Principle | Status |
|---|---|
| I Spec is truth | PASS — spec derived from `docs/features/F07`; doc amended if behavior deviates |
| II R1–R3 first | PASS — F07 is additive; the detail page consumes only registered slots |
| III Layering | PASS — thin route; service has no Next imports; DB only via repositories |
| IV Security | PASS — `authorize()` on every path (`lead:changeStage`, `lead:reopen`); Zod at boundary |
| V Test-first | PASS — matrix + service tests precede implementation; RBAC and Playwright included |
| VI Integrity | PASS — one transaction; audit entry; cents; UTC ms; no schema change |
| VII Degradation | PASS — event bus/cache fall back per F01; scoring/offer stubs degrade to no-op |
| VIII Simplicity | PASS — one new dependency, justified above |
| IX Performance | PASS — indexed board query, capped columns |
| X UX | PASS — loading/empty/error states, text chips, keyboard `M` menu |

Post-design re-check: PASS (no violations).

## Project Structure

### Documentation

```text
specs/007-stage-pipeline/
├── plan.md  research.md  data-model.md  quickstart.md  assumptions.md
├── contracts/stage-api.md
├── checklists/requirements.md
└── tasks.md
```

### Source Code (owned paths only)

```text
packages/shared/src/
├── stage-machine.ts          # F01-owned; F07 APPENDS: allowedTargets(), requiresManager(), STAGE_LABELS helpers
└── schemas/stage.ts          # F07: StageChangeSchema (discriminated union on `to`) + re-export (append-only in index)

apps/web/
├── server/services/stage.ts                  # transition(), listPipeline()
├── app/api/leads/[id]/stage/route.ts         # PATCH
├── app/api/pipeline/route.ts                 # GET columns
├── app/(app)/pipeline/page.tsx               # board page
├── components/leads/stage/
│   ├── StageSelect.tsx  WonDialog.tsx  LostDialog.tsx
│   ├── KanbanBoard.tsx  KanbanCard.tsx  MoveMenu.tsx
│   └── use-stage-mutation.ts
└── tests/
    ├── unit/stage-machine.test.ts  unit/stage-service.test.ts  unit/stage-route-rbac.test.ts
    └── e2e/pipeline.spec.ts
```

**Shared-file edits (append-only)**: nav entry for `/pipeline` (F01 layout nav config), slot registration for `StageSelect` in `components/leads/detail/slots.tsx` (F05), export lines in `packages/shared/src/index.ts`, `package.json` dependency.

**Structure Decision**: Web application; no new packages.

## Design notes

- `transition(ctx, leadId, input)`: load lead → `authorize` (reopen requires `lead:reopen`) → same-stage no-op → `canTransition(from,to,role,{system})` else 422 INVALID_TRANSITION → validate closing data → in one Drizzle transaction: `UPDATE leads … WHERE id=? AND version=?` (0 rows ⇒ 409 with current lead), insert `stage_history`, insert `STAGE_CHANGED` activity (+ `OFFER_APPLIED`), on WON insert `purchases` + set `customers.is_returning`, on WON/LOST cancel PENDING follow-ups, on revive reset `attempt_count`, on reopen clear closing fields → after commit: rescore via F09 adapter (`SCORE_CHANGED` on band change), publish `lead.updated` + `activity.created`, audit entry, cache invalidation of `dash:*` (no-op until F20).
- Internal callers (F06/F08) pass `ctx.system = true` and may omit `version`; F06 can join an existing transaction via optional `ctx.tx`.
- Offer validation goes through `offerMatcher.matchOffers(lead)` behind a local stub interface (returns `[]` until F15 merges).
- Kanban: `GET /api/pipeline?owner=&source=&priority=` returns `{columns:[{stage,count,valueCents,leads,more}]}` using the caller's scope; WON/LOST limited to `closed_at` ≥ now−30d; open columns capped at 200 by score desc.
- UI: TanStack Query optimistic mutation with rollback on 409/422; dnd-kit `PointerSensor` (distance), `TouchSensor` (long-press delay), `KeyboardSensor`; `M` opens Move-to menu.

## Dependencies

| Package | Justification |
|---|---|
| `@dnd-kit/core`, `@dnd-kit/utilities` | Accessible, maintained drag-and-drop with keyboard/touch sensors for the Kanban |

## Complexity Tracking

None.
