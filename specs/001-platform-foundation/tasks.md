# Tasks: F01 — Platform Foundation

**Branch**: `001-platform-foundation` | **Input**: `specs/001-platform-foundation/`

**Prerequisites**: plan.md ✅ | spec.md ✅ | research.md ✅ | data-model.md ✅ | contracts/ ✅

**Tests**: Included per Constitution Principle V (test-first for all logic) and F01 §9.5.

**Implementation order note**: US-3 (Shared Contracts) and US-1 (Database Setup) are both
P1, but US-3 is implemented first because the Drizzle schema imports enums from `@leaddesk/shared`.
Implementation order ≠ priority order here.

## Format: `[ID] [P?] [Story] Description with exact file path`

- **[P]**: Parallelisable (different files, no incomplete-task dependency)
- **[Story]**: US1–US5 map to user stories in spec.md

---

## Phase 1: Setup — Monorepo Scaffold

**Purpose**: Create every config file that all workspaces and tools depend on.
No user-story work can begin until this phase is complete.

- [ ] T001 Create `package.json` at repo root: `name "eurodrive-lead-desk"`, `private true`, `workspaces ["apps/*","packages/*"]`, and all 14 scripts from FR-002 (dev, dev:web, dev:showroom, redis:up, db:generate, db:migrate, db:seed, db:reset, simulate, test, test:e2e, lint, typecheck, format) using concurrently for `dev`
- [ ] T002 Create `tsconfig.base.json` at repo root: `compilerOptions` with `strict: true`, `noUncheckedIndexedAccess: true`, `moduleResolution: "bundler"`, `target: "ES2022"`, `lib: ["ES2022"]`, `skipLibCheck: true`, `noEmit: true`
- [ ] T003 [P] Create `.eslintrc.js` at repo root: TypeScript-ESLint recommended rules, React plugin for `apps/showroom`, import plugin; `parserOptions.project` pointing to workspace tsconfigs
- [ ] T004 [P] Create `.prettierrc` at repo root: `semi: true`, `singleQuote: true`, `trailingComma: "all"`, `printWidth: 100`, `tabWidth: 2`
- [ ] T005 [P] Create `.gitignore` at repo root: `node_modules/`, `.env`, `*.env.local`, `data/`, `.next/`, `dist/`, `playwright-report/`, `test-results/`, `*.db`, `*.db-wal`, `*.db-shm`
- [ ] T006 Create `docker-compose.yml` at repo root: single `redis` service using image `redis:7-alpine`, port mapping `6379:6379`, command `redis-server --maxmemory 256mb --maxmemory-policy volatile-lru`, named volume `redis_data`, healthcheck `redis-cli ping` every 5s, 3 retries
- [ ] T007 [P] Create `apps/web/.env.example` with every variable from research.md §Environment Variables: `DATABASE_URL`, `JWT_SECRET` (note: ≥ 32 chars required), `NODE_ENV`, `REDIS_URL`, `JOBS_ENABLED`, `AT_RISK_DAYS`, `COLD_AFTER_DAYS`, `COLD_AFTER_UNANSWERED`, `MISSED_AFTER_HOURS`, `ANTHROPIC_API_KEY`, `AI_MODEL=claude-opus-5-5`, `AI_EFFORT=low`, `AI_RATE_LIMIT_PER_HOUR`
- [ ] T008 [P] Create `apps/showroom/.env.example` with `VITE_API_URL=http://localhost:3000` and `VITE_API_KEY=dev-showroom-key`

**Checkpoint**: `npm install` resolves all workspaces without errors.

---

## Phase 2: Foundational — Package Scaffolds & Tooling

**Purpose**: Create each workspace's `package.json`, framework configs, and test runner config.
Blocks all user-story phases.

**⚠️ CRITICAL**: No user-story work can begin until this phase is complete.

- [ ] T009 Create `packages/shared/package.json`: `name "@leaddesk/shared"`, `version "0.1.0"`, `private true`, no `main`/`exports` build fields (source-consumed), `peerDependencies` for `zod`; create `packages/shared/tsconfig.json` extending `../../tsconfig.base.json` with `include ["src/**/*"]`; create empty `packages/shared/src/index.ts`
- [ ] T010 Create `apps/web/package.json`: Next.js 14 + React 18 deps (`next`, `react`, `react-dom`), server deps (`better-sqlite3`, `drizzle-orm`, `ioredis`, `jose`, `bcryptjs`, `ulid`, `@faker-js/faker`), shared dev deps (`drizzle-kit`, `@types/*`, `vitest`, `@playwright/test`), `@leaddesk/shared` workspace dep; create `apps/web/tsconfig.json` extending `../../tsconfig.base.json` with `plugins: [{ name: "next" }]` and `paths: { "@leaddesk/shared": ["../../packages/shared/src/index.ts"] }`
- [ ] T011 Create `apps/web/next.config.ts`: `transpilePackages: ["@leaddesk/shared"]`, App Router enabled (`experimental.appDir` if Next 13; implied in 14), `typescript.ignoreBuildErrors: false`
- [ ] T012 Create `apps/web/tailwind.config.ts`: `content` covering `app/**/*.{ts,tsx}`, `components/**/*.{ts,tsx}`; base Tailwind config; `apps/web/postcss.config.js` with `tailwindcss` and `autoprefixer`
- [ ] T013 Create `apps/showroom/package.json`: Vite 5 + React 18 + TypeScript deps, `@leaddesk/shared` workspace dep, `dev` script `vite --port 3001`; create `apps/showroom/tsconfig.json` extending `../../tsconfig.base.json`; create `apps/showroom/vite.config.ts` with `resolve.alias: { "@leaddesk/shared": path.resolve("../../packages/shared/src/index.ts") }`, `server.port: 3001`
- [ ] T014 Create `apps/web/drizzle.config.ts`: `dialect: "sqlite"`, `schema: "./server/db/schema.ts"`, `out: "./server/db/migrations"`, `dbCredentials.url` from `process.env.DATABASE_URL`
- [ ] T015 Create root `vitest.config.ts`: workspace mode covering `packages/shared` and `apps/web`; `environment: "node"`; `globals: true`; `setupFiles` for global test utilities (empty for now)
- [ ] T016 Create root `playwright.config.ts`: `testDir: "apps/web/e2e"`, `baseURL: "http://localhost:3000"`, `use.trace: "on-first-retry"`, `webServer` command `npm run dev:web`

**Checkpoint**: `npm run typecheck` produces type errors only about missing source files (not config errors). `npm run test` runs (zero tests yet).

---

## Phase 3: US-3 — Shared Contracts (Priority: P1) 🎯

**Goal**: All shared vocabulary (enums, schemas, event types, stage machine, formatters) in
`packages/shared/src/` so every other workspace can import from `@leaddesk/shared` with
compile-time exhaustiveness checking.

**Independent Test**: Import `IntakeLeadSchema` in a one-off test and validate a payload —
must pass/fail with the same rules as described in `contracts/shared-package.md`.
Run `packages/shared/src/schemas/intake.test.ts`, `stage-machine.test.ts`, `format.test.ts`.

### Tests for US-3 (write first — they MUST fail before implementation)

- [ ] T017 [P] [US3] Create `packages/shared/src/schemas/intake.test.ts`: (1) valid full payload passes; (2) missing both email and phone fails with path `email`; (3) `preferredChannel: "WHATSAPP"` without `phone` fails with path `preferredChannel`; (4) `budgetMin > budgetMax` fails with path `budgetMin`; (5) honeypot field `website` filled still parses (no schema-level rejection — F10 rejects it with 202); (6) `preferredChannel: "EMAIL"` without `email` fails
- [ ] T018 [P] [US3] Create `packages/shared/src/stage-machine.test.ts`: (1) every allowed transition in the TRANSITIONS table succeeds `canTransition`; (2) every disallowed transition returns false; (3) COLD target requires `SYSTEM` or `MANAGER`/`VP` role — REP returns false; (4) LOST→CONTACTED requires MANAGER/VP; (5) `autoAdvance`: NEW + CALL returns CONTACTED; NEW + NOTE returns null; COLD + WHATSAPP returns CONTACTED; WON + CALL returns null; (6) `isContactActivity`: USER+CALL→true; USER+NOTE→false; SYSTEM+LEAD_CREATED→false
- [ ] T019 [P] [US3] Create `packages/shared/src/format.test.ts`: (1) `buildCustomerSearchText({firstName:"Émile",lastName:"Dubois",email:"emile@test.com",phone:"+33612345678"})` → string contains "emile", "dubois", "emile@test.com", "33612345678" (digits only) and no combining marks; (2) `formatEUR(3890000)` → `"38.900 €"` (de-DE locale); (3) diacritics stripped: "María García" → "maria garcia"

### Implementation for US-3

- [ ] T020 [P] [US3] Create `packages/shared/src/enums.ts`: export all 17 enum const tuples as `as const` and corresponding union types — ROLES, ASSIGN_STRATEGIES, LEAD_SOURCES, STAGES, OPEN_STAGES, PRIORITIES, ACTIVITY_KINDS, USER_ACTIVITY_TYPES, SYSTEM_ACTIVITY_TYPES, ACTIVITY_TYPES (spread of USER+SYSTEM), OUTCOMES, CHANNELS, BEST_TIMES, AGE_BANDS, LOST_REASONS, FOLLOW_UP_STATUSES, DISCOUNT_TYPES, LANGUAGES — per data-model.md §Enums
- [ ] T021 [P] [US3] Create `packages/shared/src/catalog.ts`: `VEHICLES` as const array of 6 objects (slug, name, body, fuel, priceCents) per data-model.md §Vehicle Catalog; `VEHICLE_SLUGS` derived as `[string, ...string[]]` for Zod `.enum()`
- [ ] T022 [P] [US3] Create `packages/shared/src/countries.ts`: `COUNTRIES` as const record mapping 13 ISO-3166 alpha-2 codes (DE, AT, CH, FR, BE, NL, LU, IT, ES, PT, PL, IE, DK) to `{ name, dial, region, lang }` per data-model.md §Country Mapping; `region` is `null` for PL/IE/DK; export `COUNTRY_CODES` as `[keyof typeof COUNTRIES, ...]` for Zod
- [ ] T023 [P] [US3] Create `packages/shared/src/source-groups.ts`: `SOURCE_GROUPS` const tuple; `SourceGroup` union type; `SOURCE_GROUP_OF` record mapping each `LeadSource` to its group — WEBSITE→WEBSITE, FACEBOOK/INSTAGRAM→SOCIAL, GOOGLE_ADS→PAID_SEARCH, PORTAL→PORTALS, WALK_IN/PHONE→OFFLINE, REFERRAL→REFERRAL
- [ ] T024 [US3] Create `packages/shared/src/stage-machine.ts`: `TRANSITIONS` record with allowed target stages per source stage (backward open moves allowed, COLD only via SYSTEM/MANAGER/VP, LOST→CONTACTED only MANAGER/VP, WON terminal); `canTransition(from, to, role)` boolean; `isContactActivity(type, kind)` → kind===USER && type!=='NOTE'; `autoAdvance(stage, type, kind)` → NEW+contact→CONTACTED, COLD+contact→CONTACTED, else null — per data-model.md §Lead Stage State Machine
- [ ] T025 [P] [US3] Create `packages/shared/src/format.ts`: `formatEUR(cents)` using `Intl.NumberFormat('de-DE',{style:'currency',currency:'EUR',minimumFractionDigits:0})`; `formatRelative(ms)` (human-readable relative time); `formatDateTime(ms)` (24h, e.g. "30 Sep 2026, 14:32"); `buildCustomerSearchText({firstName,lastName,email,phone})` — lowercase, NFD normalize, remove combining marks (regex `\p{M}` with unicode flag), concatenate first+' '+last+' '+(email||'')+' '+(phone digits only)
- [ ] T026 [P] [US3] Create `packages/shared/src/schemas/common.ts`: `ApiError` type `{ error: { code: string; message: string; fields?: Record<string,string> } }`; `Paginated<T>` type `{ items: T[]; page: number; pageSize: number; total: number }`
- [ ] T027 [P] [US3] Create `packages/shared/src/schemas/intake.ts`: `IntakeLeadSchema` Zod object with all fields per contracts/shared-package.md (firstName min 1 max 60, email optional trim+lowercase+email+max 254, phone optional regex `/^\+?[0-9 ()-]{6,20}$/`, country enum COUNTRY_CODES, budgetMax max 50_000_000 cents, idempotencyKey max 64, honeypot `website`); three `.refine()` checks (email||phone; preferredChannel contact check; budgetMin≤budgetMax); `IntakeResponseSchema`; export `IntakeLead = z.infer<typeof IntakeLeadSchema>`
- [ ] T028 [P] [US3] Create `packages/shared/src/schemas/activity.ts`: `CreateActivitySchema` per contracts/shared-package.md — `clientRequestId` length 26, `type` USER_ACTIVITY_TYPES, `note` min 1 max 2000, `aiAssisted` boolean default false, optional `nextFollowUp` with datetime `dueAt`, optional `completeFollowUpId`, optional `stageChange` with `to: OPEN_STAGES`, optional `expectedVersion` int
- [ ] T029 [P] [US3] Create `packages/shared/src/schemas/lead-filters.ts`: `LeadListQuerySchema` per contracts/shared-package.md — implement `csv(schema)` helper that splits comma-separated query strings, `zBool` helper for boolean string params; all filter fields optional with documented defaults; `sort` default `"rank"`, `page` default 1, `pageSize` refine to [10,25,50] default 25, `tz` default `"Europe/Berlin"`
- [ ] T030 [P] [US3] Create `packages/shared/src/events.ts`: `Base` type with `at`, `teamId`, `ownerId`, `by`; `LeadSummary` type (14 fields per contracts/events.md); `ActivityDTO` type; `LeadDeskEvent` discriminated union with 6 event types (`lead.created`, `lead.assigned`, `lead.updated`, `activity.created`, `followup.due`, `offer.changed`); `EVENTS_CHANNEL = 'leaddesk:events'` const
- [ ] T031 [US3] Update `packages/shared/src/index.ts`: barrel-export every public symbol from enums.ts, catalog.ts, countries.ts, source-groups.ts, stage-machine.ts, format.ts, events.ts, schemas/common.ts, schemas/intake.ts, schemas/activity.ts, schemas/lead-filters.ts

**Checkpoint**: `npm test -- --project=shared` — all 3 test files pass. TypeScript exhaustive
switches on any enum catch missing cases at compile time.

---

## Phase 4: US-1 — One-Command Local Setup (Priority: P1)

**Goal**: `docker compose up -d redis && npm install && npm run db:reset && npm run dev` starts
both apps within 60 s. DB schema deployed. Env validated at startup. Activities route stubbed.

**Independent Test**: On a clean clone, run the 4-command startup sequence. Open `:3000` and
`:3001`. Run `npm run db:reset` twice; compare counts. Run `npm test -- schema.test.ts`.

### Tests for US-1 (write first — they MUST fail before implementation)

- [ ] T032 [US1] Create `apps/web/server/db/schema.test.ts`: (1) apply migrations to an in-memory better-sqlite3 DB — no error thrown; (2) insert customer with no email and no phone → SQLite CHECK constraint aborts; (3) `UPDATE activities SET note='x' WHERE id=...` → trigger aborts with "append-only table"; (4) `DELETE FROM activities WHERE id=...` → trigger aborts; (5) `UPDATE audit_log SET action='x' WHERE id=...` → trigger aborts; (6) `DELETE FROM audit_log WHERE id=...` → trigger aborts

### Implementation for US-1

- [ ] T033 [US1] Create `apps/web/server/db/schema.ts`: complete Drizzle schema with all 10 tables in declaration order (offers before leads for FK), helper wrappers `ts(n)` for unix-ms integers, `bool(n)` for boolean integers, `json<T>(n)` for typed JSON text; tables: teams, users (uniqueIndex email, index manager), customers (CHECK email IS NOT NULL OR phone IS NOT NULL, indexes phone/email/search_text), leads (all scalar + JSON score_breakdown, all 8 indexes per data-model.md), activities (append-only, index lead+createdAt), stage_history (index lead+changedAt), follow_ups (index assignee+status+due), offers, purchases (index customer), audit_log (append-only, indexes entity+entityId and createdAt) — exact column names and enum values per data-model.md
- [ ] T034 [US1] Create `apps/web/server/db/client.ts`: import better-sqlite3; attempt native import, catch and fallback to `@libsql/client` with a warning; create Drizzle instance with `drizzle(sqlite, { schema })`; set WAL mode (`PRAGMA journal_mode=WAL`), `PRAGMA foreign_keys=ON`, `PRAGMA busy_timeout=5000`, `PRAGMA synchronous=NORMAL` on open; store on `globalThis` as `__db` to survive hot reload; export `db` and `withTx<T>(fn: (tx: Tx) => T): T` that runs `db.transaction(fn)` synchronously
- [ ] T035 [US1] Create `apps/web/server/env.ts`: Zod schema for all `process.env` variables from `.env.example`; `JWT_SECRET` min 32 chars; `DATABASE_URL` required string; all optional vars with appropriate types/defaults; `validateEnv()` called at module load — throws `Error` with a clear message listing missing/invalid vars rather than crashing with a cryptic undefined access; export typed `env` object
- [ ] T036 [US1] Create `apps/web/server/db/repositories/base.ts`: export `type Tx` (the transaction type from drizzle); re-export `withTx` from `../client`; note that this is the ONLY sanctioned path for multi-row writes (add a comment explaining why: enforces the transaction boundary)
- [ ] T037 [US1] Run `npm run db:generate` in `apps/web` to produce `server/db/migrations/0000_initial.sql` from schema.ts — verify the file is created and contains CREATE TABLE statements for all 10 tables; commit the generated file
- [ ] T038 [US1] Create `apps/web/server/db/migrations/0001_append_only.sql` manually (Drizzle cannot generate trigger SQL): four triggers — `CREATE TRIGGER activities_no_update BEFORE UPDATE ON activities BEGIN SELECT RAISE(ABORT, 'append-only table'); END;`, `CREATE TRIGGER activities_no_delete BEFORE DELETE ON activities BEGIN SELECT RAISE(ABORT, 'append-only table'); END;`, and identical triggers for `audit_log` (`audit_log_no_update`, `audit_log_no_delete`)
- [ ] T039 [US1] Create `apps/web/app/api/leads/[id]/activities/route.ts`: import `NextRequest`, `NextResponse`; import `handleGet` from `./handlers/get`; import `handlePost` from `./handlers/post`; export `GET = (req) => handleGet(req)` and `POST = (req) => handlePost(req)`; create `handlers/get.ts` returning `NextResponse.json({ error: { code: 'NOT_IMPLEMENTED', message: 'GET /activities not yet implemented' } }, { status: 501 })`; create `handlers/post.ts` with the same 501 stub — F05 replaces `get.ts` body; F06 replaces `post.ts` body
- [ ] T040 [US1] Create `apps/web/server/db/migrate.ts`: a standalone script that (1) reads `DATABASE_URL` from env, (2) creates the `data/` directory if missing, (3) runs all pending Drizzle migrations using `migrate()` from `drizzle-orm/better-sqlite3/migrator`; wire the `db:migrate` root npm script to call this file via `tsx apps/web/server/db/migrate.ts`; wire `db:reset` as `rimraf apps/web/data/*.db* && npm run db:migrate && npm run db:seed` with EBUSY detection (Windows: if rimraf fails with EBUSY, print "Stop the dev server first" and exit 1)

**Checkpoint**: `npm run db:reset` completes without errors. `npm run db:generate` produces no
new migrations. `npm test -- schema.test` — all 6 schema checks pass.

---

## Phase 5: US-5 — Platform Primitives (Priority: P2)

**Goal**: Redis client with graceful degradation, event bus (Redis + in-process fallback),
cache interface (Redis + no-op fallback), audit writer, typed HTTP errors, request logger.

**Independent Test**: With Redis stopped, `redisStatus()` returns `'degraded'`. Publish an event
via `bus`; local subscriber receives it exactly once. Run `bus.test.ts`, `cache.test.ts`,
`errors.test.ts`.

### Tests for US-5 (write first — they MUST fail before implementation)

- [ ] T041 [P] [US5] Create `apps/web/server/events/bus.test.ts`: (1) in memory mode (no Redis), `bus.subscribe(handler)` then `await bus.publish(event)` → handler called exactly once; (2) `bus.publish()` never throws even with bad data; (3) unsubscribe function returned by subscribe stops delivery; (4) `bus.mode()` returns `'memory'` when Redis unavailable
- [ ] T042 [P] [US5] Create `apps/web/server/cache/cache.test.ts`: (1) `cache.wrap(key, 60, loader)` calls loader once; second call with same key returns cached value without calling loader again; (2) `cache.del(key)` then `cache.wrap` calls loader again; (3) NoopCache `wrap` always calls loader (never caches); (4) `cache.get` on missing key returns null
- [ ] T043 [P] [US5] Create `apps/web/server/http/errors.test.ts`: (1) `toErrorResponse(new ValidationError("bad",{fields:{email:"invalid"}}))` → `{ status: 400, body: { error: { code: "VALIDATION_ERROR", message: "bad", fields: { email: "invalid" } } } }`; (2) `toErrorResponse(new NotFoundError("lead"))` → status 404, code NOT_FOUND, no `fields`; (3) `toErrorResponse(new Error("unknown"))` → status 500, code INTERNAL_ERROR, message does NOT contain stack trace text

### Implementation for US-5

- [ ] T044 [P] [US5] Create `apps/web/server/redis/client.ts`: import ioredis; create `getRedis()` — lazy singleton on `globalThis.__redis`; ioredis options: `maxRetriesPerRequest: 1`, `enableOfflineQueue: false`, `connectTimeout: 500`; on `'error'` event: log once with `[Redis error]` prefix, flip internal status to 'degraded', schedule `setTimeout(reconnect, 10000)`; on `'ready'`: flip status to 'connected'; `getRedisSubscriber()` — separate singleton on `globalThis.__redisSub` with same options; `redisStatus(): 'connected' | 'degraded'` returns current status; neither function throws
- [ ] T045 [US5] Create `apps/web/server/events/bus.ts`: implement `EventBus` interface from contracts/events.md; internal `EventEmitter` for local delivery; `publish(e)`: serialize event as JSON; if Redis connected, `getRedis().publish(EVENTS_CHANNEL, json)` wrapped in try-catch (log failure, never throw); always deliver to local EventEmitter; de-duplication: when Redis subscriber receives an event it just published locally, skip (use a short-lived Set of recently-published event IDs keyed by `at+type`); `subscribe(handler)`: add to local emitter, setup Redis subscriber once via `getRedisSubscriber().subscribe(EVENTS_CHANNEL)` on first call; return unsubscribe function; `mode()`: return `'redis'` if `redisStatus() === 'connected'` else `'memory'`; export singleton `bus`
- [ ] T046 [P] [US5] Create `apps/web/server/cache/cache.ts`: define `Cache` interface (get, set, del, delByPrefix, wrap) per contracts/interfaces.md; implement `RedisCache` — all keys prefixed `"cache:"`, TTL via Redis `SET key value EX ttl`, `delByPrefix` via async SCAN loop + UNLINK; implement `NoopCache` — `get` returns null, `set`/`del` are no-ops, `wrap` always calls loader; export `cache: Cache` — `new RedisCache(getRedis())` if `redisStatus() === 'connected'` else `new NoopCache()` — re-evaluate on each call (allow switching modes at runtime)
- [ ] T047 [P] [US5] Create `apps/web/server/db/audit.ts`: import `Tx` from repositories/base; `writeAudit(tx, entry)` — `tx.insert(schema.auditLog).values({ id: ulid(), actorId: entry.actorId, action: entry.action, entity: entry.entity, entityId: entry.entityId, before: entry.before ?? null, after: entry.after ?? null, ip: entry.ip ?? null, meta: entry.meta ?? null, createdAt: Date.now() }).run()`; function is synchronous (runs inside caller's better-sqlite3 transaction)
- [ ] T048 [P] [US5] Create `apps/web/server/http/errors.ts`: abstract `AppError extends Error` with `statusCode` and `code`; concrete subclasses `ValidationError(message, { fields? })` (400, VALIDATION_ERROR), `UnauthorizedError` (401), `ForbiddenError` (403), `NotFoundError` (404), `ConflictError` (409), `RateLimitError` (429); `toErrorResponse(err: unknown): { status: number; body: ApiError }` — if `AppError` return its status and code; if `ZodError` return 400 VALIDATION_ERROR with fields map (path.join('.')→message); else log error with requestId and return 500 INTERNAL_ERROR without stack trace; import `ApiError` from `@leaddesk/shared`
- [ ] T049 [P] [US5] Create `apps/web/server/http/logger.ts`: `logRequest({ route, userId, status, ms, requestId })` writes `JSON.stringify({...})` to `process.stdout`; never log `email`, `phone`, `password`, `passwordHash`, `name` fields — keep the log schema minimal and documented

**Checkpoint**: `npm test -- --reporter=verbose bus cache errors` — all 3 test suites pass.
`bus.mode()` returns `'memory'` with Docker Redis stopped.

---

## Phase 6: US-2 — Realistic, Deterministic Demo Data (Priority: P1)

**Goal**: `npm run db:seed` produces ≈800 leads, ≈600 customers, 16 staff, 6 offers, plus all
neglected/hero scenarios, in < 10 s. Two runs with `SEED=42` produce identical counts.

**Independent Test**: Run `npm run db:reset` twice. Diff the printed summary tables. Assert
zero differences. Run `npm test -- seed.test`.

### Tests for US-2 (write first — they MUST fail before implementation)

- [ ] T050 [US2] Create `apps/web/server/db/seed/seed.test.ts`: (1) run seed twice into the same temp SQLite file, assert per-table counts are equal across runs; (2) assert per-stage counts for leads match (NEW≈7%, CONTACTED≈13%, etc.); (3) assert exactly 25 leads with `owner_id IS NULL` (unassigned); (4) assert at least 12 leads that are NEW + owned + no contact activity + age < 6 h (SLA breaches); (5) assert at least 30 follow_ups with `status='PENDING'` and `due_at < now` (overdue); (6) assert no activity has `created_at < lead.created_at` for its lead; (7) assert stage_history rows for each lead are ordered by `changed_at` ascending

### Implementation for US-2

- [ ] T051 [P] [US2] Create `apps/web/server/db/seed/utils/rng.ts`: class `SeededRng` wrapping a mulberry32 or similar deterministic PRNG seeded from `Number(process.env.SEED ?? '42')`; methods `next(): number` (0-1), `pick<T>(arr: T[]): T`, `weightedPick<T>(items: T[], weights: number[]): T`, `shuffle<T>(arr: T[]): T[]`; export singleton `rng` initialised at import time
- [ ] T052 [P] [US2] Create `apps/web/server/db/seed/utils/time.ts`: capture `const NOW = Date.now()` at module import; `daysAgo(n, jitterHours?)` returns unix ms; `workingHoursOffset(baseMs, minutesOffset)` — add minutesOffset to baseMs, clamp result to 08:00–20:00 (next working day if needed); `randomWorkingTime(afterMs)` — random time after `afterMs` within the same working day (08:00–20:00)
- [ ] T053 [P] [US2] Create `apps/web/server/db/seed/utils/reference.ts`: sequential reference generator `nextReference(year?)` → `EDM-2026-00001`, `EDM-2026-00002`, …; counter resets each seed run (module-level counter); export `generateReference()`
- [ ] T054 [P] [US2] Create `apps/web/server/db/seed/score-step.ts`: STUB — `scoreLeads(db, leadIds)` assigns deterministic scores: WALK_IN+REFERRAL sources get base 60, WEBSITE 50, social 35; WON leads ≥70, open recent leads 40–69, others 20–39; `priority` = HOT if score ≥70, WARM if ≥40, else COOL; `score_breakdown` JSON `{intent:N, source:N, customer:N, freshness:N, engagement:0}`; update each lead in a transaction; F09 replaces this body with `scoreLead()` from the scoring engine
- [ ] T055 [US2] Create `apps/web/server/db/seed/org.ts`: insert teams (DACH countries=[DE,AT,CH] strategy=LANGUAGE_MATCH, West=[FR,BE,NL,LU] LOAD_BALANCED, South=[IT,ES,PT] ROUND_ROBIN, all auto_assign=1); insert 16 users exactly per `docs/01-personas.md` org chart (Isabelle Laurent VP no team, 3 managers, 12 reps with correct languages and managerId/teamId); bcrypt password `demo1234` (10 rounds); email `firstname.lastname@eurodrive.test` with accents stripped using NFD normalization; set team `manager_id` after users are inserted; return `{ teamIds, userIds, vpId, managerIds, repIds }` lookup maps
- [ ] T056 [US2] Create `apps/web/server/db/seed/customers.ts`: generate ≈600 customers; use `@faker-js/faker` with locale selected by country (de→Faker.de, fr→Faker.fr, it→Faker.it, es→Faker.es, nl→Faker.nl, pt→Faker.pt, other→Faker.en); country distribution: DE 24%, AT 7%, CH 6%, FR 16%, BE 7%, NL 9%, LU 2%, IT 13%, ES 10%, PT 4%, other (PL/IE/DK) 2%; phone: E.164 with correct country dial code from `COUNTRIES`; channel preference per FR-033 age-band table (weightedPick by age band); 20% returning customers with 1–2 historical purchases (vehicle+amount+purchasedAt, lead_id=null) inserted into purchases; `is_returning=true` for customers with purchases; `search_text` via `buildCustomerSearchText` from shared; return `{ customerIds, returningCustomerIds }`
- [ ] T057 [P] [US2] Create `apps/web/server/db/seed/offers.ts`: insert all 6 offers per FR-038 with exact titles, discount types, values, eligibility JSON, and validity windows relative to NOW (Loyalty Bonus: NOW-60d→NOW+90d; Autumn Cashback: NOW-20d→NOW+40d; Summer Sale expired: NOW-120d→NOW-30d; others active with null/far validTo); return `{ offerIds }` map keyed by title
- [ ] T058 [US2] Create `apps/web/server/db/seed/leads.ts`: generate ≈800 leads; `created_at` distributed over last 90 days weighted 40% in last 30 (use weighted bucket: 30 days = 40%, 30-60 = 35%, 60-90 = 25%); source distribution per FR-034 (WEBSITE 35%, GOOGLE_ADS 15%, FACEBOOK 11%, INSTAGRAM 9%, WALK_IN 10%, PHONE 8%, REFERRAL 7%, PORTAL 5%); PORTAL leads get `source_detail` = "mobile.de" or "AutoScout24"; team from customer country via `COUNTRIES[country].region`; null region → round-robin across teams; stage from a `pickStage(lead_age_days, source, repId)` function implementing the FR-035 mix with source/rep variance; return `{ leadIds, leadsByStage }` including stage for each lead
- [ ] T059 [US2] Create `apps/web/server/db/seed/activities.ts`: for each lead, build a coherent timeline: (1) SYSTEM LEAD_CREATED at `lead.created_at`; (2) if owner set: SYSTEM ASSIGNED at `lead.created_at + random(0, 30min)`; (3) per-stage USER activities (3–15 on non-NEW), type matching customer preferred_channel 60% of time; (4) for WON/LOST leads: outcomes consistent with closure; (5) timestamps strictly increasing, always 08:00–20:00, never before lead.created_at; (6) derive and update lead fields: `first_response_at` = first contact activity (USER+type≠NOTE); `last_activity_at` = last USER activity; `last_contact_at` = last contact activity; `attempt_count` = consecutive unanswered (NO_ANSWER, VOICEMAIL) contact activities; `assigned_at` from ASSIGNED activity; `closed_at` from last activity on WON/LOST; (7) WON leads: insert purchases row (vehicle_model=lead.vehicleModel, amount=±10% of catalog price, lead_id=lead.id); (8) LOST leads: lost_reason per distribution PRICE 30%/BOUGHT_ELSEWHERE 25%/NOT_READY 20%/UNREACHABLE 15%/FINANCING_DECLINED 5%/OTHER 5%; (9) insert stage_history rows in order; (10) 30% of WON leads get applied_offer_id (eligible offer)
- [ ] T060 [US2] Create `apps/web/server/db/seed/scenarios.ts`: create deliberately neglected and edge-case data per FR-037 — (1) 25 unassigned leads (DACH 10, West 8, South 7) created within last 48h; (2) 12 SLA-breach leads (NEW, owned, no contact activity, age 20min–6h; 4 HOT; 2 with only an internal NOTE to verify contact-activity rule); (3) 30 overdue follow_ups (PENDING, due_at 1h–3d ago) on open leads, 20 due today, 40 due in future; (4) 20 at-risk leads (open, last_contact_at 3–6 days ago); (5) 5 leads with last_contact_at exactly 6d 23h ago; (6) Felix Wagner: ≈38 open leads with ≈60% contact coverage; Lea Hoffmann: ≈15 open leads; (7) hero lead "Giulia Conti" (South, owner=Sofia Rossi, priority=HOT, preferredChannel=WHATSAPP, language=it, vehicleModel=aurora-suv, hasTradeIn=true); (8) hero lead "Markus Klein" (DACH, owner=Anna Weber, is_returning=true, prior vento-sedan purchase in 2021, eligible for Loyalty Bonus)
- [ ] T061 [US2] Create `apps/web/server/db/seed/index.ts`: orchestrator that calls org→customers→offers→leads→activities→scenarios→score-step in order; wrap entire seed in a single `withTx` or sequential transactions; at the end print a summary table to stdout with counts per table (users, teams, customers, leads, activities, stage_history, follow_ups, offers, purchases), counts per stage, plus unassigned count, SLA breach count, overdue follow-up count; assert total time < 10 s (`console.time`/`timeEnd`); handle `SEED` env var default 42; wire `apps/web/server/db/seed/index.ts` as the target of the `db:seed` npm script via tsx

**Checkpoint**: `npm run db:reset` prints the summary table in < 15 s. `npm test -- seed.test`
— all 7 assertions pass. Run twice and diff summary tables — identical.

---

## Phase 7: US-4 — App Shell (Priority: P1)

**Goal**: Authenticated Next.js layout with role-aware nav rail and top bar. Showroom scaffold
on port 3001. Format utilities available. Activities route stub in place.

**Independent Test**: `npm run dev` starts both apps. Open `:3000` — 56 px nav rail visible,
role-based items shown, top bar rendered. Open `:3001` — placeholder page loads.

### Implementation for US-4

- [ ] T062 [P] [US4] Create `apps/web/components/ui/tokens.ts`: export design token constants — `PRIORITY_COLORS: Record<Priority, string>` (HOT: `"text-red-600"`, WARM: `"text-amber-500"`, COOL: `"text-sky-500"`); `STAGE_COLORS: Record<Stage, string>` (WON: green, LOST: red, COLD: slate, open stages: blue variants); `ACCENT = "blue-600"`, `BACKGROUND = "slate-950"`; these are imported by all UI components that need consistent colour coding
- [ ] T063 [P] [US4] Install shadcn/ui component library: run `npx shadcn-ui@latest init` in `apps/web` with slate base colour; then add all required components: `npx shadcn-ui@latest add button input select textarea dialog sheet dropdown-menu tabs badge table sonner tooltip avatar card skeleton`; verify all component files appear under `apps/web/components/ui/`
- [ ] T064 [P] [US4] Create `apps/web/lib/format.ts`: re-export `formatEUR`, `formatRelative`, `formatDateTime` from `@leaddesk/shared`; this is the canonical client-side import path for formatting (avoids importing from `server/` in client components)
- [ ] T065 [US4] Create `apps/web/server/auth/get-current-user.ts`: export `getCurrentUser(req?: Request): Promise<User | null>` — in development (when F02 not yet implemented), return the seeded VP user object `{ id: '<vp-ulid>', name: 'Isabelle Laurent', email: 'isabelle.laurent@eurodrive.test', role: 'VP', teamId: null }` hardcoded; F02 replaces this function body with real JWT cookie parsing; the function signature MUST NOT change
- [ ] T066 [US4] Create `apps/web/components/layout/nav.ts`: append-only nav config — export `NAV_ITEMS: NavItem[]` where each item has `{ href, label, icon, roles: Role[] }`; items in order: Inbox (`/inbox`, all roles), Pipeline (`/pipeline`, all roles), Dashboard (`/dashboard`, all roles), Offers (`/offers`, all roles), Team Settings (`/team/settings`, ['MANAGER','VP']), Audit (`/audit`, ['MANAGER','VP']); export `getNavItems(role: Role): NavItem[]` filtering by role
- [ ] T067 [US4] Create `apps/web/components/layout/nav-rail.tsx`: client component; 56 px wide fixed sidebar; renders `getNavItems(role)` as icon buttons with `Tooltip` (label on hover); active item: accent bar (`border-l-2 border-blue-600`) + `aria-current="page"`; icons from `lucide-react`; accepts `{ role, pathname }` props
- [ ] T068 [US4] Create `apps/web/components/layout/top-bar.tsx`: client component; 48 px tall; three zones — left: `<h1>` page title slot (accepts `title` prop); center: `<Input placeholder="Search leads (⌘K)" />` (non-functional, wired later by F04); right: three `<div>` slots (`offers-strip`, `live-dot`, `user-menu`) each with a `data-slot` attribute for F02/F12/F15 to mount into; renders user name and role badge from `user` prop
- [ ] T069 [US4] Create `apps/web/app/(app)/layout.tsx`: async server component; call `await getCurrentUser()`; if null, redirect to `/login`; render `<div className="flex h-screen">`, `<NavRail role={user.role} pathname={...} />`, `<div className="flex-1 flex flex-col">`, `<TopBar user={user} title="" />`, `<main className="flex-1 overflow-auto">{children}</main>`; export `metadata` with site name
- [ ] T070 [US4] Create `apps/web/app/layout.tsx`: root layout; `<html lang="en"><body className="bg-slate-950 text-slate-100 text-sm">`; include `<Toaster />` from sonner for toast notifications; no nav here (handled by `(app)/layout.tsx`)
- [ ] T071 [US4] Create `apps/showroom/src/App.tsx` (Vite placeholder): renders `<div className="min-h-screen bg-white flex items-center justify-center"><h1>EuroDrive Showroom</h1><p>Lead submission form coming soon (F13).</p></div>`; import one symbol from `@leaddesk/shared` (e.g. `VEHICLE_SLUGS`) and render its length to verify the alias works; wire `apps/showroom/index.html` and `apps/showroom/src/main.tsx` entry points
- [ ] T072 [US4] Verify full startup: `npm run dev` — web app renders login redirect or app shell on `:3000`, showroom placeholder on `:3001`; no TypeScript errors in terminal; no 500s in server log; nav rail shows correct items for VP stub role; top bar renders with search placeholder

**Checkpoint**: Both apps start cleanly. 56 px nav rail visible. Showroom shows EuroDrive
heading. `npm run typecheck` passes. `npm run lint` passes.

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Validate the complete feature against all success criteria in spec.md.

- [ ] T073 [P] Run `npm run typecheck` across all workspaces — must exit 0 with zero errors; fix any type issues found
- [ ] T074 [P] Run `npm run lint` across all workspaces — must exit 0 with zero warnings; fix any lint violations found
- [ ] T075 Run `npm run format` and commit any formatting changes so the codebase is consistent
- [ ] T076 Run the full quickstart.md validation sequence: (1) `npm run db:reset` twice and diff summary tables (SC-002); (2) stop Redis, restart web app, verify `:3000` loads and log prints `Redis: degraded` (SC-003); (3) navigate to `/inbox`, verify non-empty lead list (SC-004); (4) both apps running in ≤ 5 commands (SC-001); fix any failures before proceeding
- [ ] T077 Run the full test suite `npm test` — all 8 test files must pass: intake-schema.test.ts, stage-machine.test.ts, format.test.ts, schema.test.ts, bus.test.ts, cache.test.ts, errors.test.ts, seed.test.ts; fix any failures

**Final Checkpoint**: `npm test` green. `npm run typecheck` 0 errors. `npm run lint` 0 warnings.
`npm run db:reset && npm run dev` — both apps up within 60 s. Summary matches expected counts.

---

## Dependencies & Execution Order

### Phase Dependencies

```
Phase 1: Setup                  → no dependencies
Phase 2: Foundational           → Phase 1 complete
Phase 3: US-3 Shared Contracts  → Phase 2 complete (needs workspace configs)
Phase 4: US-1 Database Setup    → Phase 3 complete (schema.ts imports enums)
Phase 5: US-5 Primitives        → Phase 3 complete (bus.ts needs LeadDeskEvent)
Phase 6: US-2 Seed              → Phase 4 + Phase 5 (seed needs DB + withTx + audit)
Phase 7: US-4 App Shell         → Phase 3 + Phase 4 (needs shared + getCurrentUser)
Phase 8: Polish                 → All phases complete
```

### User Story Dependencies

| Story | Depends on | Can parallel with |
|---|---|---|
| US-3 Shared Contracts | Phase 2 | — |
| US-1 Database Setup | US-3 | US-5 (different files) |
| US-5 Platform Primitives | US-3 | US-1 (different files) |
| US-2 Demo Data | US-1 + US-5 | US-4 (different files) |
| US-4 App Shell | US-3 + US-1 (for auth stub) | US-2 (different files) |

### Within Each Phase

- Tests marked [P] MUST be written first, MUST fail before implementation begins
- Tasks marked [P] within a phase can run concurrently (different files)
- Schema-level tasks (T033) before client-level tasks (T034) before migration tasks (T037-T038)
- Seed utilities (T051-T054) before seed modules (T055-T061)

---

## Parallel Execution Examples

### Phase 3: US-3 — Launch all tests together first

```text
T017 [P] intake.test.ts        ← run concurrently
T018 [P] stage-machine.test.ts ← run concurrently
T019 [P] format.test.ts        ← run concurrently
# All fail → implement T020–T031 → all pass
```

### Phase 3: US-3 — Implement independent modules in parallel

```text
T020 [P] enums.ts    T021 [P] catalog.ts    T022 [P] countries.ts
T023 [P] source-groups.ts                   T025 [P] format.ts
T026 [P] schemas/common.ts                  T030 [P] events.ts
# All parallelisable — different files, no inter-dependencies
T024 stage-machine.ts  ← depends only on enums.ts (T020)
T027–T029 schemas/*.ts ← depend on enums.ts (T020) + catalog.ts (T021) + countries.ts (T022)
```

### Phase 5 + Phase 7: Run in parallel after Phase 4

```text
Developer A: US-5 Primitives (T041–T049)
Developer B: US-4 App Shell (T062–T072)
# Completely different file trees; no shared writes
```

---

## Implementation Strategy

### MVP First (US-3 + US-1 only)

1. Phase 1: Setup
2. Phase 2: Foundational
3. Phase 3: US-3 Shared Contracts → `npm test` shared tests pass
4. Phase 4: US-1 Database → `npm run db:reset` works → `npm test` schema tests pass
5. **STOP and VALIDATE**: Schema deploys, migrations run, append-only triggers fire
6. Proceed to remaining phases

### Incremental Delivery

1. Setup + Foundational → workspace imports work
2. US-3 → shared package fully typed, schema tests green ← first meaningful milestone
3. US-1 → DB deployed, env validated ← data layer ready
4. US-5 → primitives available to all features ← infrastructure complete
5. US-2 → `db:reset` delivers full demo dataset ← demo-ready
6. US-4 → shell visible, showroom running ← fully demo-ready
7. Polish → all checks pass ← F01 done, wave-1 features can start

### Single Developer Sequence

```
Phase 1 → Phase 2 → Phase 3 (tests first!) → Phase 4 → Phase 5 → Phase 6 → Phase 7 → Phase 8
```

Total estimated tasks: **77 tasks** (T001–T077)

---

## Notes

- `[P]` = different files, no inter-task dependencies — safe to run concurrently
- `[US?]` label maps each task to a user story from spec.md for traceability
- Tests MUST be written before implementation and MUST fail first (red → green → refactor)
- `withTx` in `server/db/repositories/base.ts` is the ONLY sanctioned path for multi-row writes
- `data/` directory is git-ignored; `db:reset` creates it if missing
- The `score-step.ts` stub is the single sanctioned cross-owner edit point — F09 replaces body only
- `handlers/get.ts` and `handlers/post.ts` are the single sanctioned cross-owner edit points for the activities route — F05/F06 replace bodies only
- Do not add `@libsql/client` as the primary driver — it's a fallback documented in client.ts comments
