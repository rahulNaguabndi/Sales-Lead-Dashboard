# EuroDrive Lead Desk

A Sales Lead Management Tool for a fictional European car dealership group, "EuroDrive Motors". Reps get an inbox that tells them **which lead to work next and how**. Managers see and steer their team's workload live, and VPs get a trustworthy view of the org-wide funnel.

| Deliverable | Where |
|---|---|
| **1. System Design Document** | [`docs/SYSTEM-DESIGN.md`](docs/SYSTEM-DESIGN.md): architecture diagram, components, data flow, tech choices, observability, GenAI in design |
| **2. Working code** | This repository. Build, run and test instructions are below, and the [AI Collaboration Narrative](#ai-collaboration-narrative) is at the end |
| **3. Video** | Script and demo plan: [`docs/VIDEO-SCRIPT.md`](docs/VIDEO-SCRIPT.md) |

## Scenario and Chosen Layer

**Scenario:** Sales Lead Management. The mandatory acceptance criteria are:

| # | Requirement | Endpoint | UI |
|---|---|---|---|
| R1 | Lead Inbox: list all incoming leads | `GET /api/leads` | `/inbox` |
| R2 | Lead Details View: full details plus a chronological activity log | `GET /api/leads/:id`, `GET /api/leads/:id/activities` | `/leads/:id` |
| R3 | Activity Logging: log a follow-up activity, persisted | `POST /api/leads/:id/activities` | composer on `/leads/:id` |

**Chosen layer: Backend.** It's a RESTful API (38 route handlers) on a persistent SQLite database with migrations, transactions and append-only triggers. Instead of stubbing the client, I also built a full **Next.js frontend**, plus two independent API clients that exercise the public intake API: a **showroom website** (`apps/showroom`) and a **CLI simulator**. cURL examples are [below](#api-quick-reference-curl).

**Beyond the mandatory scope:** JWT auth · Rep → Manager → VP hierarchy with RBAC · stage pipeline (kanban, won/lost) · follow-ups and going-cold detection · explainable lead scoring · intake with dedupe, routing and auto-assign · live updates (SSE + Redis pub/sub) · customer channel preferences (WhatsApp/call/SMS/email deep links) · offers matching · manager/VP dashboards and demographics · AI assist (summary, next best action, draft message) · audit log.

## Tech Stack (summary)

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

## Build and Run

**Prerequisites:** Node.js ≥ 20, npm, Docker (for Redis). Redis is optional at runtime: without it the app runs in degraded mode, falling back to in-process pub/sub and in-memory rate limits.

```bash
docker compose up -d redis
```

```bash
npm install
```

Copy the env templates (the defaults work for local development; leave `ANTHROPIC_API_KEY` empty to use the rule-based AI fallback):

```bash
cp apps/web/.env.example apps/web/.env && cp apps/showroom/.env.example apps/showroom/.env
```

Create the database, run migrations and load the deterministic seed (`SEED=42`, 800+ leads):

```bash
npm run db:reset
```

Start the web app (http://localhost:3000) and the showroom (http://localhost:3001):

```bash
npm run dev
```

Optionally, stream demo leads into the intake API and watch them appear live in the inbox:

```bash
npm run simulate -- --count 5
```

**Demo users** (password `demo1234`; the login page also has one-click persona buttons):

| Persona | Email | Sees |
|---|---|---|
| VP | `isabelle.laurent@eurodrive.test` | the whole organization |
| Manager (DACH) | `lukas.becker@eurodrive.test` | their team |
| Rep (South) | `sofia.rossi@eurodrive.test` | own leads plus their team's unassigned leads |

Production build: `npm run build -w apps/web && npm run start -w apps/web`.

> If `npm install` fails with a certificate error (for example behind a corporate proxy), set `NODE_USE_SYSTEM_CA=1` first (`setx NODE_USE_SYSTEM_CA 1` on Windows, then open a new terminal).

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

Run the static checks (ESLint with zero warnings allowed, and strict TypeScript across all workspaces):

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
| **Core business rules** (pure unit) | stage state machine and allowed transitions · lead scoring weights and priority bands · follow-up and going-cold rules · offer eligibility · money in cents · channel deep links · customer time zones |
| **Activity logging (R3)** | validation (outcome rules, note length, follow-up window, malformed or oversized bodies) · **atomicity** (activity + follow-up + stage + score + audit in one transaction) · idempotent replay by `clientRequestId` · append-only triggers reject UPDATE/DELETE |
| **Inbox and detail (R1, R2)** | filters, search, ranking, pagination · timeline merge and ordering · a not-found response that doesn't reveal whether the lead exists |
| **Security / RBAC** | `authorize()` matrix per role and action · scope CTE (rep / manager / VP) · per-endpoint RBAC tests (activities, stage, assignment, AI, audit) · JWT, revocation, login rate limit · PII scrubbing before AI prompts |
| **Intake pipeline** | API key, CORS, rate limit, payload cap, honeypot · dedupe by phone/email · routing and auto-assign · simulator smoke test |
| **Live updates** | SSE hub scope filtering, replay and resync · Redis-down fallback to the in-memory bus |
| **Background jobs** | cold detector, follow-up sweeper and score freshness, with locks |
| **E2E (Playwright)** | login per persona · the **core loop** (inbox → lead → log activity → visible in timeline after reload) · showroom intake → live toast · pipeline drag and drop · follow-ups · offers · dashboards · AI assist · audit |

Integration tests run real route handlers against a real SQLite file, not mocks, so SQL, triggers and transactions are exercised.

## API Quick Reference (cURL)

Authentication is a JWT in an `httpOnly` cookie, so use a cookie jar. Run these in Git Bash, WSL or macOS/Linux; on Windows PowerShell, call `curl.exe`.

```bash
curl -s -c jar.txt -H "Content-Type: application/json" -d '{"email":"sofia.rossi@eurodrive.test","password":"demo1234"}' http://localhost:3000/api/auth/login
```

**R1:** list my leads (filters: `view`, `stage`, `source`, `priority`, `q`, `page`, `pageSize`):

```bash
curl -s -b jar.txt "http://localhost:3000/api/leads?view=mine&stage=NEW,CONTACTED&pageSize=10"
```

**R2:** lead detail and its timeline (replace `LEAD_ID` with an `id` from the list):

```bash
curl -s -b jar.txt http://localhost:3000/api/leads/LEAD_ID
```

```bash
curl -s -b jar.txt http://localhost:3000/api/leads/LEAD_ID/activities
```

**R3:** log an activity. `clientRequestId` is a ULID used for idempotency; send the same one twice and you get one row. (Browser mutations must be same-origin; cURL sends no `Origin` header, which is allowed.)

```bash
curl -s -b jar.txt -H "Content-Type: application/json" -d '{"clientRequestId":"01J9ZZZZZZZZZZZZZZZZZZZZZZ","type":"CALL","outcome":"CONNECTED","note":"Discussed financing options, sending an offer tomorrow."}' http://localhost:3000/api/leads/LEAD_ID/activities
```

**Public intake** (what the showroom and simulator call; API-key authenticated, no cookie):

```bash
curl -s -H "Content-Type: application/json" -H "X-API-Key: showroom-dev-key" -d '{"firstName":"Giulia","lastName":"Bianchi","phone":"+393471234567","country":"IT","language":"it","preferredChannel":"WHATSAPP","source":"WEBSITE","message":"Interested in a test drive"}' http://localhost:3000/api/intake/leads
```

Errors use one shape everywhere: `{"error":{"code":"VALIDATION_ERROR","message":"Request is invalid","fields":{"outcome":"Outcome is required"}}}`, with 400/401/403/404/409/413/415/429 as appropriate. Other endpoints include stage changes (`PATCH /api/leads/:id/stage`), claim and assign, follow-ups, offers, dashboards, the audit log and the SSE stream (`GET /api/events`). The full list lives under [`apps/web/app/api`](apps/web/app/api), and each feature's contracts are in `specs/NNN-*/contracts/`.

## Design Highlights

- **Strict layering:** route handler → Zod → `authorize()` → service → repository. Services never import Next.js, so the core can be extracted into its own service.
- **Authorization on every lead-scoped endpoint.** List and detail share one scope function (a recursive CTE), so the inbox can never show a lead that the detail page refuses.
- **Append-only history:** SQLite triggers `RAISE(ABORT)` on any UPDATE or DELETE of `activities` and `audit_log`.
- **Correctness under retries and concurrency:** idempotent writes (`clientRequestId`, intake `idempotencyKey`), optimistic locking (`leads.version`), and every multi-row write in one transaction.
- **Graceful degradation:** Redis down → DB, in-process emitter and in-memory limits. Claude down or no key → deterministic rule-based AI. The app never hard-fails on an external service.
- **Privacy:** no PII in logs (the logger schema has no PII fields) and no email or phone in AI prompts (scrubbed and unit-tested).
- **Observability:** structured JSON logs with `requestId`, stable error codes, dependency-health logs, an audit trail with before/after diffs, and per-run job logs. The OpenTelemetry metrics and tracing plan is in [System Design §8](docs/SYSTEM-DESIGN.md#8-observability-strategy).

## AI Collaboration Narrative

I built this with **Claude Code** as the primary engineer under my direction, and **GitHub Spec Kit** as the contract between us. My role was product owner, architect and reviewer; Claude's was to write specs, plans and code inside the guardrails I set.

### Strategy: spec first, then parallel builds
1. **Docs before code.** Before any scaffolding I worked with Claude to produce the full product spec: overview and priorities, personas, user flows, domain model, architecture with ADRs, and **20 feature specs** (`docs/features/F01–F20`) from a common template. AI is very good at producing code quickly, so the expensive mistakes are about *what* to build. That's where I spent my time.
2. **A constitution as guardrails.** I encoded the non-negotiables in `docs/speckit/constitution.md`: authorize every lead endpoint, append-only activities, single-transaction writes, money in integer cents, graceful degradation, no N+1 on hot paths, and no PII to the AI provider. Every generated plan was checked against it with `/speckit-analyze`.
3. **Designed for parallel AI work.** I split the features into **5 dependency waves** with a **path-ownership table**: each feature owns distinct files, and shared files only allow append-only registrations (the lead-detail slot registry, the dashboard tab registry). F01 owned the whole schema and shared contracts, so parallel sessions never fought over migrations.
4. **Automated pipeline.** I wrote two project skills, `build-feature` (specify → self-answered clarify → plan → tasks → analyze → implement → verify → report → commit) and `integrate-wave` (merge, resolve by ownership rules, run every check, verify the wave gate), plus a PowerShell orchestrator (`scripts/speckit/run-waves.ps1`) that ran **one headless Claude session per feature in its own git worktree**, each with its own port and Redis DB. Wave 3 alone had six features building side by side.

### Verification and refinement
- **Gates, not trust.** A wave only merged when `lint` (zero warnings), `typecheck`, `npm test` and `npm run test:e2e` were all green and the wave gate in `docs/features/README.md` was met. The mandatory R1–R3 loop had to be demoable after wave 2, before any "nice-to-have" work merged.
- **Build reports.** Every feature session wrote `specs/NNN-*/REPORT.md` listing what was done, the assumptions it made and the follow-ups. Integration logs are in `docs/speckit/runs/`. I read these to decide what to accept, fix or push back on.
- **Tests first for pure logic.** The stage machine, scoring, follow-up rules and offer eligibility were specified as test cases before implementation. Integration tests run real handlers against real SQLite rather than mocks, so AI-generated code couldn't pass by mocking away the hard parts.
- **Hands-on QA as each persona.** After the last wave I had Claude drive the real UI in a browser as Rep, Manager and VP and produce a severity-ranked audit (`docs/audit/2026-10-01-role-based-ux-audit.md`). It caught real problems that green tests missed: an **RBAC regression** where reps could list their whole team's leads (and the detail page then returned 404), a kanban board that silently truncated to 50 leads, a timeline that didn't refresh after logging an activity, and inconsistent labels. Those findings drove the final "improvements" pass. The RBAC guard was restored and is covered by a test.
- **Fixing flakiness at the root.** Several e2e failures traced to input being sent before React hydration. Rather than adding blind sleeps, we waited on hydration and used `toPass` retries only where the UI is genuinely asynchronous.

### Where I overrode or constrained the AI
- **Caching (F20):** Claude recommended a Redis strategy early. I deliberately kept it as a documented *pending decision* and only adopted narrow cache-aside where the data is safe to cache (active offers, AI results), so correctness and scoping weren't traded away for speed.
- **Scope control:** real WhatsApp/Twilio integration became deep links behind a `ChannelAdapter` interface, and ML scoring became an explainable rule-based score. Both are honest for a demo and easy to swap later.
- **AI in the product:** the AI assist feature runs Claude (`claude-opus-5-5`, effort `low`) with PII scrubbing, Zod-validated output, response caching and a deterministic fallback, so the demo can't break on the network or an API key. An eval script (`npm run eval:ai`) checks schema validity, language match and latency.

### What I'd do differently
Run the persona-based UI audit after *every* wave, not just at the end. Tests proved each feature's contract, but cross-feature consistency (shared labels, counts that agree across widgets, cache invalidation after writes) only showed up when a "user" walked through the whole product.

## Further Reading
- [System Design Document](docs/SYSTEM-DESIGN.md)
- [Product overview](docs/00-overview.md) · [Personas](docs/01-personas.md) · [User flows](docs/02-user-flows.md) · [Domain model](docs/03-domain-model.md) · [Architecture and ADRs](docs/04-architecture.md)
- [Feature index and build waves](docs/features/README.md) · [Spec Kit constitution](docs/speckit/constitution.md) · [Workflow](docs/speckit/WORKFLOW.md)
- [Role-based UX and QA audit](docs/audit/2026-10-01-role-based-ux-audit.md)
