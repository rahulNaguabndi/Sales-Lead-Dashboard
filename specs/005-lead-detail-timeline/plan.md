# Implementation Plan: F05 — Lead Detail & Timeline

**Branch**: `005-lead-detail-timeline` | **Date**: 2026-09-30 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/005-lead-detail-timeline/spec.md`; source doc `docs/features/F05-lead-detail-timeline.md` §9.

## Summary

The lead detail page (`/leads/[id]`) is a Server Component that loads lead details and the first page of the merged USER/SYSTEM timeline, then hands over to TanStack Query. A three-column shell (collapsing to tabs under 1024 px) exposes named slots (`slots.tsx`) for later features. Two read-only endpoints back it: `GET /api/leads/:id` and `GET /api/leads/:id/activities` (keyset pagination over `(created_at, id)`). Authorization uses F03's `can()`/`authorize()`; deny maps to a 404 identical to "missing". No schema change, no writes.

## Technical Context

**Language/Version**: TypeScript 5 strict, Node ≥ 20
**Primary Dependencies** (all established by F01; **no new dependencies**): Next.js 14 App Router, TanStack Query, Zod, Drizzle ORM, Tailwind + shadcn/ui, lucide-react (icons named in the F05 doc; ships with shadcn/ui)
**Storage**: SQLite via Drizzle (read only). Reads `leads`, `customers`, `users`, `teams`, `activities`, `follow_ups`, `purchases`.
**Testing**: Vitest (unit + integration against seeded temp SQLite), Playwright (e2e)
**Target Platform**: Local dev; Redis not used by this feature (nothing to degrade); works with no `ANTHROPIC_API_KEY`
**Project Type**: Web app in the npm-workspaces monorepo (`apps/web`)
**Performance Goals**: `getLeadDetail` and first activities page p95 < 150 ms server time (constitution IX: < 300 ms); indexed by `activities(lead_id, created_at)`; no N+1 (history and actors loaded with joins/`IN` queries)
**Constraints**: Layering route → Zod → authorize → service → repository; viewing has no side effects; no PII in logs (security warning logs userId and leadId only)
**Scale/Scope**: ~800 leads; a lead has tens of activities

## Constitution Check

| Principle | Status | Notes |
|---|---|---|
| I. Spec is truth | ✅ | Plan follows F05 doc; deviations to be amended in the same branch |
| II. R1–R3 first | ✅ | Delivers R2 |
| III. Layering | ✅ | Handlers thin; `lead-detail.ts` service has no Next/React imports; SQL only in repository functions |
| IV. Security | ✅ | Server-side `authorize` on every read; 404 parity; Zod on params/query; plain-text rendering of user text |
| V. Test-first | ✅ | Unit tests (formatter, cursor, formatting) before impl; RBAC matrix; e2e |
| VI. Integrity | ✅ | Read-only; append-only activities untouched |
| VII. Degradation | ✅ | No Redis/AI dependency |
| VIII. Simplicity | ✅ | No new deps; slots as a plain record |
| IX. Performance | ✅ | Indexed keyset query, batched lookups |
| X. UX | ✅ | Loading/empty/error states; `role="feed"`; text on chips; 24 h times |

Gate: PASS. Re-checked after design: PASS.

## Project Structure

### Documentation

```text
specs/005-lead-detail-timeline/
├── plan.md, research.md, data-model.md, quickstart.md
├── contracts/api.md
├── assumptions.md, checklists/requirements.md
└── tasks.md
```

### Source Code (owned paths only; `apps/web`)

```text
app/(app)/leads/[id]/{page.tsx, layout.tsx, not-found.tsx}
app/api/leads/[id]/route.ts                              # GET (F05)
app/api/leads/[id]/activities/handlers/get.ts            # replaces F01 501 stub
server/services/lead-detail.ts                           # getLeadDetail, listActivities
components/leads/detail/{LeadHeader,CustomerCard,InterestCard,HistoryCard,ScoreCard,
                        ScoreBreakdownPopover,DetailLayout}.tsx, slots.tsx
components/timeline/{Timeline,TimelineDayGroup,TimelineEntry,SystemEntry,
                     TimelineControls,RelativeTime}.tsx, formatSystemActivity.ts, cursor.ts
tests/ (unit, integration) + tests/e2e/lead-detail.spec.ts
```

Shared files touched append-only: none expected beyond `packages/shared` imports (read only). The repository queries live inside `server/services/lead-detail.ts`'s sibling repository module `server/repositories/lead-detail.repo.ts` if the F01 layout has a repositories dir; otherwise inside the service file's data-access section (owned path either way).

**Structure Decision**: Follow F01's layout; keep everything within F05 owned paths.

## Design Decisions

1. **Auth flow**: `getLeadDetail(user, id)`: validate id is a ULID (else `NotFoundError`, no query) → load lead → `authorize(user,'lead:read',lead)`; on deny log `warn {userId, leadId}` and throw `NotFoundError` with the same message as missing. `listActivities` runs the same check first.
2. **Permissions object**: computed with `can()` for `lead:read`, `activity:create`, `lead:changeStage`, `lead:assign`, `lead:claim`.
3. **Keyset cursor**: base64url of `createdAt:id`; desc uses `(created_at, id) < (?, ?)`, asc uses `>`; fetch `limit+1` to derive `nextCursor`. Invalid cursor → 400 `VALIDATION`.
4. **Actors**: batch-load actor rows with one `IN` query; inactive → `(inactive)` suffix in UI; null actor → "System".
5. **Client**: page RSC prefetches and dehydrates into a `HydrationBoundary`; `useQuery(['lead', id])` and `useInfiniteQuery(['lead', id, 'activities', {order, kind}])`. Order preference in localStorage key `leaddesk.timeline.order`, read after mount to avoid hydration mismatch.
6. **Slots**: `leadSlots` record from the F05 doc; `DetailLayout` renders each present slot with `LeadSlotProps`.
7. **Formatting**: use shared `format.ts` (EUR de-DE, phone) from `@leaddesk/shared`; add helpers only if absent, inside F05 paths.
8. **Same-wave soft deps**: F04's `RelativeTime` is reused if present, else F05's own `components/timeline/RelativeTime.tsx`. F03 `authorize`/`can` and F02 `getSessionUser` are coded against their spec interfaces and stubbed until merge.
9. **Score labels**: F09 labels absent until merge; popover shows component names and values with max values from the doc.

## New Dependencies

None. (lucide-react is already part of the shadcn/ui setup from F01.)

## Complexity Tracking

No violations.
