# Implementation Plan: Lead Intake, Dedupe, Routing & Auto-assign, Simulator

**Branch**: `010-lead-intake-routing` | **Date**: 2026-09-30 | **Spec**: [spec.md](spec.md)

**Input**: `specs/010-lead-intake-routing/spec.md`; authoritative source `docs/features/F10-lead-intake-routing.md` §9.

## Summary

One public, API-key-protected `POST /api/intake/leads` route handler runs the pipeline: content-type/size → key → rate limit → JSON → shared `IntakeLeadSchema` → honeypot → `intake.ingest()`. `ingest` does idempotency check → dedupe (E.164 phone, then email) → `scoreLead` (F09) → `resolveTeam` (sticky → country → round-robin) → `withTeamLock(teamId, tx(...))` (customer, lead + reference, SYSTEM activities, `last_assigned_at`, `rr_cursor`, audit) → publish `lead.created`/`lead.assigned` after commit. Pure selectors (`selectLoadBalanced`, `selectLanguageMatch`, `selectRoundRobin`) are unit-tested first. `pickAssignee` is exported for F11. A `tsx` simulator is a pure HTTP client.

## Technical Context

**Language/Version**: TypeScript strict, Node (per F01)

**Primary Dependencies**: Next.js App Router route handlers, Drizzle + better-sqlite3, ioredis (via F01 `server/redis/client.ts`), Zod (shared), `libphonenumber-js`, `@faker-js/faker`, `tsx`

**Storage**: SQLite (schema owned by F01, no changes); Redis for `rl:intake:*`, `lock:assign:*`, `rr:teams`, channel `leaddesk:events`

**Testing**: Vitest (unit + integration on temp SQLite, Redis mocked up/down), Playwright e2e (API-level intake journey; also checks the lead appears in the inbox if F04 is present)

**Target Platform**: Node server (Next.js), local dev on Windows/Linux

**Project Type**: web-service (route handler + services + CLI script) in the existing monorepo

**Performance Goals**: intake p95 < 150 ms (Redis up), < 250 ms degraded; event published < 300 ms after submit

**Constraints**: payload ≤ 10 KB; 60 req/min per key+IP; no schema changes; works with Redis down and without `ANTHROPIC_API_KEY`

**Scale/Scope**: 200 concurrent submissions give unique references and one assignment each; single SQLite writer

### New dependencies (justification)

| Package | Where | Justification |
|---|---|---|
| `libphonenumber-js` | apps/web | E.164 normalization is required for dedupe (already in the architecture stack table; F10 is its first consumer, F01 may add it) |
| `@faker-js/faker` | apps/web | Realistic EU-locale simulator data; already in the stack for the seed |
| `tsx` | apps/web (dev) | Runs `scripts/simulate.ts` without a build step |

No other dependencies. Argument parsing uses `node:util parseArgs`.

## Constitution Check

| Principle | Status |
|---|---|
| I Spec is truth | Pass. Any deviation is amended in `docs/features/F10-*.md` |
| II R1–R3 first | Pass. Intake feeds R1; no change to R1–R3 paths |
| III Layering | Pass. Route → Zod → API-key guard (no user session, so no `authorize`) → service → repository. Services import no Next.js APIs |
| IV Security | Pass. Constant-time key compare, CORS allowlist, rate limit, Zod, honeypot, size cap; no PII in logs; response leaks nothing internal |
| V Test-first | Pass. Unit tests for phone normalization, selectors, resolveTeam and reference format come before implementation. RBAC tests are replaced by 401/key tests because the endpoint is public and key-authenticated. An e2e journey is included |
| VI Integrity | Pass. One transaction for all writes; audit entry; append-only activities respected |
| VII Degradation | Pass. In-memory rate limiter, mutex and team round-robin when Redis is down; publish failures swallowed |
| VIII Simplicity | Pass. Three dependencies, each justified above |
| IX Performance | Pass. Indexed lookups (`customers(phone)`, `customers(email)`, `leads(owner_id, stage)`) |
| X UX | N/A (no UI); timeline copy specified |

Post-design re-check: pass.

## Project Structure

### Documentation

```text
specs/010-lead-intake-routing/
├── plan.md  research.md  data-model.md  quickstart.md  assumptions.md
├── contracts/ intake-api.md  simulator-cli.md
├── checklists/requirements.md
└── tasks.md
```

### Source Code (owned paths only)

```text
apps/web/
├── app/api/intake/leads/route.ts        # OPTIONS + POST (thin)
├── app/api/intake/_lib/                 # guards: api-key, cors, rate-limit, http mapping (inside owned app/api/intake/**)
├── server/services/dedupe.ts            # normalizePhone, normalizeEmail, findCustomer, mergeCustomer, customerFacts
├── server/services/routing.ts           # resolveTeam, pickAssignee, selectors, withTeamLock
├── server/services/intake.ts            # ingest orchestration, reference generator, event publishing
├── scripts/simulate.ts                  # CLI
└── tests/
    ├── unit/{dedupe,routing,reference,simulate-args}.test.ts
    ├── integration/intake-*.test.ts     # temp SQLite, Redis up/down, concurrency, CORS
    └── e2e/intake.spec.ts
```

Append-only shared touches: root `package.json` script `"simulate": "npm run simulate -w apps/web --"`, and `apps/web/package.json` (`simulate` script plus the three dependencies). `.env.example` already lists `INTAKE_API_KEYS` and `SHOWROOM_ORIGIN`.

**Structure Decision**: Reuse F01's layout. F10 adds files only under its owned paths.

## Key Design Decisions

1. **Order inside `ingest`**: idempotency lookup (key in metadata within 24 h, then implicit duplicate: same customer + model + open lead ≤ 10 min) runs before the lock. Dedupe, facts and scoring are computed before the lock. Only selection and writes run inside the lock and transaction, keeping lock hold time short.
2. **Team resolution** reads `teams.countries` (JSON). Sticky lookup: the customer's lead that is open, or has `last_activity_at` within 90 days, whose owner is an active user with role REP under `max_open_leads` (same eligibility as FR-013); the sticky team is that owner's team.
3. **Reference**: inside the transaction take the max sequence for `EDM-YYYY-%`, add 1, zero-pad to 5; on unique violation retry once. Exposed as `nextReference(tx, now)` so the seed can reuse it.
4. **Round-robin across teams**: Redis `INCR rr:teams` (in-memory counter fallback) modulo the ordered team list.
5. **Locking**: `withTeamLock` uses Redis `SET lock:assign:<id> token NX PX 5000` with 3 × 50 ms retries and token-checked release, always combined with an in-process per-team mutex. If the Redis lock is not obtained, warn and continue under the mutex.
6. **Events**: after commit, `bus.publish` inside try/catch. `lead.assigned` carries `strategy` and `reason` (see "Requires F01 change" in research.md).
7. **Errors** use F01 `AppError` and the JSON error shape; codes per contract.
8. **Logging** never includes email or phone; only the reference and key name.
