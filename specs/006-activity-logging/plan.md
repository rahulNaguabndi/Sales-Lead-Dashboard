# Implementation Plan: F06 — Activity Logging

**Branch**: `006-activity-logging` | **Date**: 2026-09-30 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/006-activity-logging/spec.md`; technical input from `docs/features/F06-activity-logging.md` §9.

## Summary

A composer pinned above the lead timeline that posts one activity to `POST /api/leads/:id/activities`. The service runs FR-003 steps 1–11 in a single synchronous better-sqlite3/Drizzle transaction (activity, attempt counter, first response, auto-advance, explicit stage change, follow-up create/complete, score recompute, version bump, audit). Events publish after commit. The client uses TanStack `useMutation` with optimistic insert and rollback.

## Technical Context

**Language/Version**: TypeScript 5.x strict, Node ≥ 20
**Primary Dependencies**: Next.js App Router, Zod, Drizzle + better-sqlite3, TanStack Query, shadcn/ui + Tailwind, `ulid`, `sonner` (toasts). **No new dependencies.** A small context-based store is used for `useComposer` instead of adding zustand (Constitution VIII).
**Storage**: SQLite (WAL). **No schema changes** (F01 owns it). Idempotency uses `json_extract(metadata,'$.clientRequestId')` on `activities`, with the existing `activities(lead_id, created_at)` index bounding the scan to a 10-minute window.
**Testing**: Vitest unit and integration (temp-file SQLite), Playwright e2e (`tests/e2e/core-loop.spec.ts`, shared with F04/F05).
**Project Type**: web application (monorepo)
**Performance Goals**: optimistic entry < 100 ms; server p95 < 150 ms locally.
**Constraints**: works with Redis stopped (bus falls back in-process; publish errors are swallowed and logged); works without `ANTHROPIC_API_KEY` (not used); no PII in logs.
**Scale/Scope**: demo scale.

### Dependencies on other features (contracts, stubbed if absent at build time)
| Feature | Contract used |
|---|---|
| F01 | `stage-machine.ts` (`canTransition`, `autoAdvance`, `isContactActivity`), `writeAudit(tx, …)`, `bus.publish`, `AppError`, schema, `route.ts` delegating to `handlers/post.ts` |
| F02 | `getCurrentUser()`, Origin/CSRF check helper |
| F03 | `authorize(user, 'activity:create', lead)` (404 if unreadable, 403 if not permitted) |
| F09 | `scoreLead(input)` (pure, total) |
| F05 | `leadSlots.composer` registration in `components/leads/detail/slots.tsx` (append-only); timeline query keys `['lead', id, 'activities', …]`, `['lead', id]` |
| F07 (later) | `server/services/stage.ts#transition`; until it exists F06 performs explicit stage changes inline via the shared state machine |

## Constitution Check

| Principle | Status |
|---|---|
| I Spec is truth | Pass: FR numbers carried over; deviations amend `docs/features/F06` |
| II R3 first | Pass: this feature is R3; core-loop e2e included |
| III Layering | Pass: handler (auth, Zod) → policy → service → Drizzle; the service imports nothing from Next.js |
| IV Security | Pass: server-side `authorize`, Zod at boundary, Origin check, body ≤ 16 KB, plain-text notes |
| V Test-first | Pass: truth-table unit tests precede implementation; RBAC tests for REP/MANAGER/VP in and out of scope |
| VI Integrity | Pass: single transaction, append-only, audit entry, UTC ms |
| VII Degradation | Pass: publish failures never fail the request |
| VIII Simplicity | Pass: no new deps, no speculative abstraction |
| IX Performance | Pass: indexed lookups only |
| X UX | Pass: loading/error states, keyboard access, text plus icon on type buttons |

Re-check after design: no violations.

## Project Structure

### Documentation
```text
specs/006-activity-logging/
├── spec.md · plan.md · research.md · data-model.md · quickstart.md · tasks.md
├── assumptions.md
└── contracts/post-activity.md
```

### Source (owned paths only)
```text
packages/shared/src/schemas/activity.ts        # CreateActivitySchema, response types (append-only)
apps/web/server/services/activity.ts           # logActivity, nextAttemptCount, isAllowedOpenTransition
apps/web/app/api/leads/[id]/activities/handlers/post.ts
apps/web/components/leads/composer/
├── ActivityComposer.tsx · TypeSegmentedControl.tsx · OutcomeSelect.tsx
├── FollowUpPicker.tsx · StageSelect.tsx · CompleteFollowUpCheckbox.tsx
├── useLogActivity.ts · useComposer.tsx · quick-picks.ts · index.ts
apps/web/components/leads/detail/slots.tsx     # append-only: register composer
apps/web/tests/unit/ · tests/integration/ · tests/e2e/core-loop.spec.ts
```

**Structure decision**: only the paths F06 owns in `docs/features/README.md` plus the sanctioned append-only `slots.tsx` and shared-schema edits. `route.ts` is not edited.

## Key design decisions
1. **Transaction**: `db.transaction(() => …)` (synchronous). Throwing at any step rolls back everything. The fault-injection test uses an injectable step hook (`opts.onStep?(name)`) so that tests can throw at each step.
2. **Idempotency**: inside the transaction, look for an activity with the same lead and `clientRequestId` created within 10 minutes; if found, rebuild and return the original payload (including the system activities and follow-up created in that commit, found via metadata `clientRequestId` copied onto system rows) without writing.
3. **Stale check**: only when `stageChange` is present and `expectedVersion` is supplied. A mismatch throws 409 `STALE_LEAD` with `{currentVersion, updatedBy}` (updatedBy from the latest `audit_log`/stage_history actor).
4. **Explicit stage change**: targets restricted to open stages; validated with `canTransition` (after auto-advance). WON/LOST → 422 `INVALID_TRANSITION`. On closed leads, contact types do not change stage.
5. **Score**: `scoreLead` snapshot built from the updated lead, customer `is_returning`, recent purchase, last outcome, attempt count, `now`. A band change writes a SYSTEM `SCORE_CHANGED` activity.
6. **Events after commit**: `activity.created` for each inserted row in order, then one `lead.updated`; wrapped in try/catch with a warning log.
7. **Sanitization**: strip control chars other than `\n`, `\t` server-side (in the schema transform), then trim.
8. **Client**: `useLogActivity` `onMutate` inserts an optimistic row (marked pending) into every `['lead', id, 'activities', …]` cache, `onError` restores the snapshot and toasts while the form retains values, `onSuccess` swaps in the server rows, patches `['lead', id]`, and invalidates `['leads']`. `clientRequestId` (ULID) is generated once per form submission attempt and reused on retry.
9. **`useComposer()`**: a React context exposing `prefill()` and `focus()`; provided by `ActivityComposer`'s wrapper registered in the slot.

## Complexity Tracking

No constitution violations to justify.
