# Quickstart: F04 Lead Inbox

1. `npm install && npm run db:reset` (seed, SEED=42)
2. `PORT=<free port> npm run dev`
3. Login as `sofia.rossi@eurodrive.test`, open `/inbox`: My Leads tab, 25 rows, total 32.
4. Try `/inbox?stage=QUALIFIED&source=FACEBOOK`, search "conti", sort Newest.
5. `curl` (with session cookie) `GET /api/leads?view=unassigned&pageSize=10`.
6. Tests: `npm test -- lead-query`, `npm run test:e2e -- core-loop`.
