# Quickstart: validating F08

Prerequisites: `npm install`, `npm run db:reset` (seed has overdue, at-risk and near-cold leads).

1. **Rules**: `npm test -- followup-rules` (fixed `now`; at-risk, auto-cold, cadence).
2. **Services/jobs**: `npm test -- followup` (supersede, reassign, sweeper, cold-detector with fake timers). Set `JOBS_ENABLED=false` for unrelated suites.
3. **Manual demo**: `COLD_AFTER_DAYS=0.01 MISSED_AFTER_HOURS=0.01 PORT=<free> npm run dev`; within ~2 minutes seeded stale leads become COLD with an `AUTO_COLD` timeline entry.
4. **Schedule flow**: open a lead, use Schedule → "Tomorrow 18:00"; check the card, then check tomorrow's list via `GET /api/follow-ups?view=upcoming`.
5. **Redis off**: stop Redis; jobs still run (log "lock: in-memory fallback").
6. **e2e**: `PORT=<free> npm run test:e2e -- followups`.

Expected: acceptance scenarios in spec.md US-1…US-6 and SC-001…SC-004 hold.
