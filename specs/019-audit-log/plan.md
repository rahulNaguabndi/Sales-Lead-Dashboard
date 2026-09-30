# Implementation Plan: F19 — Audit Log & Traceability UI

**Branch**: `019-audit-log` | **Date**: 2026-09-30 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/019-audit-log/spec.md`

## Summary

F19 adds the read side of the audit log: a scoped, keyset-paginated `GET /api/audit`, pure `summarize`/`resolveRefs` helpers, and a `/audit` page (URL-driven filters, expandable diff rows). It also verifies F01's writer contract (`audit.record(entry, tx)`, redaction, append-only triggers) via tests and ships an `expectAudited` conformance helper. No schema change: `meta`, the indexes and the triggers are supplied by F01.

## Technical Context

**Language/Version**: TypeScript (strict), Node ≥ 20
**Primary Dependencies**: Next.js App Router, Drizzle ORM (better-sqlite3), Zod, TanStack Query, shadcn/ui + Tailwind — all already in the stack. **No new dependencies.**
**Storage**: SQLite (WAL), existing `audit_log`, `users`, `leads`, `offers`, `teams` tables (read-only from F19)
**Testing**: Vitest (scope predicate, keyset pagination, redaction, summarize, rollback), Playwright (reassign → audit trail → diff)
**Target Platform**: Web (Next.js monolith)
**Project Type**: web application (monorepo `apps/web`)
**Performance Goals**: 50-row page < 150 ms p95 with 20k entries (SC-003)
**Constraints**: Redis is not used (no caching; degrades trivially). Read-only. F19 files only in owned paths.
**Scale/Scope**: one page, one endpoint, one service, ~6 components

## Constitution Check

| Principle | Status |
|---|---|
| I Spec is truth | Pass — spec derives from docs/features/F19 |
| II R1–R3 first | Pass — read-only additive feature; adds append-only slot link only |
| III Layering | Pass — route → Zod → policy authorize → `services/audit.ts` → Drizzle queries in the service's repository section; service imports no Next.js |
| IV Security | Pass — server-side 403 for REP, scope predicate parameterised (no string concat), no secrets/PII surfaced (emailHash only) |
| V Test-first | Pass — pure logic tests precede implementation; RBAC tests REP/MANAGER/VP in/out of scope; Playwright journey |
| VI Integrity | Pass — no writes; verifies same-tx and append-only behaviour |
| VII Degradation | Pass — no Redis/AI dependency |
| VIII Simplicity | Pass — no new deps, no new abstractions |
| IX Performance | Pass — keyset pagination, existing indexes, batch ref resolution (no N+1) |
| X UX | Pass — loading/empty/error states, "changed" marker not colour only, relative time with absolute tooltip |

Re-check after design: no violations.

## Project Structure

### Documentation (this feature)

```text
specs/019-audit-log/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── assumptions.md
├── contracts/audit-api.md
├── checklists/requirements.md
└── tasks.md
```

### Source Code (owned paths only)

```text
apps/web/
├── server/services/audit.ts            # queryAudit, scope predicate, summarize, resolveRefs, cursor codec
├── server/services/audit.test.ts       # unit + integration (Vitest)
├── server/services/audit.testing.ts    # expectAudited conformance helper (test-only)
├── app/api/audit/route.ts              # GET, thin handler
├── app/(app)/audit/page.tsx            # server component: authorize, redirect/403
├── components/audit/
│   ├── AuditPage.tsx  AuditFilterBar.tsx  AuditTable.tsx
│   ├── AuditRow.tsx   DiffPanel.tsx       ActorCell.tsx
│   └── labels.ts                       # field/enum human labels + value formatters
└── e2e/audit.spec.ts                   # Playwright (reassign → audit trail)
```

**Shared, append-only edits**: nav entry "Audit" (MANAGER/VP, shield icon) in F01's layout nav registry; "Audit trail" link registration in `components/leads/detail/slots.tsx` (F05); `AuditAction`/`AuditEntity` enum additions in `packages/shared` if F01 lacks any; Zod filter schema exported from `packages/shared` only if needed by both sides (otherwise kept in the route/service).

**Structure Decision**: Follow the architecture doc's layering; single service file holds query, scope and pure helpers.

## Design Decisions

1. **Scope predicate** (FR-007): `LEFT JOIN leads l ON al.entity='lead' AND l.id=al.entity_id`; MANAGER: `(l.team_id IN :teamIds) OR al.actor_id IN :scopeUserIds OR (al.entity='team' AND al.entity_id IN :teamIds) OR al.actor_id = :self`, and `al.entity <> 'offer'`. VP: no predicate. REP: rejected before querying. `teamIds`/`scopeUserIds` from F03 `scopeFor(user)`; if F03's interface differs at merge, adapt in one adapter function.
2. **Keyset pagination**: order `created_at DESC, id DESC`; cursor = base64url(`created_at|id`); `(created_at, id) < (?, ?)` written as `created_at < ? OR (created_at = ? AND id < ?)`. Fetch `limit+1` to compute `nextCursor`.
3. **Filters**: Zod-validated; `action` ending `.*` becomes prefix `LIKE 'lead.%'` (escaped); `leadRef` resolves via `leads.reference` to entity id(s); invalid → 400 `INVALID_FILTER`.
4. **Summaries/resolution**: `summarize(entry)` pure; `resolveRefs(entries)` batch-loads user names (and offer titles) once per page.
5. **Malformed JSON**: parse defensively; unparsable value flagged `raw` and shown as-is.
6. **Truncation**: values >500 chars truncated in UI with "Show more".
7. **Enum/labels**: `labels.ts` maps field keys and stage enums; money via `lib/format.ts` (F01).

## Dependencies

No new packages. Upstream code contracts: F01 (`audit.record`, table, triggers, `lib/format.ts`), F03 (`scopeFor`, `authorize`), F05 (slots registration), F02 (session).

## Complexity Tracking

None.
