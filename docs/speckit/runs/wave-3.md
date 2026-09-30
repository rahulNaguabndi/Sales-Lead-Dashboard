# Wave 3 integration (partial wave: F12 only)

## Branches
- 012-live-updates (REPORT: DONE): merged cleanly, no conflicts.
- F07, F08, F11, F14, F15 were not passed to this run and are not merged.

## Checks
- npm install, db:reset, typecheck, lint: pass
- npm test: 67 files / 583 tests pass
- npm run test:e2e: 24/24 pass with a warm dev server (`--workers=1`)

## Fix
- `apps/web/e2e/inbox.spec.ts`: the search-debounce and keyboard-nav tests were flaky. Input sent before hydration was dropped. Wrapped both in `toPass` retries.
- Cold-start e2e runs with parallel workers still time out intermittently on the first Next.js compile.

## Gate: live showroom-to-inbox demo
- ✅ `live-updates.spec.ts` posts to `/api/intake/leads` and the lead appears live for the DACH manager, and never for a South rep
- ✅ SSE hub replay and resync, scope filtering, and degraded memory bus are covered by unit tests

## Follow-ups
- F07/F08/F11/F15 must publish events (FR-009). Their publishing is unverified, since they are not merged.
- Query keys `['lead', id]`, `['followups']`, `['dashboard']` and `['pipeline']` have no consumers yet.
- Toast rendering and the open-lead refresh are not covered by e2e.
