# Implementation Plan: F08 — Follow-ups & Going-Cold Detection

**Branch**: `008-follow-ups-cold` | **Date**: 2026-09-30 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/008-follow-ups-cold/spec.md`

## Summary

Reps schedule, complete, snooze and cancel follow-ups; a Due Today / Overdue worklist feeds the inbox chips; two `setInterval` jobs (sweeper, cold-detector) plus a score-freshness scheduler run once per process from `instrumentation.ts` under a Redis `SET NX PX` lock (no-lock fallback). At-risk is derived at read time via pure rule functions; COLD is persisted through F07's `stageService.transition` with `changedBy=null`. Cadence guidance is a pure function. All rules are shared constants in `packages/shared/src/followup-rules.ts`, env-overridable.

## Technical Context

**Language/Version**: TypeScript (strict), Node ≥ 20

**Primary Dependencies**: Next.js App Router (route handlers, `instrumentation.ts`), Drizzle ORM, Zod, ioredis (via F01 `server/redis`), TanStack Query (UI). **No new dependencies.**

**Storage**: SQLite (WAL) via Drizzle. `follow_ups`, `leads`, `activities`, `stage_history` already exist (F01). **No schema change.**

**Testing**: Vitest (pure rules with fixed `now`, service tests on in-memory SQLite, job tests with fake timers), RBAC tests per endpoint, Playwright (schedule → appears under Due Today).

**Target Platform**: Node server (Windows/macOS/Linux), browser UI.

**Project Type**: web application inside the existing npm-workspaces monorepo.

**Performance Goals**: list endpoint uses `follow_ups(assigned_to, status, due_at)` index; cold-detector batch ≤ 200 leads per run, one query with `leads(stage, last_contact_at)` index; no N+1 (lead/customer joined in one query).

**Constraints**: stay in F08 owned paths; append-only edits to shared files (`slots.tsx`, `packages/shared` index exports, `instrumentation.ts` registration); works with Redis down and with no AI key.

**Scale/Scope**: ~800 leads, tens of follow-ups per rep; jobs every 60 s / 5 min.

## Constitution Check

| Principle | Status |
|---|---|
| I Spec source of truth | Pass. Deviations (below) are amended in `docs/features/F08` at implementation time |
| II R1–R3 first | Pass. F08 only adds optional hooks into the composer and inbox chips; no change to R1–R3 paths |
| III Layering | Pass. Route → Zod → `authorize` → `followupService` → repository; rules are pure in `packages/shared` |
| IV Security | Pass. `lead:write` on parent lead for every mutation; list scoped to current user (managers within scope); Zod at boundary |
| V Test-first | Pass. Rules and cadence tests precede implementation; RBAC + Playwright included |
| VI Integrity | Pass. Create + supersede + activity in one transaction; each auto-COLD in its own transaction; UTC ms; audit entries written via F01 `audit.ts` |
| VII Degradation | Pass. Lock and notify-dedupe fall back to in-memory when Redis is down |
| VIII Simplicity | Pass. `setInterval`, no BullMQ, no new deps |
| IX Performance | Pass. Indexed queries only |
| X UX | Pass. Loading/empty/error states, text with colour (red + clock icon + "overdue") |

**Post-design re-check**: unchanged, all pass.

## Deviations / decisions recorded

1. **System-entry types.** The domain enum has no SYSTEM `NOTE`. "Follow-up marked done without activity", snooze (`metadata.rescheduledFrom`), cancel and supersede are recorded as SYSTEM `FOLLOW_UP_SCHEDULED` activities distinguished by `metadata.action` (`scheduled | snoozed | done_without_activity | cancelled | superseded`). No schema change; F08 doc to be amended.
2. **Stubs for same-wave deps.** `stageService.transition(leadId, {to:'COLD', changedBy:null, reason})` (F07) and `recomputeFreshScores()` (F09) are called through thin adapters in `server/jobs/deps.ts` that dynamically import the real modules and fall back to a logged no-op/stub if missing.
3. **Composer integration** (`nextFollowUp`, `completeFollowUpId`) is executed inside F06's activity transaction by calling `followupService.createInTx / completeInTx(tx, …)`; F06 owns the call site.

## Project Structure

### Documentation (this feature)

```text
specs/008-follow-ups-cold/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── assumptions.md
├── contracts/followups-api.md
├── checklists/requirements.md
└── tasks.md
```

### Source Code (owned paths only)

```text
packages/shared/src/
└── followup-rules.ts            # constants, env overrides, isAtRisk, shouldAutoCold, cadence.next, idleDays (pure)

apps/web/
├── instrumentation.ts           # append-only: start jobs (register())
├── server/
│   ├── services/followup.ts     # create, complete, snooze, cancel, listForUser, reassignPending, createInTx, completeInTx
│   └── jobs/
│       ├── index.ts             # startJobs(): global guard, JOBS_ENABLED, lock, run logging
│       ├── lock.ts              # Redis SET NX PX 55000 with in-memory fallback
│       ├── deps.ts              # F07/F09 adapters (see decision 2)
│       ├── followup-sweeper.ts  # MISSED + due-soon emit (dedupe)
│       ├── cold-detector.ts     # auto-COLD, batch 200
│       └── score-freshness.ts   # every 5 min → recomputeFreshScores()
├── app/api/
│   ├── leads/[id]/follow-ups/route.ts   # POST
│   └── follow-ups/
│       ├── route.ts                     # GET ?view=today|overdue|upcoming[&owner=]
│       └── [id]/route.ts                # PATCH complete|snooze|cancel
├── components/followups/
│   ├── followup-card.tsx        # "Next follow-up" card + cadence line (registered in slots.tsx)
│   ├── schedule-popover.tsx     # quick picks + custom
│   ├── due-today-widget.tsx     # list with overdue first
│   ├── at-risk-badge.tsx
│   └── quick-picks.ts           # local-time pick computation
└── tests/{unit,service,jobs,rbac,e2e}/followups*
```

**Structure Decision**: single feature slice inside the existing monorepo, restricted to F08 owned paths; shared-file edits are append-only.

## Key Design Points

- **Rules (pure)**: `idleReference(lead) = coalesce(lastContactAt, createdAt)`; `isAtRisk(lead, now)`; `shouldAutoCold(lead, hasFutureFollowUp, now)` → `{cold:boolean, reason:'No activity 7 days'|'3 unanswered attempts'|null}`; unanswered rule wins and ignores future follow-up; open stages only. Env overrides parsed once with Zod (fractions allowed).
- **Supersede**: in a transaction, cancel existing PENDING for `(lead, assignee)` with note "Superseded", insert the new one, write the `FOLLOW_UP_SCHEDULED` activity and audit entry.
- **Validation**: `dueAt > now − 60 s tolerance` and `≤ now + 90 d`; error "Pick a future time".
- **Sweeper**: single UPDATE…RETURNING of MISSED candidates (`due_at < now − MISSED_AFTER`), an activity per row; due-soon emit with `fu:notified:<id>` (SET NX EX 3600, in-memory Set fallback); event `followup.due` to owner through F01 bus.
- **Cold detector**: candidate query (open stages, idle ≥ threshold or `attempt_count ≥ 3`, LIMIT 200), per-lead transaction, `AUTO_COLD` activity, `lead.updated` event.
- **Jobs bootstrap**: `globalThis.__ldJobs` guard; each run wrapped by the lock and logs `{job, processed, durationMs}`; errors caught so the interval survives.
- **Reassign hook**: `reassignPending(leadId, toUserId)` exported for F11; F07 closure cancellation calls `cancelAllForLead`.

## New dependencies

None.

## Complexity Tracking

No constitution violations.
