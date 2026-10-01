# EuroDrive Lead Desk

A Sales Lead Management Tool for a fictional European car dealership group, "EuroDrive Motors". Reps get an inbox that tells them **which lead to work next and how**. Managers see and steer their team's workload live, and VPs get a trustworthy view of the org-wide funnel.

| Deliverable | Where |
|---|---|
| **1. System Design Document** | [`docs/SYSTEM-DESIGN.md`](docs/SYSTEM-DESIGN.md): architecture diagram, components, data flow, tech choices, observability, GenAI in design |
| **2. Working code** | This repository. Build, run and test instructions below. [AI Collaboration Narrative](#how-this-was-built) at the end. |
| **3. Video** | Script and demo plan: [`docs/VIDEO-SCRIPT.md`](docs/VIDEO-SCRIPT.md) |

---

## Scenario and Chosen Layer

**Scenario:** Sales Lead Management. The mandatory acceptance criteria are:

| # | Requirement | Endpoint | UI |
|---|---|---|---|
| R1 | Lead Inbox: list all incoming leads | `GET /api/leads` | `/inbox` |
| R2 | Lead Details View: full details plus a chronological activity log | `GET /api/leads/:id`, `GET /api/leads/:id/activities` | `/leads/:id` |
| R3 | Activity Logging: log a follow-up activity, persisted | `POST /api/leads/:id/activities` | composer on `/leads/:id` |

**Chosen layer: Backend.** It's a RESTful API (38 route handlers) on a persistent SQLite database with migrations, transactions and append-only triggers. Instead of stubbing the client, I also built a full **Next.js frontend**, plus two independent API clients that exercise the public intake API: a **showroom website** (`apps/showroom`) and a **CLI simulator**. cURL examples are [below](#api-quick-reference-curl).

**Beyond the mandatory scope:** JWT auth · Rep → Manager → VP hierarchy with RBAC · stage pipeline (kanban, won/lost) · follow-ups and going-cold detection · explainable lead scoring · intake with dedupe, routing and auto-assign · live updates (SSE + Redis pub/sub) · customer channel preferences (WhatsApp/call/SMS/email deep links) · offers matching · manager/VP dashboards and demographics · AI assist (summary, next best action, draft message) · audit log.

---

## Tech Stack

TypeScript · Next.js 14 (App Router) · SQLite (WAL) + Drizzle ORM · Redis 7 · Zod (shared contracts) · jose JWT + bcrypt · TanStack Query/Table · Tailwind + shadcn/ui · Recharts · Anthropic Claude SDK · Vitest · Playwright. The reasoning for each choice is in the [System Design §6](docs/SYSTEM-DESIGN.md#6-technology-choices).

```
apps/web         Next.js app: UI + REST API (port 3000)
  app/api/       thin route handlers
  server/        auth · policy (RBAC) · services · db (schema, migrations, seed, repositories) · events · jobs · cache · redis
  e2e/           Playwright specs
  tests/         Vitest unit, integration, RBAC and job tests
apps/showroom    Vite + React mock dealer website that posts leads to the intake API (port 3001)
packages/shared  Zod schemas, enums, event types, stage machine, scoring rules (shared by web and showroom)
docs/            product spec, domain model, architecture, 20 feature specs, system design
specs/           Spec Kit artifacts per feature (spec, plan, tasks, contracts, build REPORT)
```

---

## Installation and Running

### Prerequisites

| Tool | Version | Notes |
|---|---|---|
| Node.js | ≥ 20 | |
| npm | bundled with Node | |
| Docker + Docker Compose | any recent | Required only if you use the Docker path or want Redis |

Redis is **optional** at runtime. Without it the app runs in degraded mode — in-process pub/sub, in-memory rate limits, no token revocation or response caching — but all core features work.

---

### Option A — Docker (easiest, single command after build)

This runs the full stack: Next.js web app, Vite showroom (served by nginx), and Redis. The SQLite database is persisted in a named Docker volume across restarts.

**First run — build images and start everything:**

```bash
docker compose up --build
```

**Seed the database** (first run only; the DB is empty on a fresh volume):

```bash
docker compose exec web sh -c "../../node_modules/.bin/tsx server/db/seed/index.ts"
```

**Subsequent starts** (no rebuild needed):

```bash
docker compose up
```

**Stop everything:**

```bash
docker compose down
```

**Stop and wipe the database** (deletes the SQLite volume):

```bash
docker compose down -v
```

Once running:

| App | URL |
|---|---|
| Lead Desk (web) | http://localhost:3000 |
| Showroom (lead generation) | http://localhost:3001 |

> **Note:** The showroom's API URL (`http://localhost:3000`) is baked into the browser bundle at build time. If you deploy to a non-localhost domain, rebuild with the correct URL:
> ```bash
> docker compose build --build-arg VITE_INTAKE_URL=https://your-domain/api/intake/leads showroom
> ```

#### Running without Redis in Docker

The web app degrades gracefully when Redis is unreachable. To start only web and showroom (no Redis container):

```bash
docker compose up web showroom
```

You'll see a `[Redis error] ... degraded mode` warning in the web logs — that's expected and harmless.

---

### Option B — Local development (hot reload, no Docker required)

**1. Install dependencies**

```bash
npm install
```

**2. Copy environment files**

The defaults work out of the box. Leave `ANTHROPIC_API_KEY` empty to use the rule-based AI fallback (the app never breaks without it):

```bash
cp apps/web/.env.example apps/web/.env
cp apps/showroom/.env.example apps/showroom/.env
```

**3. Start Redis** (optional — skip this step if you don't have Docker; the app degrades gracefully)

```bash
docker compose up -d redis
```

**4. Create the database, run migrations and seed it** (800+ leads, deterministic `SEED=42`)

```bash
npm run db:reset
```

**5. Start the dev servers**

```bash
npm run dev
```

This starts:
- `http://localhost:3000` — the Lead Desk (Next.js, hot reload)
- `http://localhost:3001` — the Showroom (Vite, hot reload)

**6. Stream demo leads** (optional — watch them appear live in the inbox)

```bash
npm run simulate -- --count 5
```

> **Certificate / proxy error?** Set `NODE_USE_SYSTEM_CA=1` before npm commands (on Windows: `setx NODE_USE_SYSTEM_CA 1`, then open a new terminal).

---

### Demo users

Password for all accounts: **`demo1234`**. The login page also has one-click persona buttons.

| Persona | Email | Sees |
|---|---|---|
| VP | `isabelle.laurent@eurodrive.test` | the whole organisation |
| Manager (DACH) | `lukas.becker@eurodrive.test` | their team's leads |
| Rep (South) | `sofia.rossi@eurodrive.test` | own leads plus their team's unassigned pool |

---

### Production build (without Docker)

```bash
npm run build -w apps/web
npm run start -w apps/web
```

---

## Running without Redis (any mode)

The app is designed so Redis is never a hard dependency. The Redis client (`apps/web/server/redis/client.ts`) connects lazily with a 500 ms timeout and 10 s reconnect cadence. When it can't reach Redis it sets `status: 'degraded'` and logs one warning — nothing throws. Features that depend on Redis degrade as follows:

| Feature | Without Redis |
|---|---|
| Live inbox updates (SSE) | Falls back to in-process EventEmitter — works within one process, no cross-instance fanout |
| Auth token revocation | Tokens are valid until natural expiry (15 min) |
| Intake rate limiting | Falls back to in-memory counters (resets on restart) |
| Response caching | Cache misses every time; all reads hit the DB |

---

## Test

The test suite has **1,236 tests in 112 Vitest files** (all passing) plus **16 Playwright e2e specs**.

Run all unit and integration tests:

```bash
npm test
```

Run the end-to-end tests (Playwright starts the dev server automatically):

```bash
npm run test:e2e
```

Run the static checks (ESLint zero warnings, strict TypeScript across all workspaces):

```bash
npm run lint && npm run typecheck
```

Run a single file:

```bash
npx vitest run packages/shared/src/stage-machine.test.ts
```

What the suite covers:

| Area | Examples |
|---|---|
| **Core business rules** (pure unit) | stage machine transitions · scoring weights and priority bands · follow-up and cold rules · offer eligibility · money in cents · channel deep links |
| **Activity logging (R3)** | validation (outcome rules, note length, follow-up window, oversized bodies) · atomicity (activity + follow-up + stage + score + audit in one transaction) · idempotent replay by `clientRequestId` · append-only triggers reject UPDATE/DELETE |
| **Inbox and detail (R1, R2)** | filters, search, ranking, pagination · timeline merge and ordering · 404 that doesn't leak lead existence |
| **Security / RBAC** | `authorize()` matrix per role and action · scope CTE (rep / manager / VP) · per-endpoint RBAC tests · JWT, revocation, login rate limit · PII scrubbing before AI prompts |
| **Intake pipeline** | API key, CORS, rate limit, payload cap, honeypot · dedupe by phone/email · routing and auto-assign |
| **Live updates** | SSE hub scope filtering, replay and resync · Redis-down fallback to the in-memory bus |
| **Background jobs** | cold detector, follow-up sweeper and score freshness, with locks |
| **E2E (Playwright)** | login per persona · the core loop (inbox → lead → log activity → visible after reload) · showroom intake → live toast · pipeline drag and drop · follow-ups · offers · dashboards · AI assist · audit |

Integration tests run real route handlers against a real SQLite file, not mocks, so SQL, triggers and transactions are exercised.

---

## API Quick Reference (cURL)

Authentication is a JWT in an `httpOnly` cookie. Use a cookie jar. Run these in Git Bash, WSL or macOS/Linux; on Windows PowerShell, call `curl.exe`.

```bash
curl -s -c jar.txt -H "Content-Type: application/json" \
  -d '{"email":"sofia.rossi@eurodrive.test","password":"demo1234"}' \
  http://localhost:3000/api/auth/login
```

**R1** — list my leads (filters: `view`, `stage`, `source`, `priority`, `q`, `page`, `pageSize`):

```bash
curl -s -b jar.txt "http://localhost:3000/api/leads?view=mine&stage=NEW,CONTACTED&pageSize=10"
```

**R2** — lead detail and its timeline (replace `LEAD_ID`):

```bash
curl -s -b jar.txt http://localhost:3000/api/leads/LEAD_ID
curl -s -b jar.txt http://localhost:3000/api/leads/LEAD_ID/activities
```

**R3** — log an activity (`clientRequestId` is a ULID used for idempotency):

```bash
curl -s -b jar.txt -H "Content-Type: application/json" \
  -d '{"clientRequestId":"01J9ZZZZZZZZZZZZZZZZZZZZZZ","type":"CALL","outcome":"CONNECTED","note":"Discussed financing options."}' \
  http://localhost:3000/api/leads/LEAD_ID/activities
```

**Public intake** (what the showroom and simulator call; API-key authenticated, no cookie):

```bash
curl -s -H "Content-Type: application/json" -H "X-API-Key: showroom-dev-key" \
  -d '{"firstName":"Giulia","lastName":"Bianchi","phone":"+393471234567","country":"IT","language":"it","preferredChannel":"WHATSAPP","source":"WEBSITE","message":"Interested in a test drive"}' \
  http://localhost:3000/api/intake/leads
```

Errors use one shape everywhere: `{"error":{"code":"VALIDATION_ERROR","message":"...","fields":{...}}}` with 400/401/403/404/409/413/415/429 as appropriate. Other endpoints: stage changes (`PATCH /api/leads/:id/stage`), claim and assign, follow-ups, offers, dashboards, audit log, SSE stream (`GET /api/events`). Full list under [`apps/web/app/api`](apps/web/app/api).

---

## Design Highlights

- **Strict layering:** route handler → Zod → `authorize()` → service → repository. Services never import Next.js, so the core can be extracted into its own process.
- **Authorization on every lead-scoped endpoint.** List and detail share one scope function (a recursive CTE), so the inbox can never show a lead the detail page refuses.
- **Append-only history:** SQLite triggers `RAISE(ABORT)` on any UPDATE or DELETE of `activities` and `audit_log`.
- **Correctness under retries:** idempotent writes (`clientRequestId`, intake `idempotencyKey`), optimistic locking (`leads.version`), every multi-row write in one transaction.
- **Graceful degradation:** Redis down → DB, in-process emitter and in-memory limits. Claude down or no key → deterministic rule-based AI. The app never hard-fails on an external service.
- **Privacy:** no PII in logs, no email or phone in AI prompts (scrubbed and unit-tested).
- **Observability:** structured JSON logs with `requestId`, stable error codes, dependency-health logs, an audit trail with before/after diffs, per-run job logs.

---

## How This Was Built

This repository is the output of an **AI-native engineering process** where I acted as product owner, architect and reviewer, and [Claude Code](https://claude.com/claude-code) (Anthropic's agentic CLI) acted as the primary implementation engineer under structured direction. The process had three layers: **product specification**, **workflow orchestration via Spec Kit**, and **verification gates**.

### 1. Product specification first

Before any code was written, all product decisions were captured in `docs/`:

- `docs/00-overview.md` — problem statement, vision, priorities, glossary, and 14 global architectural decisions (money in integer cents, append-only audit trail, graceful degradation, no PII to the AI, etc.)
- `docs/01-personas.md` — three personas (Rep, Manager, VP), their jobs-to-be-done, and permission boundaries
- `docs/02-user-flows.md` — end-to-end journeys in Mermaid diagrams
- `docs/03-domain-model.md` — the full entity schema, all enums, the stage machine, the event catalogue
- `docs/04-architecture.md` — tech stack decisions with rationale, ADRs, NFRs, and the layering rule (`route handler → Zod → authorize → service → repository`)
- `docs/features/F01–F20-*.md` — 20 feature specs from a common template, each with user stories, functional requirements, edge cases, RBAC rules, test cases and success criteria

The expensive mistakes in AI-assisted development are about *what* to build. Writing the spec took the most time and was entirely human-directed.

### 2. Spec Kit as the workflow engine

[GitHub Spec Kit](https://github.com/specify-sh/specify-cli) is a CLI tool that structures the process of taking a product spec through to running code. Installed as a Claude Code integration, it exposes slash commands that drive distinct phases:

| Command | What it does |
|---|---|
| `/speckit-specify` | Turns a feature description into a structured spec artifact (`specs/NNN-*/spec.md`) |
| `/speckit-clarify` | Surfaces underspecified areas; I answered from the `docs/` files |
| `/speckit-plan` | Produces an implementation plan (`plan.md`) against the architecture and path-ownership rules |
| `/speckit-tasks` | Generates a dependency-ordered task list (`tasks.md`) |
| `/speckit-analyze` | Cross-checks spec / plan / tasks against the constitution for consistency and rule violations |
| `/speckit-implement` | Executes each task, writes code, runs verification |

I encoded non-negotiable rules in `docs/speckit/constitution.md` — authorize every lead endpoint, append-only activities, single-transaction writes, money in integer cents, no N+1 on hot paths, no PII to the AI. Every generated plan was checked against it before implementation began.

### 3. Parallel builds by dependency wave

Features were split into **5 dependency waves** (see [`docs/features/README.md`](docs/features/README.md)) with a **path-ownership table** to prevent merge conflicts between parallel sessions. Each feature owns distinct files; shared files are append-only.

```
Wave 0:  F01 — Platform Foundation (schema, shared contracts, app shell) — single stream
Wave 1:  F02 Auth · F03 RBAC · F09 Scoring · F13 Showroom — 4 parallel streams
Wave 2:  F04 Inbox · F05 Detail · F06 Activity · F10 Intake — 4 parallel streams  ← R1–R3 must be green here
Wave 3:  F07 Stages · F08 Follow-ups · F11 Assignment · F12 Live · F14 Channels · F15 Offers — 6 parallel
Wave 4:  F16 Dashboards · F17 Demographics · F18 AI Assist · F19 Audit Log · F20 Caching — 5 parallel
```

Two project-level Spec Kit skills automated the full pipeline:
- **`build-feature`** — took one feature through specify → clarify (self-answered from docs) → plan → tasks → analyze → implement → verify → `REPORT.md` → commit, without asking questions
- **`integrate-wave`** — merged a finished wave's branches into `main`, resolved conflicts by ownership rules, ran all checks, verified the wave gate, and tagged `wave-N-done`

A PowerShell orchestrator (`scripts/speckit/run-waves.ps1`) ran **one headless Claude session per feature in its own git worktree**, each with its own port and Redis DB number. Wave 3 had six features building side by side.

### 4. Verification gates, not trust

A wave only merged when all of these were green:
- `npm run lint` — ESLint, zero warnings allowed
- `npm run typecheck` — strict TypeScript across all three workspaces
- `npm test` — all 1,236 Vitest tests (unit + integration against real SQLite)
- `npm run test:e2e` — 16 Playwright specs
- Wave gate in `docs/features/README.md` — mandatory scenario demoable

Integration tests run real route handlers against a real SQLite file, not mocks. AI-generated code could not pass by mocking away the hard parts.

### 5. Persona-based UI audit

After the final wave, I had Claude drive the full app in a browser as each persona (Rep, Manager, VP) and produce a severity-ranked findings report (`docs/audit/2026-10-01-role-based-ux-audit.md`). This caught real problems that green tests had missed:

- An **RBAC regression** where reps could list their whole team's leads (the detail page then returned 403, creating a confusing UX)
- A kanban board silently truncating to 50 leads
- The activity timeline not refreshing after logging without a page reload
- Inconsistent lead count labels across widgets

Those findings drove the final "improvements" pass. The RBAC guard was restored and is now covered by a dedicated test.

### Where I constrained the AI

- **Caching (F20):** Claude recommended a Redis caching strategy early. I kept it as a documented pending decision and only approved narrow cache-aside where the data is provably safe (active offers, AI results), so correctness wasn't traded for speed.
- **Scope control:** real WhatsApp/Twilio became deep links behind a `ChannelAdapter` interface. ML scoring became an explainable rule-based score. Both are honest for a demo and easy to swap.
- **AI in the product:** the AI assist feature runs Claude (`claude-opus-5-5`, effort `low`) with PII scrubbing, Zod-validated output, response caching and a deterministic fallback — the demo cannot break on a network failure or absent API key. An eval script (`npm run eval:ai -w apps/web`) checks schema validity, language match and latency.

### What I'd do differently

Run the persona-based UI audit after *every* wave, not just at the end. Tests proved each feature's contract, but cross-feature consistency (shared labels, counts that agree across widgets, cache invalidation after writes) only appeared when a "user" walked through the whole product.

---

## Further Reading

- [System Design Document](docs/SYSTEM-DESIGN.md)
- [Product overview](docs/00-overview.md) · [Personas](docs/01-personas.md) · [User flows](docs/02-user-flows.md) · [Domain model](docs/03-domain-model.md) · [Architecture and ADRs](docs/04-architecture.md)
- [Feature index and build waves](docs/features/README.md) · [Spec Kit constitution](docs/speckit/constitution.md) · [Spec Kit workflow](docs/speckit/WORKFLOW.md)
- [Role-based UX and QA audit](docs/audit/2026-10-01-role-based-ux-audit.md)
