# Implementation Plan: F01 — Platform Foundation

**Branch**: `001-platform-foundation` | **Date**: 2026-09-30 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/001-platform-foundation/spec.md`

## Summary

F01 establishes the npm-workspaces monorepo skeleton every other feature builds on: the Next.js
web app (`apps/web`), the Vite showroom (`apps/showroom`), and the shared contracts package
(`packages/shared`). It owns the **complete Drizzle/SQLite schema** (so parallel feature streams
never collide on migrations), a deterministic realistic European seed dataset (≈800 leads, ≈600
customers, 16 staff, 6 offers), platform primitives (Redis client with graceful degradation,
event bus, cache interface, audit writer, typed HTTP errors), and the authenticated app shell
with role-based navigation. When F01 is done, `npm run db:reset && npm run dev` starts both
apps with a full, narrated demo dataset.

## Technical Context

**Language/Version**: TypeScript 5.x (strict + noUncheckedIndexedAccess), Node.js ≥ 20

**Primary Dependencies**:
- `apps/web`: Next.js 14 (App Router), Tailwind CSS, shadcn/ui, TanStack Query/Table, jose,
  bcryptjs, better-sqlite3 (+ `@libsql/client` fallback), drizzle-orm, ioredis, Zod, Sonner
- `apps/showroom`: Vite 5, React 18, TypeScript, Tailwind CSS
- `packages/shared`: @faker-js/faker (de/fr/it/es/nl/pt), Zod, no runtime build step
- Root dev tooling: concurrently, drizzle-kit, Vitest, Playwright, ESLint, Prettier

**Storage**: SQLite (WAL journal, foreign keys ON, busy_timeout 5000 ms) via better-sqlite3 +
Drizzle ORM. File path from `DATABASE_URL`. `@libsql/client` is the documented fallback for
Node 24/Windows native build failures — the Drizzle instance is the only thing the rest of the
codebase depends on.

**Testing**: Vitest (unit + integration, across workspaces), Playwright (e2e, web app only).
Tests run against a fresh in-memory or temp-file SQLite DB; Redis runs in memory mode.

**Target Platform**: Local developer machine (macOS, Linux, Windows) + Docker Compose for Redis.
Redis is optional; the app degrades gracefully without it.

**Project Type**: npm-workspaces monorepo (two apps + one shared package)

**Performance Goals**:
- `db:reset` (delete → migrate → seed) completes in < 15 s
- Seed run completes in < 10 s and prints a summary table
- Both apps start within 60 s of the startup command on a clean clone

**Constraints**:
- Redis is optional — every feature must work when Redis is down (degraded mode)
- Windows file-lock awareness: `db:reset` detects `EBUSY` and prints a helpful message
- `globalThis` singletons for DB, Redis, and event bus to survive Next.js hot reload
- No plaintext secrets; env vars only; `.env` never committed
- PII (email, phone) never sent to AI provider or written to structured logs

**Scale/Scope**: Demo-scale — ≈800 leads, ≈600 customers, 16 staff users. SQLite is sufficient.
PostgreSQL is documented as the scale path but is out of scope for v1.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design.*

| Principle | Status | Notes |
|---|---|---|
| I. Spec is source of truth | ✅ PASS | F01 spec references `docs/03-domain-model.md` for schema; plan follows spec exactly. `docs/` is authoritative; plan and code will be derived from it. |
| II. Mandatory reqs first | ✅ PASS | F01 is Wave 0 (P0) and blocks R1–R3. Nothing in F01 can be deferred. |
| III. Layered architecture | ✅ PASS | Repository layer owns all Drizzle/SQL. `withTx` is the only path for multi-row writes. Services contain logic; route handlers stay thin. Platform primitives have defined interfaces. |
| IV. Security by default | ✅ PASS | Passwords: bcrypt. Sessions: JWT in httpOnly cookie (F02). Zod at all boundaries. No raw SQL. Env vars for secrets. PII not logged. Redis keys carry TTLs (volatile-lru). |
| V. Test-first for logic | ✅ PASS | 8 test files specified in §9.5 of the source doc. Stage machine tests written before implementation. Schema constraint tests verify append-only triggers. |
| VI. Data integrity | ✅ PASS | `withTx` for multi-row writes. Append-only triggers on `activities` and `audit_log`. `writeAudit` inside caller's tx. Money: integer cents. Time: UTC ms. |
| VII. Graceful degradation | ✅ PASS | Redis client: degraded mode with in-process EventEmitter bus and no-op cache. App never hard-fails due to Redis. |
| VIII. Simplicity | ✅ PASS | No Turborepo/Nx/pnpm. Shared package as TS source (no build step). No speculative abstractions. Each new dependency justified in Decisions (§8 of source doc). |
| IX. Performance budgets | ✅ PASS | F01 sets up the platform; query performance is validated by downstream features. Seed < 10 s and reset < 15 s are measurable. |
| X. UX consistency | ✅ PASS | App shell: shadcn/ui primitives, Tailwind, 56 px nav rail, role-based nav config, design tokens defined once. |

**Gate result: PASS. No violations to justify.**

## Project Structure

### Documentation (this feature)

```text
specs/001-platform-foundation/
├── plan.md              ← this file
├── research.md          ← Phase 0: architectural decisions
├── data-model.md        ← Phase 1: complete entity + schema reference
├── quickstart.md        ← Phase 1: end-to-end validation guide
├── contracts/
│   ├── shared-package.md   ← @leaddesk/shared exports + Zod schemas
│   ├── events.md           ← LeadDeskEvent union + EVENTS_CHANNEL
│   └── interfaces.md       ← EventBus, Cache, writeAudit, withTx contracts
├── checklists/
│   └── requirements.md
└── tasks.md             ← Phase 2 output (/speckit-tasks — NOT created here)
```

### Source Code (repository root)

```text
package.json                          ← root workspace + scripts (FR-002)
tsconfig.base.json                    ← shared strict TS config (FR-003)
.eslintrc / .prettierrc / .gitignore
docker-compose.yml                    ← Redis 7-alpine service (FR-005)

packages/
└── shared/                           ← @leaddesk/shared (FR-020–FR-022)
    ├── package.json
    ├── tsconfig.json
    └── src/
        ├── index.ts
        ├── enums.ts
        ├── catalog.ts
        ├── countries.ts
        ├── source-groups.ts
        ├── stage-machine.ts
        ├── events.ts
        ├── format.ts
        └── schemas/
            ├── intake.ts
            ├── activity.ts
            ├── lead-filters.ts
            └── common.ts

apps/
├── showroom/                         ← Vite + React + Tailwind (FR-062)
│   ├── package.json
│   ├── vite.config.ts
│   ├── .env.example
│   └── src/
│       └── App.tsx                   ← placeholder (F13 owns src/** after this)
│
└── web/                              ← Next.js App Router (FR-001, FR-060–FR-063)
    ├── package.json
    ├── next.config.ts
    ├── tailwind.config.ts
    ├── .env.example
    ├── app/
    │   ├── layout.tsx                ← root layout
    │   ├── (app)/
    │   │   └── layout.tsx            ← authenticated shell (nav rail + top bar)
    │   └── api/
    │       └── leads/[id]/activities/
    │           ├── route.ts          ← delegates to handlers/ (FR-017)
    │           └── handlers/
    │               ├── get.ts        ← 501 stub; F05 replaces body
    │               └── post.ts       ← 501 stub; F06 replaces body
    ├── components/
    │   ├── layout/
    │   │   ├── nav-rail.tsx
    │   │   ├── top-bar.tsx
    │   │   └── nav.ts               ← append-only nav config (FR-060)
    │   └── ui/
    │       └── tokens.ts            ← design tokens (stage/priority colors)
    ├── lib/
    │   └── format.ts                ← re-exports from @leaddesk/shared (FR-063)
    └── server/
        ├── db/
        │   ├── client.ts            ← Drizzle singleton, withTx (FR-011, FR-014)
        │   ├── schema.ts            ← complete Drizzle schema (FR-010)
        │   ├── audit.ts             ← writeAudit(tx, entry) (FR-053)
        │   ├── migrations/
        │   │   ├── 0000_initial.sql
        │   │   └── 0001_append_only.sql  ← append-only triggers (FR-015)
        │   ├── repositories/
        │   │   └── base.ts
        │   └── seed/
        │       ├── index.ts         ← orchestrator + summary table
        │       ├── org.ts
        │       ├── customers.ts
        │       ├── leads.ts
        │       ├── activities.ts    ← timeline builder
        │       ├── offers.ts
        │       ├── scenarios.ts     ← neglected + hero leads (FR-037)
        │       ├── score-step.ts    ← stub; F09 replaces
        │       └── utils/
        │           ├── rng.ts       ← seeded weighted pick
        │           ├── time.ts      ← working-hours offsets
        │           └── reference.ts ← EDM-<YYYY>-<5-digit seq>
        ├── redis/
        │   └── client.ts            ← getRedis(), getRedisSubscriber(), redisStatus() (FR-050)
        ├── events/
        │   └── bus.ts               ← EventBus impl (FR-051)
        ├── cache/
        │   └── cache.ts             ← Cache impl + NoopCache (FR-052)
        └── http/
            └── errors.ts            ← AppError subclasses + toErrorResponse (FR-054)
```

**Structure decision**: npm-workspaces monorepo (Option 2 extended to 3 packages). No Turborepo
or pnpm — three packages don't need a build graph. Shared package consumed as TS source via
`transpilePackages` (Next.js) and Vite's native TS support.

## Complexity Tracking

*No constitution violations. Section intentionally empty.*
