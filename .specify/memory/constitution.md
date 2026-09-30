# EuroDrive Lead Desk Constitution

## Core Principles

### I. The Spec Is the Source of Truth

`docs/` (overview, personas, flows, domain model, architecture, `features/F*.md`) is authoritative. If code and spec disagree, fix the code or amend the spec in the same change. Never leave them divergent. Unresolved ambiguity is marked `[NEEDS CLARIFICATION]`, never silently guessed.

### II. The Mandatory Requirements Come First (NON-NEGOTIABLE)

R1 Lead Inbox, R2 Lead Detail with chronological activity log, and R3 persisted Activity Logging must work end to end before any P1/P2 work merges. No change may break them. The R1–R3 e2e test must pass on every merge.

### III. Layered Architecture

`route handler → validate (Zod) → authorize (policy) → service → repository`. Route handlers stay thin. Services contain business logic and never import Next.js or React. Repositories are the only code that touches Drizzle/SQL. Shared contracts (enums, Zod schemas, event types) live in `packages/shared` and are the only thing the web app and showroom share.

### IV. Security by Default

- Every lead-scoped read or write calls `authorize()` on the server. Hiding UI is never authorization.
- Passwords are bcrypt-hashed. Sessions are JWTs in httpOnly cookies. No tokens in localStorage.
- All external input is validated with Zod at the boundary. No raw SQL string concatenation.
- Secrets come only from environment variables. `.env` is never committed.
- PII (email, phone) is never sent to the AI provider or written to logs.

### V. Test-First for Logic, e2e for Journeys

- Pure logic (scoring, routing, assignment strategies, offer matching, scope/policy, stage transitions, cold rules) gets unit tests written **before** implementation (red → green → refactor).
- Every lead API endpoint has RBAC tests for REP / MANAGER / VP, in-scope and out-of-scope.
- Each user journey in `02-user-flows.md` that a feature implements gets a Playwright e2e test.
- Tests run against a fresh seeded SQLite DB. The seed is deterministic (`SEED=42`).

### VI. Data Integrity & Traceability

- Multi-row writes happen in a single transaction.
- Activities are append-only. No update or delete endpoints.
- Every mutation writes an audit entry (actor, action, entity, before/after).
- Money is integer euro cents. Time is UTC unix ms, formatted only at the edge.
- The schema is owned by F01. Changes need a Drizzle migration plus an update to `docs/03-domain-model.md` in the same change.

### VII. Graceful Degradation

The app must keep working when optional dependencies fail:

- **Redis down:** cache falls through to the DB, pub/sub falls back to an in-process emitter, rate limiting falls back to in-memory, and a warning is logged.
- **AI unavailable or no key:** a deterministic rule-based fallback, clearly labelled.
  The demo must never hard-fail because of an external service.

### VIII. Simplicity & Explicitness

- Prefer boring, explainable solutions. No new dependency without a one-line justification in the plan.
- No speculative abstractions. Build for the current spec, and keep documented extension points (ChannelAdapter, cache interface, event bus) minimal.
- Readable over clever. Code comments only explain a non-obvious _why_.

### IX. Performance Budgets

p95 server time with seed data: inbox < 300 ms, lead detail < 300 ms, dashboard < 500 ms (cold) / < 100 ms (cached). Intake → live toast < 2 s. Indexed queries only on hot paths, and no N+1 queries in lists.

### X. UX Consistency

- Dense, data-first UI built with shadcn/ui + Tailwind. Every list and panel has loading, empty and error states.
- Color is never the only signal (chips carry text). Keyboard accessible. WCAG AA contrast.
- EUR is formatted with `Intl.NumberFormat`. Dates are shown relative, with absolute on hover, in 24 h time.

## Technology Constraints

TypeScript strict · npm workspaces monorepo (`apps/web` Next.js App Router, `apps/showroom` Vite + React, `packages/shared`) · SQLite (WAL) + Drizzle ORM · Redis 7 via ioredis (Docker Compose) · Zod · jose + bcryptjs · TanStack Query / Table · Recharts · Vitest + Playwright · ESLint + Prettier · Anthropic SDK for AI. Swapping any of these requires amending this constitution.

## Development Workflow

- One feature = one branch (`NNN-short-name`), or one git worktree when features are built in parallel.
- Stay within the feature's **owned paths** (`docs/features/README.md`). Touching shared files is append-only (nav entries, new exports).
- Definition of Done: acceptance scenarios pass, unit + RBAC + e2e tests green, `npm run lint` and `npm run typecheck` clean, the spec updated if behavior changed, and a small, focused commit history.
- Merge in wave order. Each wave's gate (see `features/README.md`) must pass before the next wave's branches merge.

## Governance

This constitution supersedes ad-hoc preferences. Amendments are made by a PR that edits this file, states the rationale, and bumps the version.

**Version**: 1.0.0 | **Ratified**: 2026-09-30 | **Last Amended**: 2026-09-30
