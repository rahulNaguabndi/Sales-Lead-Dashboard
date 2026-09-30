# Quickstart Validation Guide: F01 — Platform Foundation

**Phase 1 output** | Date: 2026-09-30

This guide describes how to validate that F01 is working correctly end-to-end. It covers
prerequisites, the full startup sequence, and a set of verifiable checks for each success
criterion. Implementation code is in `tasks.md`; contracts are in `contracts/`.

---

## Prerequisites

- **Node.js ≥ 20** installed (`node --version`)
- **Docker** installed and running (`docker info`)
- A clean clone of the repository (or a branch with F01 complete)
- No prior `apps/web/.env` file (`.env.example` is the starting point)

---

## Setup

```bash
# 1. Copy env files
cp apps/web/.env.example apps/web/.env
cp apps/showroom/.env.example apps/showroom/.env

# Edit apps/web/.env at minimum:
#   DATABASE_URL=./data/leaddesk.db
#   JWT_SECRET=<any 32+ character string, e.g. "dev-secret-do-not-use-in-production-1234">

# 2. Start Redis (optional but recommended for full validation)
npm run redis:up

# 3. Install dependencies
npm install

# 4. Reset and seed the database
npm run db:reset

# 5. Start both apps
npm run dev
```

The startup sequence should complete within 60 seconds on a typical machine.

---

## SC-001: Clean Clone to Running Apps

**Success criterion**: Both apps running within 5 documented commands, ≤ 3 minutes
(excluding initial npm install download time).

**Checks**:
- [ ] Web app responds at `http://localhost:3000` (you see a login page or redirect)
- [ ] Showroom responds at `http://localhost:3001` (you see the placeholder page)
- [ ] No unhandled errors in either terminal
- [ ] Startup sequence used exactly the commands in §Setup above

---

## SC-002: Deterministic Seed

**Success criterion**: `db:reset` completes in < 15 s; two runs produce identical counts.

**Checks**:

```bash
# Run 1
npm run db:reset 2>&1 | tee /tmp/seed-run-1.txt

# Run 2
npm run db:reset 2>&1 | tee /tmp/seed-run-2.txt

# Compare summary tables (the last printed block)
diff /tmp/seed-run-1.txt /tmp/seed-run-2.txt
```

- [ ] `db:reset` finishes in under 15 seconds (check terminal timing)
- [ ] The seed summary table appears at the end of each run
- [ ] `diff` output shows no differences in counts between the two runs
- [ ] Summary table shows approximately: 600 customers, 800 leads, 16 users, 6 offers,
      25 unassigned leads, 12 SLA breaches, 30 overdue follow-ups

---

## SC-003: Graceful Redis Degradation

**Success criterion**: 100% of pages still load with Redis stopped.

**Checks**:

```bash
# Stop Redis
docker compose stop redis

# Restart the web app (or check terminal output)
npm run dev:web
```

- [ ] Terminal prints `Redis: degraded (in-memory fallback)`
- [ ] `http://localhost:3000` still loads (login page or app shell)
- [ ] No 500 errors in the terminal when navigating to any page
- [ ] `redisStatus()` returns `'degraded'` (verifiable via a test or debug endpoint)

```bash
# Restore Redis
docker compose start redis
```

- [ ] Terminal prints something indicating reconnection (status flips back to `connected`)
- [ ] No app restart required

---

## SC-004: Non-Empty Data for All Downstream Features

**Success criterion**: Every downstream feature's primary data view has data after seeding.

**Checks** (open browser to `http://localhost:3000` after seeding):

| Feature | What to check | Expected |
|---|---|---|
| F04 Inbox | `/inbox` (as VP stub) | Shows leads list, not empty |
| F05 Lead Detail | Click any lead | Shows lead info, not "no activities" everywhere |
| F06 Activity Log | Activity timeline on any non-NEW lead | Has activities |
| F08 Follow-ups | `/inbox?view=due_today` (filter) | Has follow-ups |
| F09 Scoring | Lead scores visible (not all 0) | Priority bands HOT/WARM/COOL present |
| F11 Assignment | Unassigned leads exist | `/inbox?view=unassigned` non-empty |
| F15 Offers | 6 offers in DB, 5 active | Loyalty Bonus, Autumn Cashback, etc. |
| F16 Dashboards | Stage distribution | NEW/CONTACTED/.../WON/LOST/COLD all present |

- [ ] All of the above views show non-empty data

---

## SC-005: Type Check and Lint Pass

**Success criterion**: Zero errors or warnings.

```bash
npm run typecheck
npm run lint
```

- [ ] `npm run typecheck` exits 0 with no errors
- [ ] `npm run lint` exits 0 with no warnings or errors

---

## Unit Tests

Run the F01 test suite to verify implementation correctness:

```bash
npm test -- --reporter=verbose
```

**Expected test files and what they verify**:

| Test file | What it verifies |
|---|---|
| `schema.test.ts` | Migrations apply; CHECK constraint rejects customer with no email/phone; UPDATE/DELETE on `activities` and `audit_log` abort |
| `stage-machine.test.ts` | Full transition table, role rules, `autoAdvance` (NOTE never advances), `isContactActivity` |
| `search-text.test.ts` | "Émile Dubois" → "emile dubois …"; phone digits included |
| `seed.test.ts` | Two runs with same seed produce identical per-table and per-stage counts; FR-037 scenario counts; no activity predates its lead; stage_history is ordered |
| `bus.test.ts` | In memory mode, a local subscriber receives an event exactly once |
| `cache.test.ts` | `wrap` calls the loader once while cached; NoopCache always calls the loader |
| `intake-schema.test.ts` | Valid payload passes; missing email+phone fails; WHATSAPP preferred without phone fails; budgetMin > budgetMax fails; honeypot still parses (F10 rejects it) |
| `errors.test.ts` | `toErrorResponse` produces correct shapes and status codes |

- [ ] All tests pass
- [ ] No test seeds a persistent database (each uses an in-memory or temp-file DB)

---

## App Shell Validation (Manual)

With the dev server running:

```
Login stub: VP user (dev stub from getCurrentUser until F02 lands)
```

- [ ] At `http://localhost:3000`, the 56 px navigation rail is visible on the left
- [ ] Navigation shows: Inbox, Pipeline, Dashboard, Offers, Team Settings, Audit (all VP items)
- [ ] Top bar shows: page title area, search placeholder "Search leads (⌘K)", right-side slots
- [ ] Tailwind design tokens apply (slate background, blue-600 accent, HOT = red-600)
- [ ] Navigating between routes doesn't break layout
- [ ] At `http://localhost:3001`, the showroom placeholder page renders (Vite app)

---

## Appendix: Seed Summary Table Format

The seed prints a table in this approximate format at the end:

```
=== Seed Summary ===

Tables:
  users        16
  teams         3
  customers   601
  leads       803
  activities 4812
  stage_history 1847
  follow_ups   90
  offers        6
  purchases   134

Stages:
  NEW          56
  CONTACTED   104
  QUALIFIED    80
  TEST_DRIVE   48
  NEGOTIATION  40
  WON         104
  LOST        248
  COLD        123

Unassigned:     25
SLA breaches:   12
Overdue:        30

Seed completed in 8.3s
```

If the summary doesn't appear or the numbers are wildly different from above, the seed
has a bug — check `server/db/seed/index.ts` and the individual seed modules.
