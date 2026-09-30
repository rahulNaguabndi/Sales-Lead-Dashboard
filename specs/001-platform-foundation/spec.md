# Feature Specification: F01 — Platform Foundation

**Feature Branch**: `001-platform-foundation`

**Created**: 2026-09-30

**Status**: Draft

**Input**: User description: "F01 Platform Foundation. The authoritative spec is docs/features/F01-platform-foundation.md."

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 — One-Command Local Setup (Priority: P1)

As a developer or interviewer, I want to start the whole system with a few documented commands
so that I can run the demo on any machine without needing prior project knowledge.

**Why this priority**: Without a reproducible startup sequence, no other feature can be
demonstrated or tested. This is the entry point for every evaluation.

**Independent Test**: On a clean clone with Node ≥ 20 and Docker installed, run the documented
startup commands and confirm both apps open in a browser.

**Acceptance Scenarios**:

1. **Given** Node ≥ 20 and Docker are installed, **When** I run
   `docker compose up -d redis && npm install && npm run db:reset && npm run dev`,
   **Then** the web app serves on port 3000 and the showroom on port 3001 within 60 seconds.
2. **Given** Redis is **not** running, **When** I run `npm run dev`,
   **Then** both apps still start and the web log prints `Redis: degraded (in-memory fallback)`.
3. **Given** the database already exists, **When** I run `npm run db:reset`,
   **Then** the database file is deleted, migrations are applied, and the seed reloads without
   prompts or errors.

---

### User Story 2 — Realistic, Deterministic Demo Data (Priority: P1)

As a presenter, I want the same believable European dataset every time I reset the database so
that my demo script, screenshots, and data stories always match.

**Why this priority**: The entire product demo depends on having data that tells a coherent
narrative across all screens. Random or empty data makes the demo meaningless.

**Independent Test**: Run `db:reset` twice with the same seed value and compare per-table counts,
per-stage counts, and a sample of rows — they must be identical.

**Acceptance Scenarios**:

1. **Given** `SEED=42`, **When** the seed runs twice, **Then** the entity counts, names, and
   relative timestamps of every lead are identical (timestamps are offsets from "now", so the
   data always looks current).
2. **Given** the seed has run, **When** I query the database, **Then** there are exactly
   1 VP, 3 managers, 12 reps, 3 teams, approximately 600 customers, approximately 800 leads
   spread over 90 days, 6 offers, and activities on every non-NEW lead.
3. **Given** the seed has run, **Then** every downstream feature has data to show: unassigned
   pool leads, SLA-breach leads, overdue follow-ups, at-risk leads, leads about to go cold,
   returning customers with prior purchases, WON and LOST leads with reasons, and an expired
   offer.

---

### User Story 3 — Shared Contracts (Priority: P1)

As a feature developer, I want enums, validation schemas, and event types in one shared package
so that the web app, showroom, and lead simulator all use the same vocabulary without duplication.

**Why this priority**: Without shared contracts, parallel feature streams diverge silently. A
mismatch in an enum or schema between the showroom and the intake API would break the headline
demo moment (live lead submission).

**Independent Test**: Import the intake schema from the shared package in the showroom and
validate a payload — it must pass or fail with the same rules as the web intake endpoint.

**Acceptance Scenarios**:

1. **Given** the shared package exists, **When** the showroom imports `IntakeLeadSchema`,
   **Then** it validates payloads with the same rules as the web intake endpoint.
2. **Given** a new enum value is added in the shared package, **When** I run the type checker,
   **Then** any consumer with an exhaustive switch over that enum fails compilation, making the
   gap impossible to miss.

---

### User Story 4 — App Shell (Priority: P1)

As a signed-in user, I want a consistent layout with role-aware navigation so that I can move
between screens quickly without learning different layouts per role.

**Why this priority**: The shell is visible on every authenticated screen. Reps, managers, and
the VP all need it to be ready before any feature screen can be shown.

**Independent Test**: Log in as a REP and a VP and confirm navigation items differ by role; the
layout renders on every protected page without crashing.

**Acceptance Scenarios**:

1. **Given** I am on any authenticated page, **Then** I see a 56 px icon navigation rail on the
   left and a top bar containing a search placeholder, an offers-strip slot, and a user-menu slot.
2. **Given** my role is REP, **Then** the navigation shows Inbox, Pipeline, Dashboard, and
   Offers only. **Given** my role is MANAGER or VP, **Then** Team Settings and Audit are also
   present.

---

### User Story 5 — Platform Primitives (Priority: P2)

As a feature developer, I want ready-made helpers for Redis, event broadcasting, caching,
audit writing, and error responses so that every feature stays small and the infrastructure
behavior is consistent across the app.

**Why this priority**: These primitives are consumed by every feature, but the features
themselves define the business rules. P2 because they can be added incrementally as each
consuming feature is built, provided the interfaces are in place.

**Independent Test**: With Redis stopped, publish an event via the event bus and confirm a
local subscriber still receives it exactly once.

**Acceptance Scenarios**:

1. **Given** `bus.publish(event)` is called with Redis running, **Then** subscribers in every
   process receive the event. **Given** Redis is down, **Then** subscribers in the same process
   still receive it via an in-process fallback.
2. **Given** `writeAudit(tx, …)` is called inside a database transaction that rolls back,
   **Then** no audit row persists in the database.

---

### Edge Cases

- **`better-sqlite3` native build failure on Node 24 / Windows**: The client module must
  support a fallback driver (`@libsql/client`) behind the same interface so the rest of the
  app is unaffected.
- **`db:reset` while the dev server holds the database file open (Windows file lock)**:
  The reset script detects `EBUSY` and prints "Stop the dev server first" rather than
  crashing silently or corrupting the file.
- **Redis container restarts mid-session**: The client reconnects and flips status back to
  connected without requiring an app restart.
- **Hot reload creating duplicate connections**: All database, Redis, and subscriber
  singletons must be stored on `globalThis` so hot reload doesn't leak connections.
- **`SEED` environment variable missing**: Default to seed value `42`.
- **Customer with neither email nor phone**: Impossible by schema constraint (CHECK) and the
  seed generator, so no special runtime handling is needed.

---

## Requirements *(mandatory)*

### Functional Requirements

#### Monorepo & Tooling

- **FR-001**: The repository MUST be an npm-workspaces monorepo containing `apps/web`,
  `apps/showroom`, and `packages/shared` (package name `@leaddesk/shared`).
- **FR-002**: The root `package.json` MUST expose the following scripts:

  | Script | Behavior |
  |---|---|
  | `dev` | Starts both apps concurrently (web on :3000, showroom on :3001) |
  | `dev:web` | Starts the Next.js web app on port 3000 |
  | `dev:showroom` | Starts the Vite showroom on port 3001 |
  | `redis:up` | Starts the Redis Docker service |
  | `db:generate` | Generates Drizzle migration files from schema changes |
  | `db:migrate` | Applies pending migrations to the database |
  | `db:seed` | Runs the seed script |
  | `db:reset` | Deletes the database file, applies migrations, and seeds |
  | `simulate` | Runs the lead simulator (implementation owned by F10) |
  | `test` | Runs Vitest across all workspaces |
  | `test:e2e` | Runs Playwright end-to-end tests against the web app |
  | `lint` | Runs ESLint across all workspaces |
  | `typecheck` | Runs TypeScript type checking with zero tolerance for errors |
  | `format` | Runs Prettier across all workspaces |

- **FR-003**: TypeScript MUST be configured in strict mode (`strict`, `noUncheckedIndexedAccess`)
  with a shared base `tsconfig` that all workspaces extend.
- **FR-004**: Environment variable files (`.env.example`) MUST document every required variable
  for both apps. The web app MUST validate all environment variables at startup and fail fast
  when `JWT_SECRET` is shorter than 32 characters or `DATABASE_URL` is missing.
- **FR-005**: The Docker Compose file MUST define a Redis 7 service on port 6379 with a
  healthcheck and a named volume. Redis MUST be configured with a 256 MB memory cap using a
  volatile-LRU eviction policy, so only keys with a TTL are evicted. Every key the app writes
  (cache, token revocation, rate limiting) MUST carry a TTL.

#### Database

- **FR-010**: The database schema MUST implement every table, column, enum, and index defined
  in `docs/03-domain-model.md` §2. Tables: `teams`, `users`, `customers`, `leads`,
  `activities`, `stage_history`, `follow_ups`, `offers`, `purchases`, `audit_log`.
- **FR-011**: The database client MUST enable WAL journal mode, foreign key enforcement, a 5-
  second busy timeout, and NORMAL synchronous mode on every connection. The client MUST be a
  singleton that survives Next.js hot reload.
- **FR-012**: All record IDs MUST be ULIDs. All timestamps MUST be Unix milliseconds in UTC.
  All monetary amounts MUST be integer euro cents.
- **FR-013**: The database file path MUST come from the `DATABASE_URL` environment variable.
  The `data/` directory MUST be created automatically if missing and excluded from version
  control.
- **FR-014**: A transactional helper (`withTx`) MUST be the only way services perform multi-row
  writes. It runs synchronous transactions atomically.
- **FR-015**: A custom database migration MUST create triggers that make `activities` and
  `audit_log` **append-only at the database level**: any attempt to UPDATE or DELETE a row in
  either table MUST abort with an error. (`db:reset` deletes the file entirely, so it is not
  affected by this constraint.)
- **FR-016**: The customer repository MUST maintain a `search_text` column on every insert and
  update: lowercased, diacritics stripped (NFD normalization), combining marks removed,
  containing `first_name + last_name + email + phone digits`. The column is indexed and used
  for accent-insensitive search. A shared helper function (`buildCustomerSearchText`) MUST be
  used by both the repository and the seed so the logic is never duplicated.
- **FR-017**: The activities API route (`/api/leads/[id]/activities`) MUST export `GET` and
  `POST` handlers, each delegating to a separate handler file. F01 creates both handler files
  as stubs returning `501 NOT_IMPLEMENTED`. F05 replaces the GET handler body; F06 replaces
  the POST handler body. This ensures two parallel feature streams never edit the same file.

#### Shared Package

- **FR-020**: The `@leaddesk/shared` package MUST export:
  - `enums.ts` — all domain enum tuples and union types
  - `catalog.ts` — vehicle catalog (6 models with slug, name, body type, fuel, price in cents)
  - `countries.ts` — country → team region, dialing code, default language mapping
  - `schemas/intake.ts` — `IntakeLeadSchema` (the public enquiry contract shared by the
    showroom, intake API, and simulator)
  - `schemas/activity.ts` — `CreateActivitySchema` (POST /api/leads/:id/activities body)
  - `schemas/lead-filters.ts` — `LeadListQuerySchema` (GET /api/leads query params)
  - `schemas/common.ts` — `ApiError` type and `Paginated<T>` type
  - `events.ts` — `LeadDeskEvent` union type and `EVENTS_CHANNEL` constant
  - `format.ts` — EUR formatter, relative date formatter, 24-hour datetime formatter,
    and `buildCustomerSearchText`
  - `stage-machine.ts` — `TRANSITIONS`, `canTransition`, `autoAdvance`, `isContactActivity`
  - `source-groups.ts` — source → source-group mapping
- **FR-021**: Every enum MUST be exported both as a readonly tuple (for Zod and seed use) and
  as a TypeScript union type. Consumers using exhaustive switches get a compile error when a
  new value is added.
- **FR-022**: The shared package MUST be consumable by both Next.js and Vite as TypeScript
  source, with no build step required.

#### Seed

- **FR-030**: The seed MUST be deterministic for a given `SEED` value. The random number
  generator is seeded at startup, and all timestamps are computed as offsets from a single
  reference point captured at seed start.
- **FR-031**: The seed MUST create exactly the org chart from `docs/01-personas.md`:
  1 VP, 3 managers, 12 reps, 3 teams. Passwords are bcrypt-hashed to `demo1234`. Email
  pattern: `firstname.lastname@eurodrive.test` (accents stripped). All teams start with
  auto-assign enabled. Team assignment strategies: DACH = `LANGUAGE_MATCH`,
  West = `LOAD_BALANCED`, South = `ROUND_ROBIN`.
- **FR-032**: The seed MUST create approximately 600 customers distributed across European
  countries in documented proportions (DE 24%, AT 7%, CH 6%, FR 16%, BE 7%, NL 9%, LU 2%,
  IT 13%, ES 10%, PT 4%, other 2%). Names use the matching locale. Phone numbers are E.164
  with the correct country dial code. 20% of customers are returning customers with 1–2
  historical purchases in the past 1–8 years. `is_returning` and `search_text` are set
  during seeding.
- **FR-033**: Customer channel preference MUST correlate with age band according to this table:

  | Age band | Share | WHATSAPP | CALL | SMS | EMAIL |
  |---|---|---|---|---|---|
  | 18–25 | 12% | 60% | 10% | 15% | 15% |
  | 26–35 | 28% | 50% | 20% | 10% | 20% |
  | 36–45 | 26% | 35% | 35% | 5% | 25% |
  | 46–60 | 22% | 20% | 50% | 5% | 25% |
  | 60+ | 8% | 10% | 60% | 5% | 25% |
  | UNKNOWN | 4% | 30% | 30% | 10% | 30% |

- **FR-034**: The seed MUST create approximately 800 leads with `created_at` spread over the
  last 90 days, weighted toward recent (≈ 40% in the last 30 days). Source distribution:
  WEBSITE 35%, GOOGLE_ADS 15%, FACEBOOK 11%, INSTAGRAM 9%, WALK_IN 10%, PHONE 8%,
  REFERRAL 7%, PORTAL 5% (`source_detail` "mobile.de" or "AutoScout24"). Each lead's team is
  determined by the customer's country via the country→region mapping.
- **FR-035**: Lead stage distribution MUST depend on lead age. Leads older than 30 days are
  mostly closed or cold. Target totals: NEW 7%, CONTACTED 13%, QUALIFIED 10%, TEST_DRIVE 6%,
  NEGOTIATION 5%, WON 13%, LOST 31%, COLD 15%. Conversion rate (WON ÷ WON+LOST) ≈ 30%.
  Conversion MUST vary by source (REFERRAL and WALK_IN highest, social lowest) and by rep so
  dashboard charts tell a clear story.
- **FR-036**: Every lead MUST have a consistent activity history. A `LEAD_CREATED` system
  activity is always present; an `ASSIGNED` system activity is added when an owner is set.
  A `stage_history` row exists per stage transition in order. Non-NEW leads have 3–15 user
  activities with types matching the customer's preferred channel about 60% of the time.
  Activity timestamps fall between 08:00 and 20:00, in strictly increasing order, and never
  before the lead's creation time. All derived lead fields (`first_response_at`,
  `last_activity_at`, `attempt_count`, `assigned_at`, `closed_at`) are computed from the
  generated activities. WON leads also have a linked `purchases` row; LOST leads have a
  `lost_reason` with realistic distribution.
- **FR-037**: The seed MUST include deliberately neglected and edge-case data for downstream
  features:
  - 25 **unassigned** leads (DACH 10, West 8, South 7) created within the last 48 hours
  - 12 **SLA-breach** leads (NEW, owned, no contact activity, 20 min–6 h old; 4 are HOT;
    2 carry only an internal NOTE to exercise the contact-activity distinction)
  - 30 **overdue follow-ups** (PENDING, due 1 h–3 days in the past), plus 20 due today and
    40 in the future
  - 20 **at-risk** leads (open, last activity 3–6 days ago)
  - 5 leads with last activity **6 days 23 hours** ago so the cold detector moves them
    during a live demo
  - Rep imbalance: Felix Wagner has ≈ 38 open leads at ≈ 60% coverage; Lea Hoffmann has ≈ 15
  - Hero lead "Giulia Conti" (South, owner Sofia Rossi, HOT, prefers WhatsApp, Italian,
    wants the aurora-suv with trade-in)
  - Hero lead "Markus Klein" (DACH, owner Anna Weber, returning customer who bought a
    vento-sedan in 2021, eligible for the loyalty offer)
- **FR-038**: The seed MUST create 6 offers:

  | Title | Type / value | Eligibility | Validity |
  |---|---|---|---|
  | Loyalty Bonus | AMOUNT €1,000 | Returning customers | active (−60 d → +90 d) |
  | Autumn Cashback | AMOUNT €750 | Any | active (−20 d → +40 d) |
  | Trade-in Boost | AMOUNT €1,500 | Requires trade-in | active |
  | 0% APR Finance | APR 0 bp | Requires finance, luma-ev or aurora-suv | active |
  | EV Switch Grant | PERCENT 5% | luma-ev, countries DE/NL/FR | active |
  | Summer Sale | AMOUNT €500 | Any | **expired** (−120 d → −30 d) |

- **FR-039**: Lead `score`, `priority`, and `score_breakdown` MUST be populated by a dedicated
  seed step (`seed/score-step.ts`). Until the scoring feature (F09) is implemented, the step
  uses a simple stub. F09 replaces the stub — this is the single sanctioned cross-owner
  modification.
- **FR-040**: At the end of seeding, the seed MUST print a summary table (counts per table,
  per stage, per team, unassigned, SLA breaches, overdue follow-ups) and complete in under
  10 seconds.

#### Platform Primitives

- **FR-050**: The Redis client MUST export a command client and a dedicated subscriber
  connection, both as lazy singletons. A connection failure MUST NOT throw to callers: it
  logs once, flips to degraded mode, and retries in the background. The client exposes a
  `redisStatus()` function returning `'connected'` or `'degraded'`.
- **FR-051**: The event bus MUST implement a defined `EventBus` interface. It publishes events
  to a Redis channel when connected. It always delivers to local (in-process) subscribers so
  in-process delivery works even in degraded mode. Local subscribers MUST NOT receive the
  same event twice.
- **FR-052**: The cache module MUST implement a defined `Cache` interface with a Redis-backed
  implementation and a no-op fallback (used in degraded mode). Cache keys are prefixed
  `cache:`. TTL decisions are owned by F20; F01 provides the primitive only.
- **FR-053**: The audit writer MUST export a `writeAudit(tx, entry)` function that inserts
  into `audit_log` inside the caller's transaction. Optional metadata (actor type, user agent,
  HTTP method, assignment strategy) is stored in `audit_log.meta`.
- **FR-054**: The HTTP error module MUST define typed `AppError` subclasses for status codes
  400, 401, 403, 404, 409, and 429, plus a `toErrorResponse(err)` function that produces
  a consistent JSON error shape `{ error: { code, message, fields? } }`. Unknown errors map
  to 500 without leaking stack traces.
- **FR-055**: A structured request-logging helper MUST log route, user ID, status, duration,
  and request ID in JSON format.

#### App Shell & Showroom Scaffold

- **FR-060**: The web app MUST include Tailwind CSS, the shadcn/ui component primitives
  (button, input, select, textarea, dialog, sheet, dropdown-menu, tabs, badge, table,
  toast/sonner, tooltip, avatar, card, skeleton), an authenticated route-group layout with the
  navigation rail and top bar, and role-aware navigation driven by an append-only nav config.
- **FR-061**: The shell MUST read the current user through an injectable `getCurrentUser`
  function (implemented by F02). Until F02 is implemented, a development stub returns the
  seeded VP user.
- **FR-062**: The showroom app MUST be a standalone Vite + React + TypeScript + Tailwind app
  on port 3001 that imports from `@leaddesk/shared` and renders a placeholder page. F13 owns
  the showroom application screens after scaffolding.
- **FR-063**: A format utility MUST re-export EUR currency formatting (defaulting to `de-DE`
  locale, e.g. "38.900 €"), relative date formatting, and 24-hour datetime formatting from the
  shared package.

### Key Entities

- **Team**: Three regional teams (DACH, West, South) each with a manager, member reps,
  assigned countries, an auto-assign flag, and an assignment strategy.
- **User**: A staff member with a role (REP, MANAGER, VP), team membership, languages spoken,
  open-lead capacity, and a token version for session revocation.
- **Customer**: A car buyer (deduplicated by phone or email) with contact preferences, age
  band, location, and a `is_returning` flag maintained by the system.
- **Lead**: A single sales opportunity — one customer enquiry about one vehicle. Has a stage,
  priority score, source, owner, and a full derived timeline.
- **Activity**: An append-only timeline entry on a lead. Either user-logged (call, WhatsApp,
  etc.) or system-generated (stage change, assignment). Append-only at the database level.
- **Stage History**: Ordered record of every stage transition for a lead, with who made the
  change and when.
- **Follow-up**: A scheduled task on a lead, with a due date, assigned rep, and status
  lifecycle (PENDING → DONE/MISSED/CANCELLED).
- **Offer**: A promotional incentive with eligibility rules (customer type, vehicle model,
  country, trade-in, finance) and a validity window.
- **Purchase**: A completed sale record, linked to a customer and optionally to the winning
  lead.
- **Audit Log**: An append-only record of every mutation (actor, action, entity, before/after
  state, request metadata).

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A developer on a clean clone can have both apps running using ≤ 5 documented
  commands in ≤ 3 minutes (excluding initial package downloads).
- **SC-002**: `db:reset` completes in under 15 seconds, and running it twice with the same
  seed produces identical per-table and per-stage counts.
- **SC-003**: With Redis stopped, 100% of the app's pages still load without errors. Only
  features that depend on cross-process events are limited.
- **SC-004**: Every downstream feature's primary data view is non-empty immediately after
  seeding — no feature encounters an empty state on its first run.
- **SC-005**: Type checking and linting pass with zero errors or warnings.

---

## Assumptions

- Node.js ≥ 20 and Docker are available in the developer's environment. The README documents
  this requirement explicitly.
- SQLite is sufficient for the demo-scale data (~800 leads). PostgreSQL is documented as the
  scale path but is out of scope for v1.
- Redis is optional at runtime; the app degrades gracefully but Redis is recommended for the
  live-update demo moment.
- The `SEED` environment variable defaults to `42` when not set, so the first run always
  produces the expected demo dataset without extra configuration.
- The scoring step (`seed/score-step.ts`) ships as a stub that F09 replaces. Its output
  (score, priority, score_breakdown) will be present on every lead but may not reflect the
  final scoring algorithm until F09 is merged.
- The `getCurrentUser` injection point ships as a dev stub returning the seeded VP. F02
  replaces it with real session logic.
- All monetary amounts in the seed and schema are integer euro cents. Display formatting
  (e.g. "38.900 €") is handled at the UI edge only.
- The showroom app scaffold (port 3001) is a placeholder page; F13 owns the full showroom UI.
- Auth and RBAC for the app shell navigation are enforced by F02/F03; F01 only provides the
  shell structure and navigation config.
