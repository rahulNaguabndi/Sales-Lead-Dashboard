# F01 Build Report

Status: DONE
Branch: 001-platform-foundation · Commits: see `git log 81cb0d2..HEAD`

## Acceptance scenarios

| Story / Scenario | Result | Evidence |
|---|---|---|
| US-1 one-command setup: `db:reset` builds schema and seed in < 15 s | ✅ | `npm run db:reset` ≈ 7 s; `schema.test.ts` (4 tests) |
| US-1 append-only triggers on `activities` / `audit_log`; customer contact CHECK | ✅ | `schema.test.ts` |
| US-1 env validation fails fast (JWT_SECRET < 32, missing DATABASE_URL) | ✅ | `env.test.ts`; `instrumentation.ts` calls `validateEnv()` at startup |
| US-2 seed deterministic, ≈800 leads / ≈600 customers / 16 staff / 6 offers | ✅ | `seed.test.ts` (11 tests); two `db:reset` runs give identical summaries |
| US-2 25 unassigned, ≥12 SLA breaches, 30 overdue / 20 today / 40 future follow-ups, Felix ≈38 / Lea ≈15, hero leads, five 6d23h leads | ✅ | `seed.test.ts` |
| US-3 shared contracts: intake schema, stage machine, formatters | ✅ | `intake.test.ts`, `stage-machine.test.ts`, `format.test.ts` |
| US-4 app shell: 56 px rail, role-aware nav, top bar slots | ✅ | `nav.test.ts`; Playwright `shell.spec.ts` (width = 56) |
| US-4 showroom placeholder on its own port importing `@leaddesk/shared` | 🟡 | Vite dev server returned 200 manually; no automated test |
| US-5 Redis degraded mode, event bus, cache, typed errors | ✅ / 🟡 | `bus.test.ts`, `cache.test.ts`, `errors.test.ts` (memory mode); live Redis mode NOT exercised (no Redis available) |
| SC-003 app loads with Redis stopped | ✅ | Playwright + manual; log prints `Redis: degraded` once |
| SC-004 primary data non-empty after reset | ✅ | Home page shows "799 leads loaded" |
| FR-017 activities route stubs (501) | ✅ | Playwright `shell.spec.ts` |

## Checks
typecheck: pass · lint: pass (0 warnings) · unit: 54/54 · e2e: 2/2 · `next build`: pass

## Assumptions made (see assumptions.md)
- Stage transition table: open stages may move forward or backward (not back to NEW); WON only from QUALIFIED/TEST_DRIVE/NEGOTIATION; COLD → CONTACTED or LOST.
- Seed "working hours" are 08:00-20:00 UTC; system events are exempt.
- "Coverage" for the Felix story = open leads with a contact in the last 3 days.

## Deviations from spec
- `next.config.mjs` instead of `next.config.ts` (Next 14 does not load a `.ts` config).
- `getEnv()` (lazy) instead of an `env` constant evaluated at import, so tests and scripts can import server modules without a full environment; startup validation runs from `instrumentation.ts`.
- Event bus de-duplication uses a per-process origin id in the Redis envelope rather than a Set of recent `at+type` keys (exact, no false positives).
- `db` is a lazy proxy over the `globalThis` singleton so importing it never opens the database.
- `db:reset` runs migrate and seed in-process (faster than nested npm).
- Drizzle 0.36 needs the object form of the table extra-config, not the array form.
- Seed clock is truncated to the hour, and each lead is built on its own forked rng stream, so resets in the same hour are byte-identical and across hours differ only locally.
- shadcn components were added with `npx shadcn@latest add` (radix deps, `next-themes` for sonner).
- `@libsql/client` fallback is documented in `client.ts` only; it was not needed.

## Requires F01 / other-feature changes
- None. F02 replaces the body of `server/auth/get-current-user.ts`; F05/F06 replace `handlers/get.ts` / `handlers/post.ts`; F09 replaces the body of `seed/score-step.ts`.

## Known issues / follow-ups
- Redis-backed bus and cache paths are untested against a live Redis (only fake/memory).
- Seed creates no `FOLLOW_UP_SCHEDULED` system activities for seeded follow-ups.
- `npm install` on this machine needs `NODE_USE_SYSTEM_CA=1` for the better-sqlite3 prebuilt download behind the corporate proxy.
- `/login` does not exist until F02; the shell uses the seeded VP stub and never redirects.
