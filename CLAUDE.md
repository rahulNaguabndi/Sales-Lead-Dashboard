# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Setup
docker compose up -d redis          # required before dev
npm install
npm run db:reset                    # migrate + seed (deterministic, SEED=42)

# Development
npm run dev                         # web :3000 + showroom :3001 concurrently
npm run dev:web                     # web only
npm run dev:showroom                # showroom only

# Verification (run before every merge)
npm run lint                        # ESLint, max-warnings 0
npm run typecheck                   # tsc --noEmit across all workspaces
npm test                            # vitest run (all unit + integration)
npm run test:e2e                    # Playwright

# Run a single test file
npx vitest run apps/web/tests/unit/stage-machine.test.ts

# Database
npm run db:generate                 # generate Drizzle migration from schema change
npm run db:migrate                  # apply migrations
npm run db:seed                     # seed only (without reset)

# Simulator (streams demo leads to the intake API)
npm run simulate -- --count 5
npm run format                      # Prettier write

# AI eval (dev only)
npm run eval:ai -w apps/web
```

Copy `apps/web/.env.example` → `apps/web/.env` before first `dev` or e2e run.

Demo users: `isabelle.laurent@eurodrive.test` (VP), `lukas.becker@eurodrive.test` (Manager), `sofia.rossi@eurodrive.test` (Rep). Password: `demo1234`.

## Architecture

**Monorepo** (`npm workspaces`): `apps/web` (Next.js 14, App Router, port 3000), `apps/showroom` (Vite + React, port 3001), `packages/shared` (shared Zod schemas, enums, event types, stage-machine, scoring weights).

### Strict layering in `apps/web`

```
route handler → Zod validate → policy.authorize() → service → repository
```

- Route handlers (`app/api/`) are thin: authenticate, validate, authorize, call service, return JSON. Use `withAuthz()` helper for consistent auth + authz wrapping.
- Services (`server/services/`) contain all business logic. They **never** import from `app/` or Next.js APIs.
- Repositories (`server/db/repositories/`) are the only code that calls Drizzle/SQL. Use `withTx()` for all multi-row writes.
- `packages/shared` is the only code shared between `apps/web` and `apps/showroom`.
- Environment is Zod-validated at startup in `server/env.ts` via `instrumentation.ts`.

### Key server directories (`apps/web/server/`)

| Directory       | Purpose                                                                                                                                                                       |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `auth/`         | JWT (jose, HS256, httpOnly cookie), bcrypt, `getCurrentUser()`, token revocation via Redis                                                                                    |
| `policy/`       | RBAC — `authorize(user, action, lead)`, scope computed by recursive CTE                                                                                                       |
| `services/`     | One file per domain: `lead-query`, `lead-detail`, `activity`, `stage`, `followup`, `scoring`, `intake`, `routing`, `assignment`, `offer-matcher`, `dashboard`, `ai/`, `audit` |
| `db/`           | Drizzle schema + migrations, seed, repositories, append-only triggers, `audit.ts` writer                                                                                      |
| `redis/`        | Lazy ioredis singletons; app degrades gracefully if Redis is down                                                                                                             |
| `events/bus.ts` | Redis pub/sub + in-process EventEmitter fallback                                                                                                                              |
| `jobs/`         | Background jobs started once from `instrumentation.ts`: cold-detector, followup-sweeper, score-freshness                                                                      |
| `cache/`        | Cache interface (strategy finalized in F20)                                                                                                                                   |

### UI (`apps/web/components/`)

Built with shadcn/ui + Tailwind (Radix primitives), TanStack Query for client data, TanStack Table for lists, Recharts for charts. Live updates arrive via SSE (`app/api/events/`), which invalidates TanStack Query caches.

The lead detail page has a **slot system** (`components/leads/detail/slots.tsx`) — features register cards there in an append-only fashion.

### Redis responsibilities

Pub/sub (`leaddesk:events` channel) · token revocation (`auth:revoked:<jti>`) · intake rate limiting · caching (`cache:*`) · round-robin assignment locks. Every value key has a TTL. Memory policy: `maxmemory 256mb volatile-lru`.

### AI assist

Uses `@anthropic-ai/sdk`, default model `claude-opus-5-5` at effort `low` (configurable via `AI_MODEL`/`AI_EFFORT` env vars). Falls back to deterministic rule-based responses when the key is absent or the API is unavailable. **PII (email, phone) is never sent to the AI provider.**

## Feature Build System (Spec Kit)

Features are built in **waves** — see `docs/features/README.md`. Same-wave features can run in parallel; they own non-overlapping file paths.

Each feature goes through the Spec Kit pipeline:

1. `/speckit-specify` → `docs/features/FNN-*.md`
2. `/speckit-clarify`
3. `/speckit-plan` → `plan.md`
4. `/speckit-tasks` → `tasks.md`
5. `/speckit-implement`
6. `/integrate-wave N` to merge a finished wave

**Path ownership matters.** Before editing any file, check `docs/features/README.md` → "Path Ownership" to confirm which feature owns it. Shared files are append-only.

### Definition of Done

- Acceptance scenarios pass
- Unit + RBAC + e2e tests green
- `npm run lint` and `npm run typecheck` clean
- Spec updated if behavior changed
- Migrations in sync with `docs/03-domain-model.md`

## Constitution Rules (non-negotiable)

- **R1–R3 first**: Lead Inbox, Lead Detail + timeline, Activity Logging must work before any P1/P2 merges.
- **Security**: every lead-scoped endpoint calls `authorize()` — hiding UI is not authorization.
- **Append-only**: activities and audit log rows are never updated or deleted (enforced by SQLite triggers).
- **Transactions**: multi-row writes happen in a single transaction.
- **Money**: integer euro cents. Time: UTC unix ms, formatted only at the rendering edge.
- **Graceful degradation**: Redis down → cache falls through to DB, pub/sub → in-process emitter, AI unavailable → rule-based fallback. The app must never hard-fail due to an external service.
- **No N+1 queries** on hot paths (inbox, lead detail, dashboard).
