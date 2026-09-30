# Wave 0 integration report

## Branches
- 001-platform-foundation (F01): DONE, merged with no conflicts (fast clean merge into main).

## Checks on main
- npm install: ok · db:reset: ok (~7 s; 25 unassigned, 29 SLA breaches, 30 overdue)
- typecheck: pass · lint: pass (0 warnings) · unit: 54/54 · e2e: 2/2

## Gate
- ✅ `npm run db:reset && npm run dev` works (GET / 200)
- ✅ Shell renders (shell.spec.ts)
- ✅ Seed loaded ("799 leads loaded")
- ✅ Redis degrades gracefully (log: `Redis: degraded`); live Redis mode not exercised

## Follow-ups
- Copy `apps/web/.env.example` to `apps/web/.env` (or `.env.local`) before `dev`/e2e; the env is required at startup.
- First `next dev` cold start can exceed Playwright's 120 s webServer timeout; it passed once the server was warm.
- `apps/web/data/leaddesk.db` is tracked in git and is modified by db:reset/dev.
- Next tries to patch lockfile (SSL cert error in this environment); harmless.
