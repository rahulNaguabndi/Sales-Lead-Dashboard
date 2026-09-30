# F01 — Platform Foundation

| Field | Value |
|---|---|
| **ID** | F01 |
| **Priority** | P0 |
| **Build wave** | 0 (single stream, blocks everything) |
| **Depends on** | — |
| **Blocks** | All other features |
| **Personas** | All (indirectly) |
| **Challenge req.** | — (enables R1–R3) |
| **Owns (files/areas)** | Root configs (`package.json`, `tsconfig.base.json`, `.eslintrc`, `.prettierrc`, `.gitignore`, `.env.example`), `docker-compose.yml`, `packages/shared/**` (initial contents, including `stage-machine.ts` and `source-groups.ts`), `apps/web/server/db/**` (schema, client, migrations incl. append-only triggers, seed, repositories base), `apps/web/server/db/audit.ts` (audit writer), `apps/web/server/redis/**`, `apps/web/server/events/bus.ts`, `apps/web/server/cache/cache.ts`, `apps/web/server/http/**` (error shape helpers), `apps/web/app/layout.tsx`, `apps/web/app/(app)/layout.tsx`, `apps/web/components/layout/**`, `apps/web/components/ui/**`, `apps/web/lib/format.ts`, `apps/web/app/api/leads/[id]/activities/route.ts` (delegating scaffold; the `handlers/get.ts` and `handlers/post.ts` stubs pass to F05 and F06), `apps/showroom` scaffold (config files + placeholder `src/App.tsx`) |

## 1. Summary
F01 sets up the skeleton every other feature builds on: an npm-workspaces monorepo with the Next.js web app, the Vite showroom app, and a shared contracts package. It also owns the **complete database schema** (so parallel features never collide on migrations), a deterministic realistic European seed dataset, a Redis client that degrades gracefully, the event-bus and cache interfaces, an audit writer, and the authenticated app shell. When F01 is done, `npm run db:reset && npm run dev` starts both apps with 800+ leads in the database.

## 2. User Stories & Acceptance Scenarios

### US-1 (P1): One-command local setup
*As a developer (or interviewer), I want to start the whole system with a few documented commands so that I can run the demo on any machine.*

**Independent test:** On a clean clone, run the README commands and open both apps.

1. **Given** Node ≥ 20 and Docker are installed, **When** I run `docker compose up -d redis && npm install && npm run db:reset && npm run dev`, **Then** the web app serves on :3000 and the showroom on :3001 within 60 s.
2. **Given** Redis is **not** running, **When** I run `npm run dev`, **Then** both apps still start and the web log prints `Redis: degraded (in-memory fallback)`.
3. **Given** the DB already exists, **When** I run `npm run db:reset`, **Then** the DB file is deleted, migrations are applied, and the seed reloads without prompts.

### US-2 (P1): Realistic, deterministic demo data
*As a presenter, I want the same believable European data every time so that my demo script and screenshots always match.*

**Independent test:** Run `db:reset` twice and compare the summary counts and a sample of rows.

1. **Given** `SEED=42`, **When** the seed runs twice, **Then** the entity counts, names, and the relative timestamps of every lead are identical (timestamps are offsets from "now").
2. **Given** the seed has run, **When** I query the data, **Then** there are 1 VP, 3 managers, 12 reps, 3 teams, about 600 customers, about 800 leads spread over 90 days, 6 offers, and activities on every non-NEW lead.
3. **Given** the seed has run, **Then** every downstream feature has data to show: unassigned pool leads, SLA breaches, overdue follow-ups, at-risk leads, leads that are about to go cold, returning customers with purchases, WON and LOST leads with reasons, and an expired offer.

### US-3 (P1): Shared contracts
*As a feature developer, I want enums, validation schemas, and event types in one shared package so that the web app, showroom, and simulator stay in sync.*

1. **Given** `packages/shared`, **When** the showroom imports `IntakeLeadSchema`, **Then** it validates with the same rules as the web intake endpoint.
2. **Given** a new enum value is added in `shared`, **When** I typecheck, **Then** any consumer with an exhaustive switch fails compilation.

### US-4 (P1): App shell
*As a signed-in user, I want a consistent layout with navigation for my role so that I can move between screens quickly.*

1. **Given** I'm on any authenticated page, **Then** I see a 56 px icon nav rail on the left and a top bar (search placeholder, offers-strip slot, user-menu slot).
2. **Given** my role is REP, **Then** the nav shows Inbox, Pipeline, Dashboard, and Offers. MANAGER and VP also see Team Settings and Audit.

### US-5 (P2): Platform primitives
*As a feature developer, I want ready-made helpers for Redis, events, caching, auditing, and error responses so that features stay small and consistent.*

1. **Given** `bus.publish(event)` is called with Redis up, **Then** subscribers in every process receive it. With Redis down, subscribers in the same process still receive it.
2. **Given** `writeAudit(tx, …)` is called inside a transaction that rolls back, **Then** no audit row persists.

## 3. Functional Requirements

**Monorepo & tooling**
- **FR-001**: The repo MUST be an npm-workspaces monorepo with `apps/web`, `apps/showroom`, and `packages/shared` (package name `@leaddesk/shared`).
- **FR-002**: The root `package.json` MUST expose these scripts:

| Script | Command / behavior |
|---|---|
| `dev` | `concurrently -n web,showroom "npm:dev:web" "npm:dev:showroom"` |
| `dev:web` | `npm run dev -w apps/web` (Next.js, port 3000) |
| `dev:showroom` | `npm run dev -w apps/showroom` (Vite, port 3001) |
| `redis:up` | `docker compose up -d redis` |
| `db:generate` | `drizzle-kit generate` (web workspace) |
| `db:migrate` | apply migrations to `DATABASE_URL` |
| `db:seed` | run `apps/web/server/db/seed/index.ts` |
| `db:reset` | delete DB file (+ `-wal`/`-shm`), migrate, seed |
| `simulate` | `npm run simulate -w apps/web` (the script itself is owned by F10) |
| `test` | Vitest across workspaces |
| `test:e2e` | Playwright (web) |
| `lint` / `typecheck` / `format` | ESLint / `tsc --noEmit -b` / Prettier |

- **FR-003**: TypeScript MUST be strict (`strict`, `noUncheckedIndexedAccess`) with a shared `tsconfig.base.json`.
- **FR-004**: `apps/web/.env.example` and `apps/showroom/.env.example` MUST contain exactly the variables listed in `04-architecture.md` §7: the web core, the F08 job and rule overrides (`JOBS_ENABLED`, `AT_RISK_DAYS`, `COLD_AFTER_DAYS`, `COLD_AFTER_UNANSWERED`, `MISSED_AFTER_HOURS`), the F18 AI settings (`ANTHROPIC_API_KEY`, `AI_MODEL=claude-opus-5-5`, `AI_EFFORT=low`, `AI_RATE_LIMIT_PER_HOUR`), and the showroom `VITE_*` vars. The web app MUST validate env at startup with Zod and fail fast when `JWT_SECRET` is shorter than 32 characters or `DATABASE_URL` is missing.
- **FR-005**: `docker-compose.yml` MUST define a `redis:7-alpine` service on 6379 with a healthcheck and a named volume, started with `redis-server --maxmemory 256mb --maxmemory-policy volatile-lru`. Under `volatile-lru`, only keys with a TTL can be evicted. Every key the app writes (cache, revocation, rate-limit) MUST carry a TTL (see F20). Demo-scale memory stays far below the cap.

**Database**
- **FR-010**: The Drizzle schema MUST implement every table, column, enum, and index in `03-domain-model.md` §2 (full listing in §9 below).
- **FR-011**: The DB client MUST set `journal_mode=WAL`, `foreign_keys=ON`, `busy_timeout=5000`, and `synchronous=NORMAL` on connect. It MUST be a singleton that survives Next.js hot reload (stored on `globalThis`).
- **FR-012**: IDs MUST be ULIDs, timestamps unix ms (UTC), and money integer euro cents.
- **FR-013**: The DB file path MUST come from `DATABASE_URL`, and the `data/` directory MUST be created if it's missing and ignored by git.
- **FR-014**: A `withTx(fn)` helper MUST run synchronous better-sqlite3 transactions and be the only way services perform multi-row writes.
- **FR-015**: A custom SQL migration MUST create triggers that make `activities` and `audit_log` **append-only at the DB level**: `BEFORE UPDATE` and `BEFORE DELETE` on each run `SELECT RAISE(ABORT, 'append-only table')`. (`db:reset` deletes the file, so it isn't affected.)
- **FR-016**: The customer repository MUST maintain `customers.search_text` on every insert and update: lowercased, diacritics stripped (`normalize('NFD')` + remove combining marks), made of `first_name + ' ' + last_name + ' ' + email + ' ' + phone digits`. It's indexed. The helper `buildCustomerSearchText(c)` lives in `@leaddesk/shared/format.ts`, so the seed and F10 use the same function.
- **FR-017**: `app/api/leads/[id]/activities/route.ts` MUST export `GET` and `POST`, delegating to `./handlers/get.ts` and `./handlers/post.ts`. F01 creates both handlers as stubs that return 501 `NOT_IMPLEMENTED`. F05 replaces the body of `get.ts` and F06 replaces the body of `post.ts`, so the two parallel wave-2 streams never edit the same file.

**Shared package**
- **FR-020**: `@leaddesk/shared` MUST export: `enums.ts`, `catalog.ts` (vehicles), `countries.ts` (countries → team region, dialing codes, default language), `schemas/intake.ts`, `schemas/activity.ts`, `schemas/lead-filters.ts`, `schemas/common.ts` (pagination, error shape), `events.ts`, `format.ts` (EUR and date formatters, `buildCustomerSearchText`), `stage-machine.ts` (`TRANSITIONS`, `canTransition`, `autoAdvance`, `isContactActivity`; F06 and F07 consume it, and F07 may append), and `source-groups.ts` (the source → group mapping defined in F16 §4, needed by F04's `sourceGroup` filter in wave 2; F16 may append). `scoring.ts` is added by F09.
- **FR-021**: Every enum MUST be exported both as a readonly tuple (for Zod and seeds) and as a TS union type.
- **FR-022**: The package MUST be consumable by Next.js (via `transpilePackages`) and Vite with no build step.

**Seed**
- **FR-030**: The seed MUST be deterministic for a given `SEED`. Faker is seeded, and all timestamps are computed as offsets from a single `now` captured at seed start.
- **FR-031**: The seed MUST create exactly the org chart in `01-personas.md` (1 VP, 3 managers, 12 reps, 3 teams) with password `demo1234` (bcrypt), emails `firstname.lastname@eurodrive.test` (accents stripped), and the listed languages. All teams start with `auto_assign=1`. Strategies: DACH `LANGUAGE_MATCH`, West `LOAD_BALANCED`, South `ROUND_ROBIN`, so the demo can show all three.
- **FR-032**: Customers: 600 customers across countries in the proportions DE 24%, AT 7%, CH 6%, FR 16%, BE 7%, NL 9%, LU 2%, IT 13%, ES 10%, PT 4%, and 2% "other" (PL, IE, DK). Names come from the matching Faker locale. Phones are E.164 with the correct country code. The language defaults per country (BE split nl/fr, CH split de/fr). 20% are returning customers with 1–2 `purchases` in the last 1–8 years (`lead_id` null). The seed sets `customers.is_returning = 1` for any customer with a purchase or more than one lead, and fills `search_text` via `buildCustomerSearchText`.
- **FR-033**: Channel preference MUST correlate with age band:

| Age band | Share of customers | WHATSAPP | CALL | SMS | EMAIL |
|---|---|---|---|---|---|
| 18-25 | 12% | 60% | 10% | 15% | 15% |
| 26-35 | 28% | 50% | 20% | 10% | 20% |
| 36-45 | 26% | 35% | 35% | 5% | 25% |
| 46-60 | 22% | 20% | 50% | 5% | 25% |
| 60+ | 8% | 10% | 60% | 5% | 25% |
| UNKNOWN | 4% | 30% | 30% | 10% | 30% |

- **FR-034**: Leads: 800 leads with `created_at` spread over the last 90 days, weighted toward recent (≈ 40% in the last 30 days). Sources: WEBSITE 35%, FACEBOOK 11%, INSTAGRAM 9%, GOOGLE_ADS 15%, WALK_IN 10%, PHONE 8%, REFERRAL 7%, PORTAL 5% (`source_detail` "mobile.de" or "AutoScout24"). Customers may have more than one lead. Each lead's team comes from the customer's country per `countries.ts`, with "other" countries rotated across teams.
- **FR-035**: Stage mix MUST depend on lead age. Leads older than 30 days are mostly closed or cold. Target totals: NEW 7%, CONTACTED 13%, QUALIFIED 10%, TEST_DRIVE 6%, NEGOTIATION 5%, WON 13%, LOST 31%, COLD 15%. That gives a conversion of about 30% WON÷(WON+LOST) and about 13% of all leads won. Conversion MUST vary by source (REFERRAL and WALK_IN highest, social lowest) and by rep, so charts tell a story.
- **FR-036**: Every lead MUST have a consistent history. There's a `LEAD_CREATED` system activity plus `ASSIGNED` when owned. A `stage_history` row exists per transition, in order. 3–15 USER activities appear on non-NEW leads, with types matching the customer's preferred channel about 60% of the time. Outcomes are consistent with stage progression. Activity times fall between 08:00 and 20:00, in increasing order, and never before lead creation. `first_response_at`, `last_activity_at`, `attempt_count`, `assigned_at`, and `closed_at` are derived from the generated activities. `first_response_at` and `attempt_count` count only **contact activities** (USER, type ≠ NOTE). WON leads also get a `purchases` row linked by `lead_id`. WON leads have `deal_value` in the range of the model price ±10%, and about 30% have `applied_offer_id`. LOST leads have a `lost_reason` (PRICE 30%, BOUGHT_ELSEWHERE 25%, NOT_READY 20%, UNREACHABLE 15%, FINANCING_DECLINED 5%, OTHER 5% with a note).
- **FR-037**: Neglected and edge-case data MUST be included for downstream features:
  - 25 **unassigned** leads (DACH 10, West 8, South 7) created within the last 48 h.
  - 12 **SLA-breach** leads (NEW, owned, no contact activity, age 20 min–6 h, including 4 HOT; 2 of them carry only an internal NOTE to exercise the contact-activity rule).
  - 30 **overdue follow-ups** (PENDING, `due_at` 1 h–3 days in the past), plus 20 due today and 40 in the future.
  - 20 **at-risk** leads (open, last activity 3–6 days ago).
  - 5 leads with last activity **6 days 23 hours** ago, so the cold detector visibly moves them during the demo.
  - Rep imbalance: Felix Wagner has about 38 open leads with about 60% coverage, while Lea Hoffmann has about 15 open leads.
  - Demo hero leads: "Giulia Conti" (South, owner Sofia Rossi, HOT, prefers WhatsApp, Italian, wants the aurora-suv with trade-in) and "Markus Klein" (DACH, owner Anna Weber, returning customer who bought a vento-sedan in 2021, eligible for the loyalty offer).
- **FR-038**: Offers (6):

| Title | Type / value | Eligibility | Validity |
|---|---|---|---|
| Loyalty Bonus | AMOUNT €1,000 | `customerType: RETURNING` | active, now−60d → now+90d |
| Autumn Cashback | AMOUNT €750 | ANY | active, now−20d → now+40d |
| Trade-in Boost | AMOUNT €1,500 | `requiresTradeIn: true` | active |
| 0% APR Finance | APR 0 bp | `requiresFinance: true, models: [luma-ev, aurora-suv]` | active |
| EV Switch Grant | PERCENT 5% | `models: [luma-ev]`, countries DE/NL/FR | active |
| Summer Sale | AMOUNT €500 | ANY | **expired** (now−120d → now−30d) |

- **FR-039**: `score`, `priority`, and `score_breakdown` MUST be filled in by a single seed step, `seed/score-step.ts`. Until F09 lands it uses a simple stub. F09 replaces the stub with `scoreLead()` (explicit ownership exception, see §8 D6).
- **FR-040**: At the end, the seed MUST print a summary table (counts per table, per stage, per team, unassigned, SLA breaches, overdue follow-ups) and finish in under 10 s.

**Platform primitives**
- **FR-050**: `server/redis/client.ts` MUST export `getRedis()` (an ioredis command client) and `getRedisSubscriber()` (a dedicated subscriber connection). Both are lazy singletons with `maxRetriesPerRequest: 1`, `enableOfflineQueue: false`, and a 500 ms connect timeout, and they expose `redisStatus(): 'connected' | 'degraded'`. A connection failure MUST NOT throw to callers. It logs once and flips to degraded, with a background reconnect every 10 s.
- **FR-051**: `server/events/bus.ts` MUST implement the `EventBus` interface (§9). It publishes to the Redis channel `leaddesk:events` when connected, and always also delivers to local subscribers when degraded. Delivery is de-duplicated so local subscribers never get an event twice.
- **FR-052**: `server/cache/cache.ts` MUST implement the `Cache` interface (§9) with a Redis implementation and a no-op fallback. Keys are prefixed `cache:`. The strategy and TTLs are decided by F20. F01 only provides the primitives.
- **FR-053**: `server/db/audit.ts` MUST export `writeAudit(tx, entry)`, which inserts into `audit_log` inside the caller's transaction. `entry.meta` (optional JSON: `actorType`, `userAgent`, `method`, `strategy` …) is stored in `audit_log.meta`. The contract is in F19 FR-002.
- **FR-054**: `server/http/errors.ts` MUST define `AppError` subclasses (`ValidationError` 400, `UnauthorizedError` 401, `ForbiddenError` 403, `NotFoundError` 404, `ConflictError` 409, `RateLimitError` 429) and `toErrorResponse(err)`, which produces `{ error: { code, message, fields? } }` (`fields`: map of field path → message, used by 400 `VALIDATION_ERROR`) and logs a request id. Unknown errors map to 500 `INTERNAL_ERROR` without leaking stack traces.
- **FR-055**: Structured JSON request logging helper `logRequest({route, userId, status, ms, requestId})`.

**App shell & showroom scaffold**
- **FR-060**: The web app MUST include Tailwind, the shadcn/ui primitives (button, input, select, textarea, dialog, sheet, dropdown-menu, tabs, badge, table, toast/sonner, tooltip, avatar, card, skeleton), a `(app)` route-group layout with the nav rail and top bar, and role-aware navigation driven by an append-only `components/layout/nav.ts` config.
- **FR-061**: The shell MUST read the current user through an injectable `getCurrentUser` (implemented by F02). Until F02 lands, a dev stub returns the seeded VP.
- **FR-062**: `apps/showroom` MUST be a Vite + React + TS + Tailwind app on port 3001 that imports `@leaddesk/shared` and renders a placeholder page. F13 owns `src/**` after scaffolding.
- **FR-063**: `lib/format.ts` MUST re-export `formatEUR(cents)` (default `de-DE` → "38.900 €"), `formatRelative(ms)`, and `formatDateTime(ms)` (24 h) from shared.

## 4. Key Entities & Data
All entities in `03-domain-model.md`. F01 creates them. It only *writes* business data during seeding.

## 5. Edge Cases & Error Handling
- The better-sqlite3 native build fails on Node 24/Windows → document and support the fallback driver `@libsql/client` behind `server/db/client.ts`. The rest of the code only depends on the Drizzle instance.
- `db:reset` while `npm run dev` holds the DB open (Windows file lock) → the script detects `EBUSY` and prints "Stop the dev server first".
- The Redis container restarts mid-session → the client reconnects and the status flips back to connected without an app restart.
- Hot reload creates duplicate DB/Redis connections or duplicate subscribers → all singletons are stored on `globalThis`.
- `SEED` missing → default to 42.
- A customer with neither email nor phone → impossible by schema (CHECK constraint) and the seed generator.

## 6. Success Criteria
- **SC-001**: Clean clone to both apps running in ≤ 5 documented commands and ≤ 3 minutes (excluding download time).
- **SC-002**: `db:reset` completes in < 15 s, and two runs with the same seed produce identical per-table and per-stage counts.
- **SC-003**: With Redis stopped, 100% of the app's pages still load. Only features that need cross-process events are affected.
- **SC-004**: Every downstream feature's primary screen has non-empty data after seeding.
- **SC-005**: `npm run typecheck` and `npm run lint` pass with zero errors.

## 7. UX Notes
- Nav rail: 56 px, icon + tooltip, active state with an accent bar and `aria-current="page"`. Order: Inbox, Pipeline, Dashboard, Offers, Team Settings\*, Audit\* (\* MANAGER/VP).
- Top bar: 48 px. Left: page title / breadcrumb. Center: search input placeholder "Search leads (⌘K)" (wired later by F04). Right: offers strip slot (F15), live-connection dot slot (F12), user menu (F02: name, role badge, team, Logout).
- Design tokens: neutral slate background, one accent (blue-600), stage colors and priority colors defined once in `components/ui/tokens.ts` (HOT red-600, WARM amber-500, COOL sky-500). Base font 14 px with dense spacing.
- Loading state uses skeletons. The global error boundary shows "Something went wrong" with a request id.

## 8. Decisions
| # | Decision | Alternatives | Rationale |
|---|---|---|---|
| D1 | F01 owns the **complete schema** up front | Each feature adds its tables | Parallel Spec Kit runs never conflict on migrations (ADR-010) |
| D2 | npm workspaces, no Turborepo | Turborepo, pnpm, Nx | Zero extra tooling; 3 packages don't need a build graph |
| D3 | Shared package consumed as TS source (no build) | Build with tsup | Simpler dev loop; both Next.js and Vite transpile it |
| D4 | Seed timestamps relative to "now" | Fixed calendar dates | Data always looks fresh on demo day while staying deterministic |
| D5 | Redis optional with degraded mode | Hard dependency | The demo must never fail because Docker isn't running |
| D6 | `seed/score-step.ts` stub, replaced by F09 | Seed imports scoring (would need F09 first) | Keeps F01 independent. It's the single sanctioned cross-owner edit |
| D7 | ULID ids | Autoincrement ints, UUIDv4 | Sortable, non-enumerable, safe in URLs |
| D8 | Money as integer cents | REAL / decimal strings | No float rounding errors |
| D9 | Stage-mix and conversion variance baked into the seed | Uniform random | Dashboards need a narrative (source and rep differences) |
| D10 | Append-only enforced by SQLite triggers on `activities` and `audit_log` | App-level convention only | Traceability guaranteed even against buggy code or manual SQL |
| D11 | `is_returning` stored (not derived) | Derive with EXISTS on each read | Cheap inbox filter and badge; set by seed, F10 dedupe, and F07 on WON |
| D12 | `search_text` column for accent-insensitive search | SQLite ICU extension, FTS5 | Zero native extensions; "Emile" matches "Émile" with a plain `LIKE` |
| D13 | The activities route is a delegating scaffold with per-feature handler files | F05 and F06 both edit `route.ts` | Parallel wave-2 streams don't conflict |
| D14 | `stage-machine.ts` and `source-groups.ts` ship in F01 | Owned by F07 / F16 | Wave-2 features (F06 auto-advance, F04 source-group filter) need them before F07 or F16 exist |

## 9. Technical Plan Input (for `/speckit.plan`)

### 9.1 Drizzle schema (`apps/web/server/db/schema.ts`)
```ts
import { sqliteTable, text, integer, index, uniqueIndex, check } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
import { ROLES, ASSIGN_STRATEGIES, LEAD_SOURCES, STAGES, PRIORITIES, ACTIVITY_KINDS,
  ACTIVITY_TYPES, OUTCOMES, CHANNELS, BEST_TIMES, AGE_BANDS, LOST_REASONS,
  FOLLOW_UP_STATUSES, DISCOUNT_TYPES } from '@leaddesk/shared';

const ts = (n: string) => integer(n, { mode: 'number' });
const bool = (n: string) => integer(n, { mode: 'boolean' });
const json = <T>(n: string) => text(n, { mode: 'json' }).$type<T>();

export const teams = sqliteTable('teams', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  region: text('region', { enum: ['DACH', 'WEST', 'SOUTH'] }).notNull(),
  countries: json<string[]>('countries').notNull(),
  managerId: text('manager_id'),                                  // FK added via users (circular) – enforced in app + seed order
  autoAssign: bool('auto_assign').notNull().default(true),
  assignStrategy: text('assign_strategy', { enum: ASSIGN_STRATEGIES }).notNull().default('LOAD_BALANCED'),
  rrCursor: text('rr_cursor'),
});

export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull(),
  passwordHash: text('password_hash').notNull(),
  role: text('role', { enum: ROLES }).notNull(),
  managerId: text('manager_id').references((): any => users.id),
  teamId: text('team_id').references(() => teams.id),
  languages: json<string[]>('languages').notNull(),
  avatarColor: text('avatar_color').notNull(),
  isActive: bool('is_active').notNull().default(true),
  maxOpenLeads: integer('max_open_leads').notNull().default(25),
  lastAssignedAt: ts('last_assigned_at'),
  tokenVersion: integer('token_version').notNull().default(0),
  createdAt: ts('created_at').notNull(),
}, t => ({ emailUq: uniqueIndex('users_email_uq').on(t.email), mgrIdx: index('users_manager_idx').on(t.managerId) }));

export const customers = sqliteTable('customers', {
  id: text('id').primaryKey(),
  firstName: text('first_name').notNull(), lastName: text('last_name').notNull(),
  email: text('email'), phone: text('phone'),
  country: text('country').notNull(), city: text('city'),
  age: integer('age'), ageBand: text('age_band', { enum: AGE_BANDS }).notNull().default('UNKNOWN'),
  language: text('language').notNull(),
  preferredChannel: text('preferred_channel', { enum: CHANNELS }).notNull(),
  secondaryChannel: text('secondary_channel', { enum: CHANNELS }),
  bestTime: text('best_time', { enum: BEST_TIMES }).notNull().default('ANYTIME'),
  isReturning: bool('is_returning').notNull().default(false),     // set by seed, F10 dedupe, F07 on WON
  marketingConsent: bool('marketing_consent').notNull().default(false),
  searchText: text('search_text').notNull().default(''),         // lowercased, diacritics stripped (FR-016)
  createdAt: ts('created_at').notNull(),
}, t => ({
  phoneIdx: index('customers_phone_idx').on(t.phone),
  emailIdx: index('customers_email_idx').on(t.email),
  searchIdx: index('customers_search_idx').on(t.searchText),
  contactChk: check('customers_contact_chk', sql`${t.email} IS NOT NULL OR ${t.phone} IS NOT NULL`),
}));

export const leads = sqliteTable('leads', {
  id: text('id').primaryKey(),
  reference: text('reference').notNull(),
  customerId: text('customer_id').notNull().references(() => customers.id),
  teamId: text('team_id').notNull().references(() => teams.id),
  ownerId: text('owner_id').references(() => users.id),
  source: text('source', { enum: LEAD_SOURCES }).notNull(),
  sourceDetail: text('source_detail'),
  stage: text('stage', { enum: STAGES }).notNull().default('NEW'),
  vehicleModel: text('vehicle_model'),
  budgetMin: integer('budget_min'), budgetMax: integer('budget_max'),
  hasTradeIn: bool('has_trade_in').notNull().default(false),
  wantsFinance: bool('wants_finance').notNull().default(false),
  testDriveRequested: bool('test_drive_requested').notNull().default(false),
  message: text('message'),
  score: integer('score').notNull().default(0),
  priority: text('priority', { enum: PRIORITIES }).notNull().default('COOL'),
  scoreBreakdown: json<ScoreBreakdown>('score_breakdown').notNull(),
  attemptCount: integer('attempt_count').notNull().default(0),
  dealValue: integer('deal_value'),
  appliedOfferId: text('applied_offer_id').references(() => offers.id),
  lostReason: text('lost_reason', { enum: LOST_REASONS }), lostNote: text('lost_note'),
  firstResponseAt: ts('first_response_at'), lastActivityAt: ts('last_activity_at'), lastContactAt: ts('last_contact_at'),
  assignedAt: ts('assigned_at'), closedAt: ts('closed_at'),
  createdAt: ts('created_at').notNull(), updatedAt: ts('updated_at').notNull(),
  version: integer('version').notNull().default(0),
}, t => ({
  refUq: uniqueIndex('leads_reference_uq').on(t.reference),
  ownerStage: index('leads_owner_stage_idx').on(t.ownerId, t.stage),
  teamOwner: index('leads_team_owner_idx').on(t.teamId, t.ownerId),
  created: index('leads_created_idx').on(t.createdAt),
  lastAct: index('leads_last_activity_idx').on(t.lastActivityAt),
  stageContact: index('leads_stage_last_contact_idx').on(t.stage, t.lastContactAt),
  source: index('leads_source_idx').on(t.source),
  prio: index('leads_priority_score_idx').on(t.priority, t.score),
}));

export const activities = sqliteTable('activities', {
  id: text('id').primaryKey(),
  leadId: text('lead_id').notNull().references(() => leads.id),
  actorId: text('actor_id').references(() => users.id),
  kind: text('kind', { enum: ACTIVITY_KINDS }).notNull(),
  type: text('type', { enum: ACTIVITY_TYPES }).notNull(),
  outcome: text('outcome', { enum: OUTCOMES }),
  note: text('note').notNull().default(''),
  aiAssisted: bool('ai_assisted').notNull().default(false),
  metadata: json<Record<string, unknown>>('metadata'),
  createdAt: ts('created_at').notNull(),
}, t => ({ leadTime: index('activities_lead_time_idx').on(t.leadId, t.createdAt) }));

export const stageHistory = sqliteTable('stage_history', {
  id: text('id').primaryKey(),
  leadId: text('lead_id').notNull().references(() => leads.id),
  fromStage: text('from_stage', { enum: STAGES }), toStage: text('to_stage', { enum: STAGES }).notNull(),
  changedBy: text('changed_by').references(() => users.id), reason: text('reason'),
  changedAt: ts('changed_at').notNull(),
}, t => ({ leadTime: index('stage_history_lead_time_idx').on(t.leadId, t.changedAt) }));

export const followUps = sqliteTable('follow_ups', {
  id: text('id').primaryKey(),
  leadId: text('lead_id').notNull().references(() => leads.id),
  assignedTo: text('assigned_to').notNull().references(() => users.id),
  dueAt: ts('due_at').notNull(),
  status: text('status', { enum: FOLLOW_UP_STATUSES }).notNull().default('PENDING'),
  note: text('note'),
  createdBy: text('created_by').references(() => users.id),
  createdAt: ts('created_at').notNull(), completedAt: ts('completed_at'),
  completedByActivityId: text('completed_by_activity_id').references(() => activities.id),
}, t => ({ due: index('follow_ups_assignee_status_due_idx').on(t.assignedTo, t.status, t.dueAt) }));

export const offers = sqliteTable('offers', {
  id: text('id').primaryKey(),
  title: text('title').notNull(), description: text('description').notNull(),
  discountType: text('discount_type', { enum: DISCOUNT_TYPES }).notNull(),
  value: integer('value'),                                       // cents | basis points | null (GIFT)
  validFrom: ts('valid_from').notNull(), validTo: ts('valid_to').notNull(),
  eligibility: json<OfferEligibility>('eligibility').notNull(),
  isActive: bool('is_active').notNull().default(true),
  createdBy: text('created_by').references(() => users.id), createdAt: ts('created_at').notNull(),
});

export const purchases = sqliteTable('purchases', {
  id: text('id').primaryKey(),
  customerId: text('customer_id').notNull().references(() => customers.id),
  leadId: text('lead_id').references(() => leads.id),            // null for historical seed purchases
  vehicleModel: text('vehicle_model').notNull(), amount: integer('amount').notNull(),
  purchasedAt: ts('purchased_at').notNull(),
}, t => ({ customer: index('purchases_customer_idx').on(t.customerId) }));

export const auditLog = sqliteTable('audit_log', {
  id: text('id').primaryKey(),
  actorId: text('actor_id').references(() => users.id),
  action: text('action').notNull(), entity: text('entity').notNull(), entityId: text('entity_id').notNull(),
  before: json<unknown>('before'), after: json<unknown>('after'),
  meta: json<Record<string, unknown>>('meta'),                  // actorType, userAgent, method, strategy …
  ip: text('ip'), createdAt: ts('created_at').notNull(),
}, t => ({
  entity: index('audit_entity_idx').on(t.entity, t.entityId),
  created: index('audit_created_idx').on(t.createdAt),
}));
```
(`offers` must be declared before `leads` in the file, or referenced lazily.)

Custom migration `0001_append_only.sql` (FR-015):
```sql
CREATE TRIGGER activities_no_update BEFORE UPDATE ON activities BEGIN SELECT RAISE(ABORT, 'append-only table'); END;
CREATE TRIGGER activities_no_delete BEFORE DELETE ON activities BEGIN SELECT RAISE(ABORT, 'append-only table'); END;
CREATE TRIGGER audit_log_no_update  BEFORE UPDATE ON audit_log  BEGIN SELECT RAISE(ABORT, 'append-only table'); END;
CREATE TRIGGER audit_log_no_delete  BEFORE DELETE ON audit_log  BEGIN SELECT RAISE(ABORT, 'append-only table'); END;
```

### 9.2 Shared package (`packages/shared/src`)
```ts
// enums.ts
export const ROLES = ['REP', 'MANAGER', 'VP'] as const;                  export type Role = typeof ROLES[number];
export const ASSIGN_STRATEGIES = ['LOAD_BALANCED', 'LANGUAGE_MATCH', 'ROUND_ROBIN'] as const;
export const LEAD_SOURCES = ['WEBSITE','FACEBOOK','INSTAGRAM','GOOGLE_ADS','PORTAL','WALK_IN','PHONE','REFERRAL'] as const;
export const STAGES = ['NEW','CONTACTED','QUALIFIED','TEST_DRIVE','NEGOTIATION','WON','LOST','COLD'] as const;
export const OPEN_STAGES = ['NEW','CONTACTED','QUALIFIED','TEST_DRIVE','NEGOTIATION'] as const;
export const PRIORITIES = ['HOT','WARM','COOL'] as const;
export const ACTIVITY_KINDS = ['USER','SYSTEM'] as const;
export const USER_ACTIVITY_TYPES = ['CALL','WHATSAPP','SMS','EMAIL','MEETING','TEST_DRIVE','NOTE'] as const;
export const SYSTEM_ACTIVITY_TYPES = ['LEAD_CREATED','STAGE_CHANGED','ASSIGNED','CLAIMED','FOLLOW_UP_SCHEDULED',
  'FOLLOW_UP_MISSED','AUTO_COLD','OFFER_APPLIED','SCORE_CHANGED'] as const;
export const ACTIVITY_TYPES = [...USER_ACTIVITY_TYPES, ...SYSTEM_ACTIVITY_TYPES] as const;
export const OUTCOMES = ['CONNECTED','NO_ANSWER','VOICEMAIL','INTERESTED','NOT_INTERESTED','CALLBACK_REQUESTED'] as const;
export const CHANNELS = ['CALL','WHATSAPP','SMS','EMAIL'] as const;
export const BEST_TIMES = ['MORNING','AFTERNOON','EVENING','ANYTIME'] as const;
export const AGE_BANDS = ['18-25','26-35','36-45','46-60','60+','UNKNOWN'] as const;
export const LOST_REASONS = ['PRICE','BOUGHT_ELSEWHERE','NOT_READY','UNREACHABLE','FINANCING_DECLINED','OTHER'] as const;
export const FOLLOW_UP_STATUSES = ['PENDING','DONE','MISSED','CANCELLED'] as const;
export const DISCOUNT_TYPES = ['AMOUNT','PERCENT','APR','GIFT'] as const;
export const LANGUAGES = ['de','fr','it','es','nl','pt','en','pl','da'] as const;

// catalog.ts
export const VEHICLES = [
  { slug: 'aurora-suv',  name: 'Aurora SUV',  body: 'SUV',   fuel: 'Hybrid',   priceCents: 3_890_000 },
  { slug: 'metro-hatch', name: 'Metro Hatch', body: 'Hatch', fuel: 'Petrol',   priceCents: 2_150_000 },
  { slug: 'vento-sedan', name: 'Vento Sedan', body: 'Sedan', fuel: 'Diesel',   priceCents: 3_240_000 },
  { slug: 'terra-4x4',   name: 'Terra 4x4',   body: '4x4',   fuel: 'Diesel',   priceCents: 5_490_000 },
  { slug: 'luma-ev',     name: 'Luma EV',     body: 'Hatch', fuel: 'Electric', priceCents: 4_270_000 },
  { slug: 'nova-van',    name: 'Nova Van',    body: 'Van',   fuel: 'Diesel',   priceCents: 3_620_000 },
] as const;
export const VEHICLE_SLUGS = VEHICLES.map(v => v.slug) as [string, ...string[]];

// countries.ts – drives routing (F10) and phone prefixes (F13)
export const COUNTRIES = {
  DE: { name: 'Germany', dial: '+49', region: 'DACH', lang: 'de' }, AT: { name: 'Austria', dial: '+43', region: 'DACH', lang: 'de' },
  CH: { name: 'Switzerland', dial: '+41', region: 'DACH', lang: 'de' }, FR: { name: 'France', dial: '+33', region: 'WEST', lang: 'fr' },
  BE: { name: 'Belgium', dial: '+32', region: 'WEST', lang: 'nl' },  NL: { name: 'Netherlands', dial: '+31', region: 'WEST', lang: 'nl' },
  LU: { name: 'Luxembourg', dial: '+352', region: 'WEST', lang: 'fr' }, IT: { name: 'Italy', dial: '+39', region: 'SOUTH', lang: 'it' },
  ES: { name: 'Spain', dial: '+34', region: 'SOUTH', lang: 'es' },   PT: { name: 'Portugal', dial: '+351', region: 'SOUTH', lang: 'pt' },
  PL: { name: 'Poland', dial: '+48', region: null, lang: 'pl' },     IE: { name: 'Ireland', dial: '+353', region: null, lang: 'en' },
  DK: { name: 'Denmark', dial: '+45', region: null, lang: 'da' },
} as const;   // region null => round-robin across teams
export const COUNTRY_CODES = Object.keys(COUNTRIES) as [keyof typeof COUNTRIES, ...(keyof typeof COUNTRIES)[]];

// schemas/intake.ts – THE public contract shared by F13 (showroom), F10 (intake API), simulator
export const IntakeLeadSchema = z.object({
  firstName: z.string().trim().min(1).max(60),
  lastName: z.string().trim().min(1).max(60),
  email: z.string().trim().toLowerCase().email().max(254).optional(),
  phone: z.string().trim().regex(/^\+?[0-9 ()-]{6,20}$/).optional(),   // normalized to E.164 server-side
  country: z.enum(COUNTRY_CODES),
  city: z.string().trim().max(80).optional(),
  age: z.number().int().min(18).max(100).optional(),                    // F10 derives ageBand from age when ageBand is UNKNOWN
  ageBand: z.enum(AGE_BANDS).default('UNKNOWN'),
  language: z.enum(LANGUAGES),
  preferredChannel: z.enum(CHANNELS),
  secondaryChannel: z.enum(CHANNELS).optional(),
  bestTime: z.enum(BEST_TIMES).default('ANYTIME'),
  vehicleModel: z.enum(VEHICLE_SLUGS).optional(),
  budgetMin: z.number().int().nonnegative().optional(),                 // euro cents
  budgetMax: z.number().int().positive().max(50_000_000).optional(),
  hasTradeIn: z.boolean().default(false),
  wantsFinance: z.boolean().default(false),
  testDriveRequested: z.boolean().default(false),
  message: z.string().trim().max(2000).optional(),
  source: z.enum(LEAD_SOURCES).default('WEBSITE'),
  sourceDetail: z.string().trim().max(120).optional(),
  marketingConsent: z.boolean().default(false),
  idempotencyKey: z.string().max(64).optional(),                          // body fallback; the Idempotency-Key header wins
  website: z.string().optional(),                                         // honeypot: F10 checks non-empty explicitly → 202, no write
}).refine(d => d.email || d.phone, { message: 'Email or phone is required', path: ['email'] })
  .refine(d => d.preferredChannel === 'EMAIL' ? !!d.email : !!d.phone,
          { message: 'Contact detail for preferred channel is required', path: ['preferredChannel'] })
  .refine(d => d.budgetMin == null || d.budgetMax == null || d.budgetMin <= d.budgetMax,
          { message: 'Minimum budget exceeds maximum', path: ['budgetMin'] });
export type IntakeLead = z.infer<typeof IntakeLeadSchema>;
export const IntakeResponseSchema = z.object({
  reference: z.string(), status: z.enum(['created', 'duplicate']),
  assignedTo: z.object({ firstName: z.string() }).nullable(),
  expectedContact: z.object({ channel: z.enum(CHANNELS), bestTime: z.enum(BEST_TIMES) }),
});

// schemas/activity.ts – request body of POST /api/leads/:id/activities (F06 §9 is the behavioural owner; F06 may refine append-only)
export const CreateActivitySchema = z.object({
  clientRequestId: z.string().length(26),                                  // ULID, idempotency
  type: z.enum(USER_ACTIVITY_TYPES), outcome: z.enum(OUTCOMES).optional(), // outcome rules per F06 FR-002 (superRefine)
  note: z.string().trim().min(1).max(2000),
  aiAssisted: z.boolean().default(false),                                  // set by F18 prefill
  nextFollowUp: z.object({ dueAt: z.string().datetime(), note: z.string().trim().max(200).optional() }).optional(),
  completeFollowUpId: z.string().optional(),
  stageChange: z.object({ to: z.enum(OPEN_STAGES) }).optional(),
  expectedVersion: z.number().int().optional(),
});

// schemas/lead-filters.ts – matches the F04 §9 param table (F04 may refine append-only). CSV params → arrays via csv().
export const LeadListQuerySchema = z.object({
  view: z.enum(['mine','unassigned','due_today','going_cold','team','all']).optional(),   // default by role (F04 FR-002)
  stage: csv(z.enum(STAGES)).optional(), source: csv(z.enum(LEAD_SOURCES)).optional(),
  priority: csv(z.enum(PRIORITIES)).optional(),
  owner: csv(z.string()).optional(),                  // user ids or 'unassigned' (MANAGER/VP)
  team: csv(z.string()).optional(),                   // VP
  returning: zBool.optional(), overdue: zBool.optional(), closed: zBool.optional(),
  sla: z.enum(['breached']).optional(), sourceGroup: z.enum(SOURCE_GROUPS).optional(),
  createdFrom: z.string().date().optional(), createdTo: z.string().date().optional(),
  q: z.string().trim().min(2).max(100).optional(),
  sort: z.enum(['rank','newest','oldest_untouched','next_follow_up','score','last_activity']).default('rank'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().refine(n => [10, 25, 50].includes(n)).default(25),
  tz: z.string().default('Europe/Berlin'),
});

// schemas/common.ts
export type ApiError = { error: { code: string; message: string; fields?: Record<string, string> } };  // fields: path → message
export type Paginated<T> = { items: T[]; page: number; pageSize: number; total: number };

// source-groups.ts – mapping defined in F16 §4 (F16 may append)
export const SOURCE_GROUPS = ['WEBSITE','SOCIAL','PAID_SEARCH','PORTALS','OFFLINE','REFERRAL'] as const;
export type SourceGroup = typeof SOURCE_GROUPS[number];
export const SOURCE_GROUP_OF: Record<LeadSource, SourceGroup> = {
  WEBSITE: 'WEBSITE', FACEBOOK: 'SOCIAL', INSTAGRAM: 'SOCIAL', GOOGLE_ADS: 'PAID_SEARCH',
  PORTAL: 'PORTALS', WALK_IN: 'OFFLINE', PHONE: 'OFFLINE', REFERRAL: 'REFERRAL',
};

// stage-machine.ts – docs/03 §3 (F07 consumes; append-only)
export const TRANSITIONS: Record<Stage, readonly Stage[]>;   // allowed targets per docs/03 §3, incl. backward open moves
export function canTransition(from: Stage, to: Stage, role: Role | 'SYSTEM'): boolean;
//   COLD target: SYSTEM or MANAGER/VP only · LOST → CONTACTED: MANAGER/VP only · WON terminal
export function isContactActivity(type: ActivityType, kind: ActivityKind): boolean; // kind USER && type !== 'NOTE'
export function autoAdvance(stage: Stage, type: ActivityType, kind: ActivityKind): Stage | null;
//   NEW + contact activity → CONTACTED · COLD + contact activity → CONTACTED (revive) · else null

// events.ts
type Base = { at: number; teamId: string; ownerId: string | null; by: string | null };  // by: actor user id, null = system/intake
export type LeadDeskEvent =
  | (Base & { type: 'lead.created'; lead: LeadSummary })
  | (Base & { type: 'lead.assigned'; leadId: string; fromOwnerId: string | null; toOwnerId: string | null;
              method: 'AUTO' | 'MANUAL' | 'CLAIM' })
  | (Base & { type: 'lead.updated'; leadId: string; changes: Partial<LeadSummary> })
  | (Base & { type: 'activity.created'; leadId: string; activity: ActivityDTO })
  | (Base & { type: 'followup.due'; followUpId: string; leadId: string; dueAt: number })
  | (Omit<Base, 'ownerId' | 'teamId'> & { type: 'offer.changed'; offerId: string; teamId: null; ownerId: null });
export const EVENTS_CHANNEL = 'leaddesk:events';
// LeadSummary = inbox row DTO (id, reference, customerName, vehicleModel, source, stage, priority, score, ownerId,
//   ownerName, teamId, createdAt, lastActivityAt, nextFollowUpAt, isReturning, slaStatus); ActivityDTO = activity + actorName.
```

### 9.3 Platform interfaces
```ts
// server/events/bus.ts
export interface EventBus {
  publish(e: LeadDeskEvent): Promise<void>;          // never throws
  subscribe(handler: (e: LeadDeskEvent) => void): () => void;
  mode(): 'redis' | 'memory';
}
export const bus: EventBus;

// server/cache/cache.ts
export interface Cache {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T, ttlSeconds: number): Promise<void>;
  del(...keys: string[]): Promise<void>;
  delByPrefix(prefix: string): Promise<void>;         // SCAN + UNLINK
  wrap<T>(key: string, ttlSeconds: number, loader: () => Promise<T>): Promise<T>;  // cache-aside primitive
}
export const cache: Cache;                            // RedisCache or NoopCache per redisStatus()

// server/db/audit.ts
export function writeAudit(tx: Tx, e: { actorId: string | null; action: string; entity: string; entityId: string;
  before?: unknown; after?: unknown; ip?: string | null; meta?: Record<string, unknown> }): void;

// server/db/client.ts
export const db: BetterSQLite3Database<typeof schema>;
export function withTx<T>(fn: (tx: Tx) => T): T;
```

### 9.4 Seed layout
`server/db/seed/index.ts` (orchestrator, prints summary) → `org.ts` → `customers.ts` → `leads.ts` (stage-path generator per age) → `activities.ts` (timeline builder: stage path → activities, stage_history, follow_ups, derived lead fields) → `offers.ts` → `scenarios.ts` (neglected and hero leads, FR-037) → `score-step.ts`. Utilities: `rng.ts` (seeded weighted pick), `time.ts` (working-hours offsets), `reference.ts` (`EDM-<YYYY>-<5-digit seq>`).

### 9.5 Tests
- `schema.test.ts`: migrations apply to an in-memory DB, and the CHECK constraint rejects a customer with no email and no phone. UPDATE/DELETE on `activities` and `audit_log` abort (triggers).
- `stage-machine.test.ts`: the full transition table per docs/03 §3, role rules, `autoAdvance` (NOTE never advances), and `isContactActivity`.
- `search-text.test.ts`: "Émile Dubois" → "emile dubois …", and phone digits are included.
- `seed.test.ts`: seed into a temp DB twice with the same seed and assert equal counts per table and stage. Assert the FR-037 scenario counts. Assert no activity predates its lead, and stage_history is ordered.
- `bus.test.ts`: in memory mode, a local subscriber receives an event exactly once.
- `cache.test.ts`: `wrap` calls the loader once while cached, and NoopCache always calls the loader.
- `intake-schema.test.ts`: valid payload passes. Missing email and phone fails. WHATSAPP preferred without a phone fails. budgetMin > budgetMax fails. A filled honeypot still parses (F10 rejects it explicitly with 202).
- `errors.test.ts`: `toErrorResponse` produces the right shapes and status codes.

## 10. Out of Scope
- Auth logic (F02), scope/policy (F03), scoring rules (F09), and all business services and screens.
- The caching strategy and TTL decisions (F20). F01 ships primitives only.
- Production Dockerfiles for the apps (optional later).

## 11. Open Questions
- Should the seed use `en-IE` currency formatting instead of `de-DE`? Default is `de-DE` per `04-architecture.md` §9. It can be changed in `format.ts`.
- Should the Redis connection be required in CI? Proposed: no. Tests run in memory mode.

## 12. Spec Kit Prompts
**`/speckit.specify`**
> Create the foundation for "EuroDrive Lead Desk", a sales lead management tool for a European car dealership group. Developers must be able to start the whole system (the staff web app and a separate public showroom website) with a handful of documented commands, and it must keep working even if the optional caching/messaging service is unavailable. It needs a complete, realistic, repeatable demo dataset: a three-level sales organization (1 VP, 3 regional managers for DACH, West and South, and 12 reps with the languages they speak), about 600 European customers with age-correlated contact preferences and 20% returning customers, about 800 leads over the last 90 days from eight sources with believable stage progression, activity histories, won/lost outcomes, and follow-ups, 6 promotional offers (one expired), and deliberately neglected leads (unassigned, overdue, response-time breaches, about to go cold) so every later feature has something to show. It also needs shared definitions (vocabularies, the public lead-enquiry format, live-event formats) that all apps use, and a consistent signed-in layout with role-based navigation.

**`/speckit.plan`**
> npm-workspaces monorepo: `apps/web` (Next.js App Router, TypeScript strict, Tailwind, shadcn/ui), `apps/showroom` (Vite + React + TS + Tailwind, port 3001), `packages/shared` (`@leaddesk/shared`, TS source consumed via `transpilePackages`). SQLite via better-sqlite3 (WAL, foreign_keys, busy_timeout) with Drizzle ORM and drizzle-kit migrations, and a fallback driver `@libsql/client`. The full schema is exactly as in docs/features/F01 §9.1 and docs/03-domain-model.md. ULID ids, unix-ms timestamps, integer euro cents. Zod env validation. Redis 7 via docker-compose and ioredis with graceful degradation (a degraded mode with an in-memory EventEmitter bus and a no-op cache). Redis runs with `maxmemory 256mb`, `volatile-lru`. SQLite triggers make activities and audit_log append-only. The shared stage machine and source groups are in §9.2. The activities route is a delegating scaffold (FR-017). EventBus and Cache interfaces are in §9.3, and there's a `writeAudit(tx)` helper (with `meta`), AppError classes, and a JSON error shape. Deterministic seed with @faker-js/faker (de/fr/it/es/nl/pt locales), seeded RNG, timestamps relative to now, distributions and scenarios per F01 FR-031…FR-040, and a score-step stub that F09 replaces. Root scripts per FR-002 using concurrently. Tests with Vitest: schema, seed determinism and scenarios, bus, cache, intake schema, errors. Follow docs/04-architecture.md for the layout and the path ownership in docs/features/README.md.
