# Quickstart: validating F07

Prerequisites: `npm install`, `npm run db:reset` (seeded, `SEED=42`); use `PORT` if 3000 is taken.

1. `npm test -- stage` — matrix, service, RBAC tests pass.
2. `PORT=<free> npm run dev`, log in as a rep, open a CONTACTED lead, change stage to QUALIFIED → timeline shows "CONTACTED → QUALIFIED"; reload persists.
3. Move a NEGOTIATION lead to WON with 36500 → timeline "Won · 36.500 € · …"; follow-ups cancelled.
4. As a manager reopen a LOST lead; as a rep the option is absent and the API returns 403.
5. Open `/pipeline`, drag a card QUALIFIED → TEST_DRIVE, reload; it stays.
6. `npm run test:e2e -- pipeline` passes.
