# Research: F01 — Platform Foundation

**Phase 0 output** | Date: 2026-09-30 | Plan: [plan.md](plan.md)

No `NEEDS CLARIFICATION` markers existed in the spec. All architectural decisions were
pre-made in `docs/features/F01-platform-foundation.md` §8 (Decisions) and in the
project constitution. This document consolidates them with rationale for reference by
downstream feature planners.

---

## D1 — F01 Owns the Complete Schema Up Front

**Decision**: The full Drizzle schema (all 10 tables) is created in F01, Wave 0, before
any other feature branch is opened.

**Rationale**: Parallel Spec Kit runs on separate git worktrees or branches would each need
to add their own tables, causing migration conflicts. By centralising schema ownership in
F01, every wave-2+ feature pulls in migrations that are already stable.

**Alternatives considered**:
- Each feature adds its own tables → migration ordering hell in parallel development
- Schema-per-service → overkill for a monolith at demo scale

---

## D2 — npm Workspaces, No Turborepo

**Decision**: Three-package monorepo managed with native npm workspaces.

**Rationale**: At three packages (web app, showroom, shared), a build orchestration graph
(Turborepo, Nx) adds tooling overhead with no benefit. npm workspaces is zero extra
configuration for build ordering.

**Alternatives considered**:
- Turborepo → unnecessary; parallel builds not needed at this scale
- pnpm workspaces → would require pnpm in every dev environment

---

## D3 — Shared Package as TypeScript Source (No Build Step)

**Decision**: `packages/shared` is consumed directly as TS source. Next.js uses
`transpilePackages: ['@leaddesk/shared']`; Vite transpiles it natively.

**Rationale**: Simplest dev loop — no `tsc --watch`, no tsup build, no stale build
artifacts. Both bundlers handle raw TypeScript.

**Alternatives considered**:
- Build with tsup → dist files to maintain, incremental builds to wire up
- Bundle into each app → no sharing; types diverge

---

## D4 — Seed Timestamps Relative to "Now"

**Decision**: All seed timestamps are computed as offsets from a single `now` captured
at seed-start. ULIDs are generated in chronological order.

**Rationale**: The demo always looks current (leads from "today", not 2024). Determinism
is preserved because all relative offsets are fixed by the seed value.

**Alternatives considered**:
- Fixed calendar dates → data looks stale after a few weeks; screenshots need updates

---

## D5 — Redis Optional with Degraded Mode

**Decision**: The Redis client catches connection failures, logs once, and flips to
degraded mode. The event bus falls back to an in-process EventEmitter. Cache falls back
to a no-op. Rate limiting falls back to in-memory. A background reconnect runs every 10 s.

**Rationale**: The demo must be runnable on any laptop without Docker being available.
Redis is a performance and cross-process feature, not a correctness requirement for F01.

**Alternatives considered**:
- Hard-require Redis → demo fails if Docker isn't running; breaks the evaluation story

---

## D6 — Scoring Stub in Seed, Replaced by F09

**Decision**: `seed/score-step.ts` ships as a stub that fills `score`, `priority`, and
`score_breakdown` with deterministic placeholder values. F09 replaces the stub body with
`scoreLead()` — the single sanctioned cross-owner edit in the project.

**Rationale**: Keeps F01 independently buildable. The seed needs scores to populate the
DB; F09 needs the DB to exist before it can be written. The stub breaks the circular
dependency.

**Alternatives considered**:
- Seed imports F09 scoring → F01 can't be built without F09; blocks Wave 0

---

## D7 — ULID IDs

**Decision**: All primary keys are ULIDs (26-char base32, sortable, time-prefixed).

**Rationale**: Sortable without a separate `created_at` index on IDs, non-enumerable
(safe in URLs), and collision-resistant. The `ulid()` function generates them in sequence.

**Alternatives considered**:
- Auto-increment integers → enumerable, not globally unique across tables
- UUIDv4 → random (not sortable), longer in URLs

---

## D8 — Money as Integer Euro Cents

**Decision**: All monetary amounts stored as `INTEGER` (euro cents). Display layer
formats via `formatEUR(cents)`.

**Rationale**: No floating-point rounding errors. Addition, subtraction, and comparison
are exact. The format utility at the edge handles locale-aware display.

**Alternatives considered**:
- REAL / FLOAT → rounding errors in summations
- Decimal strings → requires parsing on every read

---

## D9 — Stage Mix and Conversion Variance Baked into Seed

**Decision**: Stage distribution, conversion rate, and source-/rep-level variance are all
determined by the seed algorithm, not random.

**Rationale**: Dashboard charts need a coherent story to tell (REFERRAL converts better
than social; Felix is overloaded; Team South has a lower conversion rate). Random data
produces flat, uninteresting charts.

**Alternatives considered**:
- Uniform random → all sources look the same; demo charts are boring

---

## D10 — Append-Only Enforced by SQLite Triggers

**Decision**: `BEFORE UPDATE` and `BEFORE DELETE` triggers on `activities` and `audit_log`
call `RAISE(ABORT, 'append-only table')`.

**Rationale**: Traceability is guaranteed even against buggy application code or someone
running raw SQL in a migration. The DB-level constraint is the last line of defence.

**Alternatives considered**:
- App-level convention only → a future bug or typo could corrupt the timeline silently

---

## D11 — `is_returning` Stored, Not Derived

**Decision**: `customers.is_returning` is a stored boolean column, set by the seed,
intake dedupe (F10), and F07 on WON.

**Rationale**: Cheap inbox filter and badge — no subquery needed. The three write paths
that set it are the only moments the flag can legitimately change.

**Alternatives considered**:
- Derive with `EXISTS (SELECT 1 FROM purchases WHERE ...)` on every read → extra join on
  every inbox query; harder to index

---

## D12 — `search_text` for Accent-Insensitive Search

**Decision**: A maintained `search_text` column on `customers` stores lowercased, NFD-
normalized (diacritics stripped), combining-mark-free concatenation of name, email, and
phone digits.

**Rationale**: Plain SQLite `LIKE` is then sufficient for accent-insensitive search ("Emile"
matches "Émile"). Zero native extensions required; the column is indexed.

**Alternatives considered**:
- SQLite ICU extension → requires compilation; breaks on some platforms
- FTS5 → heavier setup; overkill for name/email/phone search

---

## D13 — Delegating Scaffold for the Activities Route

**Decision**: `app/api/leads/[id]/activities/route.ts` exports `GET` and `POST`, each
delegating to a separate handler file. F01 creates both handlers as 501 stubs. F05
replaces `get.ts` body; F06 replaces `post.ts` body.

**Rationale**: F05 (Lead Detail) and F06 (Activity Logging) are wave-2 features that can
be built in parallel on separate worktrees. If both edited `route.ts`, they would conflict.
Per-handler files mean the two streams never touch the same file.

**Alternatives considered**:
- Both features edit `route.ts` → guaranteed merge conflict in parallel development

---

## D14 — `stage-machine.ts` and `source-groups.ts` Shipped in F01

**Decision**: Both modules live in `packages/shared` from day one, even though their
primary consumers are F06/F07 (stage machine) and F04/F16 (source groups).

**Rationale**: Wave-2 features need them before F07 or F16 are merged. Shipping in F01
means every wave-2 feature can import them immediately.

**Alternatives considered**:
- Owned by F07 / F16 → wave-2 features that need them earlier would have a missing import
  or would need to duplicate the code

---

## Environment Variables (resolved from `docs/04-architecture.md` §7)

### `apps/web/.env.example`

| Variable | Required | Notes |
|---|---|---|
| `DATABASE_URL` | Yes | Path to SQLite file, e.g. `./data/leaddesk.db` |
| `JWT_SECRET` | Yes | ≥ 32 chars; startup validation rejects shorter values |
| `NODE_ENV` | No | `development` / `production` |
| `REDIS_URL` | No | Defaults to `redis://localhost:6379`; app degrades without it |
| `JOBS_ENABLED` | No | F08 background jobs toggle |
| `AT_RISK_DAYS` | No | F08 rule override (default 3) |
| `COLD_AFTER_DAYS` | No | F08 rule override (default 7) |
| `COLD_AFTER_UNANSWERED` | No | F08 rule override (default 3) |
| `MISSED_AFTER_HOURS` | No | F08 rule override (default 24) |
| `ANTHROPIC_API_KEY` | No | F18 AI features; app falls back to rule-based without it |
| `AI_MODEL` | No | Default `claude-opus-5-5` |
| `AI_EFFORT` | No | Default `low` |
| `AI_RATE_LIMIT_PER_HOUR` | No | F18 rate limiting |

### `apps/showroom/.env.example`

| Variable | Required | Notes |
|---|---|---|
| `VITE_API_URL` | Yes | Web app URL, e.g. `http://localhost:3000` |
| `VITE_API_KEY` | Yes | Showroom-to-intake API key (F10 validates) |

---

## Open Questions (from F01 §11)

Both open questions from the source doc are resolved here:

1. **EUR formatting locale**: `de-DE` is the default per `docs/04-architecture.md` §9.
   It can be changed in `format.ts` if needed. No action required for F01.

2. **Redis in CI**: Redis is NOT required in CI. Tests run in memory mode (`redisStatus()`
   returns `'degraded'`; the event bus uses the in-process fallback). No Redis service
   needed in the CI pipeline for F01 tests.
