# Implementation Plan: F12 — Live Updates

**Branch**: `012-live-updates` | **Date**: 2026-09-30 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/012-live-updates/spec.md`

## Summary

A Node-runtime SSE endpoint (`GET /api/events`) streams domain events to each signed-in user, filtered by
that user's F03 scope. A per-process hub subscribes once to the F01 event bus (Redis pub/sub
`leaddesk:events`, in-process fallback), assigns each event a ULID, keeps a 500-event ring buffer, and
fans events out to its open connections through a pure `filterFor(scope)` predicate. On the client one hook
(`useLiveEvents`) opens an `EventSource`, maps events to debounced TanStack Query invalidations, Sonner
toasts and a highlight store, and drives a connection-status dot. No schema changes.

## Technical Context

**Language/Version**: TypeScript 5.x strict, Node ≥ 20 (Next.js App Router, route handler on `runtime = 'nodejs'`)

**Primary Dependencies**: existing only: Next.js, TanStack Query, Sonner (installed by F01), Zod, `ulid` (in the stack table), F01 `bus`, F03 `scopeFor`, F02 `getCurrentUser()`. **No new dependencies.** The client store uses React `useSyncExternalStore` (a ~30-line store) instead of adding Zustand.

**Storage**: none (in-memory ring buffer and connection registry only)

**Testing**: Vitest (filter, hub, route integration with a fake bus), Playwright (two browser contexts)

**Target Platform**: local dev machine and a single or multi-process Node server

**Project Type**: web application slice inside the existing monorepo (`apps/web`)

**Performance Goals**: intake → toast < 2 s p95 locally (SC-001); filter cost O(1) per event per connection using `Set` lookups

**Constraints**: no cross-scope leaks (SC-002); works with Redis stopped (SC-004); 25 s heartbeat; ≤ 5 streams per user; stay within F12's owned paths

**Scale/Scope**: demo scale (16 users, a handful of tabs); the hub is per-process, and Redis pub/sub makes multi-process fan-out work

## Constitution Check

| Principle | Status | Note |
|---|---|---|
| I. Spec is truth | ✅ | The F01 event shape differs slightly from F12 §9's example (see research D6). The F12 doc is amended during implementation if behavior deviates |
| II. Mandatory R1–R3 first | ✅ | Additive, no changes to R1–R3 paths. The stub `useInboxLive()` keeps its signature |
| III. Layered architecture | ✅ | The route handler is thin (auth → hub). Hub and filter are server modules without Next imports and without DB access, except scope via F03 |
| IV. Security | ✅ | Server-side filtering per subscriber, cookie auth, 401 without a stream, scope refresh closes revoked sessions, payloads are never logged |
| V. Test-first | ✅ | `filterFor` and hub tests are ordered before implementation. The leak test covers REP/MANAGER/VP, in-scope and out-of-scope |
| VI. Data integrity | ✅ | No writes. Producers publish post-commit (FR-009) |
| VII. Graceful degradation | ✅ | Bus fallback is F01's. Client polling fallback (FR-018) |
| VIII. Simplicity | ✅ | No new deps, no Zustand, no BroadcastChannel |
| IX. Performance | ✅ | Debounced invalidation, in-memory fan-out |
| X. UX consistency | ✅ | Status dot with text and tooltip, reduced-motion highlight |

Post-design re-check: still passing. No violations, so no Complexity Tracking entries.

## Project Structure

### Documentation (this feature)

```text
specs/012-live-updates/
├── plan.md · research.md · data-model.md · quickstart.md · assumptions.md
├── contracts/  (sse-endpoint.md, client-events.md)
├── checklists/requirements.md
└── tasks.md
```

### Source Code (F12-owned paths under `apps/web`)

```text
app/api/events/route.ts              GET handler: auth, stream, heartbeat, abort cleanup
lib/sse/
├── filter.ts                        filterFor(scope) pure predicate + Scope type
├── hub.ts                           registry, ring buffer, broadcast, per-user limit, scope refresh, bus subscription (globalThis singleton)
├── wire.ts                          SSE frame encoding (id/event/data, retry, comment)
├── liveStore.ts                     client store: status, highlighted ids, last-updated-by (useSyncExternalStore)
├── invalidation.ts                  pure event → query-key mapping + debounced invalidator
└── useLiveEvents.ts                 EventSource hook, reconnect/resync, offline polling fallback
components/live/
├── LiveProvider.tsx                 mounts useLiveEvents once + LiveToaster
├── LiveStatusDot.tsx                Live / Reconnecting… / Offline with tooltip and text
├── LiveToaster.tsx                  toast rules (FR-012), grouping
├── useRowHighlight.ts               reads liveStore, honors reduced motion
└── UpdatedByNote.tsx                "Updated by X just now" note and reassignment banner
tests/unit/sse/*.test.ts · tests/e2e/live-updates.spec.ts
```

**Structure Decision**: all logic lives in `lib/sse` and `components/live`. Shared-file touches are append-only
and listed below.

### Cross-owner edits (sanctioned or append-only)

| File | Owner | Edit |
|---|---|---|
| `components/leads/inbox/live-slot.ts` | F04 | replace the **body only** of `useInboxLive()` (signature unchanged) |
| `app/(app)/layout.tsx` (or the F01 shell) | F01 | one append: render `<LiveProvider />` |
| `components/layout/` top bar | F01 | one append: render `<LiveStatusDot />` |
| `components/leads/detail/slots.tsx` | F05 | append-only registration of `UpdatedByNote` |

If any host file is missing at build time, the implementation stubs the mount point and logs it in REPORT.md.
